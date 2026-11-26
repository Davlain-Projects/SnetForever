// Evaluadores de los elementos de nivel, dinero, objetos y lugar (motor/elementos-mundo.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Evalúa un elemento y devuelve [resultado, extra]. `evento` es [nombre, ...argumentos] o undefined.
function evaluar(m, el, mem = {}, evento = []) {
  const args = evento.map((a) => aLua(a)).join(', ');
  const coma = args ? `, ${args}` : '';
  return m.lua(`(function() local r, x = SnetForever.Elementos.evaluar(${aLua(el)}, ${aLua(mem)}${coma}); return {r, x} end)()`);
}
const resultado = (m, el, mem, evento) => evaluar(m, el, mem, evento)[0];

// Máquina con el jugador cambiado.
const conJugador = (cambios, opciones = {}) => {
  const m = nuevaMaquina(opciones);
  m.jugador(cambios);
  return m;
};

// El ajuste «saltar pasos por nivel» (pasos.saltarPorNivel) se guarda en el personaje; sin valor vale activado.
function ajusteSaltarPorNivel(m, valor) {
  m.lua(`SnetForeverPJ = SnetForeverPJ or {}; SnetForeverPJ.ajustes = SnetForeverPJ.ajustes or {}; SnetForeverPJ.ajustes["pasos.saltarPorNivel"] = ${aLua(valor)}`);
}

// ---------------------------------------------------------------------------------------------------
// Eventos y registro
// ---------------------------------------------------------------------------------------------------

test('eventos: la lista de cada elemento de nivel, dinero, objetos y lugar', () => {
  const m = nuevaMaquina();
  const ev = (t) => m.lua(`SnetForever.Elementos.eventos({t = "${t}"})`);
  const NIVEL = ['PLAYER_XP_UPDATE', 'PLAYER_LEVEL_UP'];
  const OBJETOS = ['BAG_UPDATE_DELAYED', 'QUEST_LOG_UPDATE'];
  const LUGAR = ['ZONE_CHANGED', 'ZONE_CHANGED_INDOORS', 'ZONE_CHANGED_NEW_AREA'];
  assert.deepEqual(ev('xp'), NIVEL);
  assert.deepEqual(ev('maxlevel'), NIVEL);
  assert.deepEqual(ev('money'), ['PLAYER_MONEY']);
  for (const t of ['collect', 'destroy', 'bankdeposit', 'bronzetube']) assert.deepEqual(ev(t), OBJETOS, t);
  assert.deepEqual(ev('bankwithdraw'), [...OBJETOS, 'BANKFRAME_OPENED', 'BANKFRAME_CLOSED']);
  assert.deepEqual(ev('itemcount'), [], 'itemcount no tiene eventos propios');
  assert.deepEqual(ev('equip'), ['PLAYER_EQUIPMENT_CHANGED']);
  for (const t of ['zone', 'subzone', 'zoneskip', 'subzoneskip', 'bindlocation']) assert.deepEqual(ev(t), LUGAR, t);
  assert.deepEqual(ev('showwhiledead'), ['PLAYER_ALIVE', 'PLAYER_DEAD', 'PLAYER_UNGHOST']);
  for (const t of ['use', 'usespell']) assert.deepEqual(ev(t), [], t);
  sinErrores(m);
});

test('bankwithdraw sin texto, use y usespell son informativos y no cuentan como desconocidos', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'bankwithdraw', is: [5457] }), 'info');
  assert.equal(resultado(m, { t: 'use', is: [6948] }), 'info');
  assert.equal(resultado(m, { t: 'usespell', spells: [8690] }), 'info');
  assert.equal(m.lua('next(SnetForever.Elementos.desconocidos) == nil'), true);
  sinErrores(m);
});

