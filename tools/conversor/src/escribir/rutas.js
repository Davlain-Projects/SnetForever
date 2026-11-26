// Escritor del addon de datos SnetForever_Rutas (Lua 5.1): las guías de RestedXP ya convertidas
// (Tarea 11), troceadas en archivos pequeños, con su licencia CC BY-NC-SA 4.0 y sus créditos.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ORIGEN } from '../config.js';
import { aLua } from '../salida/lua.js';
import { trocear, archivoLua } from '../salida/trocear.js';

const NOMBRE_ADDON = 'SnetForever_Rutas';
export const NOMBRE_ADDON_RXP = 'SnetForever_RutasRXP';
const LIMITE_BYTES = 500000;
const LIMITE_CONSTANTES = 50000;
const FORMATO_VERSION = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

const COMENTARIO_NUCLEO = `-- SnetForever_Rutas: guías de RestedXP convertidas al formato propio de SnetForever (CC BY-NC-SA 4.0).
-- Este archivo se carga el primero; los guias_<n>.lua rellenan SNF_RUTAS.guias["<clave>"].
--
-- SNF_RUTAS = {version, esquema, guias = {[clave] = Guia}, grupos = {[grupo] = {clave, ...}}, alias = {[clave] = clave}}
--   * grupos[grupo] lista SOLO claves que existen en SNF_RUTAS.guias. Una guía con grupos distintos por
--     facción (variantes) aparece, con su clave real, en el grupo de cada una de sus variantes.
--   * alias[clave de una variante] = clave principal de la guía, solo para las variantes cuya clave
--     no es la principal. Las claves de variante no existen en SNF_RUTAS.guias: se resuelven con alias.
--   * Si una guía no cupo en un archivo, sus pasos se reparten: el guias_<n>.lua que la define trae
--     pasos = {} y los siguientes archivos añaden pasos al final con
--     SNF_RUTAS.guias["<clave>"].pasos[<índice>] = {...}. Con el .toc cargado entero, la guía queda completa.
--
-- Guia = {clave, grupo, nombre, titulo = {en, es?}, subgrupo?, niveles = {min, max}, filtro?, porDefecto?,
--         siguientes = {{clave, filtro?} | {sinResolver, filtro?}}, tipo, faccion?, mazmorras = {[sigla] = bool},
--         variantes? = {{clave, grupo, subgrupo?, titulo, filtro?}} (la primera repite los campos de arriba;
--         el addon elige la primera cuyo filtro aplica), fuente = {archivo, linea}, pasos = {Paso}}
--   * faccion nil = la guía vale para las dos facciones (p. ej. Skyborne). No se deduce del nombre del
--     grupo: si hay campo faccion, manda; si no, la guía es de las dos.
--   * filtro: para quién existe la guía (como el << de cabecera de RestedXP). La guía existe para el
--     personaje si se cumplen faccion, filtro y el filtro de alguna de sus variantes.
--   * variantes: una por cada combinación de #group/#subgroup/#displayname con << filtro. Cada una
--     tiene su clave (grupo, barra invertida y nombre), su grupo, subgrupo y título; el addon muestra la primera cuyo
--     filtro aplica. Sin variantes, valen los campos de la guía.
--   * siguientes: en orden; el addon toma la PRIMERA entrada con clave cuyo filtro aplica (a nivel de
--     la guía destino). El filtro de cada entrada ya incluye el de la guía destino (y su variante):
--     una entrada no se elige si su guía destino no existe para el personaje. Las entradas sinResolver
--     son nombres que no se encontraron (solo informan).
-- Paso = {id, n, filtro?, etiquetas, etiquetasPorFiltro?, elementos = {Elemento}, requisitos, linea,
--         mazmorra?, sinMazmorra?, de?}
--   * etiquetas: {[nombre] = valor} de las etiquetas de paso sin filtro (#completewith, #requires,
--     #optional, #label, #include ya resuelto…). Valor true si la etiqueta no lleva texto.
--   * etiquetasPorFiltro? = {{nombre, valor, filtro}}: etiquetas de paso con << filtro, en el orden
--     del original. Si su filtro aplica al personaje, esa entrada gana sobre etiquetas[nombre]; entre
--     varias de un mismo nombre gana la primera que aplica. Se evalúan en el addon.
--   * requisitos = {{t, ..., filtro?}}: lo que pide el paso (nivel, misión previa, objeto, profesión,
--     reputación, grupo, élite, mazmorra, paso con etiqueta). Si un requisito lleva filtro, solo cuenta
--     para los personajes a los que aplica ese filtro.
--   * Elemento = {t = "<tipo>", ..., texto = {en, es?}, filtro?, linea}; accept/turnin/complete llevan q (misión).
--     itemStat = {hueco, stat, op ("<", ">" o "=="), valor, efecto = "saltar_si_no_alcanzado"}: el paso
--     se ve si la estadística del objeto equipado en el hueco cumple «stat op valor»; con el hueco vacío
--     o sin esa estadística, no hace nada (el paso se ve). Ver docs/planes/contrato-datos-fase-1.md.
--   * Un filtro es una lista de grupos O; cada grupo es una lista Y de términos de texto:
--     "c:WARRIOR" (clase), "r:Orc" (raza), "f:Horde" (facción), "n:10" (nivel >= 10), "s:male" (sexo),
--     "l:esES" (idioma); con "!" delante si va negado, por ejemplo "!r:Orc". Sin campo filtro, siempre se cumple.
--   * Coordenadas: {mapa, x, y} (uiMapID y porcentaje 0-100) o {mapa, inst, wx, wy} (mapa de mazmorra o
--     instancia con coordenadas de mundo). Los elementos de recorrido las traen en puntos = {...}.
`;

