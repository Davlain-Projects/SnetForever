// Objetivos cercanos, detección (mapa/cercanos.lua), tarea D5 (B2): lista de PNJ del paso, estados visto/cerca/lejos por
// placas, ratón, objetivo y base de datos, marca propia sobre la placa y charla con el PNJ. Sin nada protegido.
// Datos del banco: PNJ 3 «Flesh Eater» (esp. «Comecarne», puntos (47, 62) y (48, 61) del mapa 1411), 3143 «Gornek»
// (amistoso, punto (42.1, 68.3)). Mundo del mapa 1411: wx = -2000 - 50·x, wy = 1800 - 35·y, inst 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const GUID_COMECARNE = 'Creature-0-1-0-0-3-0000ABCDEF';
const GUID_GORNEK = 'Creature-0-1-0-0-3143-0000000001';

const ACEPTAR = (q) => ({ t: 'accept', q, texto: { en: `Accept ${q}`, es: `Acepta ${q}` } });
const MOB = (nombre, campos = {}) => ({ t: 'mob', npcs: [{ nombre, ...campos.npc }], ...campos.el });
const OBJ = (nombre, campos = {}) => ({ t: 'target', npcs: [{ nombre, ...campos.npc }], ...campos.el });
const mundo = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

function conGuia(pasos, opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  return m;
}

// Un paso con un enemigo y un amistoso, el caso normal.
const pasoNormal = () => [{ elementos: [ACEPTAR(788), MOB('Flesh Eater'), OBJ('Gornek', { npc: { id: 3143 } })] }];

const lista = (m) => m.lua(`(function()
  local salida = {}
  for i, e in ipairs(SnetForever.Cercanos.lista()) do
    salida[i] = {clave = e.clave, tipo = e.tipo, paso = e.paso, ids = e.ids, nombres = e.nombres, nombreMacro = e.nombreMacro,
      estado = e.estado, unidad = e.unidad or false}
  end
  return salida
end)()`);
const estados = (m) => Object.fromEntries(lista(m).map((e) => [e.clave, e.estado]));

// Cuenta los SNF_OBJETIVOS_CAMBIADOS.
function contarCambios(m) {
  m.lua('CUENTA_OBJ = {n = 0}; SnetForever.Eventos.escuchar("SNF_OBJETIVOS_CAMBIADOS", function() CUENTA_OBJ.n = CUENTA_OBJ.n + 1 end)');
  return () => m.lua('CUENTA_OBJ.n');
}

// ---------------------------------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------------------------------

test('lista: un paso con mob y target da dos entradas (mob antes), con id, nombres y nombre de la macro', () => {
  const m = conGuia(pasoNormal());
  const l = lista(m);
  assert.equal(l.length, 2);
  assert.deepEqual(
    l.map((e) => [e.clave, e.tipo, e.paso, e.estado]),
    [['flesh eater', 'mob', 1, 'lejos'], ['gornek', 'target', 1, 'lejos']],
  );
  assert.deepEqual(l[0].ids, [3]); // sin id en la guía: todos los de la base con ese nombre
  assert.deepEqual(l[1].ids, [3143]);
  assert.deepEqual(l[0].nombres, ['Flesh Eater', 'Comecarne']);
  assert.equal(l[0].nombreMacro, 'Comecarne'); // el banco es esES: el español de los datos
  assert.equal(l[1].nombreMacro, 'Gornek');
  sinErrores(m);
});

test('lista: un mob con el padre hecho no sale; con el padre pendiente, sí', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater', { el: { padre: 0 } })] }]);
  assert.equal(lista(m).length, 1);
  m.lua('SnetForever.Motor.paso(1).elementos[1].resultado = "hecho"; SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(lista(m).length, 0);
  sinErrores(m);
});

test('lista: nombre del cliente en enUS (inglés), sin id se juntan los repetidos y se quita el «*»', () => {
  const m = conGuia(
    [{ elementos: [ACEPTAR(788), OBJ('*Flesh Eater'), MOB('Flesh Eater'), { t: 'unitscan', npcs: [{ nombre: 'Flesh Eater' }] }] }],
    { jugador: { idioma: 'enUS' } },
  );
  const l = lista(m);
  assert.equal(l.length, 1);
  assert.equal(l[0].clave, 'flesh eater');
  assert.equal(l[0].tipo, 'unitscan'); // el de mayor prioridad
  assert.equal(l[0].nombreMacro, 'Flesh Eater');
  sinErrores(m);
});

test('lista: un nombre sin id en la base conserva el nombre de la guía y no tiene ids; máximo 12 y unitscan, mob, target', () => {
  const nombres = Array.from({ length: 14 }, (_, i) => `Bicho ${i}`);
  const elementos = [ACEPTAR(788), ...nombres.slice(0, 5).map((n) => OBJ(n)), ...nombres.slice(5, 12).map((n) => MOB(n)),
    ...nombres.slice(12).map((n) => ({ t: 'unitscan', npcs: [{ nombre: n }] }))];
  const m = conGuia([{ elementos }]);
  const l = lista(m);
  assert.equal(l.length, 12);
  assert.deepEqual(l.slice(0, 2).map((e) => [e.tipo, e.clave]), [['unitscan', 'bicho 12'], ['unitscan', 'bicho 13']]);
  assert.deepEqual(l.map((e) => e.tipo), [...Array(2).fill('unitscan'), ...Array(7).fill('mob'), ...Array(3).fill('target')]);
  assert.deepEqual(l[0].ids, []);
  assert.equal(l[0].nombreMacro, 'Bicho 12');
  sinErrores(m);
});

