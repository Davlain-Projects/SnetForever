// Niveles de zonas y mazmorras de OpenMap (licencia MIT). Se ejecutan Levels.lua y Places.lua (en Data/Forever/ desde la
// 0.8.3; antes, en Data/) en fengari, llamándolos con ("OpenMap", ns) como hace el juego, y se leen ns.MapLevels y
// ns.MapPlaces.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fengari from 'fengari';

const { lua, lauxlib, lualib, to_luastring } = fengari;
const decodificador = new TextDecoder('utf-8');
const aTexto = (bytes) => decodificador.decode(bytes);

// Convierte el valor de la cima de la pila a JS: las tablas son objetos con claves numéricas o de texto.
function aJs(L, indice) {
  const idx = lua.lua_absindex(L, indice);
  switch (lua.lua_type(L, idx)) {
    case lua.LUA_TNIL: return undefined;
    case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, idx);
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, idx);
    case lua.LUA_TSTRING: return aTexto(lua.lua_tolstring(L, idx));
    case lua.LUA_TTABLE: break;
    default: return undefined;
  }
  const t = {};
  lua.lua_pushnil(L);
  while (lua.lua_next(L, idx) !== 0) {
    const clave = lua.lua_type(L, -2) === lua.LUA_TNUMBER ? lua.lua_tonumber(L, -2) : aTexto(lua.lua_tolstring(L, -2));
    t[clave] = aJs(L, -1);
    lua.lua_pop(L, 1);
  }
  return t;
}

// Ejecuta los archivos con ("OpenMap", ns) y devuelve ns convertido a JS.
function ejecutar(archivos) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  try {
    lua.lua_newtable(L);
    const ns = lua.lua_gettop(L);
    for (const { ruta, texto } of archivos) {
      const bytes = to_luastring(texto); // longitud en bytes, no en unidades UTF-16 (por si OpenMap trae tildes)
      if (lauxlib.luaL_loadbuffer(L, bytes, bytes.length, to_luastring(`@${ruta}`)) !== lua.LUA_OK) {
        throw new Error(`${ruta}: ${aTexto(lua.lua_tolstring(L, -1))}`);
      }
      lua.lua_pushstring(L, to_luastring('OpenMap'));
      lua.lua_pushvalue(L, ns);
      if (lua.lua_pcall(L, 2, 0, 0) !== lua.LUA_OK) throw new Error(`${ruta}: ${aTexto(lua.lua_tolstring(L, -1))}`);
    }
    return aJs(L, ns);
  } finally {
    lua.lua_close(L);
  }
}

// Valores `nil` de Lua llegan como undefined: un nivel ausente no se inventa.
const num = (v) => (typeof v === 'number' ? v : undefined);

// Carpetas donde OpenMap guarda Levels.lua y Places.lua, por orden de preferencia. Lote H: desde la 0.8.3 cada cliente
// tiene los suyos (el .toc del Forever carga Data\Forever\Client.lua y los datos de Data\Forever\); antes estaban en Data\.
const CARPETAS_DATOS = [['Data', 'Forever'], ['Data']];

/**
 * @param {string} dirOpenMap carpeta del addon OpenMap
 * @returns {{niveles: Map<number, [number, number]>,
 *   instancias: Array<{instancia: number, nombre: string, banda: boolean, min?: number, max?: number, mapa?: number}>,
 *   sinEntrada: Array<{nombre: string, banda: boolean, min: number, max: number}>,
 *   licencia: string} | null} null si no existe la carpeta
 * @throws si la carpeta existe pero sus datos no están en ninguna de CARPETAS_DATOS (OpenMap los ha movido: sin esto,
 *   el conversor seguiría sin niveles de zonas ni de mazmorras y sin avisar)
 */
export function leerOpenMap(dirOpenMap) {
  if (!existsSync(dirOpenMap)) return null;
  const sub = CARPETAS_DATOS.find((s) => existsSync(join(dirOpenMap, ...s, 'Levels.lua'))
    && existsSync(join(dirOpenMap, ...s, 'Places.lua')));
  if (!sub) {
    const donde = CARPETAS_DATOS.map((s) => join(...s)).join(' ni en ');
    throw new Error(`OpenMap (${dirOpenMap}) no trae Levels.lua y Places.lua en ${donde}: ¿los ha cambiado de sitio?`);
  }
  const niveles = join(dirOpenMap, ...sub, 'Levels.lua');
  const lugares = join(dirOpenMap, ...sub, 'Places.lua');
  const ns = ejecutar([niveles, lugares].map((ruta) => ({ ruta, texto: readFileSync(ruta, 'utf8') })));

  const mapa = new Map();
  for (const [id, r] of Object.entries(ns.MapLevels ?? {})) mapa.set(Number(id), [r[1], r[2]]);

  const instancias = [];
  for (const lugar of Object.values(ns.MapPlaces?.instances ?? {})) {
    for (const i of Object.values(lugar[4] ?? {})) {
      const e = { instancia: i[1], nombre: i[2], banda: i[3] === true };
      if (num(i[4]) !== undefined) e.min = i[4];
      if (num(i[5]) !== undefined) e.max = i[5];
      if (num(lugar.map) !== undefined) e.mapa = lugar.map;
      instancias.push(e);
    }
  }

  const sinEntrada = Object.values(ns.MapPlaces?.unplaced ?? {}).map((u) => ({
    nombre: u[2], banda: u[3] === true, min: u[4], max: u[5],
  }));

  const rutaLicencia = join(dirOpenMap, 'LICENSE.txt');
  const licencia = existsSync(rutaLicencia) ? readFileSync(rutaLicencia, 'utf8') : '';
  return { niveles: mapa, instancias, sinEntrada, licencia };
}