const escribir = (dirSalida, nombre, texto, archivos) => {
  writeFileSync(join(dirSalida, nombre), texto, 'utf8');
  archivos.push(nombre);
};

/**
 * Índice de grupos y alias de variantes. `grupos[grupo]` lista solo claves que existen en
 * `SNF_RUTAS.guias`: una guía aparece con su clave real en el grupo de cada una de sus variantes.
 * Las claves de variante se resuelven por `alias` (variante → principal).
 */
export function indexar(guias, avisos) {
  const grupos = {};
  const alias = {};
  const anadir = (grupo, clave) => {
    const lista = (grupos[grupo] ??= []);
    if (!lista.includes(clave)) lista.push(clave);
  };
  for (const [clave, guia] of guias) {
    const variantes = Array.isArray(guia.variantes) && guia.variantes.length > 0
      ? guia.variantes
      : [{ clave, grupo: guia.grupo }];
    anadir(guia.grupo, clave);
    for (const v of variantes) {
      anadir(v.grupo, clave);
      if (v.clave === clave) continue;
      if (guias.has(v.clave)) avisos.push(`La clave de variante «${v.clave}» de «${clave}» es también una guía; no se escribe su alias`);
      else if (alias[v.clave] && alias[v.clave] !== clave) avisos.push(`La clave de variante «${v.clave}» ya era alias de «${alias[v.clave]}»; se queda con «${clave}»`);
      else alias[v.clave] = clave;
    }
  }
  return { grupos, alias };
}

/** Lee `## Version:` y `## Author:` del .toc de RestedXP, si existe. */
function leerCabeceraRxp(dirRxp) {
  const ruta = join(dirRxp, 'RXPGuides.toc');
  if (!existsSync(ruta)) return {};
  const texto = readFileSync(ruta, 'utf8');
  const campo = (nombre) => new RegExp(`^##\\s*${nombre}:\\s*(.+?)\\s*$`, 'm').exec(texto)?.[1];
  return { version: campo('Version'), autor: campo('Author') };
}

/**
 * Genera el addon en `dirSalida` (la carpeta del addon) a partir de `guias` (Map clave -> Guia).
 * Devuelve los archivos escritos (relativos), el total de bytes y los avisos.
 * `dirRxp` es la carpeta RXPGuides del origen (LICENSE y RXPGuides.toc). Los límites solo se tocan en pruebas.
 */