test('lista: sin pasos con objetivos, la lista está vacía y no hay temporizadores de la detección', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788)] }]);
  assert.deepEqual(lista(m), []);
  assert.equal(m.lua('SnetForever.Cercanos.lista() ~= nil'), true);
  sinErrores(m);
});

test('lista: SNF_PASOS_CAMBIADOS con las mismas entradas no rehace la lista ni emite; si cambian, la rehace y emite', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater', { el: { padre: 0 } }), OBJ('Gornek', { npc: { id: 3143 } })] }]);
  m.lua('LISTA1 = SnetForever.Cercanos.lista()');
  const cuenta = contarCambios(m);
  // Lo que pasa en cada muerte de un 3/8: los pasos cambian pero las entradas no.
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(cuenta(), 0);
  assert.equal(m.lua('SnetForever.Cercanos.lista() == LISTA1'), true, 'la misma lista');
  // El padre del mob queda hecho: la entrada se va, la lista se rehace y se emite.
  m.lua('SnetForever.Motor.paso(1).elementos[1].resultado = "hecho"; SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(cuenta(), 1);
  assert.deepEqual(lista(m).map((e) => e.clave), ['gornek']);
  sinErrores(m);
});

test('objetivos.activo = false: la detección se para (sin entradas, relojes ni eventos) y vuelve al encenderlo', () => {
  const m = conGuia(pasoNormal());
  assert.equal(lista(m).length, 2);
  m.lua('SnetForever.Ajustes.set("objetivos.activo", false)');
  assert.deepEqual(lista(m), []);
  assert.deepEqual(relojes(m), [false, false]);
  // Sin eventos: una placa de la lista no pone marca.
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.equal(m.lua('SnetForever.Cercanos.marcas.nameplate1 == nil'), true);
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.deepEqual(lista(m), []);
  m.lua('SnetForever.Ajustes.set("objetivos.activo", true)');
  assert.equal(lista(m).length, 2);
  assert.deepEqual(relojes(m), [true, false]);
  assert.equal(estados(m)['flesh eater'], 'visto', 'al encender ve la placa que ya estaba');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Reconocer y placas
// ---------------------------------------------------------------------------------------------------

test('placa: el GUID de un id de la lista da «visto» aunque el nombre esté en otro idioma, y al quitarla vuelve a «lejos»', () => {
  const m = conGuia(pasoNormal());
  const cuenta = contarCambios(m);
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Fleischfresser' });
  assert.equal(estados(m)['flesh eater'], 'visto');
  assert.equal(lista(m)[0].unidad, 'nameplate1');
  assert.equal(cuenta(), 1);
  m.quitarPlaca('nameplate1');
  assert.equal(estados(m)['flesh eater'], 'lejos');
  assert.equal(lista(m)[0].unidad, false);
  assert.equal(cuenta(), 2);
  sinErrores(m);
});

test('placa: se reconoce por nombre si no hay GUID de criatura, y con el nombre visto la macro usa el UnitName real', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: 'Player-1-00000009', nombre: 'COMECARNE' }); // un GUID que no es de criatura
  assert.equal(estados(m)['flesh eater'], 'visto');
  assert.equal(lista(m)[0].nombreMacro, 'COMECARNE');
  sinErrores(m);
});

test('placa: el GUID secreto se compara por nombre; el nombre secreto no da error ni coincidencia', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guidSecreto: true, nombre: 'Flesh Eater' });
  assert.equal(estados(m)['flesh eater'], 'visto');
  m.quitarPlaca('nameplate1');
  m.placa('nameplate2', { guidSecreto: true, nombreSecreto: true });
  m.placa('nameplate3', { guid: 'Player-1-00000009', nombreSecreto: true });
  assert.deepEqual(estados(m), { 'flesh eater': 'lejos', gornek: 'lejos' });
  assert.equal(m.lua('SnetForever.Cercanos.reconocer("nameplate2")'), undefined);
  sinErrores(m);
});

test('placa: un nombre secreto con GUID de criatura de la lista sigue reconociéndose por id', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_GORNEK, nombreSecreto: true });
  assert.equal(estados(m).gornek, 'visto');
  assert.equal(lista(m)[1].nombreMacro, 'Gornek'); // sin nombre visto: el de los datos
  sinErrores(m);
});

test('placa: sin issecretvalue (sinApi), un nombre secreto no rompe nada (todo va con pcall)', () => {
  const m = conGuia(pasoNormal(), { sinApi: ['issecretvalue'] });
  m.placa('nameplate1', { guidSecreto: true, nombreSecreto: true });
  assert.deepEqual(estados(m), { 'flesh eater': 'lejos', gornek: 'lejos' });
  m.placa('nameplate2', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.equal(estados(m)['flesh eater'], 'visto');
  sinErrores(m);
});

test('placa: se descartan jugadores, mascotas y enemigos muertos (los amistosos muertos no importan)', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Flesh Eater', jugador: true });
  m.placa('nameplate2', { guid: GUID_COMECARNE, nombre: 'Flesh Eater', muerto: true });
  assert.equal(estados(m)['flesh eater'], 'lejos');
  // La mascota del jugador es de la misma especie: UnitIsUnit(placa, "pet") la descarta.
  const guidMascota = 'Creature-0-1-0-0-3-0000000099';
  m.unidad('pet', { guid: guidMascota, nombre: 'Flesh Eater' });
  m.placa('nameplate3', { guid: guidMascota, nombre: 'Flesh Eater' });
  assert.equal(estados(m)['flesh eater'], 'lejos');
  m.placa('nameplate5', { guid: GUID_GORNEK, nombre: 'Gornek', muerto: true });
  assert.equal(estados(m).gornek, 'visto');
  sinErrores(m);
});

