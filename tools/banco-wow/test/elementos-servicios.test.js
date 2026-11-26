// Evaluadores de los elementos de servicios, viajes, hechizos, auras, profesiones y reputación
// (motor/elementos-servicios.lua). Nada de esto actúa por el jugador: solo detecta que lo ha hecho él.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const GUID = (id) => `Creature-0-0-0-0-${id}-0000`;

// Un elemento con su `mem` persistente (como en el juego, una tabla por elemento y por activación del paso).
// Devuelve una función evaluar(...evento) → [resultado, extra]. `evento` es [nombre, ...argumentos].
let contador = 0;
function elemento(m, el) {
  const id = ++contador;
  m.lua(`BANCO.pruebaEl = BANCO.pruebaEl or {}; BANCO.pruebaEl[${id}] = {el = ${aLua(el)}, mem = {}}`);
  return (...evento) => {
    const args = evento.map((a) => aLua(a)).join(', ');
    const coma = args ? `, ${args}` : '';
    return m.lua(`(function()
      local c = BANCO.pruebaEl[${id}]
      local r, x = SnetForever.Elementos.evaluar(c.el, c.mem${coma})
      return {r, x}
    end)()`);
  };
}
// Evaluación suelta (sin memoria entre llamadas).
const una = (m, el, ...evento) => elemento(m, el)(...evento);
const res = (m, el, ...evento) => una(m, el, ...evento)[0];

const hechizo = (m, id, nombre, conocido = false) => m.lua(`BANCO.ponerHechizo(${id}, ${aLua(nombre)}, ${conocido})`);
const habilidad = (m, nombre, rango, max, cabecera = false) => m.lua(`BANCO.ponerHabilidad(${aLua(nombre)}, ${rango}, ${max}, ${cabecera})`);
const faccion = (m, id, rango, dentro, largo) => m.lua(`BANCO.ponerFaccion(${id}, ${rango}, ${dentro}, ${largo})`);
const aura = (m, datos) => m.lua(`BANCO.ponerAura(${aLua(datos)})`);
const enfriamiento = (m, tipo, id, restante) => m.lua(`BANCO.ponerEnfriamiento(${aLua(tipo)}, ${id}, ${restante})`);
const servicios = (m, cambios) => m.lua(`BANCO.ponerServicios(${aLua(cambios)})`);
const npc = (m, guid) => m.lua(`BANCO.ponerNpc(${aLua(guid)})`);

// El GUID de un PNJ del banco: «Creature-0-1-0-0-<id>-0000000001».
const GUID_DE = (id) => `Creature-0-1-0-0-${id}-0000000001`;

// ---------------------------------------------------------------------------------------------------
// Eventos y registro
// ---------------------------------------------------------------------------------------------------

test('eventos: la lista de cada elemento de servicios, hechizos y reputación', () => {
  const m = nuevaMaquina();
  const ev = (t) => m.lua(`SnetForever.Elementos.eventos({t = "${t}"})`);
  assert.deepEqual(ev('vendor'), ['MERCHANT_SHOW', 'MERCHANT_CLOSED']);
  assert.deepEqual(ev('trainer'), ['TRAINER_SHOW', 'TRAINER_CLOSED']);
  assert.deepEqual(ev('stable'), ['PET_STABLE_SHOW', 'PET_STABLE_CLOSED']);
  assert.deepEqual(ev('train'), ['TRAINER_SHOW', 'CHAT_MSG_SYSTEM', 'SKILL_LINES_CHANGED', 'TRAINER_UPDATE']);
  assert.deepEqual(ev('fp'), ['UI_INFO_MESSAGE', 'TAXIMAP_OPENED']);
  assert.deepEqual(ev('fly'), ['PLAYER_CONTROL_LOST', 'ZONE_CHANGED']);
  assert.deepEqual(ev('hs'), ['UNIT_SPELLCAST_SUCCEEDED']);
  assert.deepEqual(ev('cast'), ['UNIT_SPELLCAST_SUCCEEDED']);
  assert.deepEqual(ev('home'), ['HEARTHSTONE_BOUND']);
  assert.deepEqual(ev('deathskip'), ['PLAYER_DEAD', 'PLAYER_ALIVE', 'PLAYER_UNGHOST']);
  assert.deepEqual(ev('aura'), ['UNIT_AURA']);
  assert.deepEqual(ev('skill'), ['SKILL_LINES_CHANGED']);
  assert.deepEqual(ev('reputation'), ['UPDATE_FACTION']);
  assert.deepEqual(ev('cooldown'), ['SPELL_UPDATE_COOLDOWN', 'PLAYER_REGEN_ENABLED']);
  assert.deepEqual(ev('gossipoption'), ['GOSSIP_SHOW']);
  assert.deepEqual(ev('istrained'), ['SKILL_LINES_CHANGED']);
  assert.deepEqual(ev('next'), []);
  sinErrores(m);
});

