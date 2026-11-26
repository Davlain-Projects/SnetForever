// Lote H, ronda 1 (I1 y M7): la lista negra de misiones de Questie, tal como la aplica Questie en el Forever, y las
// misiones que los personajes de la cuenta tienen hechas según Questie (WTF), que son prueba del juego. Todo se lee:
// nunca se escribe en la carpeta del juego.
//
// Cómo decide Questie qué se oculta en el Forever (Questie del juego, leído el 11-nov-2026):
//   - Modules/VersionCheck.lua:60: `Questie.IsForever` (interfaz 16000-16999). Modules/Expansions.lua: en el Forever,
//     `Expansions.Current = Expansions.Era`, sea cual sea WOW_PROJECT_ID.
//   - Database/Corrections/QuestieCorrections.lua:178: `hiddenQuests = BlacklistFilter.filterExpansion(
//     QuestieQuestBlacklist:Load())`. filterExpansion (BlacklistFilter.lua:7-15) quita las entradas `false`.
//   - QuestieQuestBlacklist:Load() es una sola tabla: entradas `true`, `false`, HIDE_ON_MAP y condiciones sobre
//     `Expansions.Current` (más una sobre `Questie.IsChinaRegion`), con la sección «--- Forever quests» al final. Después,
//     solo con temporada (IsSoD, IsTBC, IsAnniversaryEra/Hardcore, IsSoM, IsMoP; VersionCheck.lua:64-110, que en el
//     Forever, sin temporada activa, son falsas) se filtra por fases. LoadAutoBlacklistWotlk y la de Titan Reforged solo
//     a partir de Wotlk (QuestieCorrections.lua:190), y la de Hardcore solo en reinos Hardcore: aquí no.
//   - QuestieDB.lua:1009: la misión se oculta si su valor es verdadero y no es HIDE_ON_MAP (HIDE_ON_MAP: se ve en el
//     diario, no en el mapa; esas no se quitan).
// Aquí se ejecuta Modules/Expansions.lua y la lista en fengari con esos valores (región que no es China) y se quedan
// las entradas que valen `true`, con su línea y su comentario.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fengari from 'fengari';

const { lua, lauxlib, lualib, to_luastring } = fengari;
const decodificador = new TextDecoder('utf-8');
const aTexto = (bytes) => decodificador.decode(bytes);

const RUTA_LISTA = ['Database', 'Corrections', 'QuestieQuestBlacklist.lua'];
const RUTA_EXPANSIONES = ['Modules', 'Expansions.lua'];

// Lo que hace falta para cargar los dos archivos fuera del juego, con las banderas del Forever (sin temporada).
const PRELUDIO = `
local modulos = {}
QuestieLoader = {}
function QuestieLoader:CreateModule(n) modulos[n] = modulos[n] or {} return modulos[n] end
function QuestieLoader:ImportModule(n) modulos[n] = modulos[n] or {} return modulos[n] end
QuestieLoader:ImportModule("ContentPhases").activePhases = {}
Questie = {
  IsForever = true, IsClassic = true, IsEra = true, IsSoD = false, IsSoM = false, IsTBC = false, IsWotlk = false,
  IsCata = false, IsMoP = false, IsTitanReforged = false, IsAnniversaryEra = false, IsAnniversaryTBC = false,
  IsAnniversaryHardcore = false, IsHardcore = false, IsChinaRegion = false, IsEURegion = false,
  DEBUG_DEVELOP = 0, Debug = function() end,
}
function SNF_listaNegra()
  return QuestieLoader:ImportModule("QuestieQuestBlacklist"):Load()
end
`;

function ejecutar(L, texto, nombre) {
  const bytes = to_luastring(texto);
  if (lauxlib.luaL_loadbuffer(L, bytes, bytes.length, to_luastring(`@${nombre}`)) !== lua.LUA_OK
    || lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
    throw new Error(`${nombre}: ${aTexto(lua.lua_tolstring(L, -1))}`);
  }
}