test('placa: con el GUID que falta al quitarla (Questie lo avisa), la placa se quita igual', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.equal(estados(m)['flesh eater'], 'visto');
  m.quitarPlaca('nameplate1', { sinGuid: true });
  assert.equal(estados(m)['flesh eater'], 'lejos');
  sinErrores(m);
});

test('placa: al cambiar de paso se recorren las placas que ya hay', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: 'Creature-0-1-0-0-9999-0000000005', nombre: 'Otro' });
  m.placa('nameplate2', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(estados(m)['flesh eater'], 'visto');
  assert.equal(lista(m)[0].unidad, 'nameplate2');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ratón y objetivo
// ---------------------------------------------------------------------------------------------------

test('ratón: «visto» durante 10 s y luego vuelve a «lejos» con su aviso', () => {
  const m = conGuia(pasoNormal());
  const cuenta = contarCambios(m);
  m.unidad('mouseover', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  assert.equal(estados(m)['flesh eater'], 'visto');
  assert.equal(lista(m)[0].unidad, 'mouseover');
  m.unidad('mouseover', undefined);
  m.avanzar(9);
  assert.equal(estados(m)['flesh eater'], 'visto');
  const antes = cuenta();
  m.avanzar(2);
  assert.equal(estados(m)['flesh eater'], 'lejos');
  assert.equal(cuenta(), antes + 1);
  sinErrores(m);
});

test('objetivo: «visto» mientras sea el objetivo y «lejos» al cambiarlo', () => {
  const m = conGuia(pasoNormal());
  // 12-nov: la 788 pide la 4641; sin ella entregada, pasados 15 s el paso se saltaría (motor-no-disponible.test.js).
  m.estadoMision(4641, { entregada: true });
  m.unidad('target', { guid: GUID_GORNEK, nombre: 'Gornek' });
  m.disparar('PLAYER_TARGET_CHANGED');
  assert.equal(estados(m).gornek, 'visto');
  assert.equal(lista(m)[1].unidad, 'target');
  m.unidad('target', undefined);
  m.disparar('PLAYER_TARGET_CHANGED');
  assert.equal(estados(m).gornek, 'lejos');
  m.avanzar(30); // el objetivo no depende del tiempo
  assert.equal(estados(m).gornek, 'lejos');
  sinErrores(m);
});

test('objetivo: ya fijado al cambiar de paso, sigue «visto»', () => {
  const m = conGuia(pasoNormal());
  m.unidad('target', { guid: GUID_GORNEK, nombre: 'Gornek' });
  m.disparar('PLAYER_TARGET_CHANGED');
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(estados(m).gornek, 'visto');
  sinErrores(m);
});

test('sin C_NamePlate sigue funcionando por ratón y objetivo (y no hay marca ni error)', () => {
  const m = conGuia(pasoNormal(), { sinApi: ['C_NamePlate'] });
  m.unidad('target', { guid: GUID_GORNEK, nombre: 'Gornek' });
  m.disparar('PLAYER_TARGET_CHANGED');
  m.unidad('mouseover', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  assert.deepEqual(estados(m), { 'flesh eater': 'visto', gornek: 'visto' });
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(m.lua('SnetForever.Cercanos.marcaPlaca("nameplate1", SnetForever.Cercanos.lista()[1])'), undefined);
  m.avanzar(2);
  sinErrores(m);
});

test('sin GetNamePlates ni GetNamePlateForUnit tampoco hay error', () => {
  const m = conGuia(pasoNormal(), { sinApi: ['C_NamePlate.GetNamePlates', 'C_NamePlate.GetNamePlateForUnit'] });
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  m.disparar('NAME_PLATE_UNIT_ADDED', 'nameplate1');
  m.avanzar(2);
  assert.deepEqual(estados(m), { 'flesh eater': 'lejos', gornek: 'lejos' });
  sinErrores(m);
});

test('sin el evento de placas, un temporizador de 0,5 s recorre GetNamePlates() solo mientras haya entradas', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.eventosInvalidos.NAME_PLATE_UNIT_ADDED = true');
  m.lua('BANCO.eventosInvalidos.NAME_PLATE_UNIT_REMOVED = true');
  m.ponerGuia(guiaDePrueba(pasoNormal()));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  // Las placas llegan sin evento (el banco los lanza, pero el addon no los escucha).
  m.lua('BANCO.unidades.nameplate1 = {guid = "' + GUID_COMECARNE + '", nombre = "Comecarne"}');
  m.lua('local base = CreateFrame("Frame"); base.namePlateUnitToken = "nameplate1"; BANCO.placas.nameplate1 = base; BANCO.ordenPlacas[1] = "nameplate1"');
  assert.equal(estados(m)['flesh eater'], 'lejos');
  m.avanzar(0.6);
  assert.equal(estados(m)['flesh eater'], 'visto');
  m.lua('BANCO.placas.nameplate1 = nil; BANCO.ordenPlacas = {}; BANCO.unidades.nameplate1 = nil');
  m.avanzar(0.6);
  assert.equal(estados(m)['flesh eater'], 'lejos');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Distancia por la base
// ---------------------------------------------------------------------------------------------------

test('base: a 30 yardas de un punto de aparición da «cerca» y a 80 da «lejos» (se mide cada 1 s)', () => {
  const m = conGuia(pasoNormal());
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 30, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(estados(m)['flesh eater'], 'cerca');
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 80, inst: 1 } });
  m.avanzar(0.3);
  assert.equal(estados(m)['flesh eater'], 'cerca'); // aún no ha pasado 1 s desde la última medida
  m.avanzar(1);
  assert.equal(estados(m)['flesh eater'], 'lejos');
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 30, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(estados(m)['flesh eater'], 'cerca');
  sinErrores(m);
});

test('base: «cerca» emite SNF_OBJETIVOS_CAMBIADOS una vez, la misma medida no lo repite y al rehacer la lista se recuerda', () => {
  const m = conGuia(pasoNormal());
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 30, inst: 1 } });
  const cuenta = contarCambios(m);
  m.avanzar(1.1);
  assert.equal(estados(m)['flesh eater'], 'cerca');
  assert.equal(cuenta(), 1);
  m.avanzar(2.1);
  assert.equal(cuenta(), 1);
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")'); // la lista nueva no pierde lo medido
  assert.equal(estados(m)['flesh eater'], 'cerca');
  sinErrores(m);
});

