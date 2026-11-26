// Eventos y estado de misiones del addon (nucleo/eventos.lua y nucleo/misiones.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const Q = 4641;

// Máquina con la misión Q en el diario y el estado que se pida.
function maquinaConMision(estado = { enDiario: true }, opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.estadoMision(Q, estado);
  return m;
}

const entregada = (m, q = Q) => m.lua(`SnetForever.Misiones.entregada(${q})`);
const enDiario = (m, q = Q) => m.lua(`SnetForever.Misiones.enDiario(${q})`);
const completa = (m, q = Q) => m.lua(`SnetForever.Misiones.completa(${q})`);
const objetivo = (m, k, q = Q) => m.lua(`SnetForever.Misiones.objetivo(${q}, ${k})`);

// ---------------------------------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------------------------------

test('Eventos: dos oyentes del mismo evento reciben los dos; el error del primero no corta al segundo', () => {
  const m = nuevaMaquina();
  m.lua('RECIBIDOS = {}');
  m.lua(`SnetForever.Eventos.escuchar("QUEST_LOG_UPDATE", function() error("fallo de prueba") end)
         SnetForever.Eventos.escuchar("QUEST_LOG_UPDATE", function(a) table.insert(RECIBIDOS, a or "sin-arg") end)`);
  m.disparar('QUEST_LOG_UPDATE');
  assert.deepEqual(m.lua('RECIBIDOS'), ['sin-arg']);
  // Esta prueba no usa sinErrores: el error tiene que haber llegado a geterrorhandler(), una sola vez.
  assert.equal(m.errores().length, 1);
  assert.match(m.errores()[0], /fallo de prueba/);
});

test('Eventos: un evento del juego llega con sus argumentos y varios eventos usan un solo marco', () => {
  const m = nuevaMaquina();
  const marcosAntes = m.lua('#BANCO.marcos');
  m.lua('RECIBIDOS = {}');
  m.lua(`SnetForever.Eventos.escuchar("QUEST_LOG_UPDATE", function(...) table.insert(RECIBIDOS, {"log", ...}) end)
         SnetForever.Eventos.escuchar("PLAYER_LOGOUT", function(...) table.insert(RECIBIDOS, {"salida", ...}) end)`);
  m.disparar('PLAYER_LEVEL_UP', 12);
  m.disparar('QUEST_LOG_UPDATE', 1, 2);
  m.disparar('PLAYER_LOGOUT');
  assert.deepEqual(m.lua('RECIBIDOS'), [['log', 1, 2], ['salida']]);
  assert.equal(m.lua('#BANCO.marcos'), marcosAntes);
  sinErrores(m);
});

test('Eventos: emitir("SNF_X", 1) llega a quien escucha SNF_X, sin registrarse en el marco', () => {
  const m = nuevaMaquina();
  m.lua('RECIBIDOS = {}');
  m.lua(`SnetForever.Eventos.escuchar("SNF_X", function(a, b) table.insert(RECIBIDOS, {a, b}) end)
         SnetForever.Eventos.emitir("SNF_X", 1)
         SnetForever.Eventos.emitir("SNF_OTRO", 2)`);
  assert.deepEqual(m.lua('RECIBIDOS'), [[1]]);
  // RegisterEvent de un nombre que el banco no conoce sería un error: no se ha registrado nada.
  assert.equal(m.lua('BANCO.eventos.SNF_X'), undefined);
  sinErrores(m);
});

test('Eventos: SNF.escuchar y SNF.emitir son los de Eventos y siguen sirviendo a los demás archivos', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.escuchar == SnetForever.Eventos.escuchar'), true);
  assert.equal(m.lua('SnetForever.emitir == SnetForever.Eventos.emitir'), true);
  m.lua('RECIBIDOS = {}');
  m.lua('SnetForever.escuchar("SNF_AJUSTE_CAMBIADO", function(clave, valor) table.insert(RECIBIDOS, {clave, valor}) end)');
  m.lua('SnetForever.Guardado.preparar()');
  m.lua('SnetForever.Ajustes.set("pines.cuantos", 9)');
  assert.deepEqual(m.lua('RECIBIDOS'), [['pines.cuantos', 9]]);
  sinErrores(m);
});

