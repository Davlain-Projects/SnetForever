// Paso de valores entre Lua (fengari) y JS para el banco.
// aJs es propio (permisivo: funciones, ciclos y userdata salen como texto); aLua viene del conversor de la fase 1.
import fengari from 'fengari';
import { aLua as aLuaConversor } from '../../conversor/src/salida/lua.js';

const { lua } = fengari;
const decodificador = new TextDecoder('utf-8');

export const aTexto = (bytes) => decodificador.decode(bytes);

// Valor JS → texto de Lua. undefined y null son nil (en listas de argumentos hacen falta).
export function aLua(valor) {
  if (valor === undefined || valor === null) return 'nil';
  return aLuaConversor(valor);
}

function claveJs(L, idx) {
  switch (lua.lua_type(L, idx)) {
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, idx);
    case lua.LUA_TSTRING: return aTexto(lua.lua_tolstring(L, idx));
    case lua.LUA_TBOOLEAN: return String(lua.lua_toboolean(L, idx));
    default: return `[${aTexto(lua.lua_typename(L, lua.lua_type(L, idx)))}]`;
  }
}

/**
 * Convierte el valor de la posición `indice` de la pila a JS, sin sacarlo.
 * Una tabla con claves 1..n es un array; la vacía es []; las demás, un objeto con las claves en texto.
 * Las funciones salen como '[función]', el userdata como '[userdata]' y una tabla que se contiene a sí misma como '[ciclo]'.
 */
export function aJs(L, indice, vistos = new Set()) {
  const idx = lua.lua_absindex(L, indice);
  switch (lua.lua_type(L, idx)) {
    case lua.LUA_TNIL:
    case lua.LUA_TNONE: return undefined;
    case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, idx);
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, idx);
    case lua.LUA_TSTRING: return aTexto(lua.lua_tolstring(L, idx));
    case lua.LUA_TFUNCTION: return '[función]';
    case lua.LUA_TTABLE: break;
    default: return '[userdata]';
  }
  const puntero = lua.lua_topointer(L, idx);
  if (vistos.has(puntero)) return '[ciclo]';
  vistos.add(puntero);

  // Las tablas muy anidadas agotan los 20 huecos de pila por defecto (como en la fase 1).
  lua.lua_checkstack(L, 4);
  const pares = [];
  lua.lua_pushnil(L);
  while (lua.lua_next(L, idx) !== 0) {
    pares.push([claveJs(L, -2), aJs(L, -1, vistos)]);
    lua.lua_pop(L, 1);
  }
  vistos.delete(puntero);

  const n = pares.length;
  if (n === 0) return [];
  const esArray = pares.every(([k]) => typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= n);
  if (esArray) {
    const arr = new Array(n);
    for (const [k, v] of pares) arr[k - 1] = v;
    return arr;
  }
  const obj = {};
  for (const [k, v] of pares) obj[String(k)] = v;
  return obj;
}
