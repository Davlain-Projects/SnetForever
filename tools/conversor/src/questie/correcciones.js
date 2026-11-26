// Correcciones dinámicas de QuestieDB (plano 4 §5.2): las que en el juego dependen de la facción y la
// clase del jugador. Se calculan fuera del juego ejecutando los archivos Lua originales en fengari, con
// sustitutos mínimos de lo que esperan (QuestieLoader, módulos, UnitFactionGroup, UnitClassBase…).
//
// Resultado: { Horde: {quest, npc, object, item}, Alliance: {…} }, cada tipo { id: { campo: valor } } con los
// nombres de campo de ESQUEMA. Un valor que cambia según la clase pasa a { porClase: { WARRIOR: v, … } }
// (null = esa clase no tiene corrección para el campo). `{}` en una corrección significa «borrar el campo»
// (REG:479-481) y se guarda como el texto BORRAR.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fengari from 'fengari';
import { ESQUEMA, POR_AREA } from './esquema.js';

const { lua, lauxlib, lualib, to_luastring } = fengari;
const decodificador = new TextDecoder('utf-8');
const aTexto = (bytes) => decodificador.decode(bytes);

export const FACCIONES = ['Horde', 'Alliance'];

// Las 9 clases de Classic, con su ID de clase del juego (segundo valor de UnitClassBase).
export const CLASES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
const ID_CLASE = { WARRIOR: 1, PALADIN: 2, HUNTER: 3, ROGUE: 4, PRIEST: 5, SHAMAN: 7, MAGE: 8, WARLOCK: 9, DRUID: 11 };

export const BORRAR = '__borrar';

// Orden de config.enumFiles (src/config.lua): constants.lua primero, porque crea LibQuestieDB.Enum.
const ENUMS = [
  'constants.lua', 'items.lua', 'quests.lua', 'professions.lua', 'factions.lua',
  'zones.lua', 'phases.lua', 'icons.lua', 'waypoints.lua', 'expansions.lua',
];

// Los 8 proveedores dinámicos del Forever (config.ownedCorrections), en orden de precedencia:
// legado (ventana Era) y después Forever; el posterior gana campo a campo.
export const PROVEEDORES = [
  { archivo: 'Forever/legacy/classicQuestFixes.lua', modulo: 'QuestieQuestFixes', funcion: 'LoadFactionFixes', tipo: 'quest' },
  { archivo: 'Forever/legacy/classicNPCFixes.lua', modulo: 'QuestieNPCFixes', funcion: 'LoadFactionFixes', tipo: 'npc' },
  { archivo: 'Forever/legacy/classicItemFixes.lua', modulo: 'QuestieItemFixes', funcion: 'LoadFactionFixes', tipo: 'item' },
  { archivo: 'Forever/legacy/classicObjectFixes.lua', modulo: 'QuestieObjectFixes', funcion: 'LoadFactionFixes', tipo: 'object' },
  { archivo: 'Forever/foreverQuestFixes.lua', modulo: 'ForeverQuestFixes', funcion: 'LoadDynamic', tipo: 'quest' },
  { archivo: 'Forever/foreverNPCFixes.lua', modulo: 'ForeverNpcFixes', funcion: 'LoadDynamic', tipo: 'npc' },
  { archivo: 'Forever/foreverItemFixes.lua', modulo: 'ForeverItemFixes', funcion: 'LoadDynamic', tipo: 'item' },
  { archivo: 'Forever/foreverObjectFixes.lua', modulo: 'ForeverObjectFixes', funcion: 'LoadDynamic', tipo: 'object' },
];

const TIPOS = ['quest', 'npc', 'object', 'item'];

const cadenaLua = (s) => JSON.stringify(s); // los textos usados son ASCII sin escapes raros

