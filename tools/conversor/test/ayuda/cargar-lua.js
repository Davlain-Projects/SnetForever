// Ayuda de pruebas: ejecuta archivos Lua en un estado fengari limpio y devuelve los globales de datos.
import { readFileSync } from 'node:fs';
import fengari from 'fengari';

const { lua, lauxlib, lualib, to_luastring } = fengari;
const decodificador = new TextDecoder('utf-8');

const aTexto = (bytes) => decodificador.decode(bytes);

function mensajeError(L) {
  const bytes = lua.lua_tolstring(L, -1);
  return bytes ? aTexto(bytes) : '(error de Lua sin mensaje)';
}

// Convierte el valor de la cima de la pila a JS (sin sacarlo).
function aJs(L, indice, vistos = new Set()) {
  const idx = lua.lua_absindex(L, indice);
  switch (lua.lua_type(L, idx)) {
    case lua.LUA_TNIL: return undefined;
    case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, idx);
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, idx);
    case lua.LUA_TSTRING: return aTexto(lua.lua_tolstring(L, idx));
    case lua.LUA_TTABLE: break;
    default:
      throw new Error(`Valor Lua no convertible: ${aTexto(lua.lua_typename(L, lua.lua_type(L, idx)))}`);
  }
  const puntero = lua.lua_topointer(L, idx);
  if (vistos.has(puntero)) throw new Error('Tabla Lua con referencia circular');
  vistos.add(puntero);

  // Las tablas muy anidadas (guías: guía → paso → elemento → punto…) agotan los 20 huecos por defecto.
  lua.lua_checkstack(L, 4);
  const pares = [];
  lua.lua_pushnil(L);
  while (lua.lua_next(L, idx) !== 0) {
    const tipoClave = lua.lua_type(L, -2);
    // La clave se lee sin convertirla en la pila (lua_next necesita la original).
    const clave = tipoClave === lua.LUA_TNUMBER
      ? lua.lua_tonumber(L, -2)
      : aTexto(lua.lua_tolstring(L, -2));
    pares.push([clave, aJs(L, -1, vistos)]);
    lua.lua_pop(L, 1);
  }
  vistos.delete(puntero);

  const n = pares.length;
  const esArray = n > 0 && pares.every(([k]) => typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= n);
  if (esArray) {
    const arr = new Array(n);
    for (const [k, v] of pares) arr[k - 1] = v;
    return arr;
  }
  if (n === 0) return []; // tabla vacía: se trata como lista vacía
  const obj = {};
  for (const [k, v] of pares) obj[String(k)] = v;
  return obj;
}

function ejecutar(L, bytes, nombre) {
  const estado = lauxlib.luaL_loadbuffer(L, bytes, bytes.length, to_luastring(`=${nombre}`));
  if (estado !== lua.LUA_OK || lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
    const msg = mensajeError(L);
    throw new Error(`Error de Lua en ${nombre}: ${msg}`);
  }
}

/**
 * Ejecuta `prelude` (opcional) y luego los archivos en orden, en un estado limpio.
 * Devuelve { SNF_RUTAS, SNF_MISIONES } convertidos a JS (undefined si no se definieron).
 */
export async function cargarLua(archivos, { prelude } = {}) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  try {
    if (prelude) ejecutar(L, to_luastring(prelude), 'prelude');
    for (const archivo of archivos) ejecutar(L, readFileSync(archivo), archivo);
    const resultado = {};
    for (const nombre of ['SNF_RUTAS', 'SNF_MISIONES']) {
      lua.lua_getglobal(L, to_luastring(nombre));
      resultado[nombre] = aJs(L, -1);
      lua.lua_pop(L, 1);
    }
    return resultado;
  } finally {
    lua.lua_close(L);
  }
}