// Valores de la tabla que devuelve Load(): {id: true | 'HIDE_ON_MAP' | ...}; las `false` no llegan (filterExpansion).
function valoresDeLoad(dirQuestie) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  try {
    ejecutar(L, PRELUDIO, 'preludio');
    const expansiones = join(dirQuestie, ...RUTA_EXPANSIONES);
    if (existsSync(expansiones)) ejecutar(L, readFileSync(expansiones, 'utf8'), expansiones);
    const lista = join(dirQuestie, ...RUTA_LISTA);
    ejecutar(L, readFileSync(lista, 'utf8'), lista);
    lua.lua_getglobal(L, to_luastring('SNF_listaNegra'));
    if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) throw new Error(`${lista}: ${aTexto(lua.lua_tolstring(L, -1))}`);
    const valores = new Map();
    const t = lua.lua_gettop(L);
    lua.lua_pushnil(L);
    while (lua.lua_next(L, t) !== 0) {
      if (lua.lua_type(L, -2) === lua.LUA_TNUMBER) {
        const tipo = lua.lua_type(L, -1);
        let v;
        if (tipo === lua.LUA_TBOOLEAN) v = lua.lua_toboolean(L, -1);
        else if (tipo === lua.LUA_TSTRING) v = aTexto(lua.lua_tolstring(L, -1));
        if (v !== false && v !== undefined) valores.set(lua.lua_tonumber(L, -2), v);
      }
      lua.lua_pop(L, 1);
    }
    return valores;
  } finally {
    lua.lua_close(L);
  }
}

// Línea y comentario de cada entrada de la tabla de Load() (la última si se repite, como en Lua).
function lineasDeLoad(texto) {
  const lineas = texto.split(/\r?\n/);
  const inicio = lineas.findIndex((l) => /function\s+QuestieQuestBlacklist:Load\s*\(/.test(l));
  const salida = new Map();
  for (let i = inicio + 1; i < lineas.length; i += 1) {
    if (/^\s*return\s+questsToBlacklist\b/.test(lineas[i])) break;
    const m = /^\s*\[(\d+)\]\s*=\s*[^-]*?(?:--\s*(.*?))?\s*$/.exec(lineas[i]);
    if (m) salida.set(Number(m[1]), { linea: i + 1, nota: m[2] ?? '' });
  }
  return salida;
}

/**
 * Misiones que Questie oculta en el Forever.
 * @param {string} dirQuestie carpeta del addon Questie
 * @returns {Map<number, {linea: number, nota: string}> | null} null si no existe la carpeta
 * @throws si la carpeta existe y no trae Database/Corrections/QuestieQuestBlacklist.lua
 */
export function leerListaNegra(dirQuestie) {
  if (!existsSync(dirQuestie)) return null;
  const lista = join(dirQuestie, ...RUTA_LISTA);
  if (!existsSync(lista)) throw new Error(`Questie (${dirQuestie}) no trae ${RUTA_LISTA.join('/')}: ¿la ha cambiado de sitio?`);
  const lineas = lineasDeLoad(readFileSync(lista, 'utf8'));
  const salida = new Map();
  for (const [id, v] of valoresDeLoad(dirQuestie)) {
    if (v !== true) continue; // HIDE_ON_MAP: Questie la deja en el diario
    salida.set(id, lineas.get(id) ?? { linea: 0, nota: '' });
  }
  return salida;
}

// Lote H, ronda 2: Questie vuelve a enseñar, con su evento, misiones de fiesta que esconde con la lista negra
// (Holidays/QuestieEvent.lua:212-245: `hiddenQuests[questId] = nil`). En el Forever eso pasa con las de los archivos de
// fiestas que carga Questie_Forever.toc (Holidays/quests/*.lua: {evento, id, ..., [7] = esconder}) que:
//   - no llevan la marca de esconder (el elemento 7, que puede ser una condición sobre Expansions o Questie.IsSoD), y
//   - son de un evento que puede estar activo: con fecha en QuestieEvent.eventDates (o el Festival Lunar, con su tabla
//     lunarFestival.DEFAULT) y no desactivado en eventDateCorrections["CLASSIC"] (el Forever es Era: :158-162 y :186).
// La Feria de la Luna Negra no se destapa nunca en el Forever: no tiene fecha, `dmfIsActive` solo se calcula desde MoP
// (:199) y _LoadDarkmoonFaire (:252-256, el otro sitio que la destapa, :403-410) no se llama con IsForever.
// No depende de la fecha de hoy: basta con que el evento pueda estar activo en algún momento.
const RUTA_TOC_FOREVER = 'Questie_Forever.toc';

/**
 * Misiones de fiesta que Questie destapa en el Forever cuando su evento está activo.
 * @param {string} dirQuestie carpeta del addon Questie
 * @returns {Map<number, string>} misión → nombre del evento (vacío si no hay Questie)
 */
export function leerEventos(dirQuestie) {
  const salida = new Map();
  const toc = join(dirQuestie, RUTA_TOC_FOREVER);
  if (!existsSync(toc)) return salida;
  const archivos = readFileSync(toc, 'utf8').split(/\r?\n/).map((l) => l.trim())
    .filter((l) => /^Database\\Corrections\\Holidays\\.+\.lua$/i.test(l)).map((l) => join(dirQuestie, ...l.split('\\')));
  if (archivos.length === 0) return salida;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  try {
    ejecutar(L, `${PRELUDIO}\ntinsert = table.insert\n`, 'preludio');
    const expansiones = join(dirQuestie, ...RUTA_EXPANSIONES);
    if (existsSync(expansiones)) ejecutar(L, readFileSync(expansiones, 'utf8'), expansiones);
    for (const a of archivos) ejecutar(L, readFileSync(a, 'utf8'), a);
    ejecutar(L, `function SNF_eventos()
      local E = QuestieLoader:ImportModule("QuestieEvent")
      local clasico = (E.eventDateCorrections or {}).CLASSIC or {}
      local function puedeEstarActivo(nombre)
        if clasico[nombre] == false then return false end
        if nombre == "Lunar Festival" then return next(((E.lunarFestival or {}).DEFAULT) or {}) ~= nil end
        return (E.eventDates or {})[nombre] ~= nil
      end
      local salida = {}
      for _, q in pairs(E.eventQuests or {}) do
        if type(q[2]) == "number" and not q[7] and puedeEstarActivo(q[1]) then
          salida[#salida + 1] = string.format("%d", q[2]) .. "\\t" .. q[1]
        end
      end
      return table.concat(salida, "\\n")
    end`, 'eventos');
    lua.lua_getglobal(L, to_luastring('SNF_eventos'));
    if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) throw new Error(`eventos: ${aTexto(lua.lua_tolstring(L, -1))}`);
    for (const linea of aTexto(lua.lua_tolstring(L, -1)).split('\n').filter(Boolean)) {
      const [id, evento] = linea.split('\t');
      salida.set(Number(id), evento);
    }
    return salida;
  } finally {
    lua.lua_close(L);
  }
}