test('sinCasilla da info en los elementos de este archivo', () => {
  const m = conJugador({ nivel: 6 });
  assert.equal(resultado(m, { t: 'xp', nivel: 5, efecto: 'objetivo', sinCasilla: true }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Regla común de las condiciones (probada con xp)
// ---------------------------------------------------------------------------------------------------

test('xp objetivo: a nivel 4 pendiente, a nivel 5 hecho, a nivel 6 hecho', () => {
  const el = { t: 'xp', nivel: 5, efecto: 'objetivo' };
  const m = conJugador({ nivel: 4 });
  assert.equal(resultado(m, el), 'pendiente');
  m.jugador({ nivel: 5 });
  assert.equal(resultado(m, el), 'hecho');
  m.jugador({ nivel: 6 });
  assert.equal(resultado(m, el), 'hecho');
  sinErrores(m);
});

test('xp con invertir: se niega la condición antes de aplicar el efecto', () => {
  const el = { t: 'xp', nivel: 5, efecto: 'objetivo', invertir: true };
  const m = conJugador({ nivel: 4 });
  assert.equal(resultado(m, el), 'hecho', 'aún no llegaste: con < se completa');
  m.jugador({ nivel: 5 });
  assert.equal(resultado(m, el), 'pendiente');
  sinErrores(m);
});

test('xp con xp: a su nivel hace falta esa xp; a un nivel más alto basta', () => {
  const el = { t: 'xp', nivel: 5, xp: 5890, efecto: 'objetivo' };
  const m = conJugador({ nivel: 5, xp: 6000, xpMax: 9000 });
  assert.equal(resultado(m, el), 'hecho');
  m.jugador({ xp: 5890 });
  assert.equal(resultado(m, el), 'hecho', 'justo la xp pedida');
  m.jugador({ xp: 5889 });
  assert.equal(resultado(m, el), 'pendiente');
  m.jugador({ nivel: 4, xp: 8999 });
  assert.equal(resultado(m, el), 'pendiente', 'nivel inferior, aunque lleve mucha xp');
  m.jugador({ nivel: 6, xp: 0 });
  assert.equal(resultado(m, el), 'hecho');
  sinErrores(m);
});

test('xp con fraccion: la fracción de UnitXPMax', () => {
  const el = { t: 'xp', nivel: 5, fraccion: 0.5, efecto: 'objetivo' };
  const m = conJugador({ nivel: 5, xp: 500, xpMax: 1000 });
  assert.equal(resultado(m, el), 'hecho');
  m.jugador({ xp: 499 });
  assert.equal(resultado(m, el), 'pendiente');
  sinErrores(m);
});

test('xp con faltan: nivel >= N, o nivel N-1 con xp >= máx - faltan', () => {
  const el = { t: 'xp', nivel: 5, faltan: 40, efecto: 'objetivo' };
  const m = conJugador({ nivel: 4, xp: 970, xpMax: 1000 });
  assert.equal(resultado(m, el), 'hecho');
  m.jugador({ xp: 959 });
  assert.equal(resultado(m, el), 'pendiente');
  m.jugador({ nivel: 3, xp: 999 });
  assert.equal(resultado(m, el), 'pendiente', 'dos niveles por debajo');
  m.jugador({ nivel: 5, xp: 0 });
  assert.equal(resultado(m, el), 'hecho');
  sinErrores(m);
});

test('xp saltar_si_alcanzado: saltar_paso (o ir_a con etiqueta) si llegaste; si no, info', () => {
  const m = conJugador({ nivel: 6 });
  assert.deepEqual(evaluar(m, { t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado', etiqueta: 'fin' }), ['ir_a', 'fin']);
  assert.deepEqual(evaluar(m, { t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado' }), ['saltar_paso']);
  m.jugador({ nivel: 4 });
  assert.deepEqual(evaluar(m, { t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado', etiqueta: 'fin' }), ['info']);
  sinErrores(m);
});

test('xp saltar_si_no_alcanzado: saltar_paso si aún no llegaste; si no, info', () => {
  const el = { t: 'xp', nivel: 5, efecto: 'saltar_si_no_alcanzado' };
  const m = conJugador({ nivel: 4 });
  assert.equal(resultado(m, el), 'saltar_paso');
  m.jugador({ nivel: 5 });
  assert.equal(resultado(m, el), 'info');
  sinErrores(m);
});

test('xp con segunAjuste: solo se evalúa con «saltar pasos por nivel» activado (por defecto lo está)', () => {
  const el = { t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado', segunAjuste: true };
  const m = conJugador({ nivel: 7 });
  assert.equal(resultado(m, el), 'saltar_paso', 'sin ajuste guardado vale activado');
  ajusteSaltarPorNivel(m, false);
  assert.equal(resultado(m, el), 'info', 'ajuste apagado: informativo');
  // Sin segunAjuste (la condición invertida con <) se evalúa siempre.
  assert.equal(resultado(m, { t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado' }), 'saltar_paso');
  ajusteSaltarPorNivel(m, true);
  assert.equal(resultado(m, el), 'saltar_paso');
  sinErrores(m);
});

test('xp con PLAYER_LEVEL_UP: manda el nivel del evento (UnitLevel va por detrás) y la xp se da por 0', () => {
  const m = conJugador({ nivel: 4, xp: 990, xpMax: 1000 });
  assert.equal(resultado(m, { t: 'xp', nivel: 5, efecto: 'objetivo' }, {}, ['PLAYER_LEVEL_UP', 5]), 'hecho');
  // La xp que aún da UnitXP es la del nivel anterior: no vale para pedir xp en el nivel nuevo.
  assert.equal(resultado(m, { t: 'xp', nivel: 5, xp: 100, efecto: 'objetivo' }, {}, ['PLAYER_LEVEL_UP', 5]), 'pendiente');
  assert.equal(resultado(m, { t: 'xp', nivel: 5, xp: 100, efecto: 'objetivo' }, {}, ['PLAYER_XP_UPDATE']), 'pendiente', 'nivel 4');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// maxlevel
// ---------------------------------------------------------------------------------------------------

test('maxlevel: saltar_paso (o ir_a) si nivel > N; si no, info', () => {
  const m = conJugador({ nivel: 13 });
  assert.deepEqual(evaluar(m, { t: 'maxlevel', nivel: 12 }), ['saltar_paso']);
  assert.deepEqual(evaluar(m, { t: 'maxlevel', nivel: 12, etiqueta: 'fin' }), ['ir_a', 'fin']);
  m.jugador({ nivel: 12 });
  assert.deepEqual(evaluar(m, { t: 'maxlevel', nivel: 12 }), ['info']);
  assert.deepEqual(evaluar(m, { t: 'maxlevel', nivel: 12, etiqueta: 'fin' }), ['info']);
  sinErrores(m);
});

test('maxlevel respeta el ajuste «saltar pasos por nivel» (plano 2: enableXpStepSkipping)', () => {
  const m = conJugador({ nivel: 13 });
  ajusteSaltarPorNivel(m, false);
  assert.equal(resultado(m, { t: 'maxlevel', nivel: 12 }), 'info');
  sinErrores(m);
});

test('maxlevel con PLAYER_LEVEL_UP usa el nivel del evento', () => {
  const m = conJugador({ nivel: 12 });
  assert.equal(resultado(m, { t: 'maxlevel', nivel: 12 }, {}, ['PLAYER_LEVEL_UP', 13]), 'saltar_paso');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------------------------------

test('money saltar_si_no_alcanzado: con 50 de 100, saltar_paso; con 150, info', () => {
  const el = { t: 'money', cobre: 100, efecto: 'saltar_si_no_alcanzado' };
  const m = conJugador({ dinero: 50 });
  assert.equal(resultado(m, el), 'saltar_paso');
  m.jugador({ dinero: 150 });
  assert.equal(resultado(m, el), 'info');
  m.jugador({ dinero: 100 });
  assert.equal(resultado(m, el), 'info', 'justo lo pedido cuenta como alcanzado');
  sinErrores(m);
});

test('money saltar_si_alcanzado y objetivo; total se ignora (solo el dinero de la bolsa)', () => {
  const m = conJugador({ dinero: 150 });
  assert.equal(resultado(m, { t: 'money', cobre: 100, efecto: 'saltar_si_alcanzado' }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'money', cobre: 200, efecto: 'saltar_si_alcanzado' }), 'info');
  assert.equal(resultado(m, { t: 'money', cobre: 100, efecto: 'objetivo' }), 'hecho');
  assert.equal(resultado(m, { t: 'money', cobre: 200, efecto: 'objetivo' }), 'pendiente');
  assert.equal(resultado(m, { t: 'money', cobre: 200, efecto: 'saltar_si_no_alcanzado', total: true }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'money', cobre: 100, efecto: 'saltar_si_no_alcanzado', total: true }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// collect
// ---------------------------------------------------------------------------------------------------

test('collect: hecho si la cuenta llega a n; pendiente si no; con banco pasa C_Item.GetItemCount(id, true)', () => {
  const m = nuevaMaquina();
  m.objeto(159, 10);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10 }), 'hecho');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 11 }), 'pendiente');
  assert.deepEqual(m.llamadas('C_Item.GetItemCount').at(-1), [159, false], 'sin banco: no cuenta el banco');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, banco: true }), 'hecho');
  assert.deepEqual(m.llamadas('C_Item.GetItemCount').at(-1), [159, true]);
  sinErrores(m);
});

test('collect cuenta el banco solo con banco; con is suma todos los objetos', () => {
  const m = nuevaMaquina();
  m.objeto(159, 4, { banco: 6 });
  m.objeto(160, 3);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10 }), 'pendiente');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, banco: true }), 'hecho');
  assert.equal(resultado(m, { t: 'collect', i: 159, is: [159, 160], n: 7 }), 'hecho', '4 + 3');
  assert.equal(resultado(m, { t: 'collect', i: 159, is: [159, 160], n: 8 }), 'pendiente');
  sinErrores(m);
});

test('collect con cuenta 0 y n 0 se da por hecho', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 0 }), 'hecho');
  sinErrores(m);
});

test('collect cuenta el objeto equipado cuando C_Item.GetItemCount da 0', () => {
  const m = nuevaMaquina();
  m.objeto(2224, 0, { equipadoEn: 16 });
  m.lua('rawset(C_Item, "GetItemCount", function(id, banco) BANCO.anotar("C_Item.GetItemCount", id, banco); return 0 end)');
  assert.equal(resultado(m, { t: 'collect', i: 2224, n: 1 }), 'hecho');
  assert.equal(resultado(m, { t: 'collect', i: 2225, n: 1 }), 'pendiente');
  sinErrores(m);
});

test('collect con q y sin mascara: hecho en cuanto la misión está en el diario', () => {
  const m = nuevaMaquina();
  m.estadoMision(100, { enDiario: true });
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 5, q: 100 }), 'hecho');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 5, q: 100, mascara: 0 }), 'hecho');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 5, q: 101 }), 'pendiente', 'otra misión');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 5, q: 100, mascara: 1 }), 'pendiente', 'con máscara no vale solo estar en la misión');
  sinErrores(m);
});

