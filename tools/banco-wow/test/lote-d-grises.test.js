// Lote D (D2, lo vio el jugador el 10-nov con el druida de prueba a nivel 22 en el paso 101 de «18-22»: «Boticaria Zamah», misión de
// nivel 15): con «Saltar misiones grises» (encendido por defecto) un paso cuyas misiones son todas grises para el
// personaje se salta solo y va a «Pasos saltados» con el motivo. Excepciones: la misión está en el registro (manda el
// juego), es previa de una misión no gris de la misma guía, es de clase o es de una cadena de mejoras. La línea de
// requisitos dice el nivel de la misión con el color del juego («Misión de nivel 15 (gris para ti)»).
// Lo gris lo decide el cliente: C_QuestLog.GetTrivialRange (Forever, como Questie), UnitQuestTrivialLevelRange o
// GetQuestGreenRange; el banco no tiene ninguna y usa la tabla de Classic (Questie, QuestDetailsFrame.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const conDatos = { skip: hayDatos ? false : 'no están los addons de datos (fase 1 sin generar)' };

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const ES = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } };

// Misiones de prueba (el nivel 22 de el druida de prueba): 9001 de nivel 15 (gris a 22: la tabla de Classic la pone gris desde
// 15 + 7), 9002 de nivel 22 que pide la 9001, 9003 de nivel 21, 9004 de clase (druida) de nivel 15 y 9005 de nivel 16
// (verde a 22).
const MISION = (q, nombre, ql, extra = {}) => ({
  name: nombre, startedBy: [[3143]], finishedBy: [[3143]], requiredLevel: Math.max(1, ql - 5), questLevel: ql,
  requiredRaces: 0, requiredClasses: 0, objectivesText: [`Haz ${nombre}`], ...extra,
});
const MISIONES = {
  9001: MISION(9001, 'Boticaria de prueba', 15),
  9002: MISION(9002, 'Sigue la cadena', 22, { preQuestSingle: [9001] }),
  9003: MISION(9003, 'De tu nivel', 21),
  9004: MISION(9004, 'De druida', 15, { requiredClasses: 1024 }),
  9005: MISION(9005, 'Verde', 16),
};

const ACEPTA = (q) => ({ t: 'accept', q, texto: { en: `Accept ${q}`, es: `Acepta ${q}` } });
const ENTREGA = (q) => ({ t: 'turnin', q, texto: { en: `Turn in ${q}`, es: `Entrega ${q}` } });
const COMPLETA = (q) => ({ t: 'complete', q, objetivo: 1 });
const IR = { t: 'goto', mapa: 1411, x: 50, y: 50 };
const NOTA = { t: 'nota', texto: { en: 'Talk to Helbrim', es: 'Habla con Helbrim' } };

function conGuia(pasos, opciones = {}) {
  const m = nuevaMaquina({ guardado: ES, jugador: { nivel: 22, clase: 'DRUID', raza: 'Tauren' }, ...opciones });
  for (const [q, datos] of Object.entries(MISIONES)) m.datoMision(Number(q), datos);
  if (opciones.antes) opciones.antes(m);
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.avanzar(2); // unos cuantos ciclos del motor
  return m;
}

const actualN = (m) => m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n');
const saltados = (m) => m.lua('SnetForeverPJ.saltados') || [];
const saltadoN = (m, n) => saltados(m).find((s) => s.n === n);
const reqs = (m, i) => m.lua(`SnetForever.Requisitos.delPaso(SnetForever.Motor.paso(${i}))`) || [];

// ---------------------------------------------------------------------------------------------------
// Saltar pasos grises
// ---------------------------------------------------------------------------------------------------

test('D2: a nivel 22, un paso cuya misión es de nivel 15 (gris para el cliente) se salta solo y va a saltados con el motivo', () => {
  const m = conGuia([{ elementos: [IR, NOTA, ACEPTA(9001)] }, { elementos: [ACEPTA(9003)] }]);
  assert.equal(m.lua('SnetForever.Ajustes.get("pasos.saltarGrises")'), true);
  assert.equal(actualN(m), 2);
  const s = saltadoN(m, 1);
  assert.ok(s, JSON.stringify(saltados(m)));
  assert.equal(s.motivo, 'gris');
  assert.equal(s.nivel, 15);
  assert.equal(m.lua('SnetForever.Motor.paso(1).saltado'), true);
  sinErrores(m);
});

