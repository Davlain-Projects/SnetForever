// Registro de evaluadores de elementos de paso (motor/elementos.lua) y evaluadores de los elementos de misión
// (motor/elementos-misiones.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const Q = 4641;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Evalúa un elemento y devuelve [resultado, extra]. `evento` es [nombre, ...argumentos] o undefined.
function evaluar(m, el, mem = {}, evento = []) {
  const args = evento.map((a) => aLua(a)).join(', ');
  const coma = args ? `, ${args}` : '';
  return m.lua(`(function() local r, x = SnetForever.Elementos.evaluar(${aLua(el)}, ${aLua(mem)}${coma}); return {r, x} end)()`);
}
const resultado = (m, el, mem, evento) => evaluar(m, el, mem, evento)[0];

// Máquina con un conjunto de misiones: {q: estado} (ver estadoMision del banco).
function conMisiones(estados = {}, opciones = {}) {
  const m = nuevaMaquina(opciones);
  for (const [q, estado] of Object.entries(estados)) m.estadoMision(Number(q), estado);
  return m;
}

// ---------------------------------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------------------------------

test('Elementos: un t sin registrar da info y suma en desconocidos; un informativo no suma', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'raroNuevo' }), 'info');
  assert.equal(resultado(m, { t: 'raroNuevo' }), 'info');
  assert.deepEqual(m.lua('SnetForever.Elementos.desconocidos'), { raroNuevo: 2 });
  for (const t of ['nota', 'line', 'link', 'xpto60', 'clicknext', 'use', 'usespell', 'pin', 'waypoint', 'goto', 'loop', 'itemStat']) {
    assert.equal(resultado(m, { t }), 'info', t);
    assert.equal(m.lua(`SnetForever.Elementos.INFORMATIVOS["${t}"]`), true, `INFORMATIVOS.${t}`);
  }
  assert.deepEqual(m.lua('SnetForever.Elementos.desconocidos'), { raroNuevo: 2 });
  sinErrores(m);
});

test('Elementos.registrar: un t registrado gana a la lista de informativos y se evalúa con el evento y sus argumentos', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Elementos.registrar("goto", {
    campos = {"x"}, eventos = {"ZONE_CHANGED"},
    evaluar = function(el, mem, evento, a, b)
      mem.visto = (mem.visto or 0) + 1
      return "ir_a", {el = el.x, evento = evento, a = a, b = b, visto = mem.visto}
    end,
  })`);
  const mem = {};
  assert.deepEqual(evaluar(m, { t: 'goto', x: 7 }, mem, ['ZONE_CHANGED', 1, 2]), ['ir_a', { el: 7, evento: 'ZONE_CHANGED', a: 1, b: 2, visto: 1 }]);
  // Sin evento (activación del paso o repaso periódico): evento es nil.
  const sin = evaluar(m, { t: 'goto', x: 8 });
  assert.equal(sin[0], 'ir_a');
  assert.equal(sin[1].evento, undefined);
  assert.deepEqual(m.lua('SnetForever.Elementos.eventos({t = "goto"})'), ['ZONE_CHANGED']);
  assert.equal(m.lua('SnetForever.Elementos.def("goto").campos[1]'), 'x');
  assert.equal(m.lua('next(SnetForever.Elementos.desconocidos) == nil'), true);
  sinErrores(m);
});

test('Elementos: los resultados ir_guia y el extra pasan tal cual; un elemento con sinCasilla da info', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Elementos.registrar("salto", {
    campos = {}, eventos = {},
    evaluar = function() return "ir_guia", {{clave = "A\\\\01", filtro = {{"c:MAGE"}}}, {clave = "B\\\\02"}} end,
  })`);
  assert.deepEqual(evaluar(m, { t: 'salto' }), ['ir_guia', [{ clave: 'A\\01', filtro: [['c:MAGE']] }, { clave: 'B\\02' }]]);
  assert.deepEqual(evaluar(m, { t: 'salto', sinCasilla: true }), ['info']);
  sinErrores(m);
});