// Con un evento que nadie más escucha (QUEST_LOG_UPDATE ya lo escucha la ventana desde la tarea 22).
test('Eventos.dejar: quita al oyente y, sin oyentes, deja de registrar el evento en el marco', () => {
  const m = nuevaMaquina({ sinComercio: true });
  m.lua('CUENTA = 0');
  m.lua(`function CONTAR() CUENTA = CUENTA + 1 end
         SnetForever.Eventos.escuchar("UPDATE_FACTION", CONTAR)`);
  m.disparar('UPDATE_FACTION');
  assert.equal(m.lua('CUENTA'), 1);
  assert.equal(m.lua('#(BANCO.eventos.UPDATE_FACTION or {})'), 1);
  m.lua('SnetForever.Eventos.dejar("UPDATE_FACTION", CONTAR)');
  m.disparar('UPDATE_FACTION');
  assert.equal(m.lua('CUENTA'), 1);
  assert.equal(m.lua('#(BANCO.eventos.UPDATE_FACTION or {})'), 0);
  sinErrores(m);
});

test('Eventos: un oyente quitado por otro durante el mismo evento ya no se llama; el mismo oyente no se duplica', () => {
  const m = nuevaMaquina();
  m.lua('ORDEN = ""');
  m.lua(`function SEGUNDO() ORDEN = ORDEN .. "2" end
         SnetForever.Eventos.escuchar("SNF_Y", function() ORDEN = ORDEN .. "1"; SnetForever.Eventos.dejar("SNF_Y", SEGUNDO) end)
         SnetForever.Eventos.escuchar("SNF_Y", SEGUNDO)
         SnetForever.Eventos.escuchar("SNF_Y", SEGUNDO)
         SnetForever.Eventos.emitir("SNF_Y")`);
  assert.equal(m.lua('ORDEN'), '1');
  m.lua(`function TERCERO() ORDEN = ORDEN .. "3" end
         SnetForever.Eventos.escuchar("SNF_Z", TERCERO)
         SnetForever.Eventos.escuchar("SNF_Z", TERCERO)
         SnetForever.Eventos.emitir("SNF_Z")`);
  assert.equal(m.lua('ORDEN'), '13');
  sinErrores(m);
});