test('sinCasilla da info en todos los elementos de este archivo', () => {
  const m = nuevaMaquina();
  hechizo(m, 100, 'Hechizo', true);
  for (const el of [
    { t: 'vendor' }, { t: 'trainer' }, { t: 'stable' }, { t: 'train', spell: 100, efecto: 'objetivo' },
    { t: 'istrained', spells: [100] }, { t: 'fp', nombre: 'x' }, { t: 'fly', destino: 'x' }, { t: 'hs' },
    { t: 'home' }, { t: 'deathskip' }, { t: 'cast', spells: [1] },
    { t: 'aura', spell: 1, efecto: 'objetivo' }, { t: 'skill', p: 'cooking', n: 1, efecto: 'objetivo' },
    { t: 'reputation', faccion: 1, rango: 4, efecto: 'objetivo' },
    { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' },
    { t: 'gossipoption', id: 1 }, { t: 'next' },
  ]) {
    assert.equal(res(m, { ...el, sinCasilla: true }), 'info', el.t);
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// vendor, trainer, stable
// ---------------------------------------------------------------------------------------------------

test('vendor {npc 3165}: MERCHANT_SHOW con ese PNJ y luego MERCHANT_CLOSED → hecho; con otro PNJ → pendiente', () => {
  const m = nuevaMaquina();
  const bueno = elemento(m, { t: 'vendor', npc: 3165 });
  assert.equal(bueno()[0], 'pendiente', 'sin abrir ninguna ventana');
  npc(m, GUID(3165));
  assert.equal(bueno('MERCHANT_SHOW')[0], 'pendiente', 'abierta, aún sin cerrar');
  assert.equal(bueno('MERCHANT_CLOSED')[0], 'hecho');
  assert.equal(bueno()[0], 'hecho', 'se queda hecho en los repasos');

  const otro = elemento(m, { t: 'vendor', npc: 3165 });
  npc(m, GUID(1234));
  otro('MERCHANT_SHOW');
  assert.equal(otro('MERCHANT_CLOSED')[0], 'pendiente', 'ventana de otro PNJ');
  sinErrores(m);
});

test('vendor, trainer y stable: sin npc vale cualquier PNJ, pero hay que abrir y cerrar la ventana', () => {
  const m = nuevaMaquina();
  for (const [t, abrir, cerrar] of [
    ['vendor', 'MERCHANT_SHOW', 'MERCHANT_CLOSED'],
    ['trainer', 'TRAINER_SHOW', 'TRAINER_CLOSED'],
    ['stable', 'PET_STABLE_SHOW', 'PET_STABLE_CLOSED'],
  ]) {
    npc(m, GUID(5000));
    const cualquiera = elemento(m, { t });
    assert.equal(cualquiera(cerrar)[0], 'pendiente', `${t}: cerrar sin haber abierto`);
    cualquiera(abrir);
    assert.equal(cualquiera(cerrar)[0], 'hecho', t);
    // La ventana de otro servicio no cuenta.
    const concreto = elemento(m, { t, npc: 5000 });
    concreto(abrir);
    assert.equal(concreto(cerrar)[0], 'hecho', `${t} con npc`);
  }
  const vendedor = elemento(nuevaMaquina(), { t: 'vendor' });
  assert.equal(vendedor('TRAINER_CLOSED')[0], 'pendiente');
  sinErrores(m);
});

test('vendor: si el GUID de «npc» no es de criatura (nil), con npc pedido no se da por hecho', () => {
  const m = nuevaMaquina();
  const el = elemento(m, { t: 'vendor', npc: 3165 });
  npc(m, null);
  el('MERCHANT_SHOW');
  assert.equal(el('MERCHANT_CLOSED')[0], 'pendiente');
  const sinNpc = elemento(m, { t: 'vendor' });
  sinNpc('MERCHANT_SHOW');
  assert.equal(sinNpc('MERCHANT_CLOSED')[0], 'hecho', 'sin npc pedido basta con abrir y cerrar');
  sinErrores(m);
});

test('vendor: con el GUID de «npc» secreto se mira issecretvalue antes de partirlo y no se da por hecho (sin error)', () => {
  const m = nuevaMaquina();
  m.unidad('npc', { guid: GUID_DE(3165), guidSecreto: true });
  const el = elemento(m, { t: 'vendor', npc: 3165 });
  const antes = m.llamadas('issecretvalue').length;
  el('MERCHANT_SHOW');
  assert.ok(m.llamadas('issecretvalue').length > antes, 'pregunta si el GUID es secreto');
  assert.equal(el('MERCHANT_CLOSED')[0], 'pendiente');
  // Sin secreto, el mismo PNJ sí vale.
  m.unidad('npc', { guid: GUID_DE(3165) });
  const bueno = elemento(m, { t: 'vendor', npc: 3165 });
  bueno('MERCHANT_SHOW');
  assert.equal(bueno('MERCHANT_CLOSED')[0], 'hecho');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// train, istrained
// ---------------------------------------------------------------------------------------------------

test('train: hecho si conoces el hechizo, pendiente si no; la regla común de efectos e invertir', () => {
  const m = nuevaMaquina();
  hechizo(m, 2018, 'Herrería', false);
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'objetivo' }), 'pendiente');
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'saltar_si_alcanzado' }), 'info');
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'saltar_si_no_alcanzado' }), 'saltar_paso');
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'objetivo', invertir: true }), 'hecho');
  hechizo(m, 2018, 'Herrería', true);
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'saltar_si_alcanzado' }), 'saltar_paso');
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'saltar_si_no_alcanzado' }), 'info');
  assert.equal(res(m, { t: 'train', spell: 2018, efecto: 'objetivo', invertir: true }), 'pendiente');
  sinErrores(m);
});

test('train sin IsPlayerSpell usa IsSpellKnown; sin ninguna de las dos no hay error y no se cumple', () => {
  const m = nuevaMaquina({ sinApi: ['IsPlayerSpell'] });
  hechizo(m, 7, 'Siete', true);
  assert.equal(res(m, { t: 'train', spell: 7, efecto: 'objetivo' }), 'hecho');
  assert.ok(m.llamadas('IsSpellKnown').length > 0);
  const n = nuevaMaquina({ sinApi: ['IsPlayerSpell', 'IsSpellKnown'] });
  assert.equal(res(n, { t: 'train', spell: 7, efecto: 'objetivo' }), 'pendiente');
  sinErrores(m);
  sinErrores(n);
});

