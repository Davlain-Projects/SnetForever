// Motor de pasos (motor/pasos.lua), tarea 10: pegajosos (#completewith, #sticky), #requires, #level (espera),
// recálculo al subir de nivel, ir_a / ir_guia y eventos por paso con un ciclo como mucho por tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const SIGUE = 'Prueba (H)\\02-03 Sigue';
const SKYBORNE = 'Prueba\\01-03 Skyborne';

const NOTA = { t: 'nota', texto: { en: 'Note', es: 'Nota' } };
const MANUAL = { t: 'manual', texto: { en: 'Do it', es: 'Hazlo' } };
const RECOGER = { t: 'collect', i: 159, n: 10 }; // collect 159,10
const VENDEDOR = { t: 'vendor' };

function conGuia(pasos, campos = {}, opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba(pasos, campos));
  return m;
}

const cargar = (m, clave = CLAVE) => m.lua(`SnetForever.Motor.cargar(${aLua(clave)})`);
const estado = (m) => m.lua('SnetForever.Motor.estado()');
const actual = (m) => estado(m).actual;
const activos = (m) => estado(m).activos;
const paso = (m, i) => m.lua(`SnetForever.Motor.paso(${i})`);
const actualizar = (m) => m.lua('SnetForever.Motor.actualizar()');
const ciclos = (m) => m.lua('SnetForever.Motor.ciclos');
const marcar = (m, i) => m.lua(`SnetForever.Motor.marcarManual(${i}, 1, true)`);
const pegajosos = (m) => m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].pegajosos`) || {};
// Cuántos marcos tienen registrado el evento del juego en el banco.
const registrados = (m, evento) => m.lua(`#(BANCO.eventos.${evento} or {})`);

// Lleva la cuenta del objeto 159 a `n` y avisa con BAG_UPDATE_DELAYED.
function llevar(m, n) {
  m.objeto(159, n);
  m.disparar('BAG_UPDATE_DELAYED');
}

// ---------------------------------------------------------------------------------------------------
// #completewith y #sticky
// ---------------------------------------------------------------------------------------------------

