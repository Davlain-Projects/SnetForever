// Máquina del banco: un estado de fengari con la imitación de WoW (wow-falso.lua), los addons de datos y el addon
// cargado desde su .toc, con eventos, tiempo falso, SavedVariables y /reload.
import fengari from 'fengari';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync, deflateSync, inflateSync, gzipSync, gunzipSync } from 'node:zlib';
import { aJs, aLua, aTexto } from './lua-js.js';

const { lua, lauxlib, lualib, to_luastring } = fengari;

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_BANCO = join(AQUI, '..');
const RAIZ_REPO = join(RAIZ_BANCO, '..', '..');
const WOW_FALSO = readFileSync(join(AQUI, 'wow-falso.lua'));

// Perfil «Forever» (tarea 22): lo que NO existe en el cliente real de WoW Forever 1.60.1 (interfaz 16001), comprobado
// con /dump. Con crearMaquina({forever: true}) se quitan (además de lo que diga sinApi).
// 17-nov: tampoco la API de talentos de Classic (GetNumTalentTabs no existe en el motor moderno; los atajos de
// Blizzard_DeprecatedSpecialization no se cargan con el tipo de juego «camelot»): sus talentos van por C_Traits.
export const SIN_API_FOREVER = [
  'GetItemCount', 'GetNumSkillLines', 'GetSkillLineInfo', 'GetSpellCooldown', 'UnitBuff', 'UnitDebuff',
  'GetMinimapShape', 'GetQuestLogTitle', 'GetContainerItemInfo',
  'GetNumTalentTabs', 'GetTalentTabInfo', 'GetNumTalents', 'GetTalentInfo', 'UnitCharacterPoints',
];

const POR_DEFECTO = {
  addon: join(RAIZ_REPO, 'addons', 'SnetForever'),
  // El addon de comercio (0.7.0), que depende del núcleo y se carga después de su ADDON_LOADED. Por defecto (null), la
  // carpeta SnetForever_Comercio junto a la del núcleo; si no está (un addon de prueba en una carpeta temporal), no se
  // carga, como un addon que no está instalado. sinComercio: true (o la variable de entorno SNF_SIN_COMERCIO=1, la
  // pasada de solo núcleo: npm run test:nucleo) imita que la carpeta NO está instalada («MISSING»): no se carga ni tras
  // C_AddOns.EnableAddOn y recargar(). Para «instalado pero desactivado» («DISABLED»), ranurasDesactivadas.
  comercio: null,
  sinComercio: process.env.SNF_SIN_COMERCIO === '1',
  datos: [join(RAIZ_BANCO, 'fixtures', 'rutas-mini.lua'), join(RAIZ_BANCO, 'fixtures', 'misiones-mini.lua')],
  jugador: {},
  guardado: {},
  sinApi: [],
  forever: false,
  codificacion: false,
  pantalla: { ancho: 1920, alto: 1080 },
  addonsDir: null,
  sonido: true,
  ranurasDesactivadas: [],
  arrancar: true,
  entrar: true,
  previo: null,
  // F2b: la forma de Enum.BagIndex: "clasico" (Bank -1 y BankBag_n, la de siempre) o "forever" (la de /dump Enum.BagIndex
  // en Forever: bolsa de componentes 5, pestañas del banco 6-14 y del banco de cuenta 15-23, llavero -1; BANCO.bolsasDeForever).
  bolsas: 'clasico',
  vigilarSecretos: [],
};