test('collect con q: hecho si la misión está completa o entregada, salvo noAlEntregar', () => {
  const m = nuevaMaquina();
  m.estadoMision(100, { enDiario: true, completa: true });
  m.estadoMision(101, { entregada: true });
  m.estadoMision(102, { enDiario: true });
  const el = (q, extra = {}) => ({ t: 'collect', i: 159, n: 5, q, mascara: 1, ...extra });
  assert.equal(resultado(m, el(100)), 'hecho', 'completa');
  assert.equal(resultado(m, el(101)), 'hecho', 'entregada');
  assert.equal(resultado(m, el(102)), 'pendiente', 'en curso con máscara');
  assert.equal(resultado(m, el(100, { noAlEntregar: true })), 'pendiente');
  assert.equal(resultado(m, el(101, { noAlEntregar: true })), 'pendiente');
  m.objeto(159, 5);
  assert.equal(resultado(m, el(101, { noAlEntregar: true })), 'hecho', 'con los objetos sí');
  sinErrores(m);
});

test('collect con restar: a lo pedido se le resta lo hecho en los objetivos de la máscara por el multiplicador', () => {
  const m = nuevaMaquina();
  m.estadoMision(100, {
    enDiario: true,
    objetivos: [
      { texto: 'Pieles: 3/10', hecho: 3, pedido: 10, terminado: false },
      { texto: 'Colmillos: 2/5', hecho: 2, pedido: 5, terminado: false },
    ],
  });
  m.objeto(159, 4);
  // Pide 10, resta 3 (objetivo 1): quedan 7.
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, restar: true }), 'pendiente');
  m.objeto(159, 7);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, restar: true }), 'hecho');
  // Máscara 3 = objetivos 1 y 2: 10 - (3 + 2) = 5.
  m.objeto(159, 5);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 3, restar: true }), 'hecho');
  // Con multiplicador 2: 10 - 3*2 = 4.
  m.objeto(159, 4);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, restar: true, multiplicador: 2 }), 'hecho');
  m.objeto(159, 3);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, restar: true, multiplicador: 2 }), 'pendiente');
  // Lo pedido no baja de 0.
  m.objeto(159, 0);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 4, q: 100, mascara: 3, restar: true, multiplicador: 5 }), 'hecho');
  sinErrores(m);
});

test('collect con porObjetivos: hecho cuando todos los objetivos de la máscara están terminados', () => {
  const m = nuevaMaquina();
  m.estadoMision(100, {
    enDiario: true,
    objetivos: [
      { texto: 'A: 5/5', hecho: 5, pedido: 5, terminado: true },
      { texto: 'B: 1/5', hecho: 1, pedido: 5, terminado: false },
    ],
  });
  const el = (mascara) => ({ t: 'collect', i: 159, n: 99, q: 100, mascara, porObjetivos: true });
  assert.equal(resultado(m, el(1)), 'hecho');
  assert.equal(resultado(m, el(3)), 'pendiente');
  assert.equal(resultado(m, el(2)), 'pendiente');
  sinErrores(m);
});

test('collect con siNinguno: si no llevas ninguno (ni en el banco, salvo ignorarBanco) lo pedido pasa a 0', () => {
  const m = nuevaMaquina();
  const el = { t: 'collect', i: 159, n: 5, siNinguno: true };
  assert.equal(resultado(m, el), 'hecho', 'ninguno: pedido 0');
  m.objeto(159, 0, { banco: 2 });
  assert.equal(resultado(m, el), 'pendiente', 'hay en el banco');
  assert.equal(resultado(m, { ...el, ignorarBanco: true }), 'hecho');
  m.objeto(159, 1, { banco: 2 });
  assert.equal(resultado(m, { ...el, ignorarBanco: true }), 'pendiente', 'llevas uno: se pide todo');
  sinErrores(m);
});

test('collect con profesion: lo pedido baja con el nivel de la profesión (SNF.Profesiones.nivel); minimo es el suelo', () => {
  const m = nuevaMaquina();
  // La tarea 8 pone SNF.Profesiones; aquí se imita.
  m.lua('SnetForever.Profesiones = {nivel = function(p) return ({cooking = 7, fishing = -1})[p] end}');
  m.objeto(159, 3);
  // 10 - (7 - 0) * 1 = 3.
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'cooking' }), 'hecho');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 11, q: 100, mascara: 1, profesion: 'cooking' }), 'pendiente');
  // Con inicio 5 y multiplicador 2: 10 - (7 - 5) * 2 = 6.
  m.objeto(159, 6);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'cooking', profesionInicio: 5, multiplicador: 2 }), 'hecho');
  m.objeto(159, 5);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'cooking', profesionInicio: 5, multiplicador: 2 }), 'pendiente');
  // El mínimo pedido es el suelo.
  m.objeto(159, 2);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'cooking', multiplicador: 5, minimo: 3 }), 'pendiente');
  m.objeto(159, 3);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'cooking', multiplicador: 5, minimo: 3 }), 'hecho');
  // Sin la profesión (-1) o sin dato, no se reduce nada.
  m.objeto(159, 9);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'fishing' }), 'pendiente');
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'riding' }), 'pendiente');
  sinErrores(m);
});

