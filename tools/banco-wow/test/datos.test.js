// Personaje y acceso a los datos (nucleo/personaje.lua y nucleo/datos.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GROMMASH = { nombre: 'Grommash', apellido: 'Hellscream', nivel: 5, sexo: 2, idioma: 'esMX' };

// ---- Personaje ----

test('leer: Grommash Hellscream, orco guerrero de la Horda', () => {
  const m = nuevaMaquina({ jugador: GROMMASH });
  const pj = m.lua('SnetForever.Personaje.leer()');
  assert.equal(pj.nombre, 'Grommash Hellscream', 'F3: el nombre completo, como la clave');
  assert.equal(pj.clave, 'Grommash Hellscream');
  assert.equal(pj.clase, 'WARRIOR');
  assert.equal(pj.raza, 'Orc');
  assert.equal(pj.faccion, 'Horde');
  assert.equal(pj.nivel, 5);
  assert.equal(pj.sexo, 'male');
  assert.equal(pj.idioma, 'esMX');
  sinErrores(m);
});

test('leer: sexo 3 es female', () => {
  const m = nuevaMaquina({ jugador: { ...GROMMASH, sexo: 3 } });
  assert.equal(m.lua('SnetForever.Personaje.leer().sexo'), 'female');
  sinErrores(m);
});

test('clave: sin apellido, o con el segundo valor vacío, solo el nombre', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Grommash' } });
  assert.equal(m.lua('SnetForever.Personaje.clave()'), 'Grommash');
  assert.equal(m.lua('SnetForever.Personaje.leer().clave'), 'Grommash');
  m.jugador({ apellido: '' });
  assert.equal(m.lua('SnetForever.Personaje.clave()'), 'Grommash');
  m.jugador({ apellido: 'Hellscream' });
  assert.equal(m.lua('SnetForever.Personaje.clave()'), 'Grommash Hellscream');
  sinErrores(m);
});

// F3: en Forever UnitName("player") da nombre y apellido. Dos personajes inventados con la misma primera palabra.
test('Personaje.clave junta nombre y apellido y aguanta un UnitName que falla o da un valor secreto', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Nombre', apellido: 'Uno' } });
  const clave = () => m.lua('return SnetForever.Personaje.clave()') ?? null;
  assert.equal(clave(), 'Nombre Uno');
  m.jugador({ apellido: 'Dos' });
  assert.equal(clave(), 'Nombre Dos', 'el otro, con la misma primera palabra, tiene otra clave');
  // Un UnitName que falla: nil, sin error.
  m.lua('UNITNAME_BUENO = UnitName; UnitName = function() error("roto") end');
  assert.equal(clave(), null);
  m.lua('UnitName = UNITNAME_BUENO');
  // Un valor secreto en el nombre o en el apellido: nil (nunca el primer nombre solo, que mezclaría a los dos).
  m.lua('BANCO.jugador.apellido = BANCO.secreto("string")');
  assert.equal(clave(), null);
  m.lua('BANCO.jugador.apellido = "Dos"; BANCO.jugador.nombre = BANCO.secreto("string")');
  assert.equal(clave(), null);
  m.lua('BANCO.jugador.nombre = "Nombre"');
  assert.equal(clave(), 'Nombre Dos');
  sinErrores(m);
});

test('Personaje.leer().nombre es el nombre completo', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Nombre', apellido: 'Uno' } });
  assert.equal(m.lua('SnetForever.Personaje.leer().nombre'), 'Nombre Uno');
  assert.equal(m.lua('SnetForever.Personaje.actual().nombre'), 'Nombre Uno');
  m.jugador({ apellido: 'Dos' });
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  assert.equal(m.lua('SnetForever.Personaje.actual().nombre'), 'Nombre Dos');
  // Sin apellido (fuera de Forever), el nombre solo.
  const s = nuevaMaquina({ jugador: { nombre: 'Nombre' } });
  assert.equal(s.lua('SnetForever.Personaje.leer().nombre'), 'Nombre');
  sinErrores(m);
  sinErrores(s);
});

test('actual: la copia guardada al entrar al mundo', () => {
  const m = nuevaMaquina({ jugador: GROMMASH });
  assert.equal(m.lua('SnetForever.Personaje.actual().clave'), 'Grommash Hellscream');
  assert.equal(m.lua('SnetForever.Personaje.actual().nivel'), 5);
  sinErrores(m);
});