test('Eventos.emitir: solo admite mensajes SNF_*', () => {
  const m = nuevaMaquina();
  assert.throws(() => m.lua('SnetForever.Eventos.emitir("QUEST_REMOVED", 1)'), /SNF_/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// entregada
// ---------------------------------------------------------------------------------------------------

test('entregada: funciona con cada una de las tres APIs, quitando las anteriores con sinApi', () => {
  const casos = [
    { sinApi: [], usa: 'C_QuestLog.IsQuestFlaggedCompleted' },
    { sinApi: ['C_QuestLog.IsQuestFlaggedCompleted'], usa: 'IsQuestFlaggedCompleted' },
    { sinApi: ['C_QuestLog.IsQuestFlaggedCompleted', 'IsQuestFlaggedCompleted'], usa: 'GetQuestsCompleted' },
  ];
  for (const { sinApi, usa } of casos) {
    // Sin entrar al mundo: la guía del arranque ya habría preguntado por las misiones entregadas.
    const m = maquinaConMision({ entregada: true }, { sinApi, entrar: false });
    m.estadoMision(1000, { entregada: false });
    assert.equal(entregada(m), true, usa);
    assert.equal(entregada(m, 1000), false, usa);
    assert.equal(entregada(m, 2000), false, `${usa}: misión que el juego no conoce`);
    assert.equal(m.llamadas(usa).length > 0, true, `usa ${usa}`);
    sinErrores(m);
  }
});

test('entregada: la lista de GetQuestsCompleted se guarda en caché y se renueva en QUEST_TURNED_IN', () => {
  const m = maquinaConMision(
    { entregada: false },
    { sinApi: ['C_QuestLog.IsQuestFlaggedCompleted', 'IsQuestFlaggedCompleted'] },
  );
  assert.equal(entregada(m), false);
  assert.equal(entregada(m), false);
  assert.equal(m.llamadas('GetQuestsCompleted').length, 1);
  m.estadoMision(Q, { entregada: true });
  assert.equal(entregada(m), false, 'sigue la caché');
  m.disparar('QUEST_TURNED_IN', 9999, 100, 5);
  assert.equal(entregada(m), true, 'renovada');
  assert.equal(m.llamadas('GetQuestsCompleted').length, 2);
  sinErrores(m);
});

test('entregada: QUEST_TURNED_IN da la misión por entregada 5 s aunque la API diga que no', () => {
  const m = maquinaConMision({ enDiario: true, entregada: false });
  assert.equal(entregada(m), false);
  m.disparar('QUEST_TURNED_IN', Q, 100, 5);
  assert.equal(entregada(m), true);
  m.avanzar(4.9);
  assert.equal(entregada(m), true);
  m.avanzar(0.2); // 5,1 s
  assert.equal(entregada(m), false);
  assert.equal(entregada(m, 1234), false, 'otra misión no se ve afectada');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// enDiario
// ---------------------------------------------------------------------------------------------------

test('enDiario: usa la API; QUEST_ACCEPTED lo da por verdadero 2 s aunque la API diga que no (id solo o índice e id)', () => {
  for (const args of ['3, 4641', '4641']) {
    const m = maquinaConMision({ enDiario: false });
    assert.equal(enDiario(m), false);
    m.disparar('QUEST_ACCEPTED', ...args.split(',').map(Number));
    assert.equal(enDiario(m), true, `QUEST_ACCEPTED(${args})`);
    m.avanzar(1.9);
    assert.equal(enDiario(m), true);
    m.avanzar(0.2); // 2,1 s
    assert.equal(enDiario(m), false, `${args}: pasados los 2 s`);
    sinErrores(m);
  }
});

test('enDiario: QUEST_REMOVED y QUEST_TURNED_IN dentro de los 2 s lo anulan', () => {
  for (const evento of ['QUEST_REMOVED', 'QUEST_TURNED_IN']) {
    const m = maquinaConMision({ enDiario: false });
    m.disparar('QUEST_ACCEPTED', 3, Q);
    assert.equal(enDiario(m), true);
    m.avanzar(0.5);
    m.disparar(evento, Q);
    assert.equal(enDiario(m), false, evento);
    sinErrores(m);
  }
});

test('enDiario: con la API en verdadero lo es siempre; el margen no cambia otras misiones', () => {
  const m = maquinaConMision({ enDiario: true });
  m.disparar('QUEST_ACCEPTED', 3, 777);
  assert.equal(enDiario(m), true);
  assert.equal(enDiario(m, 777), true, 'margen de la otra misión');
  assert.equal(enDiario(m, 888), false);
  sinErrores(m);
});

test('enDiario: sin C_QuestLog.IsOnQuest usa GetLogIndexForQuestID, y sin las dos recorre el registro', () => {
  const casos = [
    { sinApi: ['C_QuestLog.IsOnQuest'], usa: 'C_QuestLog.GetLogIndexForQuestID' },
    { sinApi: ['C_QuestLog.IsOnQuest', 'C_QuestLog.GetLogIndexForQuestID'], usa: 'GetQuestLogTitle' },
  ];
  for (const { sinApi, usa } of casos) {
    const m = nuevaMaquina({ sinApi });
    m.estadoMision(100, { enDiario: true });
    m.estadoMision(Q, { enDiario: true });
    m.estadoMision(5000, { enDiario: false });
    assert.equal(enDiario(m), true, usa);
    assert.equal(enDiario(m, 100), true, usa);
    assert.equal(enDiario(m, 5000), false, usa);
    assert.equal(enDiario(m, 31337), false, usa);
    assert.equal(m.llamadas(usa).length > 0, true, `usa ${usa}`);
    if (usa === 'GetQuestLogTitle') {
      // Las APIs que se quitaron no se llamaron.
      assert.equal(m.llamadas('C_QuestLog.IsOnQuest').length, 0);
    }
    sinErrores(m);
  }
});

// ---------------------------------------------------------------------------------------------------
// completa
// ---------------------------------------------------------------------------------------------------

test('completa: usa C_QuestLog.IsComplete; sin ella lee el 6.º valor de GetQuestLogTitle', () => {
  const con = maquinaConMision({ enDiario: true, completa: true });
  con.estadoMision(100, { enDiario: true, completa: false });
  assert.equal(completa(con), true);
  assert.equal(completa(con, 100), false);
  assert.equal(con.llamadas('C_QuestLog.IsComplete').length > 0, true);
  sinErrores(con);

  const sin = maquinaConMision({ enDiario: true, completa: true }, { sinApi: ['C_QuestLog.IsComplete'] });
  sin.estadoMision(100, { enDiario: true, completa: false });
  assert.equal(completa(sin), true);
  assert.equal(completa(sin, 100), false);
  assert.equal(completa(sin, 31337), false, 'misión que no está en el diario');
  assert.equal(sin.llamadas('GetQuestLogTitle').length > 0, true);
  sinErrores(sin);
});

// ---------------------------------------------------------------------------------------------------
// objetivo
// ---------------------------------------------------------------------------------------------------

const JABALI = { texto: 'Jabalí abatido: 3/7', hecho: 3, pedido: 7, terminado: false, tipo: 'monster' };

test('objetivo: con GetQuestObjectives da {texto, hecho, pedido, terminado}', () => {
  const m = maquinaConMision({
    enDiario: true,
    objetivos: [JABALI, { texto: 'Cuero de jabalí: 5/5', hecho: 5, pedido: 5, terminado: true, tipo: 'item' }],
  });
  assert.deepEqual(objetivo(m, 1), JABALI);
  assert.deepEqual(objetivo(m, 2), { texto: 'Cuero de jabalí: 5/5', hecho: 5, pedido: 5, terminado: true, tipo: 'item' });
  assert.equal(objetivo(m, 3), undefined);
  assert.equal(m.llamadas('C_QuestLog.GetQuestObjectives').length > 0, true);
  sinErrores(m);
});

test('objetivo: sin GetQuestObjectives lee el registro y saca 3 y 7 del texto «Jabalí abatido: 3/7»', () => {
  const m = maquinaConMision(
    { enDiario: true, objetivos: [JABALI, { texto: 'Cuero de jabalí: 5/5', hecho: 5, pedido: 5, terminado: true, tipo: 'item' }] },
    { sinApi: ['C_QuestLog.GetQuestObjectives'] },
  );
  assert.deepEqual(objetivo(m, 1), JABALI);
  assert.deepEqual(objetivo(m, 2), { texto: 'Cuero de jabalí: 5/5', hecho: 5, pedido: 5, terminado: true, tipo: 'item' });
  assert.equal(objetivo(m, 3), undefined);
  assert.equal(m.llamadas('GetQuestLogLeaderBoard').length > 0, true);
  sinErrores(m);
});

test('objetivo: un objetivo sin números («Habla con Fulano») cuenta 0/1 o 1/1 según esté hecho', () => {
  const m = maquinaConMision(
    {
      enDiario: true,
      objetivos: [
        { texto: 'Habla con Fulano', hecho: 0, pedido: 1, terminado: false, tipo: 'monster' },
        { texto: 'Habla con Mengano', hecho: 1, pedido: 1, terminado: true, tipo: 'monster' },
      ],
    },
    { sinApi: ['C_QuestLog.GetQuestObjectives', 'C_QuestLog.GetLogIndexForQuestID', 'C_QuestLog.IsOnQuest'] },
  );
  assert.deepEqual(objetivo(m, 1), { texto: 'Habla con Fulano', hecho: 0, pedido: 1, terminado: false, tipo: 'monster' });
  assert.deepEqual(objetivo(m, 2), { texto: 'Habla con Mengano', hecho: 1, pedido: 1, terminado: true, tipo: 'monster' });
  sinErrores(m);
});

test('objetivo: una misión sin objetivos y completa da el objetivo sintético; sin completar, nada', () => {
  for (const sinApi of [[], ['C_QuestLog.GetQuestObjectives']]) {
    const lista = maquinaConMision({ enDiario: true, completa: true }, { sinApi });
    const esperado = { texto: lista.lua('SnetForever.L.t("OBJETIVO_CUMPLIDO")'), hecho: 1, pedido: 1, terminado: true };
    assert.equal(esperado.texto.length > 0, true);
    assert.notEqual(esperado.texto, 'OBJETIVO_CUMPLIDO', 'la clave existe en los textos');
    assert.deepEqual(objetivo(lista, 1), esperado);
    assert.equal(objetivo(lista, 2), undefined);
    sinErrores(lista);

    const pendiente = maquinaConMision({ enDiario: true, completa: false }, { sinApi });
    assert.equal(objetivo(pendiente, 1), undefined);
    sinErrores(pendiente);
  }
});

test('objetivo: el tipo sale del juego (monster, item, object, event) tal cual', () => {
  const m = maquinaConMision({
    enDiario: true,
    objetivos: [
      { texto: 'a: 0/1', hecho: 0, pedido: 1, terminado: false, tipo: 'object' },
      { texto: 'b: 0/1', hecho: 0, pedido: 1, terminado: false, tipo: 'event' },
    ],
  });
  assert.equal(m.lua(`SnetForever.Misiones.objetivo(${Q}, 1).tipo`), 'object');
  assert.equal(m.lua(`SnetForever.Misiones.objetivo(${Q}, 2).tipo`), 'event');
  sinErrores(m);
});

test('objetivo: si el juego no trae tipo, sale de los objetivos de la base (criaturas, objetos, objetos de misión)', () => {
  const m = maquinaConMision({
    enDiario: true,
    objetivos: [
      { texto: 'a: 0/1', hecho: 0, pedido: 1, terminado: false },
      { texto: 'b: 0/1', hecho: 0, pedido: 1, terminado: false },
      { texto: 'c: 0/1', hecho: 0, pedido: 1, terminado: false },
      { texto: 'd: 0/1', hecho: 0, pedido: 1, terminado: false },
    ],
  });
  // El cliente de Forever no trae `type`.
  m.lua(`local original = C_QuestLog.GetQuestObjectives
    C_QuestLog.GetQuestObjectives = function(q)
      local lista = original(q)
      for _, o in ipairs(lista) do o.type = nil end
      return lista
    end
    SNF_MISIONES.quest[${Q}].objectives = {{{101, "x", 1}}, {{202, "y", 2}}, {{303, "z", 3}}, nil, {{{404}, 404, "w", 1}}}`);
  const tipo = (k) => m.lua(`SnetForever.Misiones.objetivo(${Q}, ${k}).tipo`);
  assert.equal(tipo(1), 'monster');
  assert.equal(tipo(2), 'object');
  assert.equal(tipo(3), 'item');
  assert.equal(tipo(4), 'monster');
  sinErrores(m);
});

test('objetivo: sin tipo del juego ni de la base, tipo es nil', () => {
  const m = maquinaConMision({
    enDiario: true,
    objetivos: [{ texto: 'a: 0/1', hecho: 0, pedido: 1, terminado: false }],
  });
  m.lua(`local original = C_QuestLog.GetQuestObjectives
    C_QuestLog.GetQuestObjectives = function(q)
      local lista = original(q)
      for _, o in ipairs(lista) do o.type = nil end
      return lista
    end`);
  assert.equal(m.lua(`SnetForever.Misiones.objetivo(${Q}, 1).tipo`), undefined);
  sinErrores(m);
});

test('objetivo: el texto sintético sale en inglés si el idioma es inglés', () => {
  const m = maquinaConMision({ enDiario: true, completa: true }, { jugador: { idioma: 'enUS' } });
  assert.equal(objetivo(m, 1).texto, 'Objective complete');
  sinErrores(m);
});

test('claves de textos: OBJETIVO_CUMPLIDO está en español y en inglés', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.L.tablas.es.OBJETIVO_CUMPLIDO ~= nil'), true);
  assert.equal(m.lua('SnetForever.L.tablas.en.OBJETIVO_CUMPLIDO ~= nil'), true);
  sinErrores(m);
});
