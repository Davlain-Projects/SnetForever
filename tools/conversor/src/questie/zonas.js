// Zonas de QuestieDB: AreaID -> uiMapID, mazmorras y conversión de puntos (plano 4 §3).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Continentes sintéticos (plano 4 §3.2 punto 4): último recurso.
const CONTINENTES = new Map([[10073, 1414], [10074, 1415], [10089, 947]]);

const quitarComentarios = (texto) => texto.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');

// Tabla guardada como texto Lua dentro de `ZoneDB.private.<nombre> = [[return {...}]]`: extrae los pares [n] = m.
function leerTablaTexto(texto, nombre, archivo) {
  const marca = `ZoneDB.private.${nombre} = [[`;
  const ini = texto.indexOf(marca);
  if (ini < 0) throw new Error(`no encuentro ${nombre} en ${archivo}`);
  const fin = texto.indexOf(']]', ini + marca.length);
  if (fin < 0) throw new Error(`${nombre} sin cierre en ${archivo}`);
  const cuerpo = quitarComentarios(texto.slice(ini + marca.length, fin));
  const t = new Map();
  for (const m of cuerpo.matchAll(/\[(-?\d+)\]\s*=\s*(-?\d+)/g)) t.set(Number(m[1]), Number(m[2]));
  return t;
}

// dungeons.lua: solo el bloque base `local dungeons = {...}` (los `if Expansions...` no aplican al Forever).
// Cada entrada: [areaId] = {"nombre", {alternativas}|nil, zonaPadre, {{zona, x, y}, ...}}.
function leerMazmorras(archivo, avisos) {
  const texto = readFileSync(archivo, 'utf8');
  const ini = texto.indexOf('local dungeons = {');
  if (ini < 0) throw new Error(`no encuentro la tabla dungeons en ${archivo}`);
  const resto = texto.slice(ini).split(/\r?\n/).slice(1);
  const mazmorras = new Map();
  const patron = /^\s*\[(\d+)\]\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*(nil|\{[^}]*\})\s*,\s*(\d+)\s*,\s*\{(.*)\}\s*\}\s*,?\s*(?:--.*)?$/;
  for (const linea of resto) {
    if (/^\}/.test(linea)) break;
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('--')) continue;
    const m = patron.exec(linea);
    if (!m) { avisos.push(`dungeons.lua: línea no reconocida, se omite: ${limpia}`); continue; }
    const entradas = [];
    let resoluble = true;
    for (const e of m[5].matchAll(/\{([^{}]*)\}/g)) {
      const partes = e[1].split(',').map((s) => s.trim());
      const nums = partes.map(Number);
      if (partes.length !== 3 || nums.some((n) => !Number.isFinite(n))) { resoluble = false; break; }
      entradas.push({ zona: nums[0], x: nums[1], y: nums[2] });
    }
    if (!resoluble) { avisos.push(`dungeons.lua: entrada con expresiones sin resolver en [${m[1]}], se omite`); continue; }
    mazmorras.set(Number(m[1]), {
      nombre: m[2].replace(/\\(.)/g, '$1'),
      alternativas: m[3] === 'nil' ? [] : [...m[3].matchAll(/\d+/g)].map((n) => Number(n[0])),
      zonaPadre: Number(m[4]),
      entradas,
    });
  }
  return mazmorras;
}

// dirQuestieDB: carpeta `QuestieDB`. Devuelve {uiMap(areaId), areaDeUi(uiMap), areasDirectas(), mazmorras, avisos}.
// uiMap: number (uiMapID), 0 (sin mapa) o null (desconocida). Orden: override -> tabla -> subzona -> continentes.
export function cargarZonas(dirQuestieDB) {
  const dir = join(dirQuestieDB, 'support', 'Forever', 'Zones');
  const rutaA2U = join(dir, 'areaIdToUiMapId.lua');
  const rutaSub = join(dir, 'subZoneToParentZone.lua');
  const a2u = readFileSync(rutaA2U, 'utf8');
  const sub = readFileSync(rutaSub, 'utf8');
  const rutaInv = join(dir, 'uiMapIdToAreaId.lua');
  const inv = readFileSync(rutaInv, 'utf8');
  const override = leerTablaTexto(a2u, 'areaIdToUiMapIdOverride', rutaA2U);
  const tabla = leerTablaTexto(a2u, 'areaIdToUiMapId', rutaA2U);
  const uiAArea = new Map([
    ...leerTablaTexto(inv, 'uiMapIdToAreaId', rutaInv),
    ...leerTablaTexto(inv, 'uiMapIdToAreaIdOverride', rutaInv),
  ]);
  const subOverride = leerTablaTexto(sub, 'subZoneToParentZoneOverride', rutaSub);
  const subTabla = leerTablaTexto(sub, 'subZoneToParentZone', rutaSub);
  const avisos = [];
  const mazmorras = leerMazmorras(join(dir, 'dungeons.lua'), avisos);

  const directo = (a) => (override.has(a) ? override.get(a) : tabla.has(a) ? tabla.get(a) : undefined);

  function uiMap(areaId) {
    let a = areaId;
    for (let salto = 0; salto < 8; salto++) {
      const v = directo(a);
      if (v !== undefined) return v;
      const padre = subOverride.has(a) ? subOverride.get(a) : subTabla.get(a);
      if (padre === undefined || padre === a) break;
      a = padre;
    }
    return CONTINENTES.has(areaId) ? CONTINENTES.get(areaId) : null;
  }

  // `zona` es el AreaID de la entrada; `mapa` su uiMapID (0 o null si no tiene).
  for (const d of mazmorras.values()) for (const e of d.entradas) e.mapa = uiMap(e.zona);

  // AreaID de una zona de uiMapID (la inversa de la tabla anterior), o undefined.
  const areaDeUi = (mapa) => uiAArea.get(mapa);
  // Las áreas con entrada directa en la tabla (más los overrides).
  const areasDirectas = () => [...new Set([...tabla.keys(), ...override.keys()])];

  return { uiMap, areaDeUi, areasDirectas, mazmorras, avisos };
}

const redondear = (n) => Math.round(n * 100) / 100;

// spawnsPorArea: {areaId: [[x, y, fase?], ...]}. Devuelve los puntos por uiMapID, las mazmorras
// (areaId con el centinela {-1,-1}) y las áreas sin mapa.
export function convertirPuntos(spawnsPorArea, zonas) {
  const mapas = {};
  const mazmorras = [];
  const sinMapa = [];
  for (const [clave, puntos] of Object.entries(spawnsPorArea ?? {})) {
    const area = Number(clave);
    if (!Array.isArray(puntos)) continue;
    const normales = [];
    let centinela = false;
    for (const p of puntos) {
      if (!Array.isArray(p) || p.length < 2) continue;
      if (p[0] === -1 && p[1] === -1) centinela = true;
      else normales.push([redondear(p[0]), redondear(p[1])]);
    }
    if (centinela && !mazmorras.includes(area)) mazmorras.push(area);
    if (!normales.length) continue;
    const mapa = zonas.uiMap(area);
    if (!mapa) { if (!sinMapa.includes(area)) sinMapa.push(area); continue; }
    (mapas[mapa] ??= []).push(...normales);
  }
  return { mapas, mazmorras, sinMapa };
}