test('PLAYER_LEVEL_UP(6) con UnitLevel todavía en 5: actual().nivel es 6', () => {
  const m = nuevaMaquina({ jugador: GROMMASH });
  m.disparar('PLAYER_LEVEL_UP', 6);
  assert.equal(m.lua('UnitLevel("player")'), 5);
  assert.equal(m.lua('SnetForever.Personaje.actual().nivel'), 6);
  sinErrores(m);
});

test('PLAYER_ENTERING_WORLD refresca la copia (cambio de clase o de nivel)', () => {
  const m = nuevaMaquina({ jugador: GROMMASH });
  m.jugador({ nivel: 12, clase: 'SHAMAN' });
  assert.equal(m.lua('SnetForever.Personaje.actual().nivel'), 5);
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  assert.equal(m.lua('SnetForever.Personaje.actual().nivel'), 12);
  assert.equal(m.lua('SnetForever.Personaje.actual().clase'), 'SHAMAN');
  sinErrores(m);
});

// ---- Datos: comprobar, guías y versiones ----

test('comprobar: con los datos mini es verdadero', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('{SnetForever.Datos.comprobar()}'), [true]);
  sinErrores(m);
});

test('comprobar: sin SNF_RUTAS o sin SNF_MISIONES falla con «faltan»', () => {
  for (const global of ['SNF_RUTAS', 'SNF_MISIONES']) {
    const m = nuevaMaquina();
    m.lua(`BANCO.permitirNil("${global}"); ${global} = nil`);
    assert.deepEqual(m.lua('{SnetForever.Datos.comprobar()}'), [false, 'faltan']);
    sinErrores(m);
  }
});

test('comprobar: con esquema 2 falla con «esquema» (en cualquiera de los dos)', () => {
  for (const global of ['SNF_RUTAS', 'SNF_MISIONES']) {
    const m = nuevaMaquina();
    m.lua(`${global}.esquema = 2`);
    assert.deepEqual(m.lua('{SnetForever.Datos.comprobar()}'), [false, 'esquema']);
    sinErrores(m);
  }
});

test('F5-2: el .toc del addon declara en «## X-SNF-EsquemaDatos» el esquema que pide Datos.comprobar (Datos.ESQUEMA)', () => {
  const m = nuevaMaquina();
  const esquema = m.lua('SnetForever.Datos.ESQUEMA');
  assert.ok(Number.isInteger(esquema) && esquema >= 1, `Datos.ESQUEMA = ${esquema}`);
  const toc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'addons', 'SnetForever', 'SnetForever.toc'), 'utf8');
  const lineas = toc.split(/\r?\n/).filter((x) => /^##\s*X-SNF-EsquemaDatos\s*:/i.test(x));
  assert.equal(lineas.length, 1, 'una sola línea X-SNF-EsquemaDatos');
  assert.equal(lineas[0], `## X-SNF-EsquemaDatos: ${esquema}`);
  // y Datos.comprobar exige justo ese esquema en los dos addons de datos
  m.lua(`SNF_RUTAS.esquema = ${esquema}; SNF_MISIONES.esquema = ${esquema}`);
  assert.deepEqual(m.lua('{SnetForever.Datos.comprobar()}'), [true]);
  m.lua(`SNF_MISIONES.esquema = ${esquema + 1}`);
  assert.deepEqual(m.lua('{SnetForever.Datos.comprobar()}'), [false, 'esquema']);
  sinErrores(m);
});

test('guia y claves: las claves salen ordenadas y una clave de variante pasa por alias', () => {
  const m = nuevaMaquina();
  const claves = m.lua('SnetForever.Datos.claves()');
  assert.deepEqual(claves, [...claves].sort());
  assert.ok(claves.includes('Prueba (H)\\01-02 Inicio'));
  assert.ok(!claves.includes('Prueba (H)\\01-09 Cielonato'), 'las claves de variante no son claves reales');
  assert.equal(m.lua('SnetForever.Datos.guia("Prueba (H)\\\\01-02 Inicio").nombre'), '01-02 Inicio');
  assert.equal(m.lua('SnetForever.Datos.guia("Prueba (A)\\\\01-09 Cielonato").clave'), 'Prueba (A)\\01-09 Cielonato');
  // variante de la Horda → guía principal por SNF_RUTAS.alias
  assert.equal(m.lua('SnetForever.Datos.guia("Prueba (H)\\\\01-09 Cielonato").clave'), 'Prueba (A)\\01-09 Cielonato');
  assert.equal(m.lua('SnetForever.Datos.guia("No existe")'), undefined);
  sinErrores(m);
});