test('collect con profesion y sin SNF.Profesiones (aún sin cargar): no se reduce nada y no hay error', () => {
  const m = nuevaMaquina();
  m.objeto(159, 9);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'cooking' }), 'pendiente');
  sinErrores(m);
});

test('collect con profesion item: se resta por cada objeto de partida (profesionInicio es un ID de objeto)', () => {
  const m = nuevaMaquina();
  m.objeto(2000, 3);
  m.objeto(159, 4);
  // 10 - 3 * 2 = 4.
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'item', profesionInicio: 2000, multiplicador: 2 }), 'hecho');
  m.objeto(159, 3);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, q: 100, mascara: 1, profesion: 'item', profesionInicio: 2000, multiplicador: 2 }), 'pendiente');
  sinErrores(m);
});

test('collect con sinCasilla da info', () => {
  const m = nuevaMaquina();
  m.objeto(159, 10);
  assert.equal(resultado(m, { t: 'collect', i: 159, n: 10, sinCasilla: true }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// itemcount, destroy, bankdeposit
// ---------------------------------------------------------------------------------------------------

test('itemcount < : con 1 de 5457 y n 1, saltar_paso; con 0, info', () => {
  const el = { t: 'itemcount', is: [5457], op: '<', n: 1, efecto: 'saltar_si_no_alcanzado' };
  const m = nuevaMaquina();
  m.objeto(5457, 1);
  assert.equal(resultado(m, el), 'saltar_paso');
  m.objeto(5457, 0);
  assert.equal(resultado(m, el), 'info');
  sinErrores(m);
});

test('itemcount: los cinco operadores, con los dos lados', () => {
  const m = nuevaMaquina();
  m.objeto(6889, 3);
  const r = (op, n) => resultado(m, { t: 'itemcount', is: [6889], op, n, efecto: 'saltar_si_no_alcanzado' });
  assert.equal(r('>=', 3), 'info');
  assert.equal(r('>=', 4), 'saltar_paso');
  assert.equal(r('>', 2), 'info');
  assert.equal(r('>', 3), 'saltar_paso');
  assert.equal(r('<=', 3), 'info');
  assert.equal(r('<=', 2), 'saltar_paso');
  assert.equal(r('==', 3), 'info');
  assert.equal(r('==', 2), 'saltar_paso');
  assert.equal(r('<', 4), 'info');
  assert.equal(r('<', 3), 'saltar_paso');
  sinErrores(m);
});

test('itemcount suma todos los objetos de is, cuenta el banco solo con banco y respeta el efecto', () => {
  const m = nuevaMaquina();
  m.objeto(1, 2, { banco: 3 });
  m.objeto(2, 1);
  const el = (extra) => ({ t: 'itemcount', is: [1, 2], op: '>=', n: 3, efecto: 'saltar_si_no_alcanzado', ...extra });
  assert.equal(resultado(m, el()), 'info', '2 + 1');
  assert.equal(resultado(m, el({ n: 4 })), 'saltar_paso');
  assert.equal(resultado(m, el({ n: 6, banco: true })), 'info', '(2 + 3) + 1');
  assert.deepEqual(m.llamadas('C_Item.GetItemCount').at(-1), [2, true]);
  assert.equal(resultado(m, el({ efecto: 'saltar_si_alcanzado' })), 'saltar_paso');
  assert.equal(resultado(m, el({ efecto: 'objetivo' })), 'hecho');
  assert.equal(resultado(m, el({ efecto: 'objetivo', n: 9 })), 'pendiente');
  sinErrores(m);
});

test('destroy: hecho si la cuenta es 0; pendiente si no', () => {
  const m = nuevaMaquina();
  m.objeto(5000, 2);
  assert.equal(resultado(m, { t: 'destroy', i: 5000 }), 'pendiente');
  m.objeto(5000, 0);
  assert.equal(resultado(m, { t: 'destroy', i: 5000 }), 'hecho');
  assert.equal(resultado(m, { t: 'destroy', i: 5001 }), 'hecho', 'un objeto que no tienes');
  sinErrores(m);
});

test('bankdeposit: hecho si ninguno está en las bolsas (el banco no cuenta)', () => {
  const m = nuevaMaquina();
  m.objeto(1, 0, { banco: 4 });
  m.objeto(2, 1);
  assert.equal(resultado(m, { t: 'bankdeposit', is: [1] }), 'hecho');
  assert.equal(resultado(m, { t: 'bankdeposit', is: [1, 2] }), 'pendiente');
  assert.equal(resultado(m, { t: 'bankdeposit', is: [2] }), 'pendiente');
  sinErrores(m);
});

// Lote A (52-I2): con texto el elemento queda hecho cuando lo que pide sacar ya está en las bolsas (lo pidió el brief) o,
// ronda 1, cuando el jugador abre el banco y lo cierra; sin texto, informativo (plano 2 §7). No mueve nada del banco.
test('bankwithdraw con texto: hecho cuando todos sus objetos están en las bolsas; los del banco no cuentan', () => {
  const m = nuevaMaquina();
  const RETIRA = { en: 'Withdraw the following items from your bank:', es: 'Retira los siguientes artículos de tu banco:' };
  m.objeto(1, 0, { banco: 4 });
  m.objeto(2, 1);
  assert.equal(resultado(m, { t: 'bankwithdraw', is: [1, 2], texto: RETIRA }), 'pendiente', 'el 1 sigue en el banco');
  assert.equal(resultado(m, { t: 'bankwithdraw', is: [2], texto: RETIRA }), 'hecho');
  m.objeto(1, 4, { banco: 0 });
  assert.equal(resultado(m, { t: 'bankwithdraw', is: [1, 2], texto: RETIRA }), 'hecho', 'sacados los dos');
  assert.equal(resultado(m, { t: 'bankwithdraw', is: [1, 2], texto: RETIRA, sinCasilla: true }), 'info');
  sinErrores(m);
});

test('bankwithdraw con texto (ronda 1): abrir el banco y cerrarlo lo da por hecho aunque falte un objeto', () => {
  const m = nuevaMaquina();
  const el = { t: 'bankwithdraw', is: [1, 2], texto: { en: 'Withdraw:', es: 'Retira:' } };
  m.objeto(2, 1);
  const r = (evento) => m.lua(`(function()
    MEM_BW = rawget(_G, "MEM_BW") or {}
    return (SnetForever.Elementos.evaluar(${aLua(el)}, MEM_BW${evento ? `, ${aLua(evento)}` : ''}))
  end)()`);
  assert.equal(r(), 'pendiente', 'el 1 no está en las bolsas');
  assert.equal(r('BANKFRAME_CLOSED'), 'pendiente', 'cerrar sin haberlo visto abrirse no cuenta');
  assert.equal(r('BANKFRAME_OPENED'), 'pendiente', 'con el banco abierto, aún no');
  assert.equal(r('BAG_UPDATE_DELAYED'), 'pendiente');
  assert.equal(r('BANKFRAME_CLOSED'), 'hecho', 'abierto y cerrado: hecho');
  assert.equal(r(), 'hecho', 'y se queda hecho en los repasos');
  sinErrores(m);
});

test('bankwithdraw con texto: un paso que solo lo trae espera a que llegue a las bolsas (BAG_UPDATE_DELAYED)', () => {
  const m = nuevaMaquina();
  m.ponerGuia({
    clave: 'Prueba\\01-60 Banco', grupo: 'Prueba', nombre: '01-60 Banco', titulo: { en: 'Bank', es: 'Banco' },
    niveles: [1, 60], siguientes: [], tipo: 'normal', fuente: { archivo: 'test', linea: 1 }, mazmorras: {},
    pasos: [
      { id: 'b1', n: 1, etiquetas: {}, requisitos: [], linea: 1, elementos: [
        { t: 'goto', mapa: 1411, x: 50, y: 50, modo: 'flecha', linea: 2 },
        { t: 'nota', texto: { en: 'Talk to Newton', es: 'Habla con Newton' }, linea: 3 },
        { t: 'bankwithdraw', is: [5457], texto: { en: 'Withdraw:', es: 'Retira:' }, linea: 4 },
      ] },
      { id: 'b2', n: 2, etiquetas: {}, requisitos: [], linea: 5, elementos: [{ t: 'manual', texto: { en: 'x', es: 'x' }, linea: 6 }] },
    ],
  });
  m.lua('SnetForever.Guias.cargar("Prueba\\\\01-60 Banco")');
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1, 'no se da por hecho al activarse');
  m.objeto(5457, 1);
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2, 'con el objeto en las bolsas, avanza');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// equip
// ---------------------------------------------------------------------------------------------------

test('equip: hay algo en el hueco (y es i, si se da); los efectos y invertir', () => {
  const m = nuevaMaquina();
  const obj = (extra = {}) => ({ t: 'equip', hueco: 16, efecto: 'objetivo', ...extra });
  assert.equal(resultado(m, obj()), 'pendiente', 'hueco vacío');
  m.objeto(2224, 0, { equipadoEn: 16 });
  assert.equal(resultado(m, obj()), 'hecho');
  assert.equal(resultado(m, obj({ i: 2224 })), 'hecho');
  assert.equal(resultado(m, obj({ i: 9999 })), 'pendiente', 'hay otra cosa');
  assert.equal(resultado(m, obj({ hueco: 17 })), 'pendiente', 'otro hueco');
  assert.equal(resultado(m, obj({ invertir: true })), 'pendiente');
  assert.equal(resultado(m, obj({ hueco: 17, invertir: true })), 'hecho');
  assert.equal(resultado(m, obj({ efecto: 'saltar_si_alcanzado' })), 'saltar_paso');
  assert.equal(resultado(m, obj({ efecto: 'saltar_si_alcanzado', hueco: 17 })), 'info');
  assert.equal(resultado(m, obj({ efecto: 'saltar_si_no_alcanzado', hueco: 17 })), 'saltar_paso');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// zone, zoneskip
// ---------------------------------------------------------------------------------------------------

test('zone: saltar_paso estando en el mapa; pendiente en otro o sin mapa', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'zone', mapa: 1411 }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'zone', mapa: 1453 }), 'pendiente');
  m.jugador({ enInstancia: true });
  assert.equal(resultado(m, { t: 'zone', mapa: 1411 }), 'pendiente', 'dentro de una mazmorra no hay mapa');
  sinErrores(m);
});

test('zoneskip: saltar_paso si el mapa actual está en mapas; invertir lo niega; sin mapa no hace nada', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'zoneskip', mapas: [1411] }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'zoneskip', mapas: [1453, 1411] }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'zoneskip', mapas: [1453] }), 'info');
  assert.equal(resultado(m, { t: 'zoneskip', mapas: [1453], invertir: true }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'zoneskip', mapas: [1411], invertir: true }), 'info');
  m.jugador({ enInstancia: true });
  assert.equal(resultado(m, { t: 'zoneskip', mapas: [1411] }), 'info');
  assert.equal(resultado(m, { t: 'zoneskip', mapas: [1411], invertir: true }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// subzone, subzoneskip, bindlocation
// ---------------------------------------------------------------------------------------------------

const AREA = 362;
const conArea = (cambios = {}) => {
  const m = nuevaMaquina();
  m.nombreJuego('zona', AREA, 'Valle de los Retos');
  m.nombreJuego('zona', 363, 'Durotar');
  m.jugador({ zona: 'Durotar', subzona: 'Valle de los Retos', vinculo: 'Orgrimmar', ...cambios });
  return m;
};

test('subzone: hecho si GetZoneText o GetSubZoneText es el nombre del área; invertir lo niega', () => {
  const m = conArea();
  assert.equal(resultado(m, { t: 'subzone', area: AREA }), 'hecho', 'subzona');
  assert.equal(resultado(m, { t: 'subzone', area: 363 }), 'hecho', 'zona');
  m.jugador({ zona: 'Orgrimmar', subzona: 'Valle de la Fuerza' });
  assert.equal(resultado(m, { t: 'subzone', area: AREA }), 'pendiente');
  assert.equal(resultado(m, { t: 'subzone', area: AREA, invertir: true }), 'hecho', 'se completa al salir');
  m.jugador({ zona: 'Durotar', subzona: 'Valle de los Retos' });
  assert.equal(resultado(m, { t: 'subzone', area: AREA, invertir: true }), 'pendiente');
  sinErrores(m);
});

test('subzone con soloInstancia: solo vale si no hay mapa (dentro de una mazmorra)', () => {
  const m = conArea();
  assert.equal(resultado(m, { t: 'subzone', area: AREA, soloInstancia: true }), 'pendiente', 'hay mapa');
  m.jugador({ enInstancia: true });
  assert.equal(resultado(m, { t: 'subzone', area: AREA, soloInstancia: true }), 'hecho');
  assert.equal(resultado(m, { t: 'subzone', area: AREA, soloInstancia: true, invertir: true }), 'pendiente');
  sinErrores(m);
});

// Lote A, ronda 1: sin poder comparar, el objetivo (subzone) queda pendiente, con su casilla; las condiciones informan.
test('subzone y subzoneskip con un área cuyo nombre el cliente aún no da: subzone pendiente, las condiciones info', () => {
  const m = conArea();
  assert.equal(resultado(m, { t: 'subzone', area: 99999 }), 'pendiente');
  assert.equal(resultado(m, { t: 'subzone', area: 99999, invertir: true }), 'pendiente');
  assert.equal(resultado(m, { t: 'subzoneskip', area: 99999 }), 'info');
  assert.equal(resultado(m, { t: 'bindlocation', area: 99999 }), 'info');
  sinErrores(m);
});

test('subzoneskip: saltar_paso si estás en esa zona o subzona; invertir y soloInstancia', () => {
  const m = conArea();
  assert.equal(resultado(m, { t: 'subzoneskip', area: AREA }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'subzoneskip', area: 363 }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'subzoneskip', area: AREA, invertir: true }), 'info');
  assert.equal(resultado(m, { t: 'subzoneskip', area: AREA, soloInstancia: true }), 'info', 'hay mapa');
  m.jugador({ zona: 'Orgrimmar', subzona: 'Valle de la Fuerza' });
  assert.equal(resultado(m, { t: 'subzoneskip', area: AREA }), 'info');
  assert.equal(resultado(m, { t: 'subzoneskip', area: AREA, invertir: true }), 'saltar_paso');
  sinErrores(m);
});

