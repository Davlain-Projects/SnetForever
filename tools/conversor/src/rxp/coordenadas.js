// Mapas y coordenadas de las guías de RestedXP.
// Fuentes: plano 2 §4 (`.goto` y su tabla de radios) y el original `RXPGuides/functions.lua:1908-2004`
// (`goto`) y `RXPGuides/map.lua:1475-1580` (`GetMapInfo` y las transformaciones de Ventormenta y
// Tierras de la Peste del Este).
import { readFileSync } from 'node:fs';

/**
 * Lee `tonumber` como Lua 5.1: decimal con signo y exponente opcionales, o hexadecimal `0x…`,
 * con espacios alrededor. Devuelve `undefined` si no es un número.
 */
export function numeroLua(texto) {
  if (texto === undefined || texto === null) return undefined;
  const t = String(texto).trim();
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(t)) {
    const neg = t.startsWith('-');
    const v = parseInt(t.replace(/^[+-]?0[xX]/, ''), 16);
    return neg ? -v : v;
  }
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t);
  return undefined;
}

/**
 * Lee `addon.mapId = {…}` de `RXPGuides/DB/forever/db.lua` con la expresión `["Nombre"] = 1234`
 * y añade los nombres especiales que `map.lua:1577-1580` mete en la misma tabla
 * (`StormwindClassic`/`StormwindNew` → Stormwind City, `EPLClassic`/`EPLNew` → Eastern Plaguelands).
 * @returns {Map<string, number>}
 */
export function cargarMapas(rutaDbForever) {
  const texto = readFileSync(rutaDbForever, 'utf8');
  const ini = texto.search(/addon\.mapId\s*=\s*\{/);
  if (ini < 0) throw new Error(`No encuentro addon.mapId en ${rutaDbForever}`);
  const fin = texto.indexOf('}', ini);
  const bloque = texto.slice(ini, fin);
  const mapas = new Map();
  const re = /\["([^"]+)"\]\s*=\s*(\d+)/g;
  let m;
  while ((m = re.exec(bloque)) !== null) mapas.set(m[1], Number(m[2]));
  const sw = mapas.get('Stormwind City');
  const epl = mapas.get('Eastern Plaguelands');
  if (sw !== undefined) {
    mapas.set('StormwindClassic', sw);
    mapas.set('StormwindNew', sw);
  }
  if (epl !== undefined) {
    mapas.set('EPLClassic', epl);
    mapas.set('EPLNew', epl);
  }
  return mapas;
}

// `GetMapCoefficients` de map.lua:1475-1481: transformación lineal calibrada con dos puntos.
function coeficientes(p1x, p1y, p1xb, p1yb, p2x, p2y, p2xb, p2yb) {
  const c11 = (p1xb - p2xb) / (p1x - p2x);
  const c31 = p1xb - p1x * c11;
  const c22 = (p1yb - p2yb) / (p1y - p2y);
  const c32 = p1yb - p1y * c22;
  return [c11, c31, c22, c32];
}
// Puntos de calibración de map.lua:1483-1512. Solo hace falta el sentido «moderno → clásico»
// (`wrathToClassic*`): Forever es la versión 16001 (< 30000), así que `StormwindNew` y `EPLNew`
// se transforman y `StormwindClassic` y `EPLClassic` pasan sin cambios (plano 2 §4).
const SW = { x: 25, y: 25, xb: 39.02232393772481, yb: 43.7789069363158, x2: 75, y2: 75, xb2: 77.70637435364208, yb2: 82.47040384981797 };
const EPL = { x: 81.51690, y: 59.23138, xb: 75.75077, yb: 53.32378, x2: 48.12616, y2: 21.96377, xb2: 43.67876, yb2: 17.52954 };
const A_CLASICO = {
  StormwindNew: { mapa: 'Stormwind City', c: coeficientes(SW.xb, SW.yb, SW.x, SW.y, SW.xb2, SW.yb2, SW.x2, SW.y2) },
  EPLNew: { mapa: 'Eastern Plaguelands', c: coeficientes(EPL.xb, EPL.yb, EPL.x, EPL.y, EPL.xb2, EPL.yb2, EPL.x2, EPL.y2) },
};
const SIN_CAMBIO = { StormwindClassic: 'Stormwind City', EPLClassic: 'Eastern Plaguelands' };

/** `GetMapId(zona) or tonumber(zona)`: el mapa de un nombre o de un número. */
export function idMapa(zona, mapas) {
  if (zona === undefined) return undefined;
  return mapas.get(zona) ?? numeroLua(zona);
}

/**
 * `GetMapInfo(zona, x, y)` (map.lua:1534-1573): mapa y x, y. Aplica los nombres especiales.
 * Devuelve `undefined` si la zona o los números no valen.
 */