test('Elementos.eventos y def: sin evaluador, lista vacía y nil', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Elementos.eventos({t = "nota"})'), []);
  assert.deepEqual(m.lua('SnetForever.Elementos.eventos({t = "raroNuevo"})'), []);
  assert.equal(m.lua('SnetForever.Elementos.def("raroNuevo")'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Eventos de cada elemento
// ---------------------------------------------------------------------------------------------------

test('eventos: la lista de cada elemento de misión', () => {
  const m = nuevaMaquina();
  const ev = (t) => m.lua(`SnetForever.Elementos.eventos({t = "${t}"})`);
  assert.deepEqual(ev('accept'), ['QUEST_ACCEPTED', 'QUEST_TURNED_IN', 'QUEST_REMOVED']);
  assert.deepEqual(ev('turnin'), ['QUEST_TURNED_IN', 'QUEST_LOG_UPDATE']);
  assert.deepEqual(ev('dailyturnin'), ['QUEST_TURNED_IN', 'QUEST_LOG_UPDATE']);
  assert.deepEqual(ev('complete'), ['QUEST_LOG_UPDATE']);
  assert.deepEqual(ev('abandon'), ['QUEST_LOG_UPDATE']);
  for (const t of ['isOnQuest', 'isNotOnQuest', 'isQuestComplete', 'isQuestNotComplete', 'isQuestTurnedIn', 'isQuestAvailable']) {
    assert.deepEqual(ev(t), ['QUEST_ACCEPTED', 'QUEST_TURNED_IN', 'QUEST_REMOVED', 'QUEST_LOG_UPDATE'], t);
  }
  assert.deepEqual(ev('manual'), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// accept
// ---------------------------------------------------------------------------------------------------

test('accept: hecho si está en el diario o entregada; pendiente si no', () => {
  const m = conMisiones({ 1: { enDiario: true }, 2: { entregada: true }, 3: {} });
  assert.equal(resultado(m, { t: 'accept', q: 1 }), 'hecho');
  assert.equal(resultado(m, { t: 'accept', q: 2 }), 'hecho');
  assert.equal(resultado(m, { t: 'accept', q: 3 }), 'pendiente');
  assert.equal(resultado(m, { t: 'accept', q: 999 }), 'pendiente');
  sinErrores(m);
});

test('accept con previa: si la previa no está entregada se da por hecho (no se puede coger); si lo está, manda la misión', () => {
  const m = conMisiones({ 10: {}, 11: { entregada: true }, 3: {} });
  assert.equal(resultado(m, { t: 'accept', q: 3, previa: 10 }), 'hecho');
  assert.equal(resultado(m, { t: 'accept', q: 3, previa: 11 }), 'pendiente');
  m.estadoMision(3, { enDiario: true });
  assert.equal(resultado(m, { t: 'accept', q: 3, previa: 11 }), 'hecho');
  sinErrores(m);
});

test('accept: hecho y después QUEST_REMOVED de esa misión vuelve a pendiente; la entregada sigue hecha', () => {
  const m = conMisiones({ [Q]: { enDiario: true } });
  assert.equal(resultado(m, { t: 'accept', q: Q }), 'hecho');
  // El evento llega antes de que la API refleje el abandono: manda el evento.
  assert.equal(resultado(m, { t: 'accept', q: Q }, {}, ['QUEST_REMOVED', Q]), 'pendiente');
  assert.equal(resultado(m, { t: 'accept', q: Q }, {}, ['QUEST_REMOVED', 7]), 'hecho', 'otra misión');
  m.estadoMision(Q, { enDiario: false, entregada: true });
  assert.equal(resultado(m, { t: 'accept', q: Q }, {}, ['QUEST_REMOVED', Q]), 'hecho', 'al entregarla también se quita del diario');
  sinErrores(m);
});

test('accept con sinCasilla da info', () => {
  const m = conMisiones({ [Q]: { enDiario: true } });
  assert.equal(resultado(m, { t: 'accept', q: Q, sinCasilla: true }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// turnin
// ---------------------------------------------------------------------------------------------------

test('turnin: hecho si está entregada; con siFalta y sin la misión, hecho; con siFalta y en el diario, pendiente', () => {
  const m = conMisiones({ 1: { entregada: true }, 2: { enDiario: true }, 3: {} });
  assert.equal(resultado(m, { t: 'turnin', q: 1 }), 'hecho');
  assert.equal(resultado(m, { t: 'turnin', q: 2 }), 'pendiente');
  assert.equal(resultado(m, { t: 'turnin', q: 3 }), 'pendiente');
  assert.equal(resultado(m, { t: 'turnin', q: 3, siFalta: true }), 'hecho', 'sin la misión');
  assert.equal(resultado(m, { t: 'turnin', q: 2, siFalta: true }), 'pendiente', 'con la misión en curso');
  sinErrores(m);
});

test('turnin con siIncompleta: además, hecho si la misión no está completa', () => {
  const m = conMisiones({ 1: { enDiario: true, completa: false }, 2: { enDiario: true, completa: true } });
  const el = (q) => ({ t: 'turnin', q, siFalta: true, siIncompleta: true });
  assert.equal(resultado(m, el(1)), 'hecho', 'en el diario pero sin completar');
  assert.equal(resultado(m, el(2)), 'pendiente', 'completa: hay que entregarla');
  assert.equal(resultado(m, el(3)), 'hecho', 'sin la misión');
  assert.equal(resultado(m, { t: 'turnin', q: 1, siFalta: true }), 'pendiente', 'sin siIncompleta no cuenta');
  sinErrores(m);
});

// T2-addon: una entrega de una misión que está en el diario y no está completa sigue pendiente, pero dice que faltan
// objetivos (el extra «faltan», con los índices de los que no están terminados). Misiones y textos inventados.
const A_MEDIAS = [
  { texto: 'Raíz de prueba: 1/3', hecho: 1, pedido: 3, terminado: false },
  { texto: 'Pluma de prueba: 2/2', hecho: 2, pedido: 2, terminado: true },
  { texto: 'Colmillo de prueba: 0/1', hecho: 0, pedido: 1, terminado: false },
];

test('T2: turnin en el diario sin completar → pendiente con «faltan» y los objetivos sin terminar', () => {
  const m = conMisiones({ 97801: { enDiario: true, completa: false, objetivos: A_MEDIAS }, 97802: { enDiario: true } });
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97801 }), ['pendiente', 'faltan:1,3']);
  assert.deepEqual(m.lua('SnetForever.Elementos.faltan({t = "turnin", q = 97801})'), [1, 3]);
  // Sin ningún objetivo sin terminar en el juego (aún no los da, o todos hechos sin marcarla completa): la entrega de
  // siempre, sin nada que enseñar ni a donde ir.
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97802 }), ['pendiente']);
  assert.equal(m.lua('SnetForever.Elementos.faltan({t = "turnin", q = 97802})'), undefined);
  m.estadoMision(97802, { objetivos: A_MEDIAS.map((o) => ({ ...o, terminado: true })) });
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97802 }), ['pendiente']);
  // Con siFalta y la misión en el diario, igual: hay que hacerla.
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97801, siFalta: true }), ['pendiente', 'faltan:1,3']);
  // Sigue siendo puro: el motor puede mirarlo hacia delante.
  assert.equal(m.lua('SnetForever.Elementos.esPuro({t = "turnin", q = 97801})'), true);
  sinErrores(m);
});