test('versiones: las de los dos addons de datos', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Datos.versiones()'), { rutas: '2026.11.09.1', misiones: '2026.11.09.1' });
  sinErrores(m);
});

test('esMazmorra: el área de SNF_MISIONES.mazmorra', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Datos.esMazmorra(1581)'), true);
  assert.equal(m.lua('SnetForever.Datos.esMazmorra(363)'), false);
  sinErrores(m);
});

// ---- Datos: correcciones por facción y clase ----

test('mision(788): la Horda aplica nextQuestInChain por clase; la Alianza, requiredLevel', () => {
  const guerrero = nuevaMaquina({ jugador: { clase: 'WARRIOR', faccion: 'Horde' } });
  assert.equal(guerrero.lua('SnetForever.Datos.mision(788).nextQuestInChain'), 900);
  const chaman = nuevaMaquina({ jugador: { clase: 'SHAMAN', faccion: 'Horde' } });
  assert.equal(chaman.lua('SnetForever.Datos.mision(788).nextQuestInChain'), 901);
  const alianza = nuevaMaquina({ jugador: { clase: 'WARRIOR', faccion: 'Alliance', raza: 'Human' } });
  assert.equal(alianza.lua('SnetForever.Datos.mision(788).requiredLevel'), 5);
  assert.equal(alianza.lua('SnetForever.Datos.mision(788).nextQuestInChain'), 0);
  assert.equal(guerrero.lua('SnetForever.Datos.mision(788).requiredLevel'), 1);
  sinErrores(guerrero);
  sinErrores(chaman);
  sinErrores(alianza);
});

test('mision: una clase que no aparece en porClase conserva el valor base; «__borrar» quita el campo', () => {
  const m = nuevaMaquina({ jugador: { clase: 'MAGE', faccion: 'Horde' } });
  assert.equal(m.lua('SnetForever.Datos.mision(788).nextQuestInChain'), 0);
  assert.equal(m.lua('SnetForever.Datos.mision(790).questFlags'), undefined);
  const alianza = nuevaMaquina({ jugador: { faccion: 'Alliance', raza: 'Human' } });
  assert.equal(alianza.lua('SnetForever.Datos.mision(790).questFlags'), 64);
  sinErrores(m);
  sinErrores(alianza);
});

// Tarea 22 (memoria): sin corrección no se copia ni se memoriza; la tabla original es de solo lectura.
test('mision sin corrección para la facción: la tabla original, sin copia (y la corregida sigue siendo copia)', () => {
  const m = nuevaMaquina({ jugador: { clase: 'WARRIOR', faccion: 'Horde' } });
  assert.equal(m.lua('SnetForever.Datos.mision(789) == SNF_MISIONES.quest[789]'), true);
  assert.equal(m.lua('SnetForever.Datos.mision(788) == SNF_MISIONES.quest[788]'), false);
  const alianza = nuevaMaquina({ jugador: { raza: 'Human', clase: 'WARRIOR', faccion: 'Alliance' } });
  assert.equal(alianza.lua('SnetForever.Datos.mision(790) == SNF_MISIONES.quest[790]'), true, 'la 790 solo se corrige para la Horda');
  assert.equal(alianza.lua('SnetForever.Datos.mision(788) == SNF_MISIONES.quest[788]'), false);
  sinErrores(m);
  sinErrores(alianza);
});

test('mision: no cambia la tabla original, devuelve copia y se memoriza por facción y clase', () => {
  const m = nuevaMaquina({ jugador: { clase: 'WARRIOR', faccion: 'Horde' } });
  assert.equal(m.lua('SnetForever.Datos.mision(788).nextQuestInChain'), 900);
  assert.equal(m.lua('SnetForever.Datos.mision(790).questFlags'), undefined);
  assert.equal(m.lua('SNF_MISIONES.quest[788].nextQuestInChain'), 0);
  assert.equal(m.lua('SNF_MISIONES.quest[788].requiredLevel'), 1);
  assert.equal(m.lua('SNF_MISIONES.quest[790].questFlags'), 64);
  assert.equal(m.lua('SnetForever.Datos.mision(788) == SNF_MISIONES.quest[788]'), false);
  assert.equal(m.lua('SnetForever.Datos.mision(788) == SnetForever.Datos.mision(788)'), true);
  // al cambiar de clase y refrescar el personaje sale otra memoria
  m.jugador({ clase: 'SHAMAN' });
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  assert.equal(m.lua('SnetForever.Datos.mision(788).nextQuestInChain'), 901);
  assert.equal(m.lua('SNF_MISIONES.quest[788].nextQuestInChain'), 0);
  sinErrores(m);
});