test('istrained: saltar_paso si conoces alguno de los hechizos; si no, info', () => {
  const m = nuevaMaquina();
  hechizo(m, 10138, 'A', false);
  hechizo(m, 10156, 'B', false);
  assert.equal(res(m, { t: 'istrained', spells: [10138, 10156] }), 'info');
  hechizo(m, 10156, 'B', true);
  assert.equal(res(m, { t: 'istrained', spells: [10138, 10156] }), 'saltar_paso');
  assert.equal(res(m, { t: 'istrained', spells: [10138] }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// fp, fly (nunca eligen el vuelo ni el destino)
// ---------------------------------------------------------------------------------------------------

test('fp: UI_INFO_MESSAGE con ERR_NEWTAXIPATH → hecho; otro mensaje → pendiente; se queda hecho', () => {
  const m = nuevaMaquina();
  const nuevo = m.lua('ERR_NEWTAXIPATH');
  const el = elemento(m, { t: 'fp', nombre: 'Orgrimmar' });
  assert.equal(el()[0], 'pendiente');
  assert.equal(el('UI_INFO_MESSAGE', 0, 'Otro mensaje')[0], 'pendiente');
  assert.equal(el('UI_INFO_MESSAGE', 0, nuevo)[0], 'hecho');
  assert.equal(el()[0], 'hecho');
  // El mensaje también vale si el cliente lo manda sin tipo (un solo argumento).
  assert.equal(res(m, { t: 'fp', nombre: 'x' }, 'UI_INFO_MESSAGE', nuevo), 'hecho');
  sinErrores(m);
});

test('fp con ignorarMensaje: el mensaje de ruta nueva no cuenta', () => {
  const m = nuevaMaquina();
  const nuevo = m.lua('ERR_NEWTAXIPATH');
  assert.equal(res(m, { t: 'fp', nombre: 'x', ignorarMensaje: true }, 'UI_INFO_MESSAGE', 0, nuevo), 'pendiente');
  sinErrores(m);
});

test('fp: TAXIMAP_OPENED con un nodo cuyo nombre contiene `nombre` (sin distinguir mayúsculas) → hecho', () => {
  const m = nuevaMaquina();
  servicios(m, { nodos: [{ nodeID: 1, name: 'Orgrimmar, Durotar', state: 1 }, { nodeID: 2, name: "Sen'jin Village, Durotar", state: 1 }] });
  assert.equal(res(m, { t: 'fp', nombre: 'orgrimmar' }, 'TAXIMAP_OPENED'), 'hecho');
  assert.equal(res(m, { t: 'fp', nombre: 'SEN\'JIN' }, 'TAXIMAP_OPENED'), 'hecho');
  assert.equal(res(m, { t: 'fp', nombre: 'Crossroads' }, 'TAXIMAP_OPENED'), 'pendiente');
  assert.equal(res(m, { t: 'fp' }, 'TAXIMAP_OPENED'), 'pendiente', 'sin nombre solo vale el mensaje');
  // Sin abrir el mapa de vuelos no se mira nada.
  assert.equal(res(m, { t: 'fp', nombre: 'orgrimmar' }), 'pendiente');
  assert.ok(m.llamadas('C_TaxiMap.GetAllTaxiNodes').length > 0);
  sinErrores(m);
});

test('fp y fly nunca llaman a TakeTaxiNode ni eligen el vuelo', () => {
  const m = nuevaMaquina();
  servicios(m, { nodos: [{ nodeID: 1, name: 'Orgrimmar', state: 1 }] });
  res(m, { t: 'fp', nombre: 'Orgrimmar' }, 'TAXIMAP_OPENED');
  res(m, { t: 'fly', destino: 'Orgrimmar' }, 'TAXIMAP_OPENED');
  res(m, { t: 'fly', destino: 'Orgrimmar' }, 'GOSSIP_SHOW');
  assert.deepEqual(m.llamadas('TakeTaxiNode'), []);
  assert.deepEqual(m.llamadas('SelectGossipOption'), []);
  sinErrores(m);
});

test('fly: UnitOnTaxi("player") → hecho y se queda hecho al aterrizar; en tierra → pendiente', () => {
  const m = nuevaMaquina();
  const el = elemento(m, { t: 'fly', destino: 'Orgrimmar' });
  assert.equal(el()[0], 'pendiente');
  servicios(m, { taxi: true });
  assert.equal(el('PLAYER_CONTROL_LOST')[0], 'hecho');
  servicios(m, { taxi: false });
  assert.equal(el('ZONE_CHANGED')[0], 'hecho', 'al aterrizar sigue hecho');
  assert.equal(res(m, { t: 'fly', destino: 'Orgrimmar' }), 'pendiente', 'otro elemento en tierra');
  assert.deepEqual(m.llamadas('TakeTaxiNode'), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// hs, home, deathskip, cast
// ---------------------------------------------------------------------------------------------------

test('hs: el lanzamiento de 8690 del jugador → hecho; el de su mascota → pendiente', () => {
  const m = nuevaMaquina();
  assert.equal(res(m, { t: 'hs' }, 'UNIT_SPELLCAST_SUCCEEDED', 'player', 'GUID', 8690), 'hecho');
  assert.equal(res(m, { t: 'hs' }, 'UNIT_SPELLCAST_SUCCEEDED', 'pet', 'GUID', 8690), 'pendiente');
  for (const id of [556, 184871]) {
    assert.equal(res(m, { t: 'hs' }, 'UNIT_SPELLCAST_SUCCEEDED', 'player', 'GUID', id), 'hecho', `hechizo ${id}`);
  }
  assert.equal(res(m, { t: 'hs' }, 'UNIT_SPELLCAST_SUCCEEDED', 'player', 'GUID', 133), 'pendiente', 'otro hechizo');
  const el = elemento(m, { t: 'hs' });
  assert.equal(el()[0], 'pendiente');
  el('UNIT_SPELLCAST_SUCCEEDED', 'player', 'GUID', 8690);
  assert.equal(el()[0], 'hecho', 'se queda hecho');
  sinErrores(m);
});

test('home: HEARTHSTONE_BOUND → hecho; o GetBindLocation() igual al nombre del área', () => {
  const m = nuevaMaquina();
  m.nombreJuego('zona', 362, 'Orgrimmar');
  m.nombreJuego('zona', 14, 'Durotar');
  m.jugador({ vinculo: 'Valle de los Retos' });
  assert.equal(res(m, { t: 'home', area: 362 }), 'pendiente');
  assert.equal(res(m, { t: 'home', area: 362 }, 'HEARTHSTONE_BOUND'), 'hecho');
  assert.equal(res(m, { t: 'home' }, 'HEARTHSTONE_BOUND'), 'hecho');
  assert.equal(res(m, { t: 'home' }), 'pendiente', 'sin área, solo el evento');
  m.jugador({ vinculo: 'Orgrimmar' });
  assert.equal(res(m, { t: 'home', area: 362 }), 'hecho');
  assert.equal(res(m, { t: 'home', area: 14 }), 'pendiente');
  assert.equal(res(m, { t: 'home', area: 99999 }), 'pendiente', 'área sin nombre en caché');
  assert.deepEqual(m.llamadas('ConfirmBinder'), []);
  sinErrores(m);
});

test('deathskip: fantasma con el paso activo y luego PLAYER_UNGHOST → hecho; sin haber sido fantasma → pendiente', () => {
  const m = nuevaMaquina();
  const el = elemento(m, { t: 'deathskip' });
  assert.equal(el('PLAYER_UNGHOST')[0], 'pendiente', 'nunca fue fantasma con el paso activo');
  m.jugador({ muerto: true });
  assert.equal(el('PLAYER_DEAD')[0], 'pendiente', 'muerto con el cadáver sin liberar');
  m.jugador({ muerto: false, fantasma: true });
  assert.equal(el('PLAYER_ALIVE')[0], 'pendiente', 'ya es fantasma');
  m.jugador({ fantasma: false });
  assert.equal(el('PLAYER_UNGHOST')[0], 'hecho');
  assert.equal(el()[0], 'hecho');
  // Si el paso se activa estando ya de fantasma, también cuenta.
  const tarde = elemento(m, { t: 'deathskip' });
  m.jugador({ fantasma: true });
  tarde();
  m.jugador({ fantasma: false });
  assert.equal(tarde('PLAYER_UNGHOST')[0], 'hecho');
  sinErrores(m);
});

test('cast: UNIT_SPELLCAST_SUCCEEDED de la unidad (por defecto el jugador) con un id de la lista', () => {
  const m = nuevaMaquina();
  const OK = 'UNIT_SPELLCAST_SUCCEEDED';
  assert.equal(res(m, { t: 'cast', spells: [3562, 3563] }, OK, 'player', 'G', 3563), 'hecho');
  assert.equal(res(m, { t: 'cast', spells: [3562, 3563] }, OK, 'player', 'G', 1), 'pendiente');
  assert.equal(res(m, { t: 'cast', spells: [3562] }, OK, 'pet', 'G', 3562), 'pendiente', 'lo lanza la mascota');
  assert.equal(res(m, { t: 'cast', unidad: 'pet', spells: [3562] }, OK, 'pet', 'G', 3562), 'hecho');
  assert.equal(res(m, { t: 'cast', unidad: 'pet', spells: [3562] }, OK, 'player', 'G', 3562), 'pendiente');
  const el = elemento(m, { t: 'cast', spells: [3562] });
  el(OK, 'player', 'G', 3562);
  assert.equal(el()[0], 'hecho', 'se queda hecho');
  assert.equal(res(m, { t: 'cast', spells: [3562] }), 'pendiente', 'sin evento nada que detectar');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// aura
// ---------------------------------------------------------------------------------------------------

test('aura: el aura está → hecho (objetivo); no está → pendiente; la regla común de efecto e invertir', () => {
  const m = nuevaMaquina();
  assert.equal(res(m, { t: 'aura', spell: 2580, efecto: 'objetivo' }), 'pendiente');
  assert.equal(res(m, { t: 'aura', spell: 2580, efecto: 'objetivo', invertir: true }), 'hecho');
  assert.equal(res(m, { t: 'aura', spell: 2580, efecto: 'saltar_si_no_alcanzado' }), 'saltar_paso');
  aura(m, { spellId: 2580, restante: 120 });
  assert.equal(res(m, { t: 'aura', spell: 2580, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'aura', spell: 2580, efecto: 'objetivo', invertir: true }), 'pendiente');
  assert.equal(res(m, { t: 'aura', spell: 2580, efecto: 'saltar_si_alcanzado' }), 'saltar_paso');
  assert.equal(res(m, { t: 'aura', spell: 2580, efecto: 'saltar_si_no_alcanzado' }), 'info');
  assert.ok(m.llamadas('C_UnitAuras.GetPlayerAuraBySpellID').length > 0);
  sinErrores(m);
});

test('aura con dur: más de dur segundos restantes, o permanente; con cargas: al menos esas cargas', () => {
  const m = nuevaMaquina();
  aura(m, { spellId: 10, restante: 30 });
  aura(m, { spellId: 11, restante: 5 });
  aura(m, { spellId: 12 }); // permanente
  aura(m, { spellId: 13, restante: 60, cuenta: 2 });
  const dur = (spell, d) => res(m, { t: 'aura', spell, dur: d, efecto: 'objetivo' });
  assert.equal(dur(10, 10), 'hecho');
  assert.equal(dur(11, 10), 'pendiente', 'le quedan 5 s y se piden más de 10');
  assert.equal(dur(12, 10), 'hecho', 'permanente');
  assert.equal(dur(14, 10), 'pendiente', 'sin el aura');
  assert.equal(res(m, { t: 'aura', spell: 13, cargas: 2, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'aura', spell: 13, cargas: 3, efecto: 'objetivo' }), 'pendiente');
  assert.equal(res(m, { t: 'aura', spell: 13, cargas: 3, efecto: 'objetivo', invertir: true }), 'hecho');
  // Con el paso del tiempo el aura baja del umbral.
  m.avanzar(26);
  assert.equal(dur(10, 10), 'pendiente', 'ahora le quedan unos 4 s');
  sinErrores(m);
});

test('aura sin C_UnitAuras recorre UnitBuff y UnitDebuff (1-32)', () => {
  const m = nuevaMaquina({ sinApi: ['C_UnitAuras'] });
  aura(m, { spellId: 21, restante: 30 });
  aura(m, { spellId: 22, restante: 30, perjuicio: true, cuenta: 4 });
  assert.equal(res(m, { t: 'aura', spell: 21, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'aura', spell: 22, efecto: 'objetivo' }), 'hecho', 'un perjuicio también cuenta');
  assert.equal(res(m, { t: 'aura', spell: 23, efecto: 'objetivo' }), 'pendiente');
  assert.equal(res(m, { t: 'aura', spell: 22, cargas: 4, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'aura', spell: 21, dur: 100, efecto: 'objetivo' }), 'pendiente');
  assert.ok(m.llamadas('UnitBuff').length > 0 && m.llamadas('UnitDebuff').length > 0);
  // Si el aura nº 32 está, se encuentra; la 33 queda fuera de lo que se mira.
  const n = nuevaMaquina({ sinApi: ['C_UnitAuras'] });
  for (let i = 1; i <= 33; i++) aura(n, { spellId: 1000 + i });
  assert.equal(res(n, { t: 'aura', spell: 1032, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(n, { t: 'aura', spell: 1033, efecto: 'objetivo' }), 'pendiente');
  sinErrores(m);
  sinErrores(n);
});

// ---------------------------------------------------------------------------------------------------
// skill y Profesiones
// ---------------------------------------------------------------------------------------------------

test('skill herbalism 50: con GetSpellInfo(9134) «Herboristería» y la línea «Herboristería» 60/75 → hecho', () => {
  const m = nuevaMaquina();
  hechizo(m, 9134, 'Herboristería');
  habilidad(m, 'Profesiones', 0, 0, true);
  habilidad(m, 'Herboristería', 60, 75);
  const el = { t: 'skill', p: 'herbalism', n: 50, efecto: 'objetivo' };
  assert.equal(res(m, el), 'hecho');
  assert.equal(res(m, { ...el, n: 70 }), 'pendiente');
  assert.equal(res(m, { ...el, n: 60 }), 'hecho', 'justo el nivel pedido');
  assert.equal(res(m, { ...el, invertir: true }), 'pendiente');
  assert.equal(res(m, { ...el, n: 70, invertir: true }), 'hecho');
  assert.equal(res(m, { ...el, efecto: 'saltar_si_alcanzado' }), 'saltar_paso');
  assert.equal(res(m, { ...el, efecto: 'saltar_si_no_alcanzado' }), 'info');
  assert.equal(res(m, { ...el, n: 70, efecto: 'saltar_si_no_alcanzado' }), 'saltar_paso');
  sinErrores(m);
});

test('skill con maximo: se compara con el nivel máximo de la línea', () => {
  const m = nuevaMaquina();
  hechizo(m, 9134, 'Herboristería');
  habilidad(m, 'Herboristería', 60, 75);
  assert.equal(res(m, { t: 'skill', p: 'herbalism', n: 75, maximo: true, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'skill', p: 'herbalism', n: 75, efecto: 'objetivo' }), 'pendiente');
  sinErrores(m);
});

// Lote A, ronda 1: si no se puede medir, el objetivo queda pendiente (con su casilla) y la condición informa.
test('skill: sin la profesión el nivel es -1; riding y las profesiones sin hechizo: objetivo pendiente, condición info', () => {
  const m = nuevaMaquina();
  hechizo(m, 9134, 'Herboristería');
  habilidad(m, 'Minería', 10, 75);
  assert.equal(res(m, { t: 'skill', p: 'herbalism', n: 1, efecto: 'objetivo' }), 'pendiente', 'no la tiene: -1 < 1');
  assert.equal(res(m, { t: 'skill', p: 'herbalism', n: 1, efecto: 'saltar_si_no_alcanzado' }), 'saltar_paso');
  assert.equal(res(m, { t: 'skill', p: 'riding', n: 75, efecto: 'objetivo' }), 'pendiente');
  assert.equal(res(m, { t: 'skill', p: 'riding', n: 75, efecto: 'saltar_si_alcanzado' }), 'info');
  assert.equal(res(m, { t: 'skill', p: 'inventada', n: 1, efecto: 'objetivo' }), 'pendiente');
  // Sin el nombre del hechizo en la caché del cliente no se puede comparar: pendiente (no «hecho» ni «no la tiene»).
  assert.equal(res(m, { t: 'skill', p: 'mining', n: 1, efecto: 'objetivo' }), 'pendiente');
  assert.equal(res(m, { t: 'skill', p: 'mining', n: 1, efecto: 'saltar_si_no_alcanzado' }), 'info');
  sinErrores(m);
});

test('Profesiones.nivel: -1 si no la tiene, nil si p no tiene hechizo; usa C_Spell.GetSpellName si no hay GetSpellInfo', () => {
  const m = nuevaMaquina();
  hechizo(m, 2550, 'Cocina');
  habilidad(m, 'Cocina', 33, 150);
  const nivel = (p) => m.lua(`SnetForever.Profesiones.nivel(${aLua(p)})`);
  assert.equal(nivel('cooking'), 33);
  assert.equal(nivel('fishing'), undefined, 'sin nombre de hechizo en la caché');
  hechizo(m, 7620, 'Pesca');
  assert.equal(nivel('fishing'), -1);
  assert.equal(nivel('riding'), undefined);
  assert.equal(nivel('nada'), undefined);
  assert.equal(m.lua('SnetForever.Profesiones.nivel("cooking", true)'), 150, 'el máximo con el segundo argumento');
  const n = nuevaMaquina({ sinApi: ['GetSpellInfo'] });
  hechizo(n, 2550, 'Cocina');
  habilidad(n, 'Cocina', 12, 75);
  assert.equal(n.lua('SnetForever.Profesiones.nivel("cooking")'), 12);
  sinErrores(m);
  sinErrores(n);
});

test('Profesiones.nivel: la tabla de hechizos de las 14 profesiones', () => {
  const IDS = { alchemy: 2259, blacksmithing: 2018, enchanting: 7411, engineering: 4036, herbalism: 9134,
    leatherworking: 2108, mining: 2575, skinning: 8613, tailoring: 3908, cooking: 2550, firstaid: 3273, fishing: 7620,
    lockpicking: 1809, poisons: 2842 };
  const m = nuevaMaquina();
  for (const [p, id] of Object.entries(IDS)) {
    hechizo(m, id, `Nombre de ${p}`);
    habilidad(m, `Nombre de ${p}`, id % 300, 300);
  }
  for (const [p, id] of Object.entries(IDS)) {
    assert.equal(m.lua(`SnetForever.Profesiones.nivel(${aLua(p)})`), id % 300, p);
  }
  sinErrores(m);
});

test('collect con profesion usa el nivel real de SNF.Profesiones.nivel', () => {
  const m = nuevaMaquina();
  hechizo(m, 2550, 'Cocina');
  habilidad(m, 'Cocina', 3, 75);
  const el = { t: 'collect', i: 2894, n: 10, q: 4000, mascara: 1, profesion: 'cooking', profesionInicio: 0 };
  m.objeto(2894, 6);
  assert.equal(res(m, el), 'pendiente', 'a nivel 3 se piden 7');
  m.objeto(2894, 7);
  assert.equal(res(m, el), 'hecho');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// reputation y Reputacion
// ---------------------------------------------------------------------------------------------------

test('Reputacion.de: {rango, valor}, o nil si no se conoce la facción', () => {
  const m = nuevaMaquina();
  faccion(m, 529, 5, 1200, 6000);
  const r = m.lua('SnetForever.Reputacion.de(529)');
  assert.equal(r.rango, 5);
  assert.equal(r.valor, 1200, 'puntos dentro del rango');
  assert.equal(m.lua('SnetForever.Reputacion.de(1)'), undefined);
  sinErrores(m);
});

test('Reputacion.de sin C_Reputation usa GetFactionInfoByID', () => {
  const m = nuevaMaquina({ sinApi: ['C_Reputation'] });
  faccion(m, 529, 6, 100, 12000);
  const r = m.lua('SnetForever.Reputacion.de(529)');
  assert.equal(r.rango, 6);
  assert.equal(r.valor, 100);
  assert.ok(m.llamadas('GetFactionInfoByID').length > 0);
  sinErrores(m);
});

test('reputation: rango >= el pedido (hated…exalted = 1…8) → hecho', () => {
  const m = nuevaMaquina();
  const el = { t: 'reputation', faccion: 529, rango: 5, efecto: 'objetivo' };
  assert.equal(res(m, el), 'pendiente', 'facción desconocida: objetivo sin medir (lote A, ronda 1)');
  assert.equal(res(m, { ...el, efecto: 'saltar_si_alcanzado' }), 'info', 'y la condición informa');
  faccion(m, 529, 4, 100, 3000);
  assert.equal(res(m, el), 'pendiente', 'neutral');
  faccion(m, 529, 5, 0, 6000);
  assert.equal(res(m, el), 'hecho', 'amistoso');
  faccion(m, 529, 8, 0, 999);
  assert.equal(res(m, el), 'hecho', 'exaltado');
  assert.equal(res(m, { ...el, invertir: true }), 'pendiente');
  assert.equal(res(m, { ...el, efecto: 'saltar_si_alcanzado' }), 'saltar_paso');
  assert.equal(res(m, { ...el, efecto: 'saltar_si_no_alcanzado' }), 'info');
  sinErrores(m);
});

test('reputation con valor: puntos dentro del rango, a X de llegar (negativo) o un porcentaje (0-1)', () => {
  const m = nuevaMaquina();
  faccion(m, 92, 5, 500, 6000);
  const con = (valor, extra = {}) => res(m, { t: 'reputation', faccion: 92, rango: 5, valor, efecto: 'objetivo', ...extra });
  assert.equal(con(500), 'hecho', '500 puntos dentro del rango, justo');
  assert.equal(con(501), 'pendiente');
  assert.equal(con(0.5), 'pendiente', 'la mitad de 6000 son 3000');
  assert.equal(con(0.05), 'hecho', '5 % son 300');
  faccion(m, 92, 5, 3000, 6000);
  assert.equal(con(0.5), 'hecho');
  // Negativo: a X puntos de llegar al rango pedido (estando en el anterior).
  faccion(m, 92, 4, 2500, 3000);
  assert.equal(con(-500), 'hecho', 'faltan 500 para amistoso');
  assert.equal(con(-499), 'pendiente');
  faccion(m, 92, 3, 2900, 3000);
  assert.equal(con(-500), 'pendiente', 'dos rangos por debajo no vale');
  faccion(m, 92, 6, 0, 12000);
  assert.equal(con(-500), 'hecho', 'por encima del rango');
  assert.equal(con(5000), 'hecho', 'un rango por encima, el valor ya no hace falta');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// cooldown
// ---------------------------------------------------------------------------------------------------

test('cooldown item 6948 < 0: con 0 s restantes → saltar_paso; con 600 s → info', () => {
  const m = nuevaMaquina();
  const el = { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' };
  enfriamiento(m, 'item', 6948, 0);
  assert.equal(res(m, el), 'saltar_paso');
  enfriamiento(m, 'item', 6948, 600);
  assert.equal(res(m, el), 'info');
  sinErrores(m);
});

test('cooldown: el mínimo de seg es 2 s; op ">" compara por encima; spell usa C_Spell.GetSpellCooldown', () => {
  const m = nuevaMaquina();
  const menor = { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' };
  const mayor = { ...menor, op: '>' };
  enfriamiento(m, 'item', 6948, 1.5);
  assert.equal(res(m, menor), 'saltar_paso', '1,5 < 2');
  assert.equal(res(m, mayor), 'info');
  enfriamiento(m, 'item', 6948, 2.5);
  assert.equal(res(m, menor), 'info');
  assert.equal(res(m, mayor), 'saltar_paso', '2,5 > 2');
  assert.equal(res(m, { ...mayor, seg: 60 }), 'info');
  enfriamiento(m, 'item', 6948, 61);
  assert.equal(res(m, { ...mayor, seg: 60 }), 'saltar_paso');
  assert.equal(res(m, { ...menor, seg: 120 }), 'saltar_paso', '61 < 120');
  enfriamiento(m, 'spell', 1259416, 30);
  assert.equal(res(m, { t: 'cooldown', tipo: 'spell', id: 1259416, op: '>', seg: 0, efecto: 'saltar_si_alcanzado' }), 'saltar_paso');
  assert.equal(res(m, { t: 'cooldown', tipo: 'spell', id: 1259705, op: '>', seg: 0, efecto: 'saltar_si_alcanzado' }), 'info');
  assert.ok(m.llamadas('C_Spell.GetSpellCooldown').length > 0);
  sinErrores(m);
});

test('cooldown: el tiempo restante baja con el tiempo; sin C_Item ni C_Container usa GetItemCooldown', () => {
  const m = nuevaMaquina({ sinApi: ['C_Container', 'C_Item.GetItemCooldown'] });
  const el = { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 10, efecto: 'saltar_si_alcanzado' };
  enfriamiento(m, 'item', 6948, 30);
  assert.equal(res(m, el), 'info');
  m.avanzar(25);
  assert.equal(res(m, el), 'saltar_paso', 'quedan unos 5 s');
  assert.ok(m.llamadas('GetItemCooldown').length > 0);
  const n = nuevaMaquina();
  enfriamiento(n, 'item', 6948, 30);
  res(n, el);
  assert.ok(n.llamadas('C_Item.GetItemCooldown').length > 0, 'con C_Item manda su versión (la de Forever)');
  sinErrores(m);
  sinErrores(n);
});

test('cooldown: los demás tipos (action, pet, inventory) dan info; unaVez guarda el primer resultado', () => {
  const m = nuevaMaquina();
  assert.equal(res(m, { t: 'cooldown', tipo: 'action', id: 1, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' }), 'info');
  const el = elemento(m, { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado', unaVez: true });
  enfriamiento(m, 'item', 6948, 0);
  assert.equal(el()[0], 'saltar_paso');
  enfriamiento(m, 'item', 6948, 900);
  assert.equal(el()[0], 'saltar_paso', 'unaVez: no se vuelve a mirar');
  assert.equal(res(m, { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' }), 'info', 'sin unaVez sí');
  sinErrores(m);
});

test('cooldown de la piedra de hogar de un chamán: cuenta también el Retorno astral (556)', () => {
  const m = nuevaMaquina();
  m.jugador({ clase: 'SHAMAN' });
  const el = { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' };
  enfriamiento(m, 'item', 6948, 0);
  enfriamiento(m, 'spell', 556, 300);
  assert.equal(res(m, el), 'info', 'la piedra está lista pero el Retorno astral no');
  const guerrero = nuevaMaquina();
  enfriamiento(guerrero, 'spell', 556, 300);
  assert.equal(res(guerrero, el), 'saltar_paso', 'otras clases no lo miran');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// gossipoption, next
// ---------------------------------------------------------------------------------------------------

test('gossipoption: GOSSIP_SHOW con la opción en C_GossipInfo.GetOptions() → hecho, sin elegirla', () => {
  const m = nuevaMaquina();
  servicios(m, { opcionesCharla: [{ gossipOptionID: 100, name: 'Uno' }, { gossipOptionID: 200, name: 'Dos' }] });
  const el = elemento(m, { t: 'gossipoption', id: 200 });
  assert.equal(el()[0], 'pendiente');
  assert.equal(el('GOSSIP_SHOW')[0], 'hecho');
  assert.equal(el()[0], 'hecho', 'se queda hecho');
  assert.equal(res(m, { t: 'gossipoption', id: 300 }, 'GOSSIP_SHOW'), 'pendiente');
  assert.deepEqual(m.llamadas('C_GossipInfo.SelectOption'), []);
  sinErrores(m);
});

// Lote A, ronda 1: sin la API no se puede saber si la opción salió; el objetivo queda pendiente, con su casilla.
test('gossipoption sin C_GossipInfo queda pendiente (con su casilla, no se salta solo)', () => {
  const m = nuevaMaquina({ sinApi: ['C_GossipInfo'] });
  assert.equal(res(m, { t: 'gossipoption', id: 200 }, 'GOSSIP_SHOW'), 'pendiente');
  sinErrores(m);
});

test('next: da ir_guia con las guías del elemento; sin guias, extra nil (los siguientes de la guía)', () => {
  const m = nuevaMaquina();
  const lista = [{ clave: 'Grupo\\01-10 A', filtro: [['f:Horde']] }, { clave: 'Grupo\\01-10 B' }];
  assert.deepEqual(una(m, { t: 'next', guias: lista }), ['ir_guia', lista]);
  assert.deepEqual(una(m, { t: 'next' }), ['ir_guia']);
  assert.deepEqual(una(m, { t: 'next', guias: ['Grupo\\X'] })[1], [{ clave: 'Grupo\\X' }], 'un texto se vuelve {clave}');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T1: vuelo ya conocido y vendedor o instructor que acompaña
// ---------------------------------------------------------------------------------------------------
// Mapa de prueba 1413 de 4000 x 5000 yardas (como en viaje.test.js) con dos maestros de vuelo inventados de la Horda.
const MAPA_PRUEBA = `BANCO.mapas[1413] = {nombre = "Llanos de prueba", inst = 1, padre = 1414, tipo = 3, izquierda = -4000,
  arriba = -2000, ancho = 4000, alto = 5000}`;
const MAESTRO = (id, x, y) => `SNF_MISIONES.npc[${id}] = {name = "Maestro ${id}", friendlyToFaction = "H", npcFlags = 8,
  spawns = {[1413] = {{${x}, ${y}}}}}`;
const conVuelos = (m, ids) => m.lua(`SnetForeverPJ.vuelos = {npcs = {${ids.map((id) => `[${id}] = true`).join(', ')}}, nombres = {}}`);

function mundoDeVuelos() {
  const m = nuevaMaquina({ jugador: { faccion: 'Horde', mapa: 1411, x: 50, y: 50 } });
  m.lua(MAPA_PRUEBA);
  m.lua(MAESTRO(96101, 12, 12));
  m.lua(MAESTRO(96102, 88, 88));
  return m;
}
// Un goto del mundo en ese punto del mapa de prueba (los de la fase 1 traen wx, wy e inst).
const gotoEn = (m, x, y, modo = 'paso') => {
  const w = m.lua(`SnetForever.Coord.aMundo({mapa = 1413, x = ${x}, y = ${y}})`);
  return { t: 'goto', mapa: 1413, x, y, inst: w.inst, wx: w.wx, wy: w.wy, modo, radio: 10 };
};
const cargarGuia = (m, pasos) => {
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(guiaDePrueba([]).clave)})`);
};
const resultadoDe = (m, i, t) => m.lua(`(function()
  for _, e in ipairs(SnetForever.Motor.paso(${i}).elementos) do if e.datos.t == ${aLua(t)} then return e.resultado end end
end)()`);

test('fp: con mem.maestros, hecho si alguno está entre los vuelos apuntados; si no, o sin vuelos apuntados, pendiente', () => {
  const m = nuevaMaquina();
  const conMaestro = (ids) => m.lua(`SnetForever.Elementos.evaluar({t = "fp", nombre = "x"}, {maestros = ${aLua(ids)}})`);
  assert.equal(conMaestro([96101]), 'pendiente', 'nunca se ha abierto un mapa de vuelos');
  conVuelos(m, [96101]);
  assert.equal(conMaestro([96101]), 'hecho');
  assert.equal(conMaestro([96102, 96101]), 'hecho');
  assert.equal(conMaestro([96102]), 'pendiente');
  assert.equal(m.lua('SnetForever.Elementos.evaluar({t = "fp", nombre = "x"}, {})'), 'pendiente', 'sin maestros, como hoy');
  sinErrores(m);
});

test('fp en un paso: el maestro sale del target del paso; ya conocido, el fp es hecho al activarse', () => {
  const m = mundoDeVuelos();
  conVuelos(m, [96101]);
  const TARGET = { t: 'target', npcs: [{ nombre: 'Maestro', id: 96101 }] };
  cargarGuia(m, [{ elementos: [TARGET, { t: 'fp', nombre: 'Norte' }] }, { elementos: [{ t: 'manual' }] }]);
  m.lua('SnetForever.Motor.irA(1)'); // el paso ya hecho no se pasa de largo para poder mirarlo
  assert.equal(resultadoDe(m, 1, 'fp'), 'hecho');
  sinErrores(m);

  const otro = mundoDeVuelos();
  conVuelos(otro, [96102]);
  cargarGuia(otro, [{ elementos: [TARGET, { t: 'fp', nombre: 'Norte' }] }, { elementos: [{ t: 'manual' }] }]);
  assert.equal(resultadoDe(otro, 1, 'fp'), 'pendiente', 'ese vuelo no se conoce');
  sinErrores(otro);
});

test('fp en un paso sin target: el maestro de la base a menos de 120 yd del goto del paso; más lejos, pendiente', () => {
  const m = mundoDeVuelos();
  conVuelos(m, [96101]);
  cargarGuia(m, [
    { elementos: [gotoEn(m, 12.5, 12.5), { t: 'fp', nombre: 'Norte' }] },
    { elementos: [gotoEn(m, 30, 30), { t: 'fp', nombre: 'Norte' }] },
    { elementos: [{ t: 'manual' }] },
  ]);
  m.lua('SnetForever.Motor.irA(1)');
  assert.equal(resultadoDe(m, 1, 'fp'), 'hecho', 'el goto está a unas 28 yd del maestro conocido');
  assert.equal(m.lua('SnetForever.Motor.paso(2).elementos[2].maestros'), undefined, 'a cientos de yardas: no se sabe');
  sinErrores(m);
});

test('vendor con collect en el mismo paso: con el collect hecho es info; si no, pendiente como hoy', () => {
  const m = nuevaMaquina();
  m.objeto(4540, 5);
  cargarGuia(m, [
    { elementos: [{ t: 'vendor' }, { t: 'collect', i: 4540, n: 5 }] },
    { elementos: [{ t: 'vendor' }, { t: 'collect', i: 4541, n: 1 }] },
    { elementos: [{ t: 'vendor' }] },
    { elementos: [{ t: 'manual' }] },
  ]);
  m.lua('SnetForever.Motor.irA(1)');
  assert.equal(resultadoDe(m, 1, 'vendor'), 'info');
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(resultadoDe(m, 2, 'vendor'), 'pendiente');
  m.objeto(4541, 1);
  m.disparar('BAG_UPDATE_DELAYED');
  assert.equal(resultadoDe(m, 2, 'collect'), 'hecho');
  assert.equal(resultadoDe(m, 2, 'vendor'), 'info', 'sigue al collect cuando cambia');
  m.lua('SnetForever.Motor.irA(3)');
  assert.equal(resultadoDe(m, 3, 'vendor'), 'pendiente', 'solo, sin collect: como hoy');
  sinErrores(m);
});

test('trainer con train en el mismo paso: con el hechizo aprendido es info; sin aprender, pendiente', () => {
  const m = nuevaMaquina();
  hechizo(m, 2550, 'Cocina', true);
  cargarGuia(m, [
    { elementos: [{ t: 'trainer' }, { t: 'train', spell: 2550, efecto: 'objetivo' }] },
    { elementos: [{ t: 'trainer' }, { t: 'train', spell: 3273, efecto: 'objetivo' }] },
    { elementos: [{ t: 'manual' }] },
  ]);
  m.lua('SnetForever.Motor.irA(1)');
  assert.equal(resultadoDe(m, 1, 'trainer'), 'info');
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(resultadoDe(m, 2, 'trainer'), 'pendiente');
  sinErrores(m);
});