test('T2: turnin con la misión completa → pendiente sin «faltan», como antes', () => {
  const m = conMisiones({ 97801: { enDiario: true, completa: true, objetivos: A_MEDIAS.map((o) => ({ ...o, terminado: true })) } });
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97801 }), ['pendiente']);
  assert.equal(m.lua('SnetForever.Elementos.faltan({t = "turnin", q = 97801})'), undefined);
  sinErrores(m);
});

test('T2: turnin sin la misión en el diario, entregada o con siIncompleta → igual que hoy, sin «faltan»', () => {
  const m = conMisiones({ 97803: {}, 97804: { entregada: true }, 97805: { enDiario: true, completa: false, objetivos: A_MEDIAS } });
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97803 }), ['pendiente'], 'no está en el diario');
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97803, siFalta: true }), ['hecho'], 'siFalta y sin la misión');
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97804 }), ['hecho'], 'entregada');
  assert.deepEqual(evaluar(m, { t: 'turnin', q: 97805, siFalta: true, siIncompleta: true }), ['hecho'], 'siIncompleta');
  for (const q of [97803, 97804]) {
    assert.equal(m.lua(`SnetForever.Elementos.faltan({t = "turnin", q = ${q}})`), undefined, String(q));
  }
  assert.equal(m.lua('SnetForever.Elementos.faltan({t = "turnin", q = 97805, siIncompleta = true})'), undefined);
  assert.equal(m.lua('SnetForever.Elementos.faltan({t = "accept", q = 97805})'), undefined, 'solo las entregas');
  sinErrores(m);
});