test('mision y npc: lo que no existe da nil y los datos sin corrección se devuelven completos', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Datos.mision(999999)'), undefined);
  assert.equal(m.lua('SnetForever.Datos.npc(3143).name'), 'Gornek');
  assert.equal(m.lua('SnetForever.Datos.npc(999999)'), undefined);
  sinErrores(m);
});

test('lote B (B1): ya no hay Datos.item ni Datos.objeto (sin uso; el juego solo carga sus nombres)', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Datos.item'), undefined);
  assert.equal(m.lua('SnetForever.Datos.objeto'), undefined);
  assert.equal(m.lua('SnetForever.Datos.nombreItem(159)'), 'Agua de manantial refrescante');
  sinErrores(m);
});

test('porFaccion de npc también se aplica', () => {
  const m = nuevaMaquina({ jugador: { faccion: 'Horde', clase: 'WARRIOR' } });
  m.lua(`SNF_MISIONES.porFaccion.Horde.npc[3143] = {friendlyToFaction = "__borrar", minLevel = {porClase = {WARRIOR = 11}}}`);
  assert.equal(m.lua('SnetForever.Datos.npc(3143).friendlyToFaction'), undefined);
  assert.equal(m.lua('SnetForever.Datos.npc(3143).minLevel'), 11);
  assert.equal(m.lua('SNF_MISIONES.npc[3143].friendlyToFaction'), 'H');
  assert.equal(m.lua('SNF_MISIONES.npc[3143].minLevel'), 10);
  sinErrores(m);
});

// ---- Datos: nombres ----

// Veces que se preguntó al juego el nombre de la misión q. La ventana (creada al entrar al mundo) pregunta también por
// las misiones de los pasos que enseña su lista (tarea D3): se cuentan solo las de q.
const titulosPedidos = (m, q) => m.llamadas('C_QuestLog.GetTitleForQuestID').filter((args) => args[0] === q).length;

test('nombreMision: idioma es y cliente esMX, sale el del juego', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esMX' } });
  m.nombreJuego('mision', 4641, 'Tu lugar en el mundo');
  const before = titulosPedidos(m, 4641);
  assert.equal(m.lua('SnetForever.Datos.nombreMision(4641)'), 'Tu lugar en el mundo');
  assert.equal(titulosPedidos(m, 4641) - before, 1);
  sinErrores(m);
});

test('nombreMision: idioma es y cliente enUS, sale el de es (sin preguntar al juego)', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'enUS' } });
  m.nombreJuego('mision', 4641, 'Your Place In The World');
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  const before = titulosPedidos(m, 4641);
  assert.equal(m.lua('SnetForever.Datos.nombreMision(4641)'), 'Tu lugar en el mundo');
  assert.equal(titulosPedidos(m, 4641) - before, 0);
  sinErrores(m);
});

test('nombreMision: idioma en y cliente esMX, sale el inglés sin preguntar al juego', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esMX' } });
  m.nombreJuego('mision', 4641, 'Tu lugar en el mundo');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const before = titulosPedidos(m, 4641);
  assert.equal(m.lua('SnetForever.Datos.nombreMision(4641)'), 'Your Place In The World');
  assert.equal(titulosPedidos(m, 4641) - before, 0);
  sinErrores(m);
});

test('nombreMision: si el juego no la tiene en caché cae a es, luego al inglés, luego a #id', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esES' } });
  assert.equal(m.lua('SnetForever.Datos.nombreMision(4641)'), 'Tu lugar en el mundo');
  // 789 no tiene traducción: inglés
  assert.equal(m.lua('SnetForever.Datos.nombreMision(789)'), 'Sting of the Scorpid');
  assert.equal(m.lua('SnetForever.Datos.nombreMision(999999)'), '#999999');
  sinErrores(m);
});

test('nombreMision y nombreItem: sin las APIs del juego (sinApi) no rompen', () => {
  const m = nuevaMaquina({
    jugador: { idioma: 'esES' },
    sinApi: ['C_QuestLog.GetTitleForQuestID', 'C_Item.GetItemNameByID'],
  });
  assert.equal(m.lua('SnetForever.Datos.nombreMision(788)'), 'Afilando los dientes');
  assert.equal(m.lua('SnetForever.Datos.nombreItem(159)'), 'Agua de manantial refrescante');
  sinErrores(m);
});

