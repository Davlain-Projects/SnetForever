// 12-nov (en el juego, con capturas): «todavía me manda hacer misiones que no tengo». En la 26-28 de Vallefresno la guía
// mandaba a cazar a Shadumbra, Ursangous y Garrafilada, pero esas misiones (24, 23 y 2) solo se pueden coger si antes se
// entregó «La Caza de Vallefresno» (6383), que el jugador no tenía: el juego no se las daba (la cabeza de Shadumbra no
// dejaba aceptar nada) y la guía se quedaba esperando. Ahora, con «Saltar misiones que no puedes coger» (encendido por
// defecto), un paso cuyas misiones no se pueden hacer (les falta una previa que ni está entregada ni en el diario, o
// no se tienen y el paso no las acepta) se salta solo y va a «Pasos saltados» con el motivo; el «Corre hacia…» que
// solo lleva a uno de esos también. La ventana enseña esos pasos en gris con «No disponible» y la ruta no va a ellos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const ES = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } };

const MISION = (nombre, extra = {}) => ({
  name: nombre, startedBy: [[3143]], finishedBy: [[3143]], requiredLevel: 20, questLevel: 25,
  requiredRaces: 0, requiredClasses: 0, objectivesText: [`Haz ${nombre}`], ...extra,
});
const CAZA = 9101; // la previa (como «La Caza de Vallefresno»)
const CABEZA = 9102; // pide la previa (como «La cabeza de Shadumbra»)
const OTRA = 9103; // una cualquiera, sin previas: con ella en el diario el registro está cargado
const SUELTA = 9104; // sin previas, para un paso que sí se puede hacer
const MISIONES = {
  [CAZA]: MISION('La caza de prueba'),
  [CABEZA]: MISION('La cabeza de prueba', { preQuestSingle: [CAZA] }),
  [OTRA]: MISION('Otra de prueba'),
  [SUELTA]: MISION('Suelta de prueba'),
};
const OBJETO_CABEZA = 91630;

const ACEPTA = (q) => ({ t: 'accept', q });
const ENTREGA = (q) => ({ t: 'turnin', q });
const HACER = (q) => ({ t: 'complete', q, objetivo: 1 });
const RECOGER = (q) => ({ t: 'collect', i: OBJETO_CABEZA, n: 1, q });
const IR = { t: 'goto', mapa: 1411, x: 50, y: 50, modo: 'flecha' };
const CORRE = { t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'objetivo' };
const NOTA = { t: 'nota', texto: { en: 'Look for it', es: 'Búscalo' } };
const MANUAL = { t: 'manual', texto: { en: 'Do it', es: 'Hazlo' } };

function conGuia(pasos, opciones = {}) {
  const m = nuevaMaquina({ guardado: opciones.guardado || ES, jugador: { nivel: 25, clase: 'DRUID', raza: 'Tauren' } });
  for (const [q, datos] of Object.entries(MISIONES)) m.datoMision(Number(q), datos);
  m.estadoMision(OTRA, { enDiario: true });
  if (opciones.antes) opciones.antes(m);
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.avanzar(2);
  return m;
}

const actualN = (m) => m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n');
const saltados = (m) => m.lua('SnetForeverPJ.saltados') || [];

test('12-nov: un paso que acepta una misión cuya previa no se entregó se salta solo y va a saltados con el motivo', () => {
  const m = conGuia([{ elementos: [IR, NOTA, RECOGER(CABEZA), ACEPTA(CABEZA)] }, { elementos: [MANUAL] }]);
  assert.equal(actualN(m), 2);
  const s = saltados(m).find((x) => x.n === 1);
  assert.ok(s, JSON.stringify(saltados(m)));
  assert.equal(s.motivo, 'no_disponible');
  assert.equal(s.previa, CAZA);
  sinErrores(m);
});

test('12-nov: con la previa entregada (o en el diario), el paso espera como siempre', () => {
  for (const estado of [{ entregada: true }, { enDiario: true }]) {
    const m = conGuia([{ elementos: [IR, ACEPTA(CABEZA)] }, { elementos: [MANUAL] }], {
      antes: (n) => n.estadoMision(CAZA, estado),
    });
    assert.equal(actualN(m), 1, JSON.stringify(estado));
    assert.equal(saltados(m).length, 0);
    sinErrores(m);
  }
});

test('12-nov: aceptar y hacer en el mismo paso una misión que no se puede coger: se salta', () => {
  const m = conGuia([{ elementos: [ACEPTA(CABEZA), HACER(CABEZA)] }, { elementos: [MANUAL] }]);
  assert.equal(actualN(m), 2);
  sinErrores(m);
});