test('D2: también los pasos de completar y entregar de esa misión si no está en el registro (varios seguidos en un ciclo)', () => {
  const m = conGuia([
    { elementos: [ACEPTA(9001)] }, { elementos: [COMPLETA(9001)] }, { elementos: [IR, ENTREGA(9001)] },
    { elementos: [ACEPTA(9003)] },
  ]);
  assert.equal(actualN(m), 4);
  assert.deepEqual(saltados(m).map((s) => [s.n, s.motivo]), [[1, 'gris'], [2, 'gris'], [3, 'gris']]);
  sinErrores(m);
});

test('D2: la misma misión no se salta si es previa de una misión no gris de la guía (la cadena tiene que seguir)', () => {
  const m = conGuia([{ elementos: [ACEPTA(9001)] }, { elementos: [ACEPTA(9002)] }]);
  assert.equal(actualN(m), 1);
  assert.equal(saltados(m).length, 0);
  sinErrores(m);
});

test('D2: con la misión en el registro no se salta: manda el juego', () => {
  const m = conGuia([{ elementos: [IR, ENTREGA(9001)] }, { elementos: [ACEPTA(9003)] }], {
    antes: (n) => n.estadoMision(9001, { enDiario: true }),
  });
  assert.equal(actualN(m), 1);
  assert.equal(saltados(m).length, 0);
  sinErrores(m);
});

test('D2: con el ajuste apagado no se salta', () => {
  const m = conGuia([{ elementos: [ACEPTA(9001)] }, { elementos: [ACEPTA(9003)] }], {
    guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } },
      SnetForeverPJ: { esquema: 1, ajustes: { 'pasos.saltarGrises': false } } },
  });
  assert.equal(actualN(m), 1);
  assert.equal(saltados(m).length, 0);
  sinErrores(m);
});

test('D2: no se saltan las de clase, las de una cadena de mejoras ni un paso que además hace otra cosa (un vuelo, un instructor…)', () => {
  const clase = conGuia([{ elementos: [ACEPTA(9004)] }, { elementos: [ACEPTA(9003)] }]);
  assert.equal(actualN(clase), 1);
  const mejora = conGuia([{ elementos: [ACEPTA(9001)] }, { elementos: [ACEPTA(9003)] }], {
    antes: (n) => n.lua(`SNF_MISIONES.guias = SNF_MISIONES.guias or {}
      SNF_MISIONES.guias["Mejoras (H)\\\\de-prueba"] = {clave = "Mejoras (H)\\\\de-prueba", tipo = "mejora", grupo = "Mejoras (H)",
        nombre = "de-prueba", titulo = {en = "x"}, niveles = {min = 1, max = 60}, siguientes = {}, mazmorras = {},
        pasos = {{id = "m1", n = 1, etiquetas = {}, requisitos = {}, elementos = {{t = "accept", q = 9001}}}}}`),
  });
  assert.equal(actualN(mejora), 1);
  const otraCosa = conGuia([{ elementos: [ACEPTA(9001), { t: 'fp', texto: { en: 'Get the flight path' } }] },
    { elementos: [ACEPTA(9003)] }]);
  assert.equal(actualN(otraCosa), 1);
  for (const m of [clase, mejora, otraCosa]) {
    assert.equal(saltados(m).length, 0);
    sinErrores(m);
  }
});

test('D2: la verde (nivel 16 a 22) no se salta; con el margen «verdes de 1 nivel por debajo», sí', () => {
  const m = conGuia([{ elementos: [ACEPTA(9005)] }, { elementos: [ACEPTA(9003)] }]);
  assert.equal(actualN(m), 1);
  m.lua('SnetForever.Ajustes.set("pasos.margenVerdes", 1)');
  m.avanzar(1);
  assert.equal(actualN(m), 2);
  assert.equal(saltadoN(m, 1).motivo, 'gris');
  sinErrores(m);
});