test('completewith next: en A, activos = {S, A} (el puntero no se para en S); al completarse A, S sale', () => {
  const m = conGuia([
    { etiquetas: { completewith: 'next' }, elementos: [RECOGER] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  assert.equal(actual(m), 2);
  assert.deepEqual(activos(m), [1, 2]);
  assert.equal(paso(m, 1).pegajoso, true);
  assert.equal(paso(m, 2).pegajoso, false);
  marcar(m, 2);
  m.avanzar(0.3);
  assert.equal(actual(m), 3);
  assert.deepEqual(activos(m), [3]);
  assert.equal(paso(m, 1).hecho, true);
  assert.equal(pegajosos(m).p1, true);
  sinErrores(m);
});

test('completewith fin: S sigue activo hasta pasar el paso con label fin', () => {
  const m = conGuia([
    { etiquetas: { completewith: 'fin' }, elementos: [RECOGER] },
    { elementos: [MANUAL] },
    { etiquetas: { label: 'fin' }, elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  assert.deepEqual(activos(m), [1, 2]);
  marcar(m, 2);
  m.avanzar(0.3);
  assert.equal(actual(m), 3);
  assert.deepEqual(activos(m), [1, 3]);
  marcar(m, 3);
  m.avanzar(0.3);
  assert.equal(actual(m), 4);
  assert.deepEqual(activos(m), [4]);
  assert.equal(pegajosos(m).p1, true);
  sinErrores(m);
});

test('completewith de una etiqueta pegajosa: se completa cuando ese pegajoso está en pegajosos', () => {
  const m = conGuia([
    { etiquetas: { completewith: 'bolsa' }, elementos: [MANUAL] },
    { etiquetas: { sticky: true, label: 'bolsa' }, elementos: [RECOGER] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  assert.equal(actual(m), 3);
  assert.deepEqual(activos(m), [1, 2, 3]);
  marcar(m, 3);
  m.avanzar(0.5);
  assert.equal(actual(m), 4);
  assert.deepEqual(activos(m), [1, 2, 4], 'pasar el paso no basta: la etiqueta es de un pegajoso');
  llevar(m, 10);
  m.avanzar(0.5);
  assert.deepEqual(activos(m), [4]);
  assert.equal(pegajosos(m).p2, true);
  assert.equal(pegajosos(m).p1, true);
  sinErrores(m);
});

test('sticky con su collect: sigue activo en los dos pasos siguientes; con la cuenta 10, pegajosos[idS] == true', () => {
  const m = conGuia([
    { etiquetas: { sticky: true }, elementos: [RECOGER] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  assert.deepEqual(activos(m), [1, 2]);
  marcar(m, 2);
  m.avanzar(0.3);
  assert.deepEqual(activos(m), [1, 3]);
  marcar(m, 3);
  m.avanzar(0.3);
  assert.deepEqual(activos(m), [1, 4]);
  llevar(m, 10);
  m.avanzar(0.3);
  assert.equal(pegajosos(m).p1, true);
  assert.deepEqual(activos(m), [4]);
  assert.equal(paso(m, 1).hecho, true);
  // Por id: sobrevive a /reload y el pegajoso no vuelve.
  const m2 = m.recargar();
  cargar(m2);
  assert.equal(actual(m2), 4);
  assert.deepEqual(activos(m2), [4]);
  assert.equal(paso(m2, 1).hecho, true);
  sinErrores(m2);
});

test('al cargar a mitad de guía, un sticky anterior sin hacer está activo y uno en pegajosos no', () => {
  const pasos = [
    { etiquetas: { sticky: true }, elementos: [RECOGER] },
    { etiquetas: { sticky: true }, elementos: [MANUAL] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ];
  const m = conGuia(pasos, {}, { guardado: { SnetForeverPJ: { progreso: { [CLAVE]: { id: 'p4', n: 4, pegajosos: { p1: true } } } } } });
  cargar(m);
  assert.equal(actual(m), 4);
  assert.deepEqual(activos(m), [2, 4]);
  sinErrores(m);
});

test('guía que acaba con un pegajoso pendiente: espera tras el último paso y, hecho, pasa a la siguiente', () => {
  const m = conGuia(
    [{ elementos: [MANUAL] }, { etiquetas: { sticky: true }, elementos: [RECOGER] }],
    { siguientes: [{ clave: SIGUE }] },
  );
  cargar(m);
  assert.equal(actual(m), 1);
  marcar(m, 1);
  m.avanzar(0.5);
  const e = estado(m);
  assert.equal(e.clave, CLAVE);
  assert.equal(e.fin, false);
  assert.deepEqual(e.activos, [2]);
  assert.notEqual(e.actual, 2, 'el puntero no descansa en el pegajoso');
  // Tras /reload sigue esperando al pegajoso (no vuelve al paso 1).
  const m2 = m.recargar();
  cargar(m2);
  assert.deepEqual(activos(m2), [2]);
  assert.equal(paso(m2, 1).hecho, true);
  llevar(m2, 10);
  m2.avanzar(0.6);
  assert.equal(estado(m2).clave, SIGUE);
  sinErrores(m2);
});

// ---------------------------------------------------------------------------------------------------
// #requires
// ---------------------------------------------------------------------------------------------------

test('requires S mientras S está activo: espera == "requiere"; con S hecho, R se activa', () => {
  const m = conGuia([
    { etiquetas: { sticky: true, label: 'S' }, elementos: [RECOGER] },
    { etiquetas: { requires: 'S' }, elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).espera, 'requiere');
  assert.deepEqual(activos(m), [1]);
  m.avanzar(0.6);
  assert.equal(actual(m), 2, 'un paso que espera no avanza');
  assert.equal(paso(m, 2).elementos[0].resultado, undefined, 'ni se activa: sus elementos no se evalúan');
  llevar(m, 10);
  m.avanzar(0.5);
  assert.equal(paso(m, 2).espera, undefined);
  assert.deepEqual(activos(m), [2]);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).hecho, false);
  sinErrores(m);
});

test('requires a un paso no pegajoso anterior, a una etiqueta que no existe o por etiquetasPorFiltro: cumplido', () => {
  const m = conGuia([
    { etiquetas: { label: 'A' }, elementos: [MANUAL] },
    { etiquetas: { requires: 'A' }, elementos: [MANUAL] },
    { etiquetas: { requires: 'NoExiste' }, elementos: [MANUAL] },
    { etiquetas: { sticky: true, label: 'S' }, elementos: [RECOGER] },
    { etiquetasPorFiltro: [{ nombre: 'requires', valor: 'S', filtro: [['c:MAGE']] }], elementos: [MANUAL] },
    { etiquetasPorFiltro: [{ nombre: 'requires', valor: 'S', filtro: [['c:WARRIOR']] }], elementos: [MANUAL] },
  ]);
  cargar(m);
  marcar(m, 1);
  m.avanzar(0.3);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).espera, undefined);
  assert.deepEqual(activos(m), [2]);
  marcar(m, 2);
  m.avanzar(0.3);
  assert.equal(actual(m), 3);
  assert.equal(paso(m, 3).espera, undefined);
  marcar(m, 3);
  m.avanzar(0.3);
  // El requires de c:MAGE no aplica a un guerrero: el 5 no espera.
  assert.equal(actual(m), 5);
  assert.equal(paso(m, 5).espera, undefined);
  assert.deepEqual(activos(m), [4, 5]);
  marcar(m, 5);
  m.avanzar(0.3);
  assert.equal(actual(m), 6);
  assert.equal(paso(m, 6).espera, 'requiere');
  sinErrores(m);
});

test('ciclo de requires: A requiere B y B requiere A; actualizar() termina y saltar funciona en los dos', () => {
  const m = conGuia([
    { etiquetas: { label: 'A', requires: 'B' }, elementos: [MANUAL] },
    { etiquetas: { label: 'B', requires: 'A' }, elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  actualizar(m);
  actualizar(m);
  assert.equal(actual(m), 1);
  assert.equal(paso(m, 1).espera, 'requiere');
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).espera, undefined);
  m.lua('SnetForever.Motor.saltar(2)');
  assert.equal(actual(m), 3);
  assert.equal(m.lua('#SnetForeverPJ.saltados'), 2);
  sinErrores(m);
});

test('ciclo de requires entre dos pegajosos: ninguno se activa, el motor no se cuelga y se pueden saltar', () => {
  const m = conGuia([
    { etiquetas: { sticky: true, label: 'A', requires: 'B' }, elementos: [MANUAL] },
    { etiquetas: { sticky: true, label: 'B', requires: 'A' }, elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 3);
  assert.deepEqual(activos(m), [3]);
  assert.equal(paso(m, 1).espera, 'requiere');
  assert.equal(paso(m, 2).espera, 'requiere');
  m.lua('SnetForever.Motor.saltar(1)');
  assert.deepEqual(activos(m), [2, 3], 'con A saltado, B ya puede activarse');
  m.lua('SnetForever.Motor.saltar(2)');
  assert.deepEqual(activos(m), [3]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// #level y recálculo al subir de nivel
// ---------------------------------------------------------------------------------------------------

test('level 3 a nivel 2: el actual no cambia y espera == "nivel"; con PLAYER_LEVEL_UP(3) se activa sin saltarse', () => {
  const m = conGuia([{ elementos: [NOTA] }, { etiquetas: { level: '3' }, elementos: [MANUAL] }, { elementos: [MANUAL] }],
    {}, { jugador: { nivel: 2 } });
  cargar(m);
  m.avanzar(0.5);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).espera, 'nivel');
  assert.deepEqual(activos(m), []);
  m.avanzar(1.2);
  assert.equal(actual(m), 2);
  // UnitLevel puede ir por detrás de PLAYER_LEVEL_UP: el banco sigue en 2 y manda el argumento del evento.
  m.disparar('PLAYER_LEVEL_UP', 3);
  m.avanzar(0.5);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).espera, undefined);
  assert.deepEqual(activos(m), [2]);
  assert.equal(paso(m, 2).hecho, false);
  assert.equal(paso(m, 2).saltado, false);
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  sinErrores(m);
});

test('un elemento n:3 no está a nivel 2; tras subir a 3 está, el id del actual se conserva y su mem también', () => {
  const m = conGuia([
    { elementos: [NOTA] },
    { filtro: [['n:3']], elementos: [MANUAL] },
    { elementos: [VENDEDOR, { ...NOTA, filtro: [['n:3']] }] },
    { elementos: [MANUAL] },
  ], {}, { jugador: { nivel: 2 } });
  cargar(m);
  actualizar(m);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).id, 'p3');
  assert.equal(paso(m, 2).elementos.length, 1);
  m.disparar('MERCHANT_SHOW');
  assert.equal(paso(m, 2).elementos[0].mem.abierta, true);
  m.disparar('PLAYER_LEVEL_UP', 3);
  assert.equal(paso(m, 3).id, 'p3');
  assert.equal(actual(m), 3);
  assert.equal(paso(m, 2).id, 'p2');
  assert.equal(paso(m, 3).elementos.length, 2);
  assert.equal(paso(m, 3).elementos[0].mem.abierta, true, 'la mem del vendedor (solo llega por evento) se conserva');
  m.disparar('MERCHANT_CLOSED');
  assert.equal(paso(m, 3).elementos[0].resultado, 'hecho');
  sinErrores(m);
});

test('PLAYER_LEVEL_UP llega a los evaluadores con su nivel aunque UnitLevel aún dé el anterior', () => {
  const m = conGuia([{ elementos: [{ t: 'xp', nivel: 3, efecto: 'objetivo' }] }, { elementos: [MANUAL] }],
    {}, { jugador: { nivel: 2 } });
  cargar(m);
  assert.equal(paso(m, 1).elementos[0].resultado, 'pendiente');
  m.disparar('PLAYER_LEVEL_UP', 3);
  assert.equal(paso(m, 1).elementos[0].resultado, 'hecho');
  actualizar(m);
  assert.equal(actual(m), 2);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// ir_a e ir_guia
// ---------------------------------------------------------------------------------------------------

test('xp con etiqueta alcanzada → el actual pasa al paso de la etiqueta; con una etiqueta que no existe, nada', () => {
  const pasos = (etiqueta) => [
    { elementos: [{ t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado', etiqueta }, MANUAL] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
    { etiquetas: { label: 'L' }, elementos: [MANUAL] },
  ];
  const m = conGuia(pasos('L'), {}, { jugador: { nivel: 6 } });
  cargar(m);
  assert.equal(paso(m, 1).elementos[0].resultado, 'ir_a');
  actualizar(m);
  assert.equal(actual(m), 4);
  assert.equal(paso(m, 2).hecho, true);
  assert.equal(paso(m, 2).saltado, false);
  assert.deepEqual(activos(m), [4]);
  sinErrores(m);

  const sinEtiqueta = conGuia(pasos('NoHay'), {}, { jugador: { nivel: 6 } });
  cargar(sinEtiqueta);
  actualizar(sinEtiqueta);
  actualizar(sinEtiqueta);
  assert.equal(actual(sinEtiqueta), 1, 'sin la etiqueta no hace nada (y el manual aún falta)');
  sinEtiqueta.lua('SnetForever.Motor.marcarManual(1, 2, true)');
  actualizar(sinEtiqueta);
  assert.equal(actual(sinEtiqueta), 2, 'el elemento ir_a no bloquea el paso');
  sinErrores(sinEtiqueta);
});

test('ir_guia: carga la primera guía de la lista cuyo filtro aplica; sin lista, la de siguientes', () => {
  const m = conGuia([
    { elementos: [{ t: 'next', guias: [{ clave: SIGUE, filtro: [['c:MAGE']] }, { clave: 'No\\existe' }, SKYBORNE] }, MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  actualizar(m);
  assert.equal(estado(m).clave, SKYBORNE);
  sinErrores(m);

  const conSiguientes = conGuia([{ elementos: [{ t: 'next' }, MANUAL] }, { elementos: [MANUAL] }], {
    siguientes: [{ clave: SIGUE }],
  });
  cargar(conSiguientes);
  actualizar(conSiguientes);
  assert.equal(estado(conSiguientes).clave, SIGUE);
  sinErrores(conSiguientes);
});

// ---------------------------------------------------------------------------------------------------
// Eventos y ciclos
// ---------------------------------------------------------------------------------------------------

test('con un paso con vendor activo el marco de eventos tiene MERCHANT_SHOW; tras pasar el paso, ya no', () => {
  // Sin entrar al mundo: con la guía del arranque cargada, el motor ya escucharía PLAYER_LEVEL_UP antes de cargar esta.
  const m = conGuia([{ elementos: [VENDEDOR] }, { elementos: [MANUAL] }], {}, { entrar: false, sinComercio: true });
  assert.equal(registrados(m, 'MERCHANT_SHOW'), 0);
  // PLAYER_LEVEL_UP lo escuchan más módulos por el mismo marco de Eventos (el latido de ia/latido.lua, siempre): no basta
  // con contar marcos. Se miran los oyentes que el motor pone y quita en Eventos desde aquí.
  m.lua(`rawset(_G, "OYENTES_NIVEL", {})
    local E = SnetForever.Eventos
    local escuchar, dejar = E.escuchar, E.dejar
    E.escuchar = function(ev, fn) if ev == "PLAYER_LEVEL_UP" then OYENTES_NIVEL[fn] = true end return escuchar(ev, fn) end
    E.dejar = function(ev, fn) if ev == "PLAYER_LEVEL_UP" then OYENTES_NIVEL[fn] = nil end return dejar(ev, fn) end`);
  const delMotor = () => m.lua('(function() local n = 0; for _ in pairs(OYENTES_NIVEL) do n = n + 1 end; return n end)()');
  cargar(m);
  assert.equal(registrados(m, 'MERCHANT_SHOW'), 1);
  assert.equal(delMotor(), 1, 'el motor escucha siempre PLAYER_LEVEL_UP');
  assert.ok(registrados(m, 'PLAYER_LEVEL_UP') >= 1, 'y el marco de Eventos lo tiene registrado');
  m.disparar('MERCHANT_SHOW');
  m.disparar('MERCHANT_CLOSED');
  m.avanzar(0.3);
  assert.equal(actual(m), 2);
  assert.equal(registrados(m, 'MERCHANT_SHOW'), 0);
  assert.equal(registrados(m, 'MERCHANT_CLOSED'), 0);
  assert.equal(delMotor(), 1, 'tras pasar el paso, sigue escuchándolo');
  assert.ok(registrados(m, 'PLAYER_LEVEL_UP') >= 1);
  sinErrores(m);
});

test('100 QUEST_LOG_UPDATE en 0,1 s → ciclos sube como mucho 1 por tick de 0,2 s', () => {
  const m = conGuia([{ elementos: [RECOGER] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.avanzar(1.2);
  const c0 = ciclos(m);
  for (let ronda = 0; ronda < 2; ronda++) {
    for (let k = 0; k < 50; k++) m.disparar('QUEST_LOG_UPDATE');
    m.avanzar(0.05);
  }
  assert.ok(ciclos(m) - c0 <= 1, `ciclos en 0,1 s: ${ciclos(m) - c0}`);
  m.avanzar(0.1);
  assert.equal(ciclos(m) - c0, 1, 'en un tick de 0,2 s, un ciclo (pedido por los eventos)');
  sinErrores(m);
});

test('sin eventos ni cambios el temporizador no hace ciclos (solo el repaso de cada segundo)', () => {
  const m = conGuia([{ elementos: [RECOGER] }, { elementos: [MANUAL] }]);
  cargar(m);
  m.avanzar(1.2);
  const c0 = ciclos(m);
  m.avanzar(2);
  assert.equal(ciclos(m), c0);
  // El repaso de cada segundo ve lo que no tiene evento (aquí, la cuenta sin BAG_UPDATE_DELAYED) y pide un ciclo.
  m.objeto(159, 10);
  m.avanzar(1.2);
  assert.equal(actual(m), 2);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglos de la ronda 1
// ---------------------------------------------------------------------------------------------------

// Progreso guardado en el paso `id` de la guía de prueba.
const enPaso = (id, extra = {}) => ({ guardado: { SnetForeverPJ: { progreso: { [CLAVE]: { id, ...extra } } } } });

// Activos que ve un oyente de SNF_GUIA_CARGADA (el último).
function vigilarCarga(m) {
  m.lua(`VISTO_CARGA = {}
  SnetForever.Eventos.escuchar("SNF_GUIA_CARGADA", function()
    VISTO_CARGA[#VISTO_CARGA + 1] = SnetForever.Motor.estado().activos
  end)`);
  return () => { const v = m.lua('VISTO_CARGA'); return v[v.length - 1]; };
}

// Plano 1 §5.2.7: S (#sticky sin #completewith) requerido por R (no pegajoso) → S se completa con R.
const CON_VIAL = [
  { etiquetas: { sticky: true, label: 'vial1' }, elementos: [RECOGER] },
  { elementos: [MANUAL] },
  { etiquetas: { requires: 'vial1' }, elementos: [MANUAL] },
  { elementos: [MANUAL] },
  { elementos: [MANUAL] },
];

test('§5.2.7: un #sticky sin completewith requerido por un paso normal se completa con ese paso (etiqueta creada)', () => {
  const m = conGuia(CON_VIAL);
  cargar(m);
  const cw = paso(m, 1).completaCon;
  assert.equal(typeof cw, 'string');
  assert.equal(paso(m, 3).etiqueta, cw, 'R recibe una etiqueta estable');
  assert.deepEqual(activos(m), [1, 2]);
  m.lua('SnetForever.Motor.irA(5)');
  m.avanzar(0.5);
  assert.deepEqual(activos(m), [5], 'irA más allá de R: S no vuelve a estar activo');
  assert.equal(pegajosos(m).p1, true);
  sinErrores(m);

  const aMitad = conGuia(CON_VIAL, {}, enPaso('p5'));
  const visto = vigilarCarga(aMitad);
  cargar(aMitad);
  assert.deepEqual(visto(), [5], 'cargar más allá de R: S no está activo');
  sinErrores(aMitad);
});

test('§5.2.7: gana el primer paso que lo requiere; no toca un sticky con completewith ni lo hace un pegajoso', () => {
  const m = conGuia([
    { etiquetas: { sticky: true, label: 'S' }, elementos: [RECOGER] },
    { etiquetas: { sticky: true, label: 'T', completewith: 'fin' }, elementos: [RECOGER] },
    { etiquetas: { sticky: true, label: 'U' }, elementos: [RECOGER] },
    { etiquetas: { sticky: true, requires: 'U' }, elementos: [MANUAL] },
    { etiquetas: { requires: 'S', label: 'X1' }, elementos: [MANUAL] },
    { etiquetas: { requires: 'S', label: 'X2' }, elementos: [MANUAL] },
    { etiquetas: { requires: 'T', label: 'fin' }, elementos: [MANUAL] },
    { etiquetas: { requires: 'V' }, elementos: [MANUAL] },
    { etiquetas: { sticky: true, label: 'V' }, elementos: [RECOGER] },
  ]);
  cargar(m);
  assert.equal(paso(m, 1).completaCon, 'X1');
  assert.equal(paso(m, 2).completaCon, 'fin');
  assert.equal(paso(m, 3).completaCon, undefined, 'lo requiere un pegajoso');
  assert.equal(paso(m, 9).completaCon, undefined, 'la etiqueta aún no se había visto');
  sinErrores(m);
});

test('§5.2.7: saltar el paso que requiere el sticky ya no deja colgados los siguientes que lo requieren', () => {
  const m = conGuia([
    { etiquetas: { sticky: true, label: 'vial1' }, elementos: [RECOGER] },
    { etiquetas: { requires: 'vial1' }, elementos: [MANUAL] },
    { etiquetas: { requires: 'vial1' }, elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ]);
  cargar(m);
  assert.equal(actual(m), 2);
  assert.equal(paso(m, 2).espera, 'requiere');
  m.lua('SnetForever.Motor.saltar(2)');
  m.avanzar(0.5);
  assert.equal(actual(m), 3);
  assert.equal(paso(m, 3).espera, undefined);
  assert.deepEqual(activos(m), [3]);
  sinErrores(m);
});

test('fin sin siguiente: guarda pasado y tras /reload no vuelve al último paso', () => {
  const m = conGuia([{ elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  marcar(m, 1);
  m.avanzar(0.3);
  marcar(m, 2);
  m.avanzar(0.3);
  assert.equal(estado(m).fin, true);
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].pasado`), true);
  const m2 = m.recargar();
  const visto = vigilarCarga(m2);
  cargar(m2);
  assert.deepEqual(visto(), []);
  m2.avanzar(0.5);
  assert.equal(estado(m2).fin, true);
  assert.deepEqual(activos(m2), []);
  assert.equal(paso(m2, 2).hecho, true);
  sinErrores(m2);
});

test('PLAYER_LEVEL_UP con la guía acabada: sigue en fin y emite un solo SNF_PASOS_CAMBIADOS', () => {
  const m = conGuia([{ elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(m);
  marcar(m, 1);
  m.avanzar(0.3);
  marcar(m, 2);
  m.avanzar(0.6);
  assert.equal(estado(m).fin, true);
  const antes = estado(m).actual;
  m.lua(`CAMBIOS = 0
  SnetForever.Eventos.escuchar("SNF_PASOS_CAMBIADOS", function() CAMBIOS = CAMBIOS + 1 end)`);
  m.disparar('PLAYER_LEVEL_UP', 2);
  assert.equal(estado(m).fin, true);
  m.avanzar(0.6);
  assert.equal(estado(m).fin, true);
  assert.equal(estado(m).actual, antes);
  assert.equal(m.lua('CAMBIOS'), 1);
  sinErrores(m);
});

test('activos al cargar a mitad de guía: sin pegajosos ya cerrados por completewith; el actual saltado tampoco', () => {
  const m = conGuia([
    { etiquetas: { completewith: 'next' }, elementos: [RECOGER] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
    { elementos: [MANUAL] },
  ], {}, enPaso('p4'));
  const visto = vigilarCarga(m);
  cargar(m);
  assert.deepEqual(visto(), [4]);
  assert.equal(registrados(m, 'BAG_UPDATE_DELAYED'), 0, 'el collect cerrado no registra eventos');
  sinErrores(m);

  const s = conGuia([{ elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }, { elementos: [MANUAL] }]);
  cargar(s);
  s.lua('SnetForever.Motor.saltar(3)');
  s.lua('SnetForever.Motor.saltar(1)');
  s.lua('SnetForever.Motor.saltar(2)');
  assert.equal(actual(s), 3);
  assert.deepEqual(activos(s), []);
  actualizar(s);
  assert.equal(actual(s), 4);
  assert.deepEqual(activos(s), [4]);
  sinErrores(s);
});

// T1: un #completewith next delante de un viaje que se da por hecho (lo que hay detrás ya está hecho) se cierra en el
// primer ciclo: queda en progreso.pegajosos, no se activa y no va a saltados.
test('T1: un #completewith next antes de un viaje que se da por hecho se cierra bien', () => {
  const pasos = [
    { etiquetas: { completewith: 'next' }, elementos: [{ t: 'manual', texto: { en: 'Go to the tower', es: 'Ve a la torre' } }] },
    { elementos: [{ t: 'zone', mapa: 1453 }] },
    { elementos: [{ t: 'accept', q: 4641 }] },
    { elementos: [{ t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'objetivo' }] },
    { elementos: [MANUAL] },
  ];
  const m = conGuia(pasos);
  m.estadoMision(4641, { enDiario: true });
  cargar(m);
  assert.equal(actual(m), 4, 'el zone sobra; el goto siguiente tiene detrás un manual');
  assert.ok(!activos(m).includes(1), 'el pegajoso ya no se activa');
  actualizar(m);
  assert.equal(paso(m, 1).hecho, true);
  assert.equal(pegajosos(m).p1, true);
  assert.ok(!activos(m).includes(1));
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  sinErrores(m);

  // Si lo de detrás del viaje tiene trabajo, el viaje manda y el pegajoso sigue activo con él.
  const otro = conGuia(pasos);
  cargar(otro);
  actualizar(otro);
  assert.equal(actual(otro), 2);
  assert.ok(activos(otro).includes(1));
  assert.equal(paso(otro, 1).hecho, false);
  sinErrores(otro);
});