test('12-nov: en un paso con otra cosa que hacer, solo esa misión cuenta como hecha y el paso espera lo demás', () => {
  const m = conGuia([{ elementos: [ENTREGA(OTRA), ACEPTA(CABEZA)] }, { elementos: [MANUAL] }]);
  assert.equal(actualN(m), 1);
  const resultados = m.lua(`(function() local t = {} for _, e in ipairs(SnetForever.Motor.paso(1).elementos) do
    t[#t + 1] = e.resultado end return t end)()`);
  assert.deepEqual(resultados, ['pendiente', 'hecho']);
  m.estadoMision(OTRA, { enDiario: false, entregada: true });
  m.disparar('QUEST_TURNED_IN', OTRA, 0, 0);
  m.avanzar(1);
  assert.equal(actualN(m), 2);
  sinErrores(m);
});

// T4: un saltado por «no disponible» se vuelve a mirar. Cuando su misión ya se puede coger (al entregar la previa, al
// cargar la guía o cuando cambia el registro), pasa solo a retomado y vuelve a estar activo.
test('T4: al entregar la previa, el paso saltado por no disponible vuelve a estar activo', () => {
  const m = conGuia([{ elementos: [IR, NOTA, ACEPTA(CABEZA)] }, { elementos: [MANUAL] }]);
  assert.equal(actualN(m), 2);
  assert.equal(saltados(m)[0].motivo, 'no_disponible');
  assert.deepEqual(m.lua('SnetForever.Motor.estado().activos'), [2]);
  m.estadoMision(CAZA, { entregada: true });
  m.disparar('QUEST_TURNED_IN', CAZA, 0, 0);
  m.avanzar(1);
  assert.deepEqual(m.lua('SnetForever.Motor.estado().activos'), [1, 2], 'el paso 1 vuelve a estar activo');
  assert.equal(m.lua('SnetForever.Motor.paso(1).saltado'), false);
  assert.equal(m.lua(`SnetForeverPJ.retomados[${aLua(CLAVE)}].p1`), true);
  assert.equal(actualN(m), 2, 'el actual no se mueve');
  sinErrores(m);
});

test('T4: al cargar la guía con la previa ya entregada, el saltado por no disponible se retoma', () => {
  const m = conGuia([{ elementos: [IR, NOTA, ACEPTA(CABEZA)] }, { elementos: [MANUAL] }]);
  assert.equal(saltados(m)[0].motivo, 'no_disponible');
  const n = m.recargar();
  n.estadoMision(CAZA, { entregada: true });
  n.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(n.lua('SnetForever.Motor.estado().activos'), [1, 2]);
  assert.equal(n.lua(`SnetForeverPJ.retomados[${aLua(CLAVE)}].p1`), true);
  sinErrores(n);
});

test('T4: sin la previa, o si el motivo era no tener la misión, el saltado sigue saltado', () => {
  const m = conGuia([{ elementos: [IR, NOTA, ACEPTA(CABEZA)] }, { elementos: [HACER(SUELTA)] }, { elementos: [MANUAL] }]);
  assert.deepEqual(saltados(m).map((s) => [s.n, s.motivo]), [[1, 'no_disponible'], [2, 'no_disponible']]);
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(1);
  assert.deepEqual(m.lua('SnetForever.Motor.estado().activos'), [3]);
  // Con SUELTA en el diario, el paso de hacerla vuelve.
  m.estadoMision(SUELTA, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 1, SUELTA);
  m.avanzar(1);
  assert.deepEqual(m.lua('SnetForever.Motor.estado().activos'), [2, 3]);
  sinErrores(m);
});

test('12-nov: con el ajuste apagado, el paso espera', () => {
  const m = conGuia([{ elementos: [IR, ACEPTA(CABEZA)] }, { elementos: [MANUAL] }], {
    guardado: { ...ES, SnetForeverPJ: { esquema: 1, ajustes: { 'pasos.saltarNoDisponibles': false } } },
  });
  assert.equal(actualN(m), 1);
  sinErrores(m);
});