// Sustitutos de compat.lua para un personaje: claves derivadas de ESQUEMA (con los alias _add/_remove,
// para que un uso de operación se vea y falle), constantes elegidas como `pick` (Forever, y si falta, las
// reglas Classic), los módulos que importan los archivos, QuestieLoader, Questie y las funciones Unit*.
function preludio(faccion, clase) {
  const esquemas = TIPOS.map((t) => `${t} = {${ESQUEMA[t].map(cadenaLua).join(', ')}}`).join(',\n  ');
  return `
local ns = __SNF.ns
local constants = ns.Enum
if type(constants) ~= "table" then error("los enums no crearon LibQuestieDB.Enum", 0) end

local esquemas = {
  ${esquemas}
}
for tipo, campos in pairs(esquemas) do
  local keys = {}
  for indice, campo in ipairs(campos) do
    keys[campo] = indice
    keys[campo .. "_add"] = indice + 1000
    keys[campo .. "_remove"] = indice - 1000
  end
  constants[tipo .. "Keys"] = keys
end

-- Como compat.pick: compartida si existe (salvo classKeys y npcFlags), si no Forever, si no Classic.
local ACTIVAS = { classKeys = true, npcFlags = true }
local function pick(nombre)
  local compartida = (not ACTIVAS[nombre]) and constants[nombre] or nil
  if compartida ~= nil then return compartida end
  local por = constants.byExpansion
  if type(por) ~= "table" or type(por.Forever) ~= "table" then
    error("faltan constants.byExpansion.Forever", 0)
  end
  local valor = por.Forever[nombre]
  if valor == nil and type(por.Classic) == "table" then valor = por.Classic[nombre] end
  if valor == nil then error("constante desconocida: " .. nombre, 0) end
  return valor
end

local capturado = { questData = {}, npcData = {}, itemData = {}, objectData = {} }

local QuestieDB = {
  questKeys = constants.questKeys, npcKeys = constants.npcKeys,
  itemKeys = constants.itemKeys, objectKeys = constants.objectKeys,
  raceKeys = pick("raceKeys"), classKeys = pick("classKeys"), sortKeys = pick("sortKeys"),
  specialFlags = pick("specialFlags"), factionIDs = pick("factionIDs"), questFlags = pick("questFlags"),
  npcFlags = pick("npcFlags"), itemClasses = pick("itemClasses"), waypointPresets = pick("waypointPresets"),
}
for nombre, buffer in pairs(capturado) do QuestieDB[nombre] = buffer end
local function invertir(keys)
  local r = {}
  for k, i in pairs(keys) do r[i] = k end
  return r
end
QuestieDB.questKeysReversed = invertir(QuestieDB.questKeys)
QuestieDB.npcKeysReversed = invertir(QuestieDB.npcKeys)
QuestieDB.itemKeysReversed = invertir(QuestieDB.itemKeys)
QuestieDB.objectKeysReversed = invertir(QuestieDB.objectKeys)

local modulos = {
  QuestieDB = QuestieDB,
  ZoneDB = { zoneIDs = pick("zoneIDs") },
  QuestieProfessions = {
    professionKeys = pick("professionKeys"),
    specializationKeys = pick("specializationKeys"),
    rankNames = pick("rankNames"),
  },
  -- Pistas de orden de objetivos: no son datos de entidad; se descartan aquí.
  QuestieCorrections = {
    killCreditObjectiveFirst = {}, objectObjectiveFirst = {}, itemObjectiveFirst = {},
    eventObjectiveFirst = {}, spellObjectiveFirst = {},
  },
  Phasing = { phases = pick("phases") },
  -- l10n(texto) devuelve el texto inglés, como en compat.lua.
  l10n = setmetatable({}, { __call = function(_, texto) return texto end }),
  -- config.expansionOrder con las reglas Classic del Forever.
  Expansions = { Era = 1, Classic = 1, Tbc = 2, Wotlk = 3, Cata = 4, MoP = 5, Current = 1 },
}

QuestieLoader = {
  ImportModule = function(_, nombre)
    modulos[nombre] = modulos[nombre] or {}
    return modulos[nombre]
  end,
  CreateModule = function(_, nombre)
    modulos[nombre] = modulos[nombre] or {}
    return modulos[nombre]
  end,
}

Questie = {}
for nombre, valor in pairs(constants.iconTypes or {}) do Questie[nombre] = valor end

local FACCION, CLASE, ID_CLASE = ${cadenaLua(faccion)}, ${cadenaLua(clase)}, ${ID_CLASE[clase]}
function UnitFactionGroup(_) return FACCION, FACCION end
function UnitClassBase(_) return CLASE, ID_CLASE end

-- Llama a M:funcion() del módulo y comprueba que no escribió directamente en QuestieDB.*Data.
function __SNF.ejecutar(modulo, funcion)
  local m = modulos[modulo]
  if type(m) ~= "table" or type(m[funcion]) ~= "function" then
    error("el módulo " .. modulo .. " no define " .. funcion, 0)
  end
  local resultado = m[funcion](m)
  for nombre, buffer in pairs(capturado) do
    if next(buffer) ~= nil then
      error("escritura directa en QuestieDB." .. nombre .. " (no se admite)", 0)
    end
  end
  if type(resultado) ~= "table" then error(funcion .. " no devolvió una tabla", 0) end
  return resultado
end
`;
}

function mensajeError(L) {
  const bytes = lua.lua_tolstring(L, -1);
  return bytes ? aTexto(bytes) : '(error de Lua sin mensaje)';
}