test('base: justo a 50 yardas es «cerca», a 51 «lejos»; «visto» gana a «cerca»', () => {
  const m = conGuia(pasoNormal());
  const p = mundo(48, 61); // el otro punto, (47, 62), queda a más de 85 yardas en estas posiciones
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 50, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(estados(m)['flesh eater'], 'cerca');
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 51, inst: 1 } });
  m.avanzar(1);
  assert.equal(estados(m)['flesh eater'], 'lejos');
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 10, inst: 1 } });
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.avanzar(1);
  assert.equal(estados(m)['flesh eater'], 'visto');
  m.quitarPlaca('nameplate1');
  assert.equal(estados(m)['flesh eater'], 'cerca');
  sinErrores(m);
});

test('base: otra instancia (inst distinto) no cuenta, y dentro de una instancia (sin posición) no hay «cerca»', () => {
  const m = conGuia(pasoNormal());
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy, inst: 2 } });
  m.avanzar(1.1);
  assert.equal(estados(m)['flesh eater'], 'lejos');
  m.jugador({ mundo: { wx: p.wx, wy: p.wy, inst: 1 } });
  m.avanzar(1);
  assert.equal(estados(m)['flesh eater'], 'cerca');
  m.jugador({ enInstancia: true }); // UnitPosition da nil: Coord.jugador() es nil
  assert.equal(m.lua('SnetForever.Coord.jugador()'), undefined);
  m.avanzar(1);
  assert.equal(estados(m)['flesh eater'], 'lejos');
  sinErrores(m);
});

test('base: un PNJ sin punto de aparición ni id solo se ve por placas, ratón y objetivo', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Bicho raro')] }]);
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy, inst: 1 } });
  m.avanzar(1.1);
  assert.equal(estados(m)['bicho raro'], 'lejos');
  m.placa('nameplate1', { guid: 'Creature-0-1-0-0-777-0000000005', nombre: 'Bicho raro' });
  assert.equal(estados(m)['bicho raro'], 'visto');
  sinErrores(m);
});

const registrados = (m, evento) => m.lua(`(function() local n = 0 for _, f in ipairs(BANCO.eventos[${aLua(evento)}] or {}) do n = n + 1 end return n end)()`);

test('eventos del juego: solo se escuchan mientras la lista tiene entradas', () => {
  const m = conGuia([{ id: 'a', elementos: [ACEPTAR(788)] }]);
  const eventos = ['NAME_PLATE_UNIT_ADDED', 'NAME_PLATE_UNIT_REMOVED', 'UPDATE_MOUSEOVER_UNIT', 'PLAYER_TARGET_CHANGED', 'GOSSIP_SHOW',
    'QUEST_GREETING', 'QUEST_PROGRESS', 'QUEST_COMPLETE', 'MERCHANT_SHOW', 'PLAYER_ENTERING_WORLD'];
  const antes = eventos.map((e) => registrados(m, e));
  const otra = 'Prueba\\02-60 Con objetivos';
  m.ponerGuia(guiaDePrueba(pasoNormal(), { clave: otra, nombre: '02-60 Con objetivos' }));
  m.lua(`SnetForever.Motor.cargar(${aLua(otra)})`);
  // PLAYER_ENTERING_WORLD ya lo tiene registrado el marco de SnetForever (arranque): no suma otro registro. Desde la
  // 0.6.1, QUEST_COMPLETE tampoco: el diario de objetos (ia/diario.lua) lo escucha siempre.
  const siempre = new Set(['PLAYER_ENTERING_WORLD', 'QUEST_COMPLETE']);
  // Merchant price observation already uses the shared event frame when Commerce is loaded.
  if (m.lua('SnetForever.MerchantPrices ~= nil')) siempre.add('MERCHANT_SHOW');
  assert.deepEqual(eventos.map((e) => registrados(m, e)), antes.map((n, i) => (siempre.has(eventos[i]) ? n : n + 1)));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(eventos.map((e) => registrados(m, e)), antes);
  sinErrores(m);
});