test('bindlocation: saltar_paso si la piedra está vinculada en el área; invertir lo niega', () => {
  const m = conArea({ vinculo: 'Valle de los Retos' });
  assert.equal(resultado(m, { t: 'bindlocation', area: AREA }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'bindlocation', area: AREA, invertir: true }), 'info');
  assert.equal(resultado(m, { t: 'bindlocation', area: 363 }), 'info', 'vinculada en otro sitio');
  assert.equal(resultado(m, { t: 'bindlocation', area: 363, invertir: true }), 'saltar_paso');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// showwhiledead, bronzetube
// ---------------------------------------------------------------------------------------------------

test('showwhiledead: saltar_paso si estás vivo; info si estás muerto o fantasma', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'showwhiledead' }), 'saltar_paso');
  m.jugador({ muerto: true });
  assert.equal(resultado(m, { t: 'showwhiledead' }), 'info');
  m.jugador({ muerto: false, fantasma: true });
  assert.equal(resultado(m, { t: 'showwhiledead' }), 'info');
  m.jugador({ fantasma: false });
  assert.equal(resultado(m, { t: 'showwhiledead' }), 'saltar_paso');
  sinErrores(m);
});

test('bronzetube: saltar_paso si tienes los tubos que hacen falta (1 sin la 174 entregada, 0 con ella); invertir lo niega', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'bronzetube' }), 'info', 'sin tubo y sin la 174');
  assert.equal(resultado(m, { t: 'bronzetube', invertir: true }), 'saltar_paso');
  m.objeto(4371, 1);
  assert.equal(resultado(m, { t: 'bronzetube' }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'bronzetube', invertir: true }), 'info');
  m.objeto(4371, 0);
  m.estadoMision(174, { entregada: true });
  assert.equal(resultado(m, { t: 'bronzetube' }), 'saltar_paso', 'entregada la 174 no hace falta ninguno');
  assert.equal(resultado(m, { t: 'bronzetube', invertir: true }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// APIs del banco
// ---------------------------------------------------------------------------------------------------

test('banco: las APIs de jugador, dinero, objetos y lugar', () => {
  const m = nuevaMaquina();
  m.jugador({ nivel: 7, xp: 120, xpMax: 900, dinero: 4321, zona: 'Durotar', subzona: 'Aldea Sen’jin', vinculo: 'Razor Hill' });
  assert.deepEqual(m.lua('{UnitXP("player"), UnitXPMax("player"), GetMoney()}'), [120, 900, 4321]);
  assert.deepEqual(m.lua('{GetZoneText(), GetRealZoneText(), GetSubZoneText(), GetBindLocation()}'), ['Durotar', 'Durotar', 'Aldea Sen’jin', 'Razor Hill']);
  assert.equal(m.lua('C_Map.GetBestMapForUnit("player")'), 1411);
  assert.deepEqual(m.lua('{IsInInstance()}'), [false, 'none']);
  m.jugador({ enInstancia: true, muerto: true });
  assert.equal(m.lua('C_Map.GetBestMapForUnit("player")'), undefined);
  assert.deepEqual(m.lua('{IsInInstance()}'), [true, 'party']);
  assert.deepEqual(m.lua('{UnitIsDeadOrGhost("player"), UnitIsGhost("player")}'), [true, false]);
  m.jugador({ muerto: false, fantasma: true });
  assert.deepEqual(m.lua('{UnitIsDeadOrGhost("player"), UnitIsGhost("player")}'), [true, true]);
  m.jugador({ fantasma: false });
  assert.equal(m.lua('UnitIsDeadOrGhost("player")'), false);
  // Objetos: bolsas, banco solo si se pide, y lo equipado cuenta siempre.
  m.objeto(159, 3, { banco: 2 });
  m.objeto(2224, 0, { equipadoEn: 16 });
  assert.deepEqual(m.lua('{GetItemCount(159), GetItemCount(159, false), GetItemCount(159, true), GetItemCount(777)}'), [3, 3, 5, 0]);
  assert.equal(m.lua('GetItemCount(2224)'), 1);
  assert.deepEqual(m.lua('{GetInventoryItemID("player", 16), GetInventoryItemID("player", 17)}'), [2224]);
  sinErrores(m);
});

test('banco: una unidad que no es player da el error «no imitado»', () => {
  const m = nuevaMaquina();
  assert.throws(() => m.lua('UnitXP("target")'), /no imitado/);
  assert.throws(() => m.lua('GetInventoryItemID("target", 1)'), /no imitado/);
  m.cerrar();
});

// ---------------------------------------------------------------------------------------------------
// Contrato con los datos reales de la fase 1
// ---------------------------------------------------------------------------------------------------

const TIPOS_DEL_MUNDO = ['xp', 'maxlevel', 'money', 'collect', 'itemcount', 'destroy', 'bankdeposit', 'bankwithdraw', 'use',
  'usespell', 'equip', 'zone', 'subzone', 'zoneskip', 'subzoneskip', 'bindlocation', 'showwhiledead', 'bronzetube'];

test('contrato: todos los elementos de nivel, dinero, objetos y lugar de SnetForever_Rutas traen los campos que se leen', () => {
  const m = nuevaMaquina({
    datos: [
      join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'),
      join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc'),
    ],
  });
  const informe = m.lua(`(function()
    local E = SnetForever.Elementos
    local vistos, malos, resultados = {}, {}, {}
    local function numero(v) return type(v) == "number" end
    local function lista(v)
      if type(v) ~= "table" or #v == 0 then return false end
      for i = 1, #v do if not numero(v[i]) then return false end end
      return true
    end
    local function opcional(v, comprobar) return v == nil or comprobar(v) end
    local function cadena(v) return type(v) == "string" end
    local function booleano(v) return type(v) == "boolean" end
    local EFECTOS = {objetivo = 1, saltar_si_alcanzado = 1, saltar_si_no_alcanzado = 1}
    local OPS = {[">="] = 1, ["<"] = 1, [">"] = 1, ["<="] = 1, ["=="] = 1}
    local VALIDOS = {hecho = 1, pendiente = 1, info = 1, saltar_paso = 1, ir_a = 1, ir_guia = 1}
    local function revisar(t, el)
      if t == "xp" then
        return numero(el.nivel) and EFECTOS[el.efecto] and opcional(el.xp, numero) and opcional(el.fraccion, numero)
          and opcional(el.faltan, numero) and opcional(el.segunAjuste, booleano) and opcional(el.invertir, booleano)
          and opcional(el.etiqueta, cadena)
      elseif t == "maxlevel" then
        return numero(el.nivel) and opcional(el.etiqueta, cadena)
      elseif t == "money" then
        return numero(el.cobre) and EFECTOS[el.efecto] and opcional(el.total, booleano)
      elseif t == "collect" then
        return numero(el.i) and numero(el.n) and opcional(el.is, lista) and opcional(el.q, numero) and opcional(el.mascara, numero)
          and opcional(el.profesion, cadena) and opcional(el.multiplicador, numero) and opcional(el.profesionInicio, numero)
          and opcional(el.minimo, numero) and opcional(el.restar, booleano) and opcional(el.porObjetivos, booleano)
          and opcional(el.banco, booleano) and opcional(el.noAlEntregar, booleano) and opcional(el.siNinguno, booleano)
          and opcional(el.ignorarBanco, booleano)
      elseif t == "itemcount" then
        return lista(el.is) and OPS[el.op] and numero(el.n) and EFECTOS[el.efecto] and opcional(el.banco, booleano)
      elseif t == "destroy" then
        return numero(el.i)
      elseif t == "bankdeposit" or t == "bankwithdraw" or t == "use" then
        return lista(el.is)
      elseif t == "usespell" then
        return lista(el.spells)
      elseif t == "equip" then
        return numero(el.hueco) and EFECTOS[el.efecto] and opcional(el.i, numero) and opcional(el.invertir, booleano)
      elseif t == "zone" then
        return numero(el.mapa)
      elseif t == "subzone" or t == "subzoneskip" or t == "bindlocation" then
        return numero(el.area) and opcional(el.invertir, booleano) and opcional(el.soloInstancia, booleano)
      elseif t == "zoneskip" then
        return lista(el.mapas) and opcional(el.invertir, booleano)
      end
      return true
    end
    for _, guia in pairs(SNF_RUTAS.guias) do
      for _, paso in ipairs(guia.pasos) do
        for _, el in ipairs(paso.elementos) do
          local t = el.t
          vistos[t] = (vistos[t] or 0) + 1
          if not revisar(t, el) then malos[#malos + 1] = t .. " línea " .. tostring(el.linea) end
          local r = E.evaluar(el, {})
          resultados[r] = (resultados[r] or 0) + 1
          if not VALIDOS[r] then malos[#malos + 1] = t .. " devolvió " .. tostring(r) end
        end
      end
    end
    return {vistos = vistos, malos = malos, resultados = resultados, desconocidos = E.desconocidos}
  end)()`);
  assert.deepEqual(informe.malos.slice(0, 10), [], 'elementos con campos que faltan o resultados inválidos');
  for (const t of TIPOS_DEL_MUNDO) {
    if (t !== 'bankwithdraw' && t !== 'bronzetube') assert.ok(informe.vistos[t] > 0, `la fase 1 emite ${t}`);
    assert.equal(informe.desconocidos[t], undefined, `${t} no debe contarse como desconocido`);
  }
  sinErrores(m);
});

test('contrato: cada def declara como obligatorios solo campos que todos los elementos reales traen', () => {
  const m = nuevaMaquina({
    datos: [
      join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'),
      join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc'),
    ],
  });
  const mundo = aLua(Object.fromEntries(TIPOS_DEL_MUNDO.map((t) => [t, true])));
  const faltan = m.lua(`(function()
    local E = SnetForever.Elementos
    local mundo = ${mundo}
    local falta = {}
    for _, guia in pairs(SNF_RUTAS.guias) do
      for _, paso in ipairs(guia.pasos) do
        for _, el in ipairs(paso.elementos) do
          local d = E.def(el.t)
          if d and mundo[el.t] then
            for _, campo in ipairs(d.campos) do
              if el[campo] == nil then falta[el.t .. "." .. campo] = (falta[el.t .. "." .. campo] or 0) + 1 end
            end
          end
        end
      end
    end
    return falta
  end)()`);
  assert.deepEqual(faltan, [], 'campos obligatorios que faltan en datos reales');
  sinErrores(m);
});

test('contrato: con un personaje avanzado, los elementos reales también dan resultados válidos y nada queda desconocido', () => {
  const m = nuevaMaquina({
    datos: [
      join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'),
      join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc'),
    ],
  });
  m.jugador({ nivel: 45, xp: 100000, xpMax: 200000, dinero: 10000000, muerto: true });
  m.objeto(4371, 1);
  m.lua('SnetForever.Profesiones = {nivel = function() return 150 end}');
  const informe = m.lua(`(function()
    local E = SnetForever.Elementos
    local resultados, malos = {}, {}
    local VALIDOS = {hecho = 1, pendiente = 1, info = 1, saltar_paso = 1, ir_a = 1, ir_guia = 1}
    for _, guia in pairs(SNF_RUTAS.guias) do
      for _, paso in ipairs(guia.pasos) do
        for _, el in ipairs(paso.elementos) do
          local r, extra = E.evaluar(el, {})
          resultados[r] = (resultados[r] or 0) + 1
          if not VALIDOS[r] then malos[#malos + 1] = el.t .. " " .. tostring(r) end
          if r == "ir_a" and type(extra) ~= "string" then malos[#malos + 1] = el.t .. " ir_a sin etiqueta" end
        end
      end
    end
    return {resultados = resultados, malos = malos, desconocidos = E.desconocidos}
  end)()`);
  assert.deepEqual(informe.malos.slice(0, 10), []);
  assert.ok(informe.resultados.hecho > 0 && informe.resultados.saltar_paso > 0 && informe.resultados.ir_a > 0, JSON.stringify(informe.resultados));
  for (const t of TIPOS_DEL_MUNDO) assert.equal(informe.desconocidos[t], undefined, t);
  sinErrores(m);
});

// T1: un collect sin misión busca en el diario del juego la misión que pide ese objeto (por el nombre que da el juego).
const ESPECIAS = 95013;
const NOMBRE_ESPECIAS = 'Especias de prueba';
const objetivoEspecias = (hecho, terminado) => ({ texto: `${NOMBRE_ESPECIAS}: ${hecho}/1`, hecho, pedido: 1, terminado, tipo: 'item' });
const COLLECT_SIN_Q = { t: 'collect', i: ESPECIAS, n: 1 };

test('collect sin q: con su misión dueña completa en el diario, hecho; a medias, pendiente', () => {
  const m = nuevaMaquina();
  m.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  m.estadoMision(95001, { enDiario: true, completa: true, objetivos: [objetivoEspecias(1, true)] });
  assert.equal(resultado(m, COLLECT_SIN_Q), 'hecho');
  assert.deepEqual(m.lua(`{SnetForever.Misiones.duenaDeObjeto(${ESPECIAS})}`), [95001, 1]);

  const medias = nuevaMaquina();
  medias.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  medias.estadoMision(95001, { enDiario: true, objetivos: [objetivoEspecias(0, false)] });
  assert.equal(resultado(medias, COLLECT_SIN_Q), 'pendiente');
  sinErrores(m);
  sinErrores(medias);
});

test('collect sin q: con el objetivo del objeto terminado basta aunque la misión tenga más por hacer', () => {
  const m = nuevaMaquina();
  m.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  m.estadoMision(95001, {
    enDiario: true,
    objetivos: [{ texto: 'Bicho de prueba: 0/3', hecho: 0, pedido: 3, terminado: false, tipo: 'monster' }, objetivoEspecias(1, true)],
  });
  assert.equal(resultado(m, COLLECT_SIN_Q), 'hecho');
  sinErrores(m);
});

test('collect sin q: sin dueña en el diario, con un objetivo que no es de objeto o sin el nombre del juego, pendiente', () => {
  const m = nuevaMaquina();
  m.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  m.estadoMision(95002, { enDiario: true, completa: true, objetivos: [{ texto: 'Otra cosa: 1/1', hecho: 1, pedido: 1, terminado: true, tipo: 'item' }] });
  assert.equal(resultado(m, COLLECT_SIN_Q), 'pendiente', 'ninguna misión pide ese objeto');

  const noObjeto = nuevaMaquina();
  noObjeto.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  noObjeto.estadoMision(95001, { enDiario: true, completa: true, objetivos: [{ ...objetivoEspecias(1, true), tipo: 'monster' }] });
  assert.equal(resultado(noObjeto, COLLECT_SIN_Q), 'pendiente', 'el objetivo no es de objeto');

  const sinNombre = nuevaMaquina();
  sinNombre.estadoMision(95001, { enDiario: true, completa: true, objetivos: [objetivoEspecias(1, true)] });
  assert.equal(resultado(sinNombre, COLLECT_SIN_Q), 'pendiente', 'el juego aún no tiene el nombre del objeto');
  for (const x of [m, noObjeto, sinNombre]) sinErrores(x);
});

test('collect sin q: la dueña se memoriza hasta el siguiente QUEST_LOG_UPDATE', () => {
  const m = nuevaMaquina();
  m.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  assert.equal(resultado(m, COLLECT_SIN_Q), 'pendiente');
  m.estadoMision(95001, { enDiario: true, completa: true, objetivos: [objetivoEspecias(1, true)] });
  assert.equal(resultado(m, COLLECT_SIN_Q), 'pendiente', 'aún vale lo memorizado');
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(resultado(m, COLLECT_SIN_Q), 'hecho');
  sinErrores(m);
});

// Ronda 1 de T1 (I4): el paso no puede pedir más de lo que piden las dueñas, y todas tienen que estar completas.
test('collect sin q: pide más que la dueña → pendiente; con dos dueñas, las dos completas y la suma alcanza', () => {
  const objetivo = (hecho, pedido, terminado) => ({ texto: `${NOMBRE_ESPECIAS}: ${hecho}/${pedido}`, hecho, pedido, terminado, tipo: 'item' });
  const m = nuevaMaquina();
  m.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  m.estadoMision(95001, { enDiario: true, completa: true, objetivos: [objetivo(1, 1, true)] });
  assert.equal(resultado(m, { t: 'collect', i: ESPECIAS, n: 10 }), 'pendiente', 'la dueña pide 1 y el paso 10');
  m.estadoMision(95003, { enDiario: true, objetivos: [objetivo(0, 9, false)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(resultado(m, { t: 'collect', i: ESPECIAS, n: 1 }), 'pendiente', 'otra dueña aún a medias');
  m.estadoMision(95003, { completa: true, objetivos: [objetivo(9, 9, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(resultado(m, { t: 'collect', i: ESPECIAS, n: 10 }), 'hecho', '1 + 9');
  assert.equal(resultado(m, { t: 'collect', i: ESPECIAS, n: 11 }), 'pendiente');
  sinErrores(m);
});

// Ronda 1 de T1 (M5): los dos puntos de ancho completo también se quitan.
test('collect sin q: el objetivo con «：» también casa con el nombre', () => {
  const m = nuevaMaquina();
  m.nombreJuego('item', ESPECIAS, NOMBRE_ESPECIAS);
  m.estadoMision(95001, { enDiario: true, completa: true, objetivos: [{ texto: `${NOMBRE_ESPECIAS}：1/1`, hecho: 1, pedido: 1, terminado: true, tipo: 'item' }] });
  assert.equal(resultado(m, COLLECT_SIN_Q), 'hecho');
  sinErrores(m);
});