// Estado con solo base, string, table y math (sin io, os, package, debug); dofile y loadfile se quitan.
function nuevoEstado() {
  const L = lauxlib.luaL_newstate();
  const librerias = [
    ['_G', lualib.luaopen_base],
    [lualib.LUA_STRLIBNAME, lualib.luaopen_string],
    [lualib.LUA_TABLIBNAME, lualib.luaopen_table],
    [lualib.LUA_MATHLIBNAME, lualib.luaopen_math],
  ];
  for (const [nombre, abrir] of librerias) {
    lauxlib.luaL_requiref(L, to_luastring(nombre), abrir, 1);
    lua.lua_pop(L, 1);
  }
  for (const nombre of ['dofile', 'loadfile']) {
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, to_luastring(nombre));
  }
  return L;
}

// Compila `bytes` y lo ejecuta con los argumentos de un archivo de addon ("QuestieDB", espacio de nombres).
function ejecutarArchivo(L, bytes, nombre) {
  if (lauxlib.luaL_loadbuffer(L, bytes, bytes.length, to_luastring(`=${nombre}`)) !== lua.LUA_OK) {
    throw new Error(`Error de Lua en ${nombre}: ${mensajeError(L)}`);
  }
  lua.lua_pushstring(L, to_luastring('QuestieDB'));
  lua.lua_getglobal(L, to_luastring('__SNF'));
  lua.lua_getfield(L, -1, to_luastring('ns'));
  lua.lua_remove(L, -2);
  if (lua.lua_pcall(L, 2, 0, 0) !== lua.LUA_OK) {
    throw new Error(`Error de Lua en ${nombre}: ${mensajeError(L)}`);
  }
}

// Lee el valor Lua en `indice` como primitivo o { pares: [[clave, valor], …] } (sin interpretar aún).
function leerValor(L, indice, vistos = new Set()) {
  const idx = lua.lua_absindex(L, indice);
  const tipo = lua.lua_type(L, idx);
  switch (tipo) {
    case lua.LUA_TNIL: return undefined;
    case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, idx);
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, idx);
    case lua.LUA_TSTRING: return aTexto(lua.lua_tolstring(L, idx));
    case lua.LUA_TTABLE: break;
    default:
      throw new Error(`valor Lua no convertible: ${aTexto(lua.lua_typename(L, tipo))}`);
  }
  const puntero = lua.lua_topointer(L, idx);
  if (vistos.has(puntero)) throw new Error('tabla Lua con referencia circular');
  vistos.add(puntero);
  const pares = [];
  lua.lua_pushnil(L);
  while (lua.lua_next(L, idx) !== 0) {
    const tipoClave = lua.lua_type(L, -2);
    let clave;
    if (tipoClave === lua.LUA_TNUMBER) clave = lua.lua_tonumber(L, -2);
    else if (tipoClave === lua.LUA_TSTRING) clave = aTexto(lua.lua_tolstring(L, -2));
    else throw new Error(`clave de tabla no admitida (${aTexto(lua.lua_typename(L, tipoClave))})`);
    pares.push([clave, leerValor(L, -1, vistos)]);
    lua.lua_pop(L, 1);
  }
  vistos.delete(puntero);
  return { pares };
}

const esTabla = (v) => v !== null && typeof v === 'object' && Array.isArray(v.pares);
const enteroPositivo = (k) => typeof k === 'number' && Number.isInteger(k) && k >= 1;

// Tabla Lua -> JS, con la misma regla que entidades.js: claves 1..n -> array con huecos (null); si no, objeto.
function aJs(v) {
  if (!esTabla(v)) return v;
  if (v.pares.length === 0) return [];
  if (v.pares.every(([k]) => enteroPositivo(k))) {
    const max = Math.max(...v.pares.map(([k]) => k));
    const salida = new Array(max).fill(null);
    for (const [k, x] of v.pares) salida[k - 1] = aJs(x);
    return salida;
  }
  const o = {};
  for (const [k, x] of v.pares) o[String(k)] = aJs(x);
  return o;
}

// Tabla indexada por AreaID (spawns, waypoints): siempre objeto { areaId: … }.
function porAreaJs(v) {
  if (!esTabla(v)) return v;
  const o = {};
  for (const [k, x] of v.pares) o[String(k)] = aJs(x);
  return o;
}

// Resultado de un proveedor -> { id: { campo: valor } } con nombres de ESQUEMA.
function interpretar(resultado, tipo, archivo) {
  const salida = {};
  const campos = ESQUEMA[tipo];
  for (const [id, fila] of resultado.pares) {
    if (!enteroPositivo(id)) throw new Error(`${archivo}: id de ${tipo} no válido: ${id}`);
    if (!esTabla(fila)) throw new Error(`${archivo}: la corrección de ${tipo} ${id} no es una tabla`);
    const destino = {};
    for (const [indice, valor] of fila.pares) {
      if (typeof indice === 'number' && (indice >= 1000 || indice <= 0)) {
        throw new Error(`${archivo}: clave de operación ${indice} en ${tipo} ${id} (añadir/quitar no se admite)`);
      }
      if (!Number.isInteger(indice) || indice > campos.length) {
        throw new Error(`${archivo}: campo desconocido ${indice} en ${tipo} ${id}`);
      }
      const campo = campos[indice - 1];
      if (esTabla(valor) && valor.pares.length === 0) destino[campo] = BORRAR;
      else if (POR_AREA[tipo]?.includes(campo)) destino[campo] = porAreaJs(valor);
      else destino[campo] = aJs(valor);
    }
    salida[id] = destino;
  }
  return salida;
}