const relojes = (m) => m.lua('(function() local d, p = SnetForever.Cercanos.relojes(); return {d, p} end)()');

test('relojes: solo existen mientras hay entradas (1 s de distancia; 0,5 s de placas solo sin evento de placas)', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788)] }]);
  assert.deepEqual(relojes(m), [false, false]);
  const otra = 'Prueba\\02-60 Con objetivos';
  m.ponerGuia(guiaDePrueba(pasoNormal(), { clave: otra, nombre: '02-60 Con objetivos' }));
  m.lua(`SnetForever.Motor.cargar(${aLua(otra)})`);
  assert.equal(lista(m).length, 2);
  assert.deepEqual(relojes(m), [true, false]);
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(lista(m), []);
  assert.deepEqual(relojes(m), [false, false]);
  sinErrores(m);

  const sinEvento = nuevaMaquina();
  sinEvento.lua('BANCO.eventosInvalidos.NAME_PLATE_UNIT_ADDED = true');
  sinEvento.ponerGuia(guiaDePrueba(pasoNormal()));
  sinEvento.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(relojes(sinEvento), [true, true]);
  sinErrores(sinEvento);
});

// ---------------------------------------------------------------------------------------------------
// Marca sobre la placa
// ---------------------------------------------------------------------------------------------------

const marca = (m, unidad) => m.lua(`(function()
  local marco = SnetForever.Cercanos.marcas[${aLua(unidad)}]
  if not marco then return false end
  local punto, relativo, relPunto, x, y = marco:GetPoint(1)
  return {mostrado = marco:IsShown(), ancho = marco:GetWidth(), alto = marco:GetHeight(), punto = punto, relPunto = relPunto,
    x = x, y = y, hijoDeLaBase = marco:GetParent() == BANCO.placas[${aLua(unidad)}], relativoALaBase = relativo == BANCO.placas[${aLua(unidad)}],
    textura = marco.icono:GetTexture()}
end)()`);

test('marca: una placa de un enemigo recibe un icono de 16x16 de espadas en un hijo de la base (BOTTOM → TOP, 0, 2)', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.deepEqual(marca(m, 'nameplate1'), {
    mostrado: true, ancho: 16, alto: 16, punto: 'BOTTOM', relPunto: 'TOP', x: 0, y: 2, hijoDeLaBase: true, relativoALaBase: true,
    textura: 'Interface\\GossipFrame\\BattleMasterGossipIcon',
  });
  m.placa('nameplate2', { guid: GUID_GORNEK, nombre: 'Gornek' });
  assert.equal(marca(m, 'nameplate2').textura, 'Interface\\WorldMap\\ChatBubble_64Grey');
  sinErrores(m);
});

test('marca: se quita con NAME_PLATE_UNIT_REMOVED y una placa de otro PNJ no la tiene', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.placa('nameplate2', { guid: 'Creature-0-1-0-0-9999-0000000005', nombre: 'Otro' });
  assert.equal(marca(m, 'nameplate2'), false);
  const hijo = m.lua('SnetForever.Cercanos.marcas.nameplate1');
  assert.ok(hijo);
  m.quitarPlaca('nameplate1');
  assert.equal(marca(m, 'nameplate1'), false);
  assert.equal(m.lua('BANCO.placas.nameplate1'), undefined);
  sinErrores(m);
});

test('marca: con los marcos base reciclados no se duplica y la marca vieja no se queda en la placa nueva', () => {
  const m = conGuia(pasoNormal());
  m.lua('BANCO.reciclarPlacas = true');
  const hijosDe = (expresion) => m.lua(`(function() local f = ${expresion}; local n = 0; for _, h in ipairs(BANCO.marcos) do if h:GetParent() == f then n = n + 1 end end; return n end)()`);
  const marcaVisibleEn = (expresion) => m.lua(`(function() for _, h in ipairs(BANCO.marcos) do if h:GetParent() == ${expresion} and h:IsShown() then return true end end; return false end)()`);
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.quitarPlaca('nameplate1');
  assert.equal(m.lua('BANCO.basesLibres[1]:IsShown()'), false);
  assert.equal(m.lua('SnetForever.Cercanos.marcas.nameplate1'), undefined);
  assert.equal(hijosDe('BANCO.basesLibres[1]'), 1);
  // La misma base vuelve con otro PNJ de la lista: se reutiliza la marca (con la textura nueva) sin crear otra.
  m.placa('nameplate2', { guid: GUID_GORNEK, nombre: 'Gornek' });
  assert.equal(hijosDe('BANCO.placas.nameplate2'), 1);
  assert.equal(marca(m, 'nameplate2').textura, 'Interface\\WorldMap\\ChatBubble_64Grey');
  // Y con un PNJ que no es de la lista, la marca vieja no se ve.
  m.quitarPlaca('nameplate2');
  m.placa('nameplate3', { guid: 'Creature-0-1-0-0-9999-0000000005', nombre: 'Otro' });
  assert.equal(marcaVisibleEn('BANCO.placas.nameplate3'), false);
  sinErrores(m);
});