test('D2: el cliente manda: con C_QuestLog.GetTrivialRange (Forever) de 8, la de nivel 15 es verde a 22 y no se salta', () => {
  const m = conGuia([{ elementos: [ACEPTA(9001)] }, { elementos: [ACEPTA(9003)] }], {
    previo: 'C_QuestLog = C_QuestLog or {}; rawset(C_QuestLog, "GetTrivialRange", function() return 8 end)',
  });
  assert.equal(m.lua('SnetForever.Dificultad.fuente()'), 'C_QuestLog.GetTrivialRange');
  assert.equal(actualN(m), 1);
  assert.equal(m.lua('SnetForever.Dificultad.color(15)'), 'verde');
  assert.equal(m.lua('SnetForever.Dificultad.color(13)'), 'gris');
  sinErrores(m);
});

test('D2: sin las funciones del cliente se usa la tabla de Classic (gris desde nivel de misión + 5/6/7/8…)', () => {
  const m = nuevaMaquina({ jugador: { nivel: 22 } });
  assert.equal(m.lua('SnetForever.Dificultad.fuente()'), 'tabla');
  const color = (ql, nivel) => m.lua(`SnetForever.Dificultad.color(${ql}, ${nivel})`);
  assert.equal(color(15, 22), 'gris');
  assert.equal(color(16, 22), 'verde');
  assert.equal(color(19, 22), 'verde');
  assert.equal(color(20, 22), 'amarillo');
  assert.equal(color(25, 22), 'naranja');
  assert.equal(color(27, 22), 'rojo');
  assert.equal(color(4, 9), 'gris');
  assert.equal(color(5, 9), 'verde');
  assert.equal(color(40, 49), 'gris');
  assert.equal(color(41, 49), 'verde');
  assert.equal(color(-1, 22), 'amarillo'); // escala con el jugador
  sinErrores(m);
});

test('D2: «Retomar» un paso saltado por gris lo deja hacer (no se vuelve a saltar)', () => {
  const m = conGuia([{ elementos: [ACEPTA(9001)] }, { elementos: [ACEPTA(9003)] }]);
  const id = saltadoN(m, 1).id;
  m.lua(`SnetForever.Motor.retomar(${aLua(CLAVE)}, ${aLua(id)})`);
  m.avanzar(1);
  assert.deepEqual(m.lua('SnetForever.Motor.estado().activos'), [1, 2]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Línea de requisitos y panel
// ---------------------------------------------------------------------------------------------------

test('D2: la línea de requisitos dice el nivel de la misión con el color del juego («Misión de nivel 15 (gris para ti)»)', () => {
  const m = conGuia([{ elementos: [ACEPTA(9001)] }, { elementos: [ACEPTA(9003)] }], {
    guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } },
      SnetForeverPJ: { esquema: 1, ajustes: { 'pasos.saltarGrises': false } } },
  });
  const gris = reqs(m, 1).find((r) => r.clave === 'nivelMision');
  assert.equal(gris.texto, 'Misión de nivel 15 (gris para ti)');
  assert.equal(gris.color, '|cFF808080');
  assert.equal(gris.estado, 'aviso');
  const amarilla = reqs(m, 2).find((r) => r.clave === 'nivelMision');
  assert.equal(amarilla.texto, 'Misión de nivel 21 (amarilla para ti)');
  assert.equal(amarilla.estado, 'ok');
  // En la ventana, con su color.
  m.lua('SnetForever.Ventana.crear(); SnetForever.Ventana.pintar()');
  const lineas = m.lua('(function() local t = {} for _, fs in ipairs(SnetForever.Ventana.marcos.pasos[1].requisitos) do t[#t + 1] = fs:GetText() end return t end)()');
  assert.ok(lineas.includes('|cFF808080Misión de nivel 15 (gris para ti)|r'), lineas.join(' | '));
  sinErrores(m);
});

test('D2: en inglés, «Level 15 quest (grey for you)»', () => {
  const m = conGuia([{ elementos: [ACEPTA(9001)] }], {
    guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } },
      SnetForeverPJ: { esquema: 1, ajustes: { 'pasos.saltarGrises': false } } },
  });
  assert.equal(reqs(m, 1).find((r) => r.clave === 'nivelMision').texto, 'Level 15 quest (grey for you)');
  sinErrores(m);
});