test('nombrePNJ: es, inglés y #id', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esES' } });
  assert.equal(m.lua('SnetForever.Datos.nombrePNJ(3)'), 'Comecarne');
  assert.equal(m.lua('SnetForever.Datos.nombrePNJ(3143)'), 'Gornek');
  assert.equal(m.lua('SnetForever.Datos.nombrePNJ(999999)'), '#999999');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(m.lua('SnetForever.Datos.nombrePNJ(3)'), 'Flesh Eater');
  sinErrores(m);
});

test('nombreItem: el juego (si el idioma coincide), es, inglés y #id', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esES' } });
  assert.equal(m.lua('SnetForever.Datos.nombreItem(159)'), 'Agua de manantial refrescante');
  m.nombreJuego('item', 159, 'Agua del juego');
  assert.equal(m.lua('SnetForever.Datos.nombreItem(159)'), 'Agua del juego');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(m.lua('SnetForever.Datos.nombreItem(159)'), 'Refreshing Spring Water');
  assert.equal(m.lua('SnetForever.Datos.nombreItem(999999)'), '#999999');
  sinErrores(m);
});

test('nombreZona: el juego y, sin C_Map.GetAreaInfo, el nombre de la mazmorra', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esES' } });
  m.nombreJuego('zona', 1581, 'Las Minas de la Muerte');
  assert.equal(m.lua('SnetForever.Datos.nombreZona(1581)'), 'Las Minas de la Muerte');
  const sin = nuevaMaquina({ jugador: { idioma: 'esES' } });
  sin.lua('BANCO.quitarApi("C_Map.GetAreaInfo")');
  assert.equal(sin.lua('SnetForever.Datos.nombreZona(1581)'), 'The Deadmines');
  assert.equal(sin.lua('SnetForever.Datos.nombreZona(424242)'), '#424242');
  sinErrores(m);
  sinErrores(sin);
});

// ---- Datos: PNJ por nombre (tarea D4, B1) ----

// Un segundo PNJ con el mismo nombre que el 3 (Flesh Eater), puesto solo para la prueba: el fixture no repite nombres.
const REPETIDO = 'SNF_MISIONES.npc[90001] = {name = "Flesh Eater", spawns = {[1411] = {{10, 20}}}}';

// idsPNJPorNombres(nombres) -> {[nombre en minúsculas] = lista de id}.
const ids = (m, nombres) => m.lua(`SnetForever.Datos.idsPNJPorNombres(${aLua(nombres)})`);

test('idsPNJPorNombres: el nombre en cualquier mayúscula da su id; dos PNJ con el mismo nombre dan dos id', () => {
  const m = nuevaMaquina();
  m.lua(REPETIDO);
  assert.deepEqual(ids(m, ['Flesh Eater', 'flesh eater', 'Gornek', 'No existe']), {
    'flesh eater': [3, 90001], gornek: [3143], 'no existe': [],
  });
  assert.deepEqual(m.lua('SnetForever.Datos.idsPNJPorNombres(nil)'), []); // tabla vacía
  assert.deepEqual(m.lua('SnetForever.Datos.idsPNJPorNombres({1, "Gornek", {}})'), { gornek: [3143] });
  sinErrores(m);
});

test('idsPNJPorNombres: una sola pasada por SNF_MISIONES.npc para los nombres nuevos y ninguna para los ya conocidos', () => {
  const m = nuevaMaquina();
  m.lua(`PASADAS = 0
    setmetatable(SNF_MISIONES.npc, {__pairs = function(t) PASADAS = PASADAS + 1; return next, t, nil end})`);
  assert.equal(m.lua('PASADAS'), 0);
  ids(m, ['Gornek', 'Kaltunk', 'Flesh Eater']);
  assert.equal(m.lua('PASADAS'), 1);
  ids(m, ['gornek', 'KALTUNK']);
  ids(m, ['No existe']);
  assert.equal(m.lua('PASADAS'), 2);
  ids(m, ['No existe', 'Gornek']); // lo que no existe también se recuerda
  assert.equal(m.lua('PASADAS'), 2);
  sinErrores(m);
});