test('T2: Elementos.entregaAMedias(e) mira el elemento vivo del motor (turnin pendiente con «faltan»)', () => {
  const m = nuevaMaquina();
  const aMedias = (e) => m.lua(`SnetForever.Elementos.entregaAMedias(${aLua(e)})`);
  assert.equal(aMedias({ datos: { t: 'turnin', q: 1 }, resultado: 'pendiente', extra: 'faltan:2' }), true);
  assert.equal(aMedias({ datos: { t: 'turnin', q: 1 }, resultado: 'pendiente', extra: 'faltan' }), true);
  assert.equal(aMedias({ datos: { t: 'turnin', q: 1 }, resultado: 'pendiente' }), false);
  assert.equal(aMedias({ datos: { t: 'turnin', q: 1 }, resultado: 'hecho', extra: 'faltan' }), false, 'dado por hecho');
  assert.equal(aMedias({ datos: { t: 'complete', q: 1 }, resultado: 'pendiente', extra: 'faltan' }), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------------------------------

const OBJETIVOS = [
  { texto: 'Jabalí abatido: 5/10', hecho: 5, pedido: 10, terminado: false },
  { texto: 'Cuero de jabalí: 5/5', hecho: 5, pedido: 5, terminado: true },
];

test('complete: hecho si el objetivo está terminado; pendiente si no', () => {
  const m = conMisiones({ [Q]: { enDiario: true, objetivos: OBJETIVOS } });
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 2 }), 'hecho');
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 1 }), 'pendiente');
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 3 }), 'pendiente', 'objetivo que no existe');
  sinErrores(m);
});

test('complete con max: hecho si hecho >= max (5/10 con max 5), pendiente con max 6', () => {
  const m = conMisiones({ [Q]: { enDiario: true, objetivos: OBJETIVOS } });
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 1, max: 5 }), 'hecho');
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 1, max: 6 }), 'pendiente');
  sinErrores(m);
});

test('complete: hecho también si la misión está completa o entregada', () => {
  const m = conMisiones({
    1: { enDiario: true, completa: true, objetivos: [OBJETIVOS[0]] },
    2: { entregada: true },
  });
  assert.equal(resultado(m, { t: 'complete', q: 1, objetivo: 1 }), 'hecho', 'completa');
  assert.equal(resultado(m, { t: 'complete', q: 2, objetivo: 1 }), 'hecho', 'entregada');
  sinErrores(m);
});

test('complete con siFalta: sin la misión (ni entregada) se da por hecho; en el diario manda el objetivo', () => {
  const m = conMisiones({ [Q]: { enDiario: true, objetivos: OBJETIVOS } });
  assert.equal(resultado(m, { t: 'complete', q: 555, objetivo: 1, siFalta: true }), 'hecho');
  assert.equal(resultado(m, { t: 'complete', q: 555, objetivo: 1 }), 'pendiente');
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 1, siFalta: true }), 'pendiente');
  sinErrores(m);
});

test('complete con info: hecho → saltar_paso, y sin hacer → info (no bloquea)', () => {
  const m = conMisiones({ [Q]: { enDiario: true, objetivos: OBJETIVOS } });
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 2, info: true }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'complete', q: Q, objetivo: 1, info: true }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// dailyturnin y abandon
// ---------------------------------------------------------------------------------------------------

test('dailyturnin: hecho si alguna de las misiones está entregada', () => {
  const m = conMisiones({ 1: { entregada: true }, 2: {}, 3: { enDiario: true } });
  assert.equal(resultado(m, { t: 'dailyturnin', qs: [2, 1] }), 'hecho');
  assert.equal(resultado(m, { t: 'dailyturnin', qs: [2, 3] }), 'pendiente');
  sinErrores(m);
});