export function infoMapa(zona, x, y, mapas) {
  let nx = numeroLua(x);
  let ny = numeroLua(y);
  if (nx === undefined || ny === undefined || zona === undefined) return undefined;
  let mapa;
  if (A_CLASICO[zona]) {
    const { c } = A_CLASICO[zona];
    nx = nx * c[0] + c[1];
    ny = ny * c[2] + c[3];
    mapa = mapas.get(A_CLASICO[zona].mapa);
  } else if (SIN_CAMBIO[zona]) {
    mapa = mapas.get(SIN_CAMBIO[zona]);
  } else {
    mapa = idMapa(zona, mapas);
  }
  if (mapa === undefined) return undefined;
  return { mapa, x: nx, y: ny };
}

/**
 * Punto de una zona y dos números, con las dos formas de RestedXP:
 * - `Nombre|número, x, y` → `{mapa, x, y}` (% de la zona);
 * - `mapa/instancia, a, b` → `{mapa, inst, wx: a, wy: b}` (coordenadas de mundo **en el orden en que
 *   vienen**: `wx` = 2.º valor de `UnitPosition`, `wy` = 1.º; plano 2 §4).
 * `especiales` (por defecto true) aplica los nombres de `GetMapInfo` (en `.goto`, `.pin` y la forma
 * con nombre de `.waypoint`); si es false se usa `GetMapId` tal cual (como `.line`, `.loop` y la forma
 * de mundo de `.waypoint` y `.pin`).
 * @returns {{punto?: object, aviso?: string}}
 */
export function punto(zona, x, y, mapas, { especiales = true } = {}) {
  if (zona === undefined) return { aviso: 'Falta la zona' };
  const mundo = /^(.*?)\/(\d+)/.exec(zona); // `(.-)/(%d+)` de Lua
  if (mundo) {
    const inst = Number(mundo[2]);
    const wx = numeroLua(x);
    const wy = numeroLua(y);
    let mapa;
    if (especiales) {
      // `GetMapInfo(sub, x, y, inst)`: con un nombre especial también transformaría los números,
      // pero en la forma de mundo no tiene sentido y no aparece en las guías.
      const info = infoMapa(mundo[1], 0, 0, mapas);
      mapa = info?.mapa;
    } else {
      mapa = idMapa(mundo[1], mapas);
    }
    if (mapa === undefined) return { aviso: `Mapa desconocido: "${mundo[1]}"` };
    if (wx === undefined || wy === undefined) return { aviso: `Coordenadas no numéricas: "${x}", "${y}"` };
    return { punto: { mapa, inst, wx, wy } };
  }
  if (numeroLua(x) === undefined || numeroLua(y) === undefined) {
    return { aviso: `Coordenadas no numéricas: "${x}", "${y}"` };
  }
  const info = especiales ? infoMapa(zona, x, y, mapas) : (() => {
    const mapa = idMapa(zona, mapas);
    return mapa === undefined ? undefined : { mapa, x: numeroLua(x), y: numeroLua(y) };
  })();
  if (!info) return { aviso: `Mapa desconocido: "${zona}"` };
  return { punto: info };
}

/**
 * Modo de un `.goto` según el radio y el 5.º argumento (plano 2 §4, tabla «Radio y 5.º argumento»;
 * functions.lua:1975-2000). `opcional` vale cualquier texto, también "0".
 * - sin radio (o radio no numérico): `"flecha"` (flecha y pin, informativo, ligado al padre);
 * - radio > 0 sin 5.º: `"objetivo"` (casilla; se completa al llegar);
 * - radio > 0 con 5.º: `"paso"` (punto de paso sin pin, ligado al padre);
 * - radio = 0 sin 5.º: `"pin"` (solo pin, sin flecha);
 * - radio = 0 con 5.º: `"baja"` (baja prioridad);
 * - radio < 0: `"cercano"` (dinámico: la flecha elige el más cercano), con o sin 5.º.
 */
export function modoGoto(radio, opcional) {
  if (radio === undefined) return 'flecha';
  if (radio < 0) return 'cercano';
  if (radio > 0) return opcional === undefined ? 'objetivo' : 'paso';
  return opcional === undefined ? 'pin' : 'baja';
}

/**
 * Convierte los argumentos de un `.goto` (`zona, x, y[, radio[, opcional]]`).
 * Sin zona usa `ultimaZona` (la variable `lastZone` del original, que se arrastra entre pasos).
 * @returns {{punto?: object, zona?: string, radio?: number, modo?: string, aviso?: string}}
 *   `zona` es la nueva última zona (se actualiza aunque el punto no valga, como en el original).
 */
export function convertirGoto(args, { mapas, ultimaZona } = {}) {
  const [zArg, x, y, r, opcional] = args;
  const zona = zArg ?? ultimaZona;
  const { punto: p, aviso } = punto(zona, x, y, mapas);
  if (!p) return { zona, aviso };
  const radio = numeroLua(r);
  const sal = { punto: p, zona, modo: modoGoto(radio, opcional) };
  if (radio !== undefined) sal.radio = radio;
  return sal;
}