test('idsPNJPorNombres: encuentra nombres con mayúsculas y minúsculas distintas y con letras fuera de ASCII', () => {
  const m = nuevaMaquina();
  m.lua('SNF_MISIONES.npc[90002] = {name = "ÁRBOL viejo"}; SNF_MISIONES.npc[90003] = {name = "gORNEK"}; SNF_MISIONES.npc[90004] = {name = "Gornekk"}');
  assert.deepEqual(ids(m, ['gornek']).gornek, [3143, 90003]);
  assert.deepEqual(m.lua('SnetForever.Datos.idsPNJPorNombres({"ÁRBOL VIEJO"})[string.lower("ÁRBOL viejo")]'), [90002]);
  sinErrores(m);
});

test('idsPNJPorNombres: si cambia la tabla SNF_MISIONES, se vuelve a buscar; sin SNF_MISIONES.npc no hay error', () => {
  const m = nuevaMaquina();
  assert.deepEqual(ids(m, ['Nuevo']), { nuevo: [] });
  m.lua('SNF_MISIONES = setmetatable({npc = {[7] = {name = "Nuevo"}}}, {__index = SNF_MISIONES})');
  assert.deepEqual(ids(m, ['Nuevo']), { nuevo: [7] });
  m.lua('SNF_MISIONES = {}');
  assert.deepEqual(ids(m, ['Nuevo']), { nuevo: [] });
  sinErrores(m);
});

test('nombrePNJCliente: esMX da el español y, sin español, el inglés (aunque el idioma del addon sea en)', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esMX' } });
  assert.equal(m.lua('SnetForever.Datos.nombrePNJCliente(3)'), 'Comecarne');
  assert.equal(m.lua('SnetForever.Datos.nombrePNJCliente(3143)'), 'Gornek');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(m.lua('SnetForever.Datos.nombrePNJCliente(3)'), 'Comecarne');
  assert.equal(m.lua('SnetForever.Datos.nombrePNJCliente(999999)'), undefined);
  sinErrores(m);
});

test('nombrePNJCliente: un cliente esES también usa el español y uno enUS el inglés (aunque el addon vaya en es)', () => {
  const es = nuevaMaquina({ jugador: { idioma: 'esES' } });
  assert.equal(es.lua('SnetForever.Datos.nombrePNJCliente(3)'), 'Comecarne');
  const en = nuevaMaquina({ jugador: { idioma: 'enUS' } });
  en.lua('SnetForever.Ajustes.set("idioma", "es")');
  assert.equal(en.lua('SnetForever.Datos.nombrePNJCliente(3)'), 'Flesh Eater');
  sinErrores(es);
  sinErrores(en);
});

test('puntosPNJ: los spawns como lista de {mapa, x, y}, ordenada por mapa, y vacía sin spawns', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Datos.puntosPNJ(3)'), [
    { mapa: 1411, x: 47, y: 62 },
    { mapa: 1411, x: 48, y: 61 },
  ]);
  m.lua('SNF_MISIONES.npc[90002] = {name = "Dos mapas", spawns = {[1412] = {{1, 2}}, [1411] = {{3, 4}, {5, 6}}}}');
  assert.deepEqual(m.lua('SnetForever.Datos.puntosPNJ(90002)'), [
    { mapa: 1411, x: 3, y: 4 },
    { mapa: 1411, x: 5, y: 6 },
    { mapa: 1412, x: 1, y: 2 },
  ]);
  m.lua('SNF_MISIONES.npc[90003] = {name = "Sin sitio"}');
  assert.deepEqual(m.lua('SnetForever.Datos.puntosPNJ(90003)'), []);
  assert.deepEqual(m.lua('SnetForever.Datos.puntosPNJ(999999)'), []);
  sinErrores(m);
});

// ---- T2: sitios de los objetivos de una misión (Datos.objetivoDeBase, Datos.sitiosObjetivo, Datos.puntosObjeto) ----