/** La carpeta WTF del cliente a partir de su carpeta Interface/AddOns (la variable SNF_WTF la sustituye). */
export function dirWtfDe(origen) {
  return process.env.SNF_WTF || join(origen, '..', '..', 'WTF');
}

// QuestieConfig.char[personaje].complete de un SavedVariables de Questie, en fengari (solo datos).
function completadasDe(ruta) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  try {
    ejecutar(L, readFileSync(ruta, 'utf8'), ruta);
    ejecutar(L, `function SNF_completadas()
      local salida = {}
      for nombre, datos in pairs((QuestieConfig or {}).char or {}) do
        for q, hecha in pairs(type(datos) == "table" and datos.complete or {}) do
          if hecha == true and type(q) == "number" then salida[#salida + 1] = nombre .. "\\t" .. string.format("%d", q) end
        end
      end
      return table.concat(salida, "\\n")
    end`, 'completadas');
    lua.lua_getglobal(L, to_luastring('SNF_completadas'));
    if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) throw new Error(`${ruta}: ${aTexto(lua.lua_tolstring(L, -1))}`);
    return aTexto(lua.lua_tolstring(L, -1)).split('\n').filter(Boolean).map((l) => l.split('\t'));
  } finally {
    lua.lua_close(L);
  }
}

/**
 * Misiones hechas por algún personaje de la cuenta según Questie: WTF/Account/<cuenta>/SavedVariables/Questie.lua.
 * @param {string} dirWtf carpeta WTF del cliente
 * @returns {Map<number, Set<string>>} misión → personajes que la tienen hecha (vacío si no hay WTF)
 */
export function leerCompletadas(dirWtf) {
  const salida = new Map();
  const cuentas = join(dirWtf, 'Account');
  if (!existsSync(cuentas)) return salida;
  for (const cuenta of readdirSync(cuentas)) {
    const ruta = join(cuentas, cuenta, 'SavedVariables', 'Questie.lua');
    if (!statSync(join(cuentas, cuenta)).isDirectory() || !existsSync(ruta)) continue;
    for (const [nombre, q] of completadasDe(ruta)) {
      const id = Number(q);
      if (!salida.has(id)) salida.set(id, new Set());
      salida.get(id).add(nombre);
    }
  }
  return salida;
}