test('abandon: hecho si no estás en ninguna; pendiente si estás en alguna', () => {
  const m = conMisiones({ 1: { enDiario: true }, 2: {} });
  assert.equal(resultado(m, { t: 'abandon', qs: [2, 3] }), 'hecho');
  assert.equal(resultado(m, { t: 'abandon', qs: [2, 1] }), 'pendiente');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Condiciones de misión
// ---------------------------------------------------------------------------------------------------

test('isOnQuest / isNotOnQuest: saltar_paso si no estás en ninguna / si estás en alguna; si no, info', () => {
  const m = conMisiones({ 1: { enDiario: true }, 2: {} });
  assert.equal(resultado(m, { t: 'isOnQuest', qs: [2, 3] }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'isOnQuest', qs: [2, 1] }), 'info');
  assert.equal(resultado(m, { t: 'isNotOnQuest', qs: [2, 1] }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'isNotOnQuest', qs: [2, 3] }), 'info');
  sinErrores(m);
});

test('isQuestComplete / isQuestNotComplete: saltar_paso si no (en ella y completa) / si (en ella y completa)', () => {
  const m = conMisiones({
    1: { enDiario: true, completa: true },
    2: { enDiario: true, completa: false },
    3: { entregada: true },
  });
  assert.equal(resultado(m, { t: 'isQuestComplete', q: 1 }), 'info');
  assert.equal(resultado(m, { t: 'isQuestComplete', q: 2 }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'isQuestComplete', q: 3 }), 'saltar_paso', 'entregada: ya no está en el diario');
  assert.equal(resultado(m, { t: 'isQuestComplete', q: 999 }), 'saltar_paso', 'sin la misión');
  assert.equal(resultado(m, { t: 'isQuestNotComplete', q: 1 }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'isQuestNotComplete', q: 2 }), 'info');
  assert.equal(resultado(m, { t: 'isQuestNotComplete', q: 999 }), 'info', 'sin la misión el paso se muestra');
  sinErrores(m);
});