// Una misión inventada con un objetivo de cada grupo de la base, en el orden del diario: k1 PNJ, k2 objeto del mundo,
// k3 y k4 objetos de la bolsa (uno con quién lo suelta y otro sin nada, como en los datos del juego), k5 crédito de
// muerte y k6 hechizo.
function conObjetivos() {
  const m = nuevaMaquina();
  m.lua(`SNF_MISIONES.npc[97911] = {name = "Lobo de prueba", spawns = {[1411] = {{60, 30}, {61, 30}}}}
  SNF_MISIONES.npc[97912] = {name = "Cuervo de prueba", spawns = {[1412] = {{10, 20}}}}
  SNF_MISIONES.npc[97913] = {name = "Cuervo sin sitio"}
  SNF_MISIONES.object[97921] = {name = "Cofre de prueba", spawns = {[1412] = {{1, 2}}, [1411] = {{62, 32}}}}
  SNF_MISIONES.object[97922] = {name = "Saco sin sitio"}
  SNF_MISIONES.item[97931] = {name = "Garra de prueba", npcDrops = {97911}, objectDrops = {97921, 97922}}
  SNF_MISIONES.item[97932] = {name = "Polvo de prueba"}
  SNF_MISIONES.es.item[97932] = {name = "Polvo inventado"}`);
  m.datoMision(97901, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5,
    objectives: [[[97911, 'Lobo']], [[97921]], [[97931], [97932]], [], [[[97912, 97913], 97914, 'Cuervos']], [[97941]]] });
  return m;
}

test('T2 puntosObjeto: los spawns de un objeto del mundo como {mapa, x, y}, ordenados por mapa; vacía sin spawns', () => {
  const m = conObjetivos();
  assert.deepEqual(m.lua('SnetForever.Datos.puntosObjeto(97921)'), [
    { mapa: 1411, x: 62, y: 32 },
    { mapa: 1412, x: 1, y: 2 },
  ]);
  assert.deepEqual(m.lua('SnetForever.Datos.puntosObjeto(97922)'), []);
  assert.deepEqual(m.lua('SnetForever.Datos.puntosObjeto(999999)'), []);
  sinErrores(m);
});

test('T2 objetivoDeBase: el k si la base lo tiene; si no (o sin k), el primero cuyo nombre (inglés o español) es obj', () => {
  const m = conObjetivos();
  const k = (args) => m.lua(`SnetForever.Datos.objetivoDeBase(${args})`);
  assert.equal(k('97901, nil, 3'), 3);
  assert.equal(k('97901, "Lobo de prueba", 4'), 4, 'con un k que existe, el nombre no cuenta');
  assert.equal(k('97901, "polvo inventado", 9'), 4, 'k que no está: por el nombre (español, sin mayúsculas)');
  assert.equal(k('97901, "Cofre de prueba"'), 2, 'objeto del mundo por nombre');
  assert.equal(k('97901, "Nada"'), undefined);
  assert.equal(k('97901, nil, 9'), undefined);
  assert.equal(k('999999, nil, 1'), undefined, 'misión que no está en la base');
  sinErrores(m);
});

test('T2 sitiosObjetivo: PNJ y objetos de cada objetivo con sus puntos; nil si la base no tiene ese objetivo', () => {
  const m = conObjetivos();
  const s = (k) => m.lua(`SnetForever.Datos.sitiosObjetivo(97901, ${k})`);
  const LOBO = [{ mapa: 1411, x: 60, y: 30 }, { mapa: 1411, x: 61, y: 30 }];
  const COFRE = [{ mapa: 1411, x: 62, y: 32 }, { mapa: 1412, x: 1, y: 2 }];
  assert.deepEqual(s(1), { grupo: 1, id: 97911, npcs: [97911], objetos: [], puntos: LOBO });
  assert.deepEqual(s(2), { grupo: 2, id: 97921, npcs: [], objetos: [97921], puntos: COFRE });
  assert.deepEqual(s(3), { grupo: 3, id: 97931, npcs: [97911], objetos: [97921, 97922], puntos: [...LOBO, ...COFRE] });
  assert.deepEqual(s(4), { grupo: 3, id: 97932, npcs: [], objetos: [], puntos: [] }, 'sin quién lo suelte: sin sitio');
  assert.deepEqual(s(5), { grupo: 5, npcs: [97912, 97913], objetos: [], puntos: [{ mapa: 1412, x: 10, y: 20 }] });
  assert.deepEqual(s(6), { grupo: 6, id: 97941, npcs: [], objetos: [], puntos: [] });
  assert.deepEqual(m.lua('SnetForever.Datos.sitiosObjetivo(97901, 3, true)'), { grupo: 3, id: 97931, npcs: [97911], objetos: [97921, 97922], puntos: [] },
    'sin puntos: solo quién');
  assert.equal(s(7), undefined);
  assert.equal(m.lua('SnetForever.Datos.sitiosObjetivo(999999, 1)'), undefined);
  sinErrores(m);
});