export function escribirRutas(guias, dirSalida, {
  version,
  dirRxp = join(ORIGEN, 'RXPGuides'),
  avisos: avisosDatos = [],
  licenciaOpenMap,
  personal = false,
  limiteBytes = LIMITE_BYTES,
  limiteConstantes = LIMITE_CONSTANTES,
} = {}) {
  if (!version) throw new Error('escribirRutas: falta la versión de los datos (AAAA.MM.DD.n)');
  if (!FORMATO_VERSION.test(version)) throw new Error(`escribirRutas: la versión «${version}» no tiene la forma AAAA.MM.DD.n`);
  const rutaLicencia = join(dirRxp, 'LICENSE');
  if (!existsSync(rutaLicencia)) throw new Error(`escribirRutas: no encuentro la licencia en ${rutaLicencia}`);
  const avisos = [];
  const nombreAddon = personal ? NOMBRE_ADDON_RXP : NOMBRE_ADDON;
  const tablaLua = personal ? 'SnetForeverRutasRXP' : 'SNF_RUTAS';
  const limites = { maxBytes: limiteBytes, maxConstantes: limiteConstantes };
  const claves = [...guias.keys()];

  // Cada guía va entera en una entrada; si una sola no cabe, se escribe sin pasos y sus pasos van aparte.
  const entradas = [];
  const partidas = [];
  for (const clave of claves) {
    const guia = guias.get(clave);
    let cabe = true;
    try { trocear([[clave, guia]], limites); } catch { cabe = false; }
    if (cabe) { entradas.push([clave, guia]); continue; }
    entradas.push([clave, { ...guia, pasos: [] }]);
    partidas.push([clave, guia.pasos]);
  }

  mkdirSync(dirSalida, { recursive: true });
  const archivos = [];
  const ficherosLua = [];

  const { grupos, alias } = indexar(guias, avisos);
  const nucleo = { version, esquema: 1, guias: {}, grupos, alias, avisos: avisosDatos };
  const comentario = personal ? '-- Guías RXP de uso local. Generado por SnetForever.\n' : COMENTARIO_NUCLEO;
  escribir(dirSalida, 'nucleo.lua', `${comentario}${tablaLua} = ${aLua(nucleo)}\n`, archivos);
  ficherosLua.push('nucleo.lua');

  let n = 0;
  const escribirTrozos = (destino, lista) => {
    for (const trozo of trocear(lista, limites)) {
      n += 1;
      const nombre = `guias_${n}.lua`;
      escribir(dirSalida, nombre, archivoLua(destino, trozo), archivos);
      ficherosLua.push(nombre);
    }
  };
  escribirTrozos(`${tablaLua}.guias`, entradas);
  for (const [clave, pasos] of partidas) {
    const antes = n;
    escribirTrozos(`${tablaLua}.guias[${aLua(clave)}].pasos`, pasos.map((p, i) => [i + 1, p]));
    avisos.push(`La guía «${clave}» no cabe en un archivo: sus ${pasos.length} pasos se reparten en ${n - antes} archivos`);
  }

  const cabeceraRxp = leerCabeceraRxp(dirRxp);
  const toc = [
    '## Interface: 16001',
    personal ? '## Title: SnetForever - Mis guías RXP' : '## Title: SnetForever - Rutas',
    personal ? '## Notes: Guías locales de RestedXP para Forever' :
      '## Notes: Guías de subida de nivel del Forever (datos de RestedXP, CC BY-NC-SA 4.0)',
    `## Version: ${version}`,
    '## Author: SnetForever',
    '## X-License: CC-BY-NC-SA-4.0',
    '## IconTexture: Interface\\AddOns\\SnetForever\\recursos\\icono',
    '',
    ...ficherosLua,
    '',
  ].join('\n');
  escribir(dirSalida, `${nombreAddon}.toc`, toc, archivos);

  copyFileSync(rutaLicencia, join(dirSalida, 'LICENSE'));
  archivos.push('LICENSE');
  if (licenciaOpenMap) escribir(dirSalida, 'LICENSE-OpenMap.txt', licenciaOpenMap, archivos);
  const hayProfesiones = [...guias.values()].some((g) => g.tipo === 'profesion');
  const creditos = personal
    ? 'Guías locales importadas desde RestedXP y conservadas para uso personal. Consulta las licencias y créditos del origen.\n'
    : textoCreditos(cabeceraRxp, { openMap: Boolean(licenciaOpenMap), profesiones: hayProfesiones });
  escribir(dirSalida, 'CREDITOS.md', creditos, archivos);

  const bytes = archivos.reduce((suma, f) => suma + statSync(join(dirSalida, f)).size, 0);
  return { archivos, bytes, avisos };
}

function textoCreditos({ version, autor }, { openMap = false, profesiones = false } = {}) {
  const lineasExtra = [
    ...(profesiones ? ['- Profesiones de RestedXP (WotLK) recortadas al 1-300.'] : []),
    ...(openMap ? ['- Niveles de zonas y mazmorras de **OpenMap** (licencia MIT, copia en `LICENSE-OpenMap.txt`).'] : []),
  ];
  const extra = lineasExtra.length > 0 ? `${lineasExtra.join('\n')}\n` : '';
  const origen = `**RestedXP Guides**${version ? ` ${version}` : ''}${autor ? `, de ${autor}` : ''}`;
  return `# Créditos de SnetForever - Rutas

Las guías de este addon proceden de ${origen} (https://github.com/RestedXP), el addon de guías de
subida de nivel de RestedXP, y de sus autores y traductores.

Las rutas «Skyrim» (Horda 22-60 y Alianza 20-60) son del autor de SnetForever, derivadas de las guías de
RestedXP 4.5.19 (addon \`RXPGuides_Clasicas\`).

## Licencia

Este addon se distribuye bajo la **Creative Commons Atribución-NoComercial-CompartirIgual 4.0
Internacional (CC BY-NC-SA 4.0)** (archivo \`LICENSE\`), la misma que las guías de origen.
No se puede usar con fines comerciales y las obras derivadas deben mantener esta licencia.

## Procedencia y cambios

- Convertido a formato propio de SnetForever: tablas Lua 5.1 con pasos, elementos, filtros y coordenadas
  ya analizados, en lugar de los comandos de texto de RestedXP.
- Las coordenadas de recorrido se guardan como uiMapID más porcentajes o coordenadas de mundo.
- Se han incluido el español y el inglés de cada guía y se han resuelto los \`#include\` y los \`#next\`.
- Los pasos y las guías que no se ven en el Forever (otras temporadas, hardcore, etc.) se han descartado.
${extra}
## Sin relación con RestedXP

SnetForever y este addon no están respaldados por RestedXP ni por sus autores.
`;
}