// Comparaciones que la opción vigilarSecretos envuelve: `ruta.de.campos ==|~= nil|"texto"` (ver BANCO.vigilar).
const COMPARACION = /(?<![\w.:"'])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(\s*(?:==|~=)\s*(?:nil\b|"[^"\n]*"))/g;
const PALABRAS = new Set(['nil', 'not', 'and', 'or', 'return', 'then', 'else', 'do', 'end', 'local', 'if', 'elseif']);

/** Fuente con las comparaciones con nil o con un texto envueltas en BANCO.vigilar (solo para pruebas). */
export function vigilarComparaciones(fuente) {
  return fuente.split('\n').map((linea) => {
    const comentario = linea.indexOf('--');
    const codigo = comentario >= 0 ? linea.slice(0, comentario) : linea;
    const resto = comentario >= 0 ? linea.slice(comentario) : '';
    return codigo.replace(COMPARACION, (todo, ruta, cola) => (PALABRAS.has(ruta) ? todo : `BANCO.vigilar(${ruta})${cola}`)) + resto;
  }).join('\n');
}

/**
 * Lee un .toc: {metadatos: {clave: valor}, archivos: [ruta relativa con /]}.
 * Solo admite .lua (el addon no lleva .xml) y todos tienen que existir.
 */
export function leerToc(rutaToc) {
  const dir = dirname(rutaToc);
  const metadatos = {};
  const archivos = [];
  for (const bruta of readFileSync(rutaToc, 'utf8').split(/\r?\n/)) {
    const linea = bruta.trim();
    if (!linea) continue;
    const meta = /^##\s*([^:]+?)\s*:\s*(.*)$/.exec(linea);
    if (meta) {
      metadatos[meta[1]] = meta[2];
      continue;
    }
    if (linea.startsWith('#')) continue;
    const archivo = linea.replace(/\\/g, '/');
    if (extname(archivo).toLowerCase() !== '.lua') throw new Error(`${rutaToc}: solo se admiten .lua (${archivo})`);
    if (!existsSync(join(dir, archivo))) throw new Error(`${rutaToc}: no existe ${archivo}`);
    archivos.push(archivo);
  }
  return { metadatos, archivos };
}

const lista = (texto) => (texto ? texto.split(',').map((s) => s.trim()).filter(Boolean) : []);

// Manejador de mensajes de lua_pcall: añade la traza al error.
function conTraza(L) {
  const mensaje = lua.lua_tolstring(L, 1) ?? to_luastring('(error de Lua que no es texto)');
  lauxlib.luaL_traceback(L, L, mensaje, 1);
  return 1;
}

class Maquina {
  constructor(L, opciones) {
    this._L = L;
    this._opciones = opciones;
    this._puestos = [...(opciones._puestos || [])];
    this._guardadas = [];
  }

  _vivo() {
    if (!this._L) throw new Error('La máquina está cerrada');
    return this._L;
  }

  // Carga `bytes` como chunk y lo ejecuta; devuelve el primer resultado en JS. Un error sube como Error de JS.
  _ejecutar(bytes, nombre) {
    const L = this._vivo();
    const base = lua.lua_gettop(L);
    lua.lua_pushcfunction(L, conTraza);
    if (lauxlib.luaL_loadbuffer(L, bytes, bytes.length, to_luastring(nombre)) !== lua.LUA_OK) {
      const msg = aTexto(lua.lua_tolstring(L, -1));
      lua.lua_settop(L, base);
      throw new Error(`Error de sintaxis en ${nombre}: ${msg}`);
    }
    return this._llamar(base, 0);
  }

  // Llama a la función que hay en la cima con `nArgs` argumentos encima (el manejador está en base + 1).
  _llamar(base, nArgs) {
    const L = this._L;
    if (lua.lua_pcall(L, nArgs, 1, base + 1) !== lua.LUA_OK) {
      const msg = aTexto(lua.lua_tolstring(L, -1));
      lua.lua_settop(L, base);
      throw new Error(msg);
    }
    const valor = aJs(L, -1);
    lua.lua_settop(L, base);
    return valor;
  }

  // Llama a BANCO[funcion](fuente, nombreArchivo, addon) pasando la fuente como bytes.
  _cargarFuente(funcion, bytes, nombreArchivo, addon) {
    const L = this._vivo();
    const base = lua.lua_gettop(L);
    lua.lua_pushcfunction(L, conTraza);
    lua.lua_getglobal(L, to_luastring('BANCO'));
    lua.lua_getfield(L, -1, to_luastring(funcion));
    lua.lua_remove(L, -2);
    lua.lua_pushstring(L, bytes);
    lua.lua_pushstring(L, to_luastring(nombreArchivo));
    lua.lua_pushstring(L, to_luastring(addon));
    return this._llamar(base, 3);
  }

  _banco(funcion, ...args) {
    return this.lua(`BANCO.${funcion}(${args.map(aLua).join(', ')})`);
  }

  // Ejecuta código de Lua y devuelve el primer valor en JS. Acepta una expresión («SnetForever.VERSION») o sentencias.
  lua(codigo) {
    const conReturn = to_luastring(`return ${codigo}`);
    const L = this._vivo();
    const base = lua.lua_gettop(L);
    const cabe = lauxlib.luaL_loadbuffer(L, conReturn, conReturn.length, to_luastring('=prueba')) === lua.LUA_OK;
    lua.lua_settop(L, base);
    return this._ejecutar(cabe ? conReturn : to_luastring(codigo), '=prueba');
  }

  disparar(evento, ...args) {
    this._banco('disparar', evento, ...args);
  }

  avanzar(segundos) {
    this._banco('avanzar', segundos);
  }

  // Sin argumentos devuelve el jugador; con cambios, los aplica y lo devuelve.
  jugador(cambios) {
    return cambios === undefined ? this.lua('BANCO.jugador') : this._banco('ponerJugador', cambios);
  }

  // Nombre que da el juego (caché del cliente) a una misión, objeto o zona: tipo «mision», «item» o «zona».
  nombreJuego(tipo, id, nombre) {
    this._banco('ponerNombre', tipo, id, nombre);
  }

  estadoMision(q, datos) {
    this._banco('ponerMision', q, datos);
  }

  // Misiones del registro bajo una cabecera colapsada: C_QuestLog.GetInfo no las enumera (IsOnQuest sí las ve).
  registroColapsado(qs) {
    this._banco('ponerColapsadas', qs);
  }

  objeto(id, cuenta, opciones = {}) {
    this._banco('ponerObjeto', id, cuenta, opciones);
  }

  // Fase 4, tarea 7. Pone (o con `datos` undefined vacía) un hueco de una bolsa: {id, n, calidad?, ligado?, enlace?} (T1a:
  // enlace, el hyperlink de ese hueco tal cual; sin él, el de siempre por su id). Bolsas: 0 mochila,
  // 1-4, -1 banco, 5-10 bolsas del banco; con bolsas: 'forever' (F2b), 5 la de componentes, 6-14 las pestañas del banco,
  // 15-23 las del banco de cuenta y -1 el llavero. No lanza eventos (hay que disparar BAG_UPDATE_DELAYED).
  bolsa(bolsa, hueco, datos) {
    this._banco('ponerBolsa', bolsa, hueco, datos);
  }

  // Cambia los huecos de una bolsa (por defecto: mochila 16, banco 28, las demás 12).
  huecos(bolsa, n) {
    this._banco('ponerHuecos', bolsa, n);
  }

  // Fase 4, tarea 10. Enseña el objeto `id` en GameTooltip como el cliente (TooltipDataProcessor si existe, si no
  // OnTooltipSetItem) y devuelve los textos de sus líneas.
  // Task 20d: con `tooltip` («ItemRefTooltip»), lo enseña ahí en vez de en GameTooltip.
  tooltipObjeto(id, tooltip) {
    return this.lua(`BANCO.mostrarTooltipObjeto(${aLua(id)}${tooltip ? `, ${aLua(tooltip)}` : ''})`) || [];
  }

  // Task 20d: el detalle de las líneas del tooltip: [{izq, der, colorIzq, colorDer}] (colores {r, g, b} o nil).
  detalleTooltip(tooltip) {
    return this.lua(`BANCO.detalleTooltip(${tooltip ? aLua(tooltip) : ''})`) || [];
  }

  // Pone el objeto `id` en el hueco de equipo 1-19 (GetInventoryItemLink, C_TooltipInfo.GetInventoryItem).
  equipar(hueco, id) {
    this._banco('ponerEquipo', hueco, id);
  }

  // Lo que da GetItemInfo del objeto (en caché): {nombre, calidad, nivel, nivelMin, tipo, subtipo, apilado, equipa, icono,
  // precio, clase, subclase, ligadura, estadisticas?: {ITEM_MOD_…: n}, tooltip?: [líneas]}. Sin esta llamada no está en caché.
  itemInfo(id, datos) {
    this._banco('ponerInfoObjeto', id, datos);
  }

  // Las guías y misiones puestas se vuelven a poner tras recargar(), como si estuvieran en los addons de datos.
  ponerGuia(guia) {
    this._banco('ponerGuia', guia);
    this._puestos.push(['ponerGuia', [guia]]);
  }

  datoMision(q, registro) {
    this._banco('datoMision', q, registro);
    this._puestos.push(['datoMision', [q, registro]]);
  }

  // Tarea D4. Pone (o con `datos` undefined quita) una unidad: «target», «mouseover», «npc», «pet» o «nameplateN».
  // datos: {guid?, nombre?, muerto?, jugador?, nombreSecreto?, guidSecreto?}. No lanza eventos (hay que dispararlos).
  unidad(unidad, datos) {
    this._banco('ponerUnidad', unidad, datos);
  }

  // Pone una placa de nombre (con los datos de una unidad y prohibida?) y lanza NAME_PLATE_UNIT_ADDED.
  placa(unidad, datos) {
    this._banco('ponerPlaca', unidad, datos);
  }

  // Quita la placa y lanza NAME_PLATE_UNIT_REMOVED; con {sinGuid: true}, durante el evento UnitGUID da nil.
  quitarPlaca(unidad, opciones) {
    this._banco('quitarPlaca', unidad, opciones);
  }

  // Cambia el tamaño de la pantalla física (GetPhysicalScreenSize). No lanza DISPLAY_SIZE_CHANGED: hay que dispararlo.
  pantalla(tamano) {
    this._banco('ponerPantalla', tamano);
  }

  cvar(nombre, valor) {
    this._banco('ponerCVar', nombre, valor);
  }

  // Acciones que el banco bloqueó en combate: [{funcion: 'Button:Show()', marco}].
  bloqueos() {
    return this.lua('BANCO.bloqueos') || [];
  }

  marco(nombreOExpresion) {
    return this._banco('estadoMarco', nombreOExpresion);
  }

  // Lista de llamadas a la API; cada una es la lista de sus argumentos.
  llamadas(api) {
    const registro = this.lua(`BANCO.llamadas[${aLua(api)}]`) || [];
    return registro.map((llamada) => Array.from({ length: llamada.n }, (_, i) => llamada[String(i + 1)]));
  }

  guardado() {
    const salida = {};
    for (const nombre of this._guardadas) {
      const valor = this.lua(`rawget(_G, ${aLua(nombre)})`);
      if (valor !== undefined) salida[nombre] = valor;
    }
    return salida;
  }

  // Como /reload: PLAYER_LEAVING_WORLD y PLAYER_LOGOUT (wowpedia: en ese orden), se guardan las SavedVariables y se
  // carga todo de nuevo en un estado limpio.
  // Lo que se cambió en la lista de addons (C_AddOns.DisableAddOn / EnableAddOn) vale desde aquí: un addon desactivado
  // pasa a ranurasDesactivadas (no se carga; LoadAddOn da «DISABLED») y uno activado sale de la lista.
  recargar() {
    this.disparar('PLAYER_LEAVING_WORLD');
    this.disparar('PLAYER_LOGOUT');
    return this._cargarOtraVez(true);
  }

  // F2b: como salir al menú de personajes y entrar con otro de la cuenta. Con el de ahora llegan PLAYER_LEAVING_WORLD y
  // PLAYER_LOGOUT y se guardan las SavedVariables; luego se carga todo de nuevo YA con el otro (cambios de jugador, desde
  // el ADDON_LOADED). Lo de cuenta (SavedVariables, tiempo, caché de nombres de objetos) sigue; lo de cada personaje (sus
  // SavedVariablesPerCharacter, el jugador entero, misiones, objetos y bolsas, servicios, marcador) es suyo: uno nuevo
  // empieza vacío y uno que ya jugó vuelve como lo dejó (BANCO.estadoParaCambiar). Vuelve tras PLAYER_LOGIN y sin
  // PLAYER_ENTERING_WORLD: la prueba le pone sus bolsas y lo dispara (true, false), como al entrar al mundo la primera vez.
  cambiarDePersonaje(cambios = {}) {
    this.disparar('PLAYER_LEAVING_WORLD');
    this.disparar('PLAYER_LOGOUT');
    return this._cargarOtraVez(false, this._banco('estadoParaCambiar', this._guardadasCuenta, this._guardadasPJ, cambios));
  }

  _cargarOtraVez(entrar, estado = this._banco('estadoParaRecargar', this._guardadas)) {
    const desactivadas = new Set(this._opciones.ranurasDesactivadas);
    for (const [nombre, activo] of Object.entries(this.lua('BANCO.addonsCambiados') || {})) {
      if (activo) desactivadas.delete(nombre);
      else desactivadas.add(nombre);
    }
    const opciones = {
      ...this._opciones, arrancar: true, entrar, _estado: estado, _puestos: this._puestos,
      _addonsFoto: this._addonsFoto, ranurasDesactivadas: [...desactivadas],
    };
    this.cerrar();
    return crearMaquina(opciones);
  }

  errores() {
    return this.lua('BANCO.errores');
  }

  globalesNuevas() {
    return this.lua('BANCO.globalesNuevas()');
  }

  cerrar() {
    if (this._L) lua.lua_close(this._L);
    this._L = null;
  }
}

// C_EncodingUtil del cliente (wow-ui-source, EncodingUtilDocumentation.lua): CompressString / DecompressString con
// Enum.CompressionMethod (Deflate 0 = deflate crudo, Zlib 1, Gzip 2) y EncodeBase64 / DecodeBase64 (base64 estándar).
// Los textos de Lua son bytes: pasan tal cual, sin pasar por UTF-8.
const METODOS_ZLIB = [
  { comprimir: deflateRawSync, descomprimir: inflateRawSync },
  { comprimir: deflateSync, descomprimir: inflateSync },
  { comprimir: gzipSync, descomprimir: gunzipSync },
];

function funcionCodificacion(nombre, transformar) {
  return (L) => {
    try {
      const entrada = lua.lua_tolstring(L, 1);
      if (!entrada) throw new Error(`${nombre}: se esperaba un texto`);
      const metodo = lua.lua_isnumber(L, 2) ? lua.lua_tonumber(L, 2) : 0;
      const salida = transformar(Buffer.from(entrada), METODOS_ZLIB[metodo] ?? (() => { throw new Error(`${nombre}: método ${metodo} desconocido`); })());
      lua.lua_pushstring(L, new Uint8Array(salida));
      return 1;
    } catch (error) {
      return lauxlib.luaL_error(L, to_luastring('%s'), to_luastring(`C_EncodingUtil.${error.message}`));
    }
  };
}

// Pone C_EncodingUtil y Enum.CompressionMethod (antes de la foto de globales: no cuentan como globales nuevas).
function ponerCodificacion(m) {
  const L = m._vivo();
  m.lua('BANCO.espacio("C_EncodingUtil")');
  m.lua('Enum.CompressionMethod = {Deflate = 0, Zlib = 1, Gzip = 2}');
  const funciones = {
    CompressString: funcionCodificacion('CompressString', (b, z) => z.comprimir(b)),
    DecompressString: funcionCodificacion('DecompressString', (b, z) => z.descomprimir(b)),
    EncodeBase64: funcionCodificacion('EncodeBase64', (b) => Buffer.from(b.toString('base64'), 'latin1')),
    DecodeBase64: funcionCodificacion('DecodeBase64', (b) => Buffer.from(b.toString('latin1'), 'base64')),
  };
  lua.lua_getglobal(L, to_luastring('C_EncodingUtil'));
  for (const [nombre, f] of Object.entries(funciones)) {
    lua.lua_pushcfunction(L, f);
    lua.lua_setfield(L, -2, to_luastring(nombre));
  }
  lua.lua_pop(L, 1);
}

// BANCO.existeArchivo(ruta), que usa SetFont: «Interface\AddOns\X\...» existe si el archivo está en la carpeta de AddOns
// del addon (o en addonsDir); cualquier otra ruta («Fonts\FRIZQT__.TTF») se da por existente, como en el cliente.
function ponerExisteArchivo(m, op) {
  const bases = [dirname(op.addon), dirname(op.comercio), op.addonsDir].filter(Boolean);
  const L = m._vivo();
  lua.lua_getglobal(L, to_luastring('BANCO'));
  lua.lua_pushcfunction(L, (estado) => {
    const ruta = aTexto(lua.lua_tolstring(estado, 1)).replace(/\\/g, '/');
    const trozos = /^interface\/addons\/(.+)$/i.exec(ruta);
    const existe = !trozos || (!trozos[1].includes('..') && bases.some((base) => existsSync(join(base, trozos[1]))));
    lua.lua_pushboolean(estado, existe);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('existeArchivo'));
  lua.lua_pop(L, 1);
}

// Opción addonsDir: una carpeta de AddOns de verdad. Pone en BANCO dos funciones que usan PlaySoundFile y
// C_AddOns.LoadAddOn de wow-falso.lua.
//   sonidoExiste(ruta): «Interface\AddOns\X\senales\y.wav» -> true si el archivo existe ahora Y estaba en la foto
//     de «*/senales/*» sacada al crear la máquina (recargar() la saca otra vez); con sonido: false, siempre false.
//   leerAddon(nombre): lee ahora addonsDir/nombre/nombre.toc y sus archivos -> lista {ruta, fuente}; o nil y la razón
//     («MISSING» si la carpeta no existía al crear la máquina por primera vez o falta el .toc, «DISABLED» si está en
//     ranurasDesactivadas, «CORRUPT» si el .toc no se puede leer). La foto de carpetas pasa intacta por recargar().
function fotoSenales(dir) {
  const foto = new Set();
  for (const carpeta of readdirSync(dir)) {
    const senales = join(dir, carpeta, 'senales');
    if (!existsSync(senales) || !statSync(senales).isDirectory()) continue;
    for (const archivo of readdirSync(senales)) foto.add(`${carpeta}/senales/${archivo}`.toLowerCase());
  }
  return foto;
}

function ponerAddons(m, op) {
  const L = m._vivo();
  const dir = op.addonsDir;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`addonsDir: no es una carpeta: ${dir}`);
  const senales = fotoSenales(dir);
  if (!op._addonsFoto) op._addonsFoto = new Set(readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
  m._addonsFoto = op._addonsFoto;
  const desactivadas = new Set(op.ranurasDesactivadas);
  for (const carpeta of m._addonsFoto) {
    const toc = join(dir, carpeta, `${carpeta}.toc`);
    if (!existsSync(toc)) continue;
    let metadatos = {};
    try { metadatos = leerToc(toc).metadatos; } catch { /* un .toc roto sigue contando como instalado */ }
    instalado(m, carpeta, metadatos, desactivadas.has(carpeta));
  }

  const sonidoExiste = (L2) => {
    const ruta = aTexto(lua.lua_tolstring(L2, 1)) ?? '';
    const plana = ruta.replace(/\\/g, '/');
    const rel = plana.replace(/^interface\/addons\//i, '');
    const valido = op.sonido !== false && rel !== plana && !rel.split('/').includes('..')
      && senales.has(rel.toLowerCase()) && existsSync(join(dir, rel));
    lua.lua_pushboolean(L2, valido);
    return 1;
  };
  const leerAddon = (L2) => {
    const nombre = aTexto(lua.lua_tolstring(L2, 1)) ?? '';
    const falla = (razon) => { lua.lua_pushnil(L2); lua.lua_pushstring(L2, to_luastring(razon)); return 2; };
    if (!m._addonsFoto.has(nombre)) return falla('MISSING');
    if (desactivadas.has(nombre)) return falla('DISABLED');
    const toc = join(dir, nombre, `${nombre}.toc`);
    if (!existsSync(toc)) return falla('MISSING');
    let archivos;
    try {
      archivos = leerToc(toc).archivos.map((ruta) => ({ ruta, fuente: readFileSync(join(dir, nombre, ruta)) }));
    } catch { return falla('CORRUPT'); }
    lua.lua_createtable(L2, archivos.length, 0);
    archivos.forEach((a, i) => {
      lua.lua_createtable(L2, 0, 2);
      lua.lua_pushstring(L2, to_luastring(a.ruta));
      lua.lua_setfield(L2, -2, to_luastring('ruta'));
      lua.lua_pushstring(L2, new Uint8Array(a.fuente));
      lua.lua_setfield(L2, -2, to_luastring('fuente'));
      lua.lua_rawseti(L2, -2, i + 1);
    });
    return 1;
  };
  lua.lua_getglobal(L, to_luastring('BANCO'));
  lua.lua_pushcfunction(L, sonidoExiste);
  lua.lua_setfield(L, -2, to_luastring('sonidoExiste'));
  lua.lua_pushcfunction(L, leerAddon);
  lua.lua_setfield(L, -2, to_luastring('leerAddon'));
  lua.lua_pop(L, 1);
}

// Apunta un addon instalado para C_AddOns.GetAddOnInfo, DoesAddOnExist y GetAddOnEnableState (wow-falso.lua).
function instalado(m, nombre, metadatos, desactivado) {
  m.lua(`BANCO.addonsInstalados[${aLua(nombre)}] = ${aLua({ titulo: metadatos.Title, notas: metadatos.Notes, desactivado })}`);
}

function cargarDatos(m, ruta) {
  if (extname(ruta).toLowerCase() === '.toc') {
    const addon = basename(ruta, extname(ruta));
    for (const archivo of leerToc(ruta).archivos) {
      m._cargarFuente('cargarDatos', readFileSync(join(dirname(ruta), archivo)), `${addon}/${archivo}`, addon);
    }
    return;
  }
  const addon = basename(ruta, extname(ruta));
  m._cargarFuente('cargarDatos', readFileSync(ruta), `datos/${basename(ruta)}`, addon);
}

/**
 * Crea una máquina. Opciones: addon (carpeta), datos (.lua o .toc), jugador (cambios sobre el de por defecto),
 * guardado ({SnetForeverCuenta?, SnetForeverPJ?}), sinApi (rutas que se quitan), forever (quita además las APIs
 * que no tiene el cliente de WoW Forever, SIN_API_FOREVER), codificacion (C_EncodingUtil y Enum.CompressionMethod con
 * node:zlib), pantalla ({ancho, alto} físicos, 1920 × 1080 por defecto), arrancar (eventos de inicio) y
 * addonsDir (carpeta de AddOns de verdad para PlaySoundFile y C_AddOns.LoadAddOn, ver ponerAddons), sonido (false: PlaySoundFile
 * siempre da false) y ranurasDesactivadas (nombres de addon que LoadAddOn da como «DISABLED»),
 * previo (código de Lua que se ejecuta antes de cargar el addon, p. ej. un Baganator falso con rawset(_G, ...)),
 * bolsas ("clasico" o "forever": la forma de Enum.BagIndex, ver BANCO.bolsasDeForever),
 * entrar (con entrar: false se para tras PLAYER_LOGIN, sin PLAYER_ENTERING_WORLD, como en la pantalla de carga: el addon
 * ya tiene sus marcos pero aún no ha cargado la guía del personaje; sirve a las pruebas de un módulo suelto que
 * empiezan sin guía. recargar() siempre entra), vigilarSecretos (archivos del addon, como en el .toc con «/», cuyas
 * comparaciones con nil o con un texto pasan por BANCO.vigilar: comparar un secreto da error, como en el cliente; vale
 * también para los archivos del comercio), comercio (carpeta del addon de comercio; por defecto SnetForever_Comercio junto
 * al núcleo) y sinComercio (true: solo el núcleo; imita que la carpeta SnetForever_Comercio NO está instalada, «MISSING»,
 * así que ni C_AddOns.EnableAddOn lo carga tras recargar(); para «instalado y desactivado en la lista», «DISABLED», se usa
 * ranurasDesactivadas: ['SnetForever_Comercio']).
 *
 * Orden de carga, como en el cliente: archivos del núcleo, sus SavedVariables, ADDON_LOADED("SnetForever"), archivos de
 * SnetForever_Comercio, ADDON_LOADED("SnetForever_Comercio"), PLAYER_LOGIN y PLAYER_ENTERING_WORLD. El comercio no se
 * carga con sinComercio, si su carpeta no está o si está en ranurasDesactivadas (también tras C_AddOns.DisableAddOn y
 * recargar()).
 */
export function crearMaquina(opciones = {}) {
  const op = { ...POR_DEFECTO };
  for (const [clave, valor] of Object.entries(opciones)) if (valor !== undefined) op[clave] = valor;
  if (!op.comercio) op.comercio = join(dirname(op.addon), 'SnetForever_Comercio');

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const m = new Maquina(L, op);
  try {
    m._ejecutar(WOW_FALSO, '@wow-falso.lua');
    m._banco('ponerPantalla', op.pantalla);
    ponerExisteArchivo(m, op);
    if (op._estado) m.lua(`BANCO.restaurarEstado(${op._estado})`);
    else m._banco('iniciarJugador', op.jugador);
    const quitar = op.forever ? [...SIN_API_FOREVER, ...op.sinApi.filter((r) => !SIN_API_FOREVER.includes(r))] : op.sinApi;
    for (const ruta of quitar) m._banco('quitarApi', ruta);
    // Sin la opción, C_EncodingUtil no existe (como en un cliente sin ella): vale nil, no «no imitado».
    if (op.codificacion) ponerCodificacion(m);
    else m._banco('permitirNil', 'C_EncodingUtil');

    if (op.addonsDir) ponerAddons(m, op);
    // Lua que se ejecuta antes de cargar datos y addon (y antes de la foto de globales): para addons falsos como Baganator.
    if (op.bolsas === 'forever') m.lua('BANCO.bolsasDeForever()');
    else if (op.bolsas !== 'clasico') throw new Error(`bolsas: ${op.bolsas} no es "clasico" ni "forever"`);
    if (op.previo) m._ejecutar(to_luastring(op.previo), '=previo');
    m._banco('permitirNil', 'SNF_BUZON');
    for (const ruta of op.datos) cargarDatos(m, ruta);
    for (const [funcion, args] of m._puestos) m._banco(funcion, ...args);
    m.lua('BANCO.fotoGlobales()');

    const nombre = basename(op.addon);
    const { metadatos, archivos } = leerToc(join(op.addon, `${nombre}.toc`));
    m._guardadasCuenta = lista(metadatos.SavedVariables);
    m._guardadasPJ = lista(metadatos.SavedVariablesPerCharacter);
    m._guardadas = [...m._guardadasCuenta, ...m._guardadasPJ];
    for (const clave of Object.keys(op.guardado)) {
      if (!m._guardadas.includes(clave)) throw new Error(`guardado: ${clave} no es una SavedVariable del .toc`);
    }
    for (const sv of m._guardadas) m._banco('permitirNil', sv);

    const vigilados = new Set(op.vigilarSecretos);
    const cargarArchivos = (carpeta, addon, lista) => {
      for (const archivo of lista) {
        let fuente = readFileSync(join(carpeta, archivo));
        if (vigilados.has(archivo)) fuente = Buffer.from(vigilarComparaciones(fuente.toString('utf8')), 'utf8');
        m._cargarFuente('cargarArchivo', fuente, `${addon}/${archivo}`, addon);
      }
    };
    cargarArchivos(op.addon, nombre, archivos);
    instalado(m, nombre, metadatos, false);
    m.lua(`BANCO.addonsCargados[${aLua(nombre)}] = true`);

    // Como el cliente: las SavedVariables llegan después de ejecutar los archivos y antes de ADDON_LOADED.
    if (op._estado) m.lua('BANCO.ponerGuardadoPendiente()');
    else for (const sv of m._guardadas) if (op.guardado[sv] !== undefined) m.lua(`${sv} = ${aLua(op.guardado[sv])}`);

    if (op.arrancar) m.disparar('ADDON_LOADED', nombre);

    // El addon de comercio («## Dependencies: SnetForever», sin SavedVariables propias): como en el cliente, sus archivos
    // se ejecutan después del ADDON_LOADED del núcleo y su ADDON_LOADED llega antes de PLAYER_LOGIN. No se carga con
    // sinComercio ni si está en ranurasDesactivadas (desactivado en la lista de addons). Con arrancar: false sus archivos
    // se cargan igual, tras los del núcleo, sin eventos.
    const nombreComercio = basename(op.comercio);
    const tocComercio = join(op.comercio, `${nombreComercio}.toc`);
    // sinComercio imita que la carpeta no está instalada («MISSING»: ni EnableAddOn lo carga tras recargar); con
    // ranurasDesactivadas está instalado pero desactivado en la lista («DISABLED»).
    const hayComercio = existsSync(tocComercio) && !op.sinComercio;
    if (hayComercio) instalado(m, nombreComercio, leerToc(tocComercio).metadatos, op.ranurasDesactivadas.includes(nombreComercio));
    if (hayComercio && !op.ranurasDesactivadas.includes(nombreComercio)) {
      const toc = leerToc(tocComercio);
      if (lista(toc.metadatos.SavedVariables).length || lista(toc.metadatos.SavedVariablesPerCharacter).length) {
        throw new Error(`${nombreComercio}.toc: el addon de comercio usa las SavedVariables del núcleo`);
      }
      cargarArchivos(op.comercio, nombreComercio, toc.archivos);
      m.lua(`BANCO.addonsCargados[${aLua(nombreComercio)}] = true`);
      if (op.arrancar) m.disparar('ADDON_LOADED', nombreComercio);
    }

    if (op.arrancar) {
      m.disparar('PLAYER_LOGIN');
      if (!op.entrar) return m;
      // wowpedia: PLAYER_ENTERING_WORLD(isInitialLogin, isReloadingUi); tras /reload llega (false, true).
      if (op._estado) m.disparar('PLAYER_ENTERING_WORLD', false, true);
      else m.disparar('PLAYER_ENTERING_WORLD', true, false);
    }
  } catch (error) {
    m.cerrar();
    throw error;
  }
  return m;
}