// Ejecuta los enums y los 8 proveedores para un personaje (facción, clase) en un estado nuevo, y funde
// los resultados por tipo en orden (el posterior gana campo a campo).
function calcularPersonaje(dirCorrecciones, faccion, clase) {
  const L = nuevoEstado();
  try {
    const iniciar = to_luastring('__SNF = { ns = {} }');
    if (lauxlib.luaL_dostring(L, iniciar) !== lua.LUA_OK) throw new Error(`Error de Lua: ${mensajeError(L)}`);
    for (const archivo of ENUMS) {
      const ruta = join(dirCorrecciones, 'enum', archivo);
      ejecutarArchivo(L, readFileSync(ruta), `enum/${archivo}`);
    }
    const codigo = to_luastring(preludio(faccion, clase));
    if (lauxlib.luaL_loadbuffer(L, codigo, codigo.length, to_luastring('=preludio de correcciones')) !== lua.LUA_OK
      || lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
      throw new Error(`Error de Lua en el preludio de correcciones: ${mensajeError(L)}`);
    }

    const fundido = { quest: {}, npc: {}, object: {}, item: {} };
    for (const { archivo, modulo, funcion, tipo } of PROVEEDORES) {
      ejecutarArchivo(L, readFileSync(join(dirCorrecciones, archivo)), archivo);
      lua.lua_getglobal(L, to_luastring('__SNF'));
      lua.lua_getfield(L, -1, to_luastring('ejecutar'));
      lua.lua_remove(L, -2);
      lua.lua_pushstring(L, to_luastring(modulo));
      lua.lua_pushstring(L, to_luastring(funcion));
      if (lua.lua_pcall(L, 2, 1, 0) !== lua.LUA_OK) {
        throw new Error(`Error de Lua en ${archivo} (${funcion}, ${faccion}/${clase}): ${mensajeError(L)}`);
      }
      let filas;
      try {
        filas = interpretar(leerValor(L, -1), tipo, archivo);
      } finally {
        lua.lua_pop(L, 1);
      }
      for (const [id, campos] of Object.entries(filas)) {
        fundido[tipo][id] = { ...(fundido[tipo][id] || {}), ...campos };
      }
    }
    return fundido;
  } finally {
    lua.lua_close(L);
  }
}

// Texto canónico para comparar valores sin depender del orden de las claves.
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// Pliega las 9 clases de una facción: valor normal si todas coinciden; si no, { porClase: {…} }.
function plegarClases(porClase) {
  const salida = { quest: {}, npc: {}, object: {}, item: {} };
  for (const tipo of TIPOS) {
    const ids = new Set();
    for (const clase of CLASES) for (const id of Object.keys(porClase[clase][tipo])) ids.add(id);
    for (const id of ids) {
      const campos = new Set();
      for (const clase of CLASES) for (const c of Object.keys(porClase[clase][tipo][id] || {})) campos.add(c);
      const fila = {};
      for (const campo of campos) {
        const valores = CLASES.map((clase) => porClase[clase][tipo][id]?.[campo]);
        const primero = canonico(valores[0]);
        const iguales = valores[0] !== undefined && valores.every((v) => v !== undefined && canonico(v) === primero);
        if (iguales) {
          fila[campo] = valores[0];
        } else {
          const mapa = {};
          CLASES.forEach((clase, i) => { mapa[clase] = valores[i] === undefined ? null : valores[i]; });
          fila[campo] = { porClase: mapa };
        }
      }
      salida[tipo][id] = fila;
    }
  }
  return salida;
}

/**
 * Calcula las correcciones dinámicas del Forever por facción y clase.
 * @param {string} dirQuestieDB carpeta del addon QuestieDB (solo lectura)
 * @returns {{Horde: {quest: object, npc: object, object: object, item: object}, Alliance: object}}
 */
export function leerCorrecciones(dirQuestieDB) {
  const dirCorrecciones = join(dirQuestieDB, 'src', 'corrections');
  const resultado = {};
  for (const faccion of FACCIONES) {
    const porClase = {};
    for (const clase of CLASES) porClase[clase] = calcularPersonaje(dirCorrecciones, faccion, clase);
    resultado[faccion] = plegarClases(porClase);
  }
  return resultado;
}