test('D2: el panel tiene en «Pasos saltados» la casilla «Saltar misiones grises» y el margen de verdes (0 por defecto); la fila dice el motivo', () => {
  const m = conGuia([{ elementos: [ACEPTA(9001)] }, { elementos: [ACEPTA(9003)] }]);
  m.lua('SlashCmdList.SNET("")');
  m.lua('SnetForever.Panel.marcos.tarjetas.saltados:Click()');
  const C = 'SnetForever.Panel.controles';
  assert.equal(m.lua(`${C}["pasos.saltarGrises"]:GetParent() == SnetForever.Panel.marcos.secciones.saltados`), true);
  assert.equal(m.lua(`${C}["pasos.margenVerdes"]:GetParent() == SnetForever.Panel.marcos.secciones.saltados`), true);
  assert.equal(m.lua('SnetForever.Ajustes.get("pasos.margenVerdes")'), 0);
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["pasos.margenVerdes"]'), { min: 0, max: 5, paso: 1 });
  const textos = m.lua(`(function() local t = {}
    for _, f in ipairs(SnetForever.Panel.marcos.saltados) do if f:IsShown() then t[#t + 1] = f.t2:GetText() end end
    return t end)()`);
  assert.ok(textos.some((t) => t.includes('Misión gris (nivel 15)')), textos.join(' | '));
  m.lua(`${C}["pasos.saltarGrises"]:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("pasos.saltarGrises")'), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Datos reales: el druida de prueba en el paso 101 de «18-22»
// ---------------------------------------------------------------------------------------------------

test('D2: con los datos reales, el druida de prueba (druida Skyborne, nivel 22) en el paso 101 de «18-22» salta «Boticaria Zamah» (853, nivel 15)', conDatos, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], guardado: ES,
    jugador: { clase: 'DRUID', raza: 'Skyborne', faccion: 'Horde', nivel: 22 } });
  m.estadoMision(848, { entregada: true }); // la previa de 853, la de Helbrim
  m.lua('SnetForever.Guias.cargar("RestedXP Forever Guide (H)\\\\17-22 Stonetalon/Barrens/Ashenvale", {n = 101})');
  const antes = m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n');
  assert.equal(antes, 101);
  const linea = m.lua('SnetForever.Requisitos.delPaso(SnetForever.Motor.paso(SnetForever.Motor.estado().actual))')
    .find((r) => r.clave === 'nivelMision');
  assert.equal(linea.texto, 'Misión de nivel 15 (gris para ti)');
  m.avanzar(2);
  const s = (m.lua('SnetForeverPJ.saltados') || []).find((x) => x.n === 101);
  assert.ok(s, JSON.stringify(m.lua('SnetForeverPJ.saltados')));
  assert.equal(s.motivo, 'gris');
  assert.equal(s.nivel, 15);
  assert.ok(m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n') > 101);
  sinErrores(m);
});

test('D2 (ronda 1, M1): la previa gris de una misión de clase (o de mejoras), que nunca se salta, tampoco se salta', () => {
  const clase = conGuia([{ elementos: [ACEPTA(9006)] }, { elementos: [ACEPTA(9007)] }], {
    antes: (n) => {
      n.datoMision(9006, MISION(9006, 'Previa gris', 14));
      n.datoMision(9007, MISION(9007, 'De druida con previa', 15, { requiredClasses: 1024, preQuestSingle: [9006] }));
    },
  });
  assert.equal(actualN(clase), 1);
  assert.equal(saltados(clase).length, 0);
  const mejora = conGuia([{ elementos: [ACEPTA(9006)] }, { elementos: [ACEPTA(9008)] }], {
    antes: (n) => {
      n.datoMision(9006, MISION(9006, 'Previa gris', 14));
      n.datoMision(9008, MISION(9008, 'Da una mejora', 15, { preQuestSingle: [9006] }));
      n.lua(`SNF_MISIONES.guias = SNF_MISIONES.guias or {}
        SNF_MISIONES.guias["Mejoras (H)\\\\con-previa"] = {clave = "Mejoras (H)\\\\con-previa", tipo = "mejora", grupo = "Mejoras (H)",
          nombre = "con-previa", titulo = {en = "x"}, niveles = {min = 1, max = 60}, siguientes = {}, mazmorras = {},
          pasos = {{id = "m1", n = 1, etiquetas = {}, requisitos = {}, elementos = {{t = "accept", q = 9008}}}}}`);
    },
  });
  assert.equal(actualN(mejora), 1);
  assert.equal(saltados(mejora).length, 0);
  sinErrores(clase);
  sinErrores(mejora);
});