test('isQuestTurnedIn / isQuestAvailable: saltar_paso si no entregaste ninguna / si entregaste todas', () => {
  const m = conMisiones({ 1: { entregada: true }, 2: { entregada: true }, 3: {} });
  assert.equal(resultado(m, { t: 'isQuestTurnedIn', qs: [3, 4] }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'isQuestTurnedIn', qs: [3, 1] }), 'info');
  assert.equal(resultado(m, { t: 'isQuestAvailable', qs: [1, 2] }), 'saltar_paso');
  assert.equal(resultado(m, { t: 'isQuestAvailable', qs: [1, 3] }), 'info');
  assert.equal(resultado(m, { t: 'isQuestAvailable', qs: [3] }), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// manual y nota
// ---------------------------------------------------------------------------------------------------

test('manual: hecho si mem.marcado; nota: info', () => {
  const m = nuevaMaquina();
  assert.equal(resultado(m, { t: 'manual' }, {}), 'pendiente');
  assert.equal(resultado(m, { t: 'manual' }, { marcado: true }), 'hecho');
  assert.equal(resultado(m, { t: 'nota', texto: { en: 'x' } }, {}), 'info');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglo de la tarea 5: GetLogIndexForQuestID devuelve 0 cuando la misión no está
// ---------------------------------------------------------------------------------------------------

test('misiones: un índice 0 de GetLogIndexForQuestID cuenta como «no está» (sin IsOnQuest)', () => {
  const m = nuevaMaquina({ sinApi: ['C_QuestLog.IsOnQuest'] });
  m.estadoMision(Q, { enDiario: true });
  m.lua('C_QuestLog.GetLogIndexForQuestID = function(q) if q == 31337 then return 0 end; return 1 end');
  assert.equal(m.lua('SnetForever.Misiones.enDiario(31337)'), false);
  assert.equal(m.lua(`SnetForever.Misiones.enDiario(${Q})`), true);
  // objetivo y completa tampoco se confunden con un índice 0.
  assert.equal(m.lua('SnetForever.Misiones.objetivo(31337, 1)'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Contrato con los datos reales de la fase 1
// ---------------------------------------------------------------------------------------------------

const TIPOS_DE_MISION = ['accept', 'turnin', 'complete', 'dailyturnin', 'abandon', 'isOnQuest', 'isNotOnQuest',
  'isQuestComplete', 'isQuestNotComplete', 'isQuestTurnedIn', 'isQuestAvailable', 'manual', 'nota'];

test('contrato: todos los elementos de misión de SnetForever_Rutas traen los campos que el evaluador lee y se evalúan', () => {
  const m = nuevaMaquina({
    datos: [
      join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'),
      join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc'),
    ],
  });
  const informe = m.lua(`(function()
    local E = SnetForever.Elementos
    local vistos, malos, resultados, sinRegistrar = {}, {}, {}, {}
    local function numero(v) return type(v) == "number" end
    local function lista(v)
      if type(v) ~= "table" or #v == 0 then return false end
      for i = 1, #v do if not numero(v[i]) then return false end end
      return true
    end
    local VALIDOS = {hecho = 1, pendiente = 1, info = 1, saltar_paso = 1, ir_guia = 1}
    for _, guia in pairs(SNF_RUTAS.guias) do
      for _, paso in ipairs(guia.pasos) do
        for _, el in ipairs(paso.elementos) do
          local t = el.t
          vistos[t] = (vistos[t] or 0) + 1
          local ok = true
          if t == "accept" or t == "turnin" or t == "isQuestComplete" or t == "isQuestNotComplete" or t == "complete" then
            ok = numero(el.q)
            if t == "complete" then ok = ok and numero(el.objetivo) and (el.max == nil or numero(el.max)) end
            if t == "accept" then ok = ok and (el.previa == nil or numero(el.previa)) end
          elseif t == "dailyturnin" or t == "abandon" or t == "isOnQuest" or t == "isNotOnQuest"
              or t == "isQuestTurnedIn" or t == "isQuestAvailable" then
            ok = lista(el.qs)
          end
          if not ok then malos[#malos + 1] = t .. " línea " .. tostring(el.linea) end
          local r = E.evaluar(el, {})
          resultados[r] = (resultados[r] or 0) + 1
          if not VALIDOS[r] then malos[#malos + 1] = t .. " devolvió " .. tostring(r) end
          if not E.def(t) and not E.INFORMATIVOS[t] then sinRegistrar[t] = true end
        end
      end
    end
    return {vistos = vistos, malos = malos, resultados = resultados, desconocidos = E.desconocidos}
  end)()`);
  assert.deepEqual(informe.malos.slice(0, 10), [], 'elementos con campos que faltan o resultados inválidos');
  for (const t of TIPOS_DE_MISION) {
    if (t !== 'manual') assert.ok(informe.vistos[t] > 0, `la fase 1 emite ${t}`);
    assert.equal(informe.desconocidos[t], undefined, `${t} no debe contarse como desconocido`);
  }
  for (const t of ['itemStat', 'target', 'mob', 'unitscan', 'timer']) assert.equal(informe.desconocidos[t], undefined, `${t} es informativo`);
  // Con un personaje sin misiones, hay de todas las clases de resultado.
  assert.ok(informe.resultados.pendiente > 0 && informe.resultados.info > 0 && informe.resultados.saltar_paso > 0);
  sinErrores(m);
});

test('T2: Elementos.faltanDe(e) da los objetivos que faltan según el extra (la misma lista para el mismo extra)', () => {
  const m = nuevaMaquina();
  const faltanDe = (e) => m.lua(`SnetForever.Elementos.faltanDe(${aLua(e)})`);
  assert.deepEqual(faltanDe({ datos: { t: 'turnin', q: 1 }, resultado: 'pendiente', extra: 'faltan:1,3' }), [1, 3]);
  assert.deepEqual(faltanDe({ datos: { t: 'turnin', q: 1 }, resultado: 'pendiente', extra: 'faltan' }), []);
  assert.equal(faltanDe({ datos: { t: 'turnin', q: 1 }, resultado: 'pendiente' }), undefined);
  assert.equal(m.lua(`(function()
    local E = SnetForever.Elementos
    return E.faltanDe({datos = {t = "turnin"}, resultado = "pendiente", extra = "faltan:2"})
      == E.faltanDe({datos = {t = "turnin"}, resultado = "pendiente", extra = "faltan:2"})
  end)()`), true);
  sinErrores(m);
});