test('12-nov: con el registro aún vacío al entrar, no se salta nada todavía', () => {
  const m = nuevaMaquina({ guardado: ES, jugador: { nivel: 25, clase: 'DRUID', raza: 'Tauren' } });
  for (const [q, datos] of Object.entries(MISIONES)) m.datoMision(Number(q), datos);
  m.ponerGuia(guiaDePrueba([{ elementos: [ACEPTA(CABEZA)] }, { elementos: [MANUAL] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.avanzar(2);
  assert.equal(actualN(m), 1);
  sinErrores(m);
});

test('12-nov: el «Corre hacia…» que solo lleva a un paso que no se puede hacer también se salta', () => {
  const m = conGuia([
    { elementos: [CORRE] },
    { elementos: [IR, ACEPTA(CABEZA)] },
    { elementos: [CORRE] },
    { elementos: [IR, ACEPTA(SUELTA)] },
  ]);
  assert.equal(actualN(m), 3, 'el segundo «Corre hacia…» lleva a una misión que sí se puede coger');
  assert.deepEqual(saltados(m).map((s) => [s.n, s.motivo]), [[1, 'no_disponible'], [2, 'no_disponible']]);
  sinErrores(m);
});

test('12-nov: los pasos que vienen y no se pueden hacer salen en la ventana en gris con «No disponible» y su motivo', () => {
  const m = conGuia([{ elementos: [IR, ACEPTA(SUELTA)] }, { elementos: [IR, ACEPTA(CABEZA)] }, { elementos: [MANUAL] }]);
  assert.equal(actualN(m), 1);
  const nd = m.lua('SnetForever.Motor.noDisponible(SnetForever.Motor.paso(2))');
  assert.equal(nd.previa, CAZA);
  assert.equal(m.lua('SnetForever.Motor.noDisponible(SnetForever.Motor.paso(1))'), undefined);
  m.lua('SnetForever.Ventana.crear()');
  m.avanzar(1);
  const textos = m.lua(`(function() local t = {} for _, f in ipairs(SnetForever.Ventana.marcos.siguientes or {}) do
    t[#t + 1] = f:GetText() end return t end)()`) || [];
  assert.ok(textos.some((t) => t.includes('No disponible') && t.includes('La caza de prueba')), textos.join(' | '));
  sinErrores(m);
});

test('12-nov: la previsión cuenta lo que dan los pasos de en medio: aceptar antes de hacer y entregar la previa antes no es «no disponible»', () => {
  const m = conGuia([
    { elementos: [MANUAL] },
    { elementos: [IR, ACEPTA(CAZA)] },
    { elementos: [IR, HACER(CAZA)] },
    { elementos: [IR, ENTREGA(CAZA)] },
    { elementos: [IR, ACEPTA(CABEZA)] },
    { elementos: [IR, ENTREGA(SUELTA)] },
  ]);
  assert.equal(actualN(m), 1);
  const nd = (i) => m.lua(`SnetForever.Motor.noDisponible(SnetForever.Motor.paso(${i})) ~= nil`);
  assert.deepEqual([2, 3, 4, 5, 6].map(nd), [false, false, false, false, true], 'solo la entrega de una que no se coge en la guía');
  sinErrores(m);
});

test('12-nov: el panel tiene la casilla «Saltar misiones que no puedes coger» y la fila de saltados dice el motivo', () => {
  const m = conGuia([{ elementos: [IR, ACEPTA(CABEZA)] }, { elementos: [MANUAL] }]);
  m.lua('SlashCmdList.SNET("")');
  m.lua('SnetForever.Panel.marcos.tarjetas.saltados:Click()');
  const C = 'SnetForever.Panel.controles';
  assert.equal(m.lua(`${C}["pasos.saltarNoDisponibles"]:GetParent() == SnetForever.Panel.marcos.secciones.saltados`), true);
  assert.equal(m.lua('SnetForever.Ajustes.get("pasos.saltarNoDisponibles")'), true);
  const textos = m.lua(`(function() local t = {}
    for _, f in ipairs(SnetForever.Panel.marcos.saltados) do if f:IsShown() then t[#t + 1] = f.t2:GetText() end end
    return t end)()`);
  assert.ok(textos.some((t) => t.includes('No disponible') && t.includes('La caza de prueba')), textos.join(' | '));
  sinErrores(m);
});

// Con los datos reales: la 26-28 de Vallefresno sin «La Caza de Vallefresno» (6383), con el diario de las capturas.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const reales = { skip: existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES) ? false : 'no están los addons de datos', timeout: 900000 };

test('datos reales: en la 26-28 de Vallefresno sin «La Caza de Vallefresno», la guía no manda a cazar a Shadumbra, Ursangous ni Garrafilada', reales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], guardado: ES,
    jugador: { raza: 'Tauren', clase: 'DRUID', faccion: 'Horde', nivel: 25 }, forever: true });
  for (const q of [216, 6462, 25, 6571]) m.estadoMision(q, { enDiario: true });
  const clave = 'Skyrim Horde 22-30 (EN)' + String.fromCharCode(92) + '26-28 Ashenvale';
  assert.ok(m.lua(`SnetForever.Motor.cargar(${aLua(clave)})`));
  const resultado = m.lua(`(function()
    local M = SnetForever.Motor
    local function indiceDe(n) local i = 1 while M.paso(i) do if M.paso(i).n == n then return i end i = i + 1 end end
    local nd = {}
    for _, n in ipairs({19, 29, 36}) do nd[#nd + 1] = M.noDisponible(M.paso(indiceDe(n))) ~= nil end
    M.irA(indiceDe(19))
    for _ = 1, 6 do M.actualizar() end
    return {nd = nd, n = M.paso(M.estado().actual).n}
  end)()`);
  assert.deepEqual(resultado.nd, [true, true, true], 'Shadumbra, Ursangous y Garrafilada no se pueden hacer');
  assert.ok(resultado.n > 19, `la guía pasa de Shadumbra (está en el paso ${resultado.n})`);
  sinErrores(m);
});