test('marca: en una instancia no hay marca, ni con el ajuste apagado; el ajuste la quita y la vuelve a poner', () => {
  const m = conGuia(pasoNormal(), { jugador: { enInstancia: true } });
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.equal(marca(m, 'nameplate1'), false);
  assert.equal(estados(m)['flesh eater'], 'visto'); // la detección sigue
  const m2 = conGuia(pasoNormal());
  m2.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.equal(marca(m2, 'nameplate1').mostrado, true);
  m2.lua('SnetForever.Ajustes.set("objetivos.marcaPlaca", false)');
  assert.equal(marca(m2, 'nameplate1'), false);
  m2.lua('SnetForever.Ajustes.set("objetivos.marcaPlaca", true)');
  assert.equal(marca(m2, 'nameplate1').mostrado, true);
  sinErrores(m);
  sinErrores(m2);
});

test('marca: una placa prohibida (IsForbidden) no recibe marca pero se detecta', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne', prohibida: true });
  assert.equal(marca(m, 'nameplate1'), false);
  assert.equal(estados(m)['flesh eater'], 'visto');
  sinErrores(m);
});

test('marca: marcaPlaca(unidad, entrada) con datos que no valen da nil sin error', () => {
  const m = conGuia(pasoNormal());
  assert.equal(m.lua('SnetForever.Cercanos.marcaPlaca(nil, nil)'), undefined);
  assert.equal(m.lua('SnetForever.Cercanos.marcaPlaca("nameplate9", SnetForever.Cercanos.lista()[1])'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Valores secretos de UnitIsPlayer, UnitIsUnit y UnitIsDead (ronda 1)
// ---------------------------------------------------------------------------------------------------

test('banco: UnitIsPlayer, UnitIsDead y UnitIsUnit(unidad, "pet") pueden dar un secreto booleano', () => {
  const m = nuevaMaquina();
  m.unidad('target', { guid: GUID_COMECARNE, nombre: 'x', jugadorSecreto: true, muertoSecreto: true, mascotaSecreta: true });
  assert.equal(m.lua('issecretvalue(UnitIsPlayer("target"))'), true);
  assert.equal(m.lua('issecretvalue(UnitIsDead("target"))'), true);
  assert.equal(m.lua('issecretvalue(UnitIsUnit("target", "pet"))'), true);
  assert.equal(m.lua('type(UnitIsPlayer("target"))'), 'boolean');
  assert.throws(() => m.lua('UnitIsPlayer("target") < 1'), /secret/);
  m.unidad('mouseover', { guid: GUID_COMECARNE, nombre: 'x' });
  assert.equal(m.lua('issecretvalue(UnitIsPlayer("mouseover"))'), false);
  assert.equal(m.lua('UnitIsUnit("mouseover", "player")'), false);
  sinErrores(m);
});

test('secretos: si no se sabe si es jugador o mascota, la unidad no cuenta (sin error); si no se sabe si está muerta, cuenta', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne', jugadorSecreto: true });
  assert.equal(estados(m)['flesh eater'], 'lejos');
  assert.equal(marca(m, 'nameplate1'), false);
  m.placa('nameplate2', { guid: GUID_COMECARNE, nombre: 'Comecarne', mascotaSecreta: true });
  assert.equal(estados(m)['flesh eater'], 'lejos');
  m.placa('nameplate3', { guid: GUID_COMECARNE, nombre: 'Comecarne', muertoSecreto: true, muerto: true });
  assert.equal(estados(m)['flesh eater'], 'visto');
  assert.equal(marca(m, 'nameplate3').mostrado, true);
  // También por ratón y objetivo, y con el recorrido de placas al cambiar de paso.
  m.unidad('mouseover', { guid: GUID_GORNEK, nombre: 'Gornek', jugadorSecreto: true });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  m.unidad('target', { guid: GUID_GORNEK, nombre: 'Gornek', mascotaSecreta: true });
  m.disparar('PLAYER_TARGET_CHANGED');
  assert.equal(estados(m).gornek, 'lejos');
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.deepEqual(estados(m), { 'flesh eater': 'visto', gornek: 'lejos' });
  sinErrores(m);
});

test('secretos: sin issecretvalue (sinApi) esos booleanos secretos tampoco dan error (pcall)', () => {
  // (en el banco == con un secreto no falla, así que solo se comprueba que no hay error)
  const m = conGuia(pasoNormal(), { sinApi: ['issecretvalue'] });
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne', jugadorSecreto: true });
  m.placa('nameplate2', { guid: GUID_GORNEK, nombre: 'Gornek', muertoSecreto: true, mascotaSecreta: true });
  m.unidad('target', { guid: GUID_GORNEK, nombre: 'Gornek', jugadorSecreto: true });
  m.disparar('PLAYER_TARGET_CHANGED');
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Marcas: instancias y parpadeo (ronda 1)
// ---------------------------------------------------------------------------------------------------

test('marca: al entrar en una instancia se quitan las marcas de las placas vivas', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.placa('nameplate2', { guid: GUID_GORNEK, nombre: 'Gornek' });
  assert.equal(marca(m, 'nameplate1').mostrado, true);
  m.disparar('PLAYER_ENTERING_WORLD', false, false); // sin instancia: no se toca nada
  assert.equal(marca(m, 'nameplate1').mostrado, true);
  m.jugador({ enInstancia: true });
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  assert.equal(marca(m, 'nameplate1'), false);
  assert.equal(marca(m, 'nameplate2'), false);
  assert.equal(m.lua('next(SnetForever.Cercanos.marcas) == nil'), true);
  assert.equal(estados(m)['flesh eater'], 'visto'); // la detección sigue
  sinErrores(m);
});

test('marca: rehacer la lista no esconde ni vuelve a mostrar las marcas que siguen, y solo quita las que sobran', () => {
  const m = conGuia([{ id: 'a', elementos: [ACEPTAR(788), MOB('Flesh Eater')] }, { id: 'b', elementos: [ACEPTAR(789), OBJ('Gornek', { npc: { id: 3143 } })] }]);
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.lua(`MARCO1 = SnetForever.Cercanos.marcas.nameplate1; OCULTAR = 0; MOSTRAR = 0
    local h, s = MARCO1.Hide, MARCO1.Show
    MARCO1.Hide = function(self) OCULTAR = OCULTAR + 1; return h(self) end
    MARCO1.Show = function(self) MOSTRAR = MOSTRAR + 1; return s(self) end`);
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(m.lua('SnetForever.Cercanos.marcas.nameplate1 == MARCO1'), true);
  assert.equal(m.lua('OCULTAR'), 0);
  assert.equal(marca(m, 'nameplate1').mostrado, true);
  // Al pasar al paso 2 el enemigo ya no está en la lista: su marca se quita.
  m.lua('SnetForever.Motor.saltar(1)');
  assert.deepEqual(lista(m).map((e) => e.clave), ['gornek']);
  assert.equal(marca(m, 'nameplate1'), false);
  assert.equal(m.lua('MARCO1:IsShown()'), false);
  sinErrores(m);
});

test('marca: una placa que cambia de PNJ al rehacer la lista conserva su marco y cambia el icono', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.lua('MARCO1 = SnetForever.Cercanos.marcas.nameplate1');
  m.lua(`BANCO.unidades.nameplate1.guid = "${GUID_GORNEK}"; BANCO.unidades.nameplate1.nombre = "Gornek"`);
  // SNF_PASOS_CAMBIADOS con las mismas entradas ya no rehace la lista (revisión final): se rehace a mano.
  m.lua('SnetForever.Cercanos.reconstruir()');
  assert.equal(m.lua('SnetForever.Cercanos.marcas.nameplate1 == MARCO1'), true);
  assert.equal(marca(m, 'nameplate1').textura, 'Interface\\WorldMap\\ChatBubble_64Grey');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Datos que faltan (ronda 1)
// ---------------------------------------------------------------------------------------------------

test('sin SNF_MISIONES.npc la lista se rehace sin error y sigue detectando por nombre', () => {
  const m = conGuia(pasoNormal());
  m.lua('SNF_MISIONES.npc = nil'); // los demás módulos exigen SNF_MISIONES.npc: solo se rehace la lista de Cercanos
  m.lua('SnetForever.Cercanos.reconstruir()');
  m.avanzar(2.1);
  const l = lista(m);
  assert.deepEqual(l.map((e) => [e.clave, e.ids]), [['flesh eater', []], ['gornek', [3143]]]);
  assert.equal(l[0].nombreMacro, 'Flesh Eater');
  m.placa('nameplate1', { guid: 'Creature-0-1-0-0-9999-0000000005', nombre: 'Flesh Eater' });
  assert.equal(estados(m)['flesh eater'], 'visto');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Charla con el PNJ
// ---------------------------------------------------------------------------------------------------

for (const evento of ['GOSSIP_SHOW', 'QUEST_GREETING', 'QUEST_PROGRESS', 'QUEST_COMPLETE', 'MERCHANT_SHOW']) {
  test(`charla: ${evento} con ese PNJ amistoso lo quita de la lista (por id, no por nombre)`, () => {
    const m = conGuia(pasoNormal());
    m.lua(`BANCO.ponerNpc("${GUID_GORNEK}", "Nombre distinto")`);
    m.disparar(evento);
    assert.deepEqual(lista(m).map((e) => e.clave), ['flesh eater']);
    sinErrores(m);
  });
}

test('charla: sigue fuera tras otros cambios del mismo paso, pero vuelve al cambiar de pasos activos', () => {
  const m = conGuia([{ id: 'a', elementos: [ACEPTAR(788), OBJ('Gornek', { npc: { id: 3143 } })] },
    { id: 'b', elementos: [ACEPTAR(789), OBJ('Gornek', { npc: { id: 3143 } })] }]);
  m.lua(`BANCO.ponerNpc("${GUID_GORNEK}")`);
  m.disparar('GOSSIP_SHOW');
  assert.equal(lista(m).length, 0);
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(lista(m).length, 0);
  m.lua('SnetForever.Motor.saltar(1)');
  assert.deepEqual(lista(m).map((e) => e.paso), [2]);
  sinErrores(m);
});

test('charla: un enemigo con el mismo id no sale de la lista y un PNJ que no es de la lista no hace nada', () => {
  const m = conGuia(pasoNormal());
  m.lua(`BANCO.ponerNpc("${GUID_COMECARNE}")`);
  m.disparar('GOSSIP_SHOW');
  assert.equal(lista(m).length, 2);
  m.lua('BANCO.ponerNpc("Creature-0-1-0-0-12345-0000000001")');
  m.disparar('GOSSIP_SHOW');
  m.lua('BANCO.ponerNpc(nil)');
  m.disparar('GOSSIP_SHOW');
  assert.equal(lista(m).length, 2);
  sinErrores(m);
});

test('charla: un GUID secreto de «npc» no da error', () => {
  const m = conGuia(pasoNormal());
  m.unidad('npc', { guidSecreto: true, nombre: 'Gornek' });
  m.disparar('GOSSIP_SHOW');
  assert.equal(lista(m).length, 2);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Orden para pintar
// ---------------------------------------------------------------------------------------------------

test('ordenada: primero los vistos, luego los cercanos y luego los lejos; soloCercanos quita los lejos', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater'), MOB('Bicho A'), OBJ('Gornek', { npc: { id: 3143 } })] }]);
  const claves = () => m.lua('(function() local s = {}; for i, e in ipairs(SnetForever.Cercanos.ordenada()) do s[i] = e.clave end; return s end)()');
  assert.deepEqual(claves(), ['flesh eater', 'bicho a', 'gornek']);
  const g = mundo(42.1, 68.3); // en el punto de Gornek (Flesh Eater queda a más de 200 yardas)
  m.jugador({ mundo: { wx: g.wx, wy: g.wy, inst: 1 } });
  m.avanzar(1.1);
  assert.deepEqual(claves(), ['gornek', 'flesh eater', 'bicho a']);
  m.placa('nameplate1', { guid: 'Creature-0-1-0-0-777-0000000005', nombre: 'Bicho A' });
  assert.deepEqual(claves(), ['bicho a', 'gornek', 'flesh eater']);
  m.lua('SnetForever.Ajustes.set("objetivos.soloCercanos", true)');
  assert.deepEqual(claves(), ['bicho a', 'gornek']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T2: una entrega a medias pide a los PNJ de sus objetivos sin terminar
// ---------------------------------------------------------------------------------------------------

// Datos inventados: la misión 97901 se entrega al «Dador inventado» y pide matar al «Lobo de prueba» (k1) y la «Garra de
// prueba» (k2), que suelta el «Cuervo de prueba».
function conEntregaAMedias(objetivos, { completa = false } = {}) {
  const m = nuevaMaquina();
  m.lua(`SNF_MISIONES.npc[97911] = {name = "Lobo de prueba", spawns = {[1411] = {{60, 30}}}}
  SNF_MISIONES.npc[97912] = {name = "Cuervo de prueba", spawns = {[1411] = {{30, 60}}}}
  SNF_MISIONES.npc[97915] = {name = "Dador inventado", friendlyToFaction = "H", spawns = {[1411] = {{80, 40}}}}
  SNF_MISIONES.item[97931] = {name = "Garra de prueba", npcDrops = {97912}}`);
  m.datoMision(97901, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5, objectives: [[[97911]], [], [[97931]]] });
  m.estadoMision(97901, { enDiario: true, completa, objetivos });
  m.ponerGuia(guiaDePrueba([{ elementos: [
    { t: 'goto', mapa: 1411, x: 80, y: 40, modo: 'flecha' },
    { t: 'turnin', q: 97901 },
    OBJ('Dador inventado', { npc: { id: 97915 }, el: { padre: 1 } }),
  ] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  return m;
}
const LOBO = (terminado) => ({ texto: 'Lobo de prueba: 0/1', hecho: terminado ? 1 : 0, pedido: 1, terminado, tipo: 'monster' });
const GARRA = (terminado) => ({ texto: 'Garra de prueba: 0/1', hecho: terminado ? 1 : 0, pedido: 1, terminado, tipo: 'item' });

test('T2: los PNJ de los objetivos sin terminar de una entrega a medias salen como enemigos (mob), con su id', () => {
  const m = conEntregaAMedias([LOBO(false), GARRA(false)]);
  assert.deepEqual(lista(m).map((e) => [e.clave, e.tipo, e.ids]), [
    ['lobo de prueba', 'mob', [97911]],
    ['cuervo de prueba', 'mob', [97912]],
    ['dador inventado', 'target', [97915]],
  ]);
  // Terminado el lobo, sale de la lista en cuanto el motor lo ve (QUEST_LOG_UPDATE y su ciclo).
  m.estadoMision(97901, { objetivos: [LOBO(true), GARRA(false)] });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  assert.deepEqual(lista(m).map((e) => e.clave), ['cuervo de prueba', 'dador inventado']);
  // Completa: solo queda el que la recoge.
  m.estadoMision(97901, { completa: true, objetivos: [LOBO(true), GARRA(true)] });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  assert.deepEqual(lista(m).map((e) => [e.clave, e.tipo]), [['dador inventado', 'target']]);
  sinErrores(m);
});

test('T2: con la misión completa, la entrega no pide más PNJ que los suyos', () => {
  const m = conEntregaAMedias([LOBO(true), GARRA(true)], { completa: true });
  assert.deepEqual(lista(m).map((e) => e.clave), ['dador inventado']);
  sinErrores(m);
});
