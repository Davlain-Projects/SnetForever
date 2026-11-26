// Ruta y pines de la IA (ia/ruta.lua) y el fin de parada de la navegación (mapa/navegacion.lua), fase 4, tarea 9.
// Mapa 1411 del banco (src/wow-falso.lua): wx = -2000 - 5000·x/100, wy = 1800 - 3500·y/100, inst 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const Q = 4641;
const mundo1411 = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

// A (recoger), B (objetivo «Jabalí») y C (entregar) de la misma misión, en tres sitios del mapa 1411.
const A = { mapa: 1411, x: 40, y: 20, etiqueta: 'Habla con Garra', tipo: 'recoger', q: Q, seguir: true };
// Lote F: B lleva `objetivo` (su índice en el registro), como lo manda la app: su paso es un complete del objetivo 1.
const B = { mapa: 1411, x: 60, y: 30, etiqueta: 'Caza jabalíes', tipo: 'objetivo', q: Q, obj: 'Jabalí', objetivo: 1, seguir: true };
const C = { mapa: 1411, x: 80, y: 40, etiqueta: 'Vuelve con Garra', tipo: 'entregar', q: Q, seguir: true };

const JABALI = (hecho, terminado = false) => ({ texto: `Jabalí: ${hecho}/8`, hecho, pedido: 8, terminado });

// Ronda 1 del lote F (Menor 5): un objetivo que la base no tiene se ignora. En el banco 4641 no tiene objetivos; aquí
// lleva uno, el «Jabalí» de B, para que B sea un paso de completar (como lo daría la base de verdad).
function maquina(opciones = {}) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 }, ...opciones });
  m.datoMision(Q, { name: 'Your Place In The World', startedBy: [[10176]], finishedBy: [[3143]], requiredLevel: 1,
    questLevel: 1, objectives: [[[3]]], zoneOrSort: 363 });
  return m;
}

function proponer(m, puntos = [A, B, C], titulo = 'Misión de Garra') {
  m.lua(`SnetForever.Ruta.proponer(${aLua({ titulo, puntos })})`);
}

function aceptar(m, puntos, titulo) {
  proponer(m, puntos, titulo);
  return m.lua('SnetForever.Ruta.aceptar()');
}

const ponerEn = (m, x, y, dy = 0) => {
  const w = mundo1411(x, y);
  m.jugador({ mundo: { wx: w.wx, wy: w.wy + dy, inst: 1 } });
};
const destino = (m) => m.lua('SnetForever.Navegacion.destino()');
const ordenDestino = (m) => m.lua('(SnetForever.Navegacion.destino() or {punto = {}}).punto.orden');
const etiquetaDestino = (m) => m.lua('SnetForever.Navegacion.destino().punto.etiqueta');
const comprobar = (m) => m.lua('SnetForever.Navegacion.comprobarLlegada()');
// Lote F: las paradas son pasos de la guía de la ruta, que avanza en el siguiente ciclo del motor.
const ciclo = (m) => m.avanzar(1); // el motor avanza un paso por ciclo de 0,2 s
const xDestino = (m) => (m.lua('SnetForever.Navegacion.destino()') || { punto: {} }).punto.x;
const pasosGuia = (m) => m.lua('#SnetForever.Datos.guia(SnetForever.Motor.estado().clave).pasos');
const etiquetas = (m) => m.lua('(function() local t = {} for i, p in ipairs(SnetForever.Capa.puntos("ia")) do t[i] = p.etiqueta end return t end)()');

// Cuenta los mensajes internos `evento` y guarda el último argumento.
function contar(m, evento) {
  m.lua(`CUENTA_${evento} = {n = 0}
  SnetForever.Eventos.escuchar("${evento}", function(a) CUENTA_${evento}.n = CUENTA_${evento}.n + 1; CUENTA_${evento}.ultimo = a end)`);
  return () => m.lua(`CUENTA_${evento}`);
}

// ---------------------------------------------------------------------------------------------------
// Navegacion.ponerFinDeParada
// ---------------------------------------------------------------------------------------------------

function conRutaDeJugador(m, fnLua) {
  m.lua(`SnetForever.Capa.poner("jugador", {
    {mapa = 1411, inst = 1, wx = ${mundo1411(50, 25).wx}, wy = ${mundo1411(50, 25).wy}, seguir = true, orden = 1, etiqueta = "Aquí"},
    {mapa = 1411, inst = 1, wx = ${mundo1411(80, 25).wx}, wy = ${mundo1411(80, 25).wy}, seguir = true, orden = 2, etiqueta = "Allí"}})
  SnetForever.Navegacion.ponerFinDeParada(${fnLua})`);
}

test('fin de parada: fn(p) == true salta la parada; la ruta sigue en la siguiente', () => {
  const m = maquina();
  conRutaDeJugador(m, 'function(p) return p.etiqueta == "Aquí" or nil end');
  assert.equal(m.lua('SnetForever.Navegacion.destino().punto.etiqueta'), 'Allí');
  sinErrores(m);
});

test('fin de parada: fn(p) == false no deja alcanzar la parada por distancia (a 0 yd)', () => {
  const m = maquina();
  conRutaDeJugador(m, 'function(p) if p.etiqueta == "Aquí" then return false end end');
  assert.ok(m.lua('SnetForever.Navegacion.destino().distancia') < 2);
  const llegadas = contar(m, 'SNF_LLEGADA');
  comprobar(m);
  assert.equal(llegadas().n, 0);
  assert.equal(m.lua('SnetForever.Navegacion.destino().punto.etiqueta'), 'Aquí');
  sinErrores(m);
});

test('fin de parada: fn(p) == nil se alcanza por distancia como siempre', () => {
  const m = maquina();
  conRutaDeJugador(m, 'function() return nil end');
  const llegadas = contar(m, 'SNF_LLEGADA');
  comprobar(m);
  assert.equal(llegadas().n, 1);
  assert.equal(m.lua('SnetForever.Navegacion.destino().punto.etiqueta'), 'Allí');
  sinErrores(m);
});

test('fin de parada: sin función puesta (nil) todo va por distancia', () => {
  const m = maquina();
  conRutaDeJugador(m, 'nil');
  comprobar(m);
  assert.equal(m.lua('SnetForever.Navegacion.destino().punto.etiqueta'), 'Allí');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// aceptar, proponer, descartar
// ---------------------------------------------------------------------------------------------------

test('proponer emite SNF_IA_PROPUESTA y pendiente() la devuelve; no toca la capa', () => {
  const m = maquina();
  const emitida = contar(m, 'SNF_IA_PROPUESTA');
  assert.equal(m.lua('SnetForever.Ruta.pendiente()'), undefined);
  proponer(m);
  assert.equal(emitida().n, 1);
  assert.equal(emitida().ultimo.titulo, 'Misión de Garra');
  assert.equal(m.lua('#SnetForever.Ruta.pendiente().puntos'), 3);
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("ia")'), []);
  sinErrores(m);
});

test('aceptar: la capa «ia» recibe los puntos con orden 1-3 y etiquetas «1. …», sin seguir (lote F: la flecha va con la guía de la ruta); el destino es A', () => {
  const m = maquina();
  assert.equal(aceptar(m), true);
  assert.equal(m.lua('SnetForever.Ruta.pendiente()'), undefined);
  const puntos = m.lua('SnetForever.Capa.puntos("ia")');
  assert.equal(puntos.length, 3);
  assert.deepEqual(puntos.map((p) => p.orden), [1, 2, 3]);
  assert.deepEqual(puntos.map((p) => p.seguir === true), [false, false, false]);
  assert.deepEqual(puntos.map((p) => p.origen), ['ia', 'ia', 'ia']);
  assert.deepEqual(puntos.map((p) => p.etiqueta), ['1. Habla con Garra', '2. Caza jabalíes', '3. Vuelve con Garra']);
  assert.equal(pasosGuia(m), 3);
  assert.equal(destino(m).punto.origen, 'guia');
  assert.equal(ordenDestino(m), 1);
  assert.equal(xDestino(m), 40);
  sinErrores(m);
});

test('aceptar sin propuesta pendiente da false y no toca nada; aceptar es de una sola vez', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.Ruta.aceptar()'), false);
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("ia")'), []);
  aceptar(m);
  assert.equal(m.lua('SnetForever.Ruta.aceptar()'), false);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 3);
  sinErrores(m);
});

test('aceptar: los pines (seguir = false) quedan en la capa pero no son pasos de la guía de la ruta', () => {
  const m = maquina();
  aceptar(m, [A, { ...B, seguir: false }, C]);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 3);
  assert.equal(m.lua('SnetForever.Capa.ruta()'), undefined, 'la capa ya no es una ruta que siga la flecha');
  assert.equal(pasosGuia(m), 2);
  sinErrores(m);
});

test('aceptar quita los puntos sin sitio (sin mapa o sin coordenadas) y numera los que quedan', () => {
  const m = maquina();
  aceptar(m, [{ etiqueta: 'sin mapa', tipo: 'lugar', seguir: true }, A, { mapa: 1411, etiqueta: 'sin x', tipo: 'lugar' }, C]);
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("ia")').map((p) => p.etiqueta), ['1. Habla con Garra', '2. Vuelve con Garra']);
  sinErrores(m);
});

test('descartar quita la propuesta pendiente y no toca la capa', () => {
  const m = maquina();
  aceptar(m);
  proponer(m, [A], 'Otra');
  m.lua('SnetForever.Ruta.descartar()');
  assert.equal(m.lua('SnetForever.Ruta.pendiente()'), undefined);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 3);
  sinErrores(m);
});

test('quitar deja la capa «ia» vacía, borra lo guardado y emite SNF_PUNTOS_CAMBIADOS("ia")', () => {
  const m = maquina();
  aceptar(m);
  assert.equal(m.lua('type(SnetForeverPJ.ia.ruta)'), 'table');
  m.lua('ORIGENES = {}; SnetForever.Eventos.escuchar("SNF_PUNTOS_CAMBIADOS", function(o) ORIGENES[#ORIGENES + 1] = o end)');
  m.lua('SnetForever.Ruta.quitar()');
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("ia")'), []);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta'), undefined);
  assert.ok(m.lua('ORIGENES').includes('ia'));
  assert.notEqual(m.lua('(SnetForever.Navegacion.destino() or {punto = {}}).punto.origen'), 'ia');
  assert.ok(!String(m.lua('SnetForever.Motor.estado().clave')).startsWith('IA\\'), 'su guía ya no está abierta');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// hecho y progreso (R7)
// ---------------------------------------------------------------------------------------------------

test('hecho: recoger es true con la misión en el diario (o entregada) y false si no', () => {
  const m = maquina();
  aceptar(m);
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[1])'), false);
  m.estadoMision(Q, { enDiario: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[1])'), true);
  m.estadoMision(Q, { entregada: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[1])'), true);
  sinErrores(m);
});

test('hecho: entregar es true solo con la misión entregada', () => {
  const m = maquina();
  aceptar(m);
  m.estadoMision(Q, { enDiario: true, completa: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[3])'), false);
  m.estadoMision(Q, { entregada: true });
  m.disparar('QUEST_TURNED_IN', Q);
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[3])'), true);
  sinErrores(m);
});

test('hecho: lugar da nil (se alcanza por distancia) y un punto ajeno también', () => {
  const m = maquina();
  aceptar(m, [{ mapa: 1411, x: 60, y: 30, etiqueta: 'Mira', tipo: 'lugar', seguir: true }]);
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[1])'), undefined);
  assert.equal(m.lua('SnetForever.Ruta.hecho({tipo = "goto", q = 4641})'), undefined);
  sinErrores(m);
});

test('hecho: objetivo con el objetivo «Jabalí» terminado, o con la misión completa, es true', () => {
  const m = maquina();
  aceptar(m);
  const hechoB = () => m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[2])');
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(2)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(hechoB(), false);
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(8, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(hechoB(), true);
  m.estadoMision(Q, { enDiario: true, completa: true, objetivos: [JABALI(2)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(hechoB(), true);
  sinErrores(m);
});

test('hecho: un obj que no coincide con ningún objetivo hace que cuente Misiones.completa(q)', () => {
  const m = maquina();
  aceptar(m, [A, { ...B, obj: 'Lobo' }, C]);
  const hechoB = () => m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[2])');
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(8, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(hechoB(), false);
  m.estadoMision(Q, { enDiario: true, completa: true, objetivos: [JABALI(8, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(hechoB(), true);
  sinErrores(m);
});

test('progreso: recoger, objetivo (con y sin obj) y entregar', () => {
  const m = maquina();
  aceptar(m, [A, B, { ...B, obj: undefined, etiqueta: 'Todo' }, C]);
  const progreso = (i) => m.lua(`SnetForever.Ruta.progreso(SnetForever.Capa.puntos("ia")[${i}])`);
  assert.match(progreso(1), /Por recoger|To pick up/);
  assert.match(progreso(4), /Falta completarla|Not complete yet/);
  m.estadoMision(Q, {
    enDiario: true,
    objetivos: [{ texto: 'Pata de lobo: 3/8', hecho: 3, pedido: 8, terminado: false }, JABALI(2)],
  });
  m.disparar('QUEST_LOG_UPDATE');
  assert.match(progreso(1), /En el registro|In the quest log/);
  assert.equal(progreso(2), 'Jabalí: 2/8');
  assert.equal(progreso(3), 'Pata de lobo: 3/8; Jabalí: 2/8');
  m.estadoMision(Q, { enDiario: true, completa: true, objetivos: [JABALI(8, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.match(progreso(4), /Lista para entregar|Ready to turn in/);
  sinErrores(m);
});

test('progreso: un objetivo sin números en el texto lleva «hecho/pedido» solo si pide más de uno', () => {
  const m = maquina();
  aceptar(m, [{ ...B, obj: undefined }]);
  m.estadoMision(Q, { enDiario: true, objetivos: [{ texto: 'Jabalí', hecho: 2, pedido: 8, terminado: false }, { texto: 'Habla con Garra', hecho: 0, pedido: 1, terminado: false }] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(m.lua('SnetForever.Ruta.progreso(SnetForever.Capa.puntos("ia")[1])'), 'Jabalí: 2/8; Habla con Garra');
  assert.equal(m.lua('SnetForever.Ruta.progreso({tipo = "lugar"})'), undefined);
  assert.equal(m.lua('SnetForever.Ruta.progreso({tipo = "objetivo", q = 99999})'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Eventos de misión: etiquetas, destino y fin
// ---------------------------------------------------------------------------------------------------

test('QUEST_ACCEPTED: el destino pasa a B y su etiqueta lleva «Jabalí: 2/8»; son los mismos puntos y se emite SNF_PUNTOS_CAMBIADOS("ia")', () => {
  const m = maquina();
  aceptar(m);
  m.lua('PUNTO_B = SnetForever.Capa.puntos("ia")[2]');
  const cambios = contar(m, 'SNF_PUNTOS_CAMBIADOS');
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(2)] });
  m.disparar('QUEST_ACCEPTED', 1, Q);
  assert.equal(m.lua('SnetForever.Capa.puntos("ia")[2] == PUNTO_B'), true);
  assert.match(etiquetas(m)[1], /^2\. Caza jabalíes — Jabalí: 2\/8$/);
  assert.match(etiquetas(m)[0], /^1\. Habla con Garra — (En el registro|In the quest log)$/);
  assert.ok(cambios().n >= 1);
  ciclo(m);
  assert.equal(ordenDestino(m), 2);
  assert.equal(xDestino(m), 60);
  sinErrores(m);
});

test('con el jugador encima de B (0 yd) y el objetivo sin hacer, B no se alcanza', () => {
  const m = maquina();
  aceptar(m);
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(2)] });
  m.disparar('QUEST_ACCEPTED', 1, Q);
  ciclo(m);
  ponerEn(m, 60, 30);
  assert.ok(destino(m).distancia < 2);
  comprobar(m);
  comprobar(m);
  ciclo(m);
  assert.equal(ordenDestino(m), 2);
  assert.equal(xDestino(m), 60);
  sinErrores(m);
});

test('el objetivo terminado lleva a C; entregada emite SNF_IA_RUTA_TERMINADA una sola vez', () => {
  const m = maquina();
  aceptar(m);
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(2)] });
  m.disparar('QUEST_ACCEPTED', 1, Q);
  ciclo(m);
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(8, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(ordenDestino(m), 3);
  assert.equal(terminada().n, 0);
  m.estadoMision(Q, { entregada: true });
  m.disparar('QUEST_TURNED_IN', Q);
  ciclo(m);
  assert.equal(terminada().n, 1);
  m.disparar('QUEST_LOG_UPDATE');
  m.disparar('UNIT_QUEST_LOG_CHANGED', 'player');
  ciclo(m);
  assert.equal(terminada().n, 1);
  assert.notEqual(m.lua('(SnetForever.Navegacion.destino() or {punto = {}}).punto.origen'), 'ia');
  sinErrores(m);
});

test('UNIT_QUEST_LOG_CHANGED solo cuenta para «player»', () => {
  const m = maquina();
  aceptar(m);
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(2)] });
  const cambios = contar(m, 'SNF_PUNTOS_CAMBIADOS');
  m.disparar('UNIT_QUEST_LOG_CHANGED', 'party1');
  assert.equal(cambios().n, 0);
  m.disparar('UNIT_QUEST_LOG_CHANGED', 'player');
  assert.equal(cambios().n, 1);
  assert.match(etiquetas(m)[1], /Jabalí: 2\/8/);
  sinErrores(m);
});

test('QUEST_LOG_UPDATE y QUEST_TURNED_IN también reescriben las etiquetas', () => {
  const m = maquina();
  aceptar(m);
  m.estadoMision(Q, { enDiario: true, completa: true, objetivos: [JABALI(8, true)] });
  m.disparar('QUEST_LOG_UPDATE');
  assert.match(etiquetas(m)[2], /^3\. Vuelve con Garra — (Lista para entregar|Ready to turn in)$/);
  sinErrores(m);
});

test('sin ruta, los eventos de misión no emiten nada', () => {
  const m = maquina();
  const cambios = contar(m, 'SNF_PUNTOS_CAMBIADOS');
  m.disparar('QUEST_LOG_UPDATE');
  m.disparar('QUEST_ACCEPTED', 1, Q);
  assert.equal(cambios().n, 0);
  sinErrores(m);
});

test('una parada «lugar» se alcanza a 10 yd o menos (y no a más) y termina la ruta', () => {
  const m = maquina();
  aceptar(m, [{ mapa: 1411, x: 60, y: 30, etiqueta: 'Mira', tipo: 'lugar', seguir: true }]);
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  ponerEn(m, 60, 30, 11);
  comprobar(m);
  ciclo(m);
  assert.equal(terminada().n, 0);
  assert.equal(ordenDestino(m), 1);
  ponerEn(m, 60, 30, 9);
  comprobar(m);
  ciclo(m);
  assert.equal(terminada().n, 1);
  comprobar(m);
  ciclo(m);
  assert.equal(terminada().n, 1);
  sinErrores(m);
});

test('la ruta mixta termina cuando se cumplen las de misión y se alcanzan las de lugar', () => {
  const m = maquina();
  aceptar(m, [{ mapa: 1411, x: 60, y: 30, etiqueta: 'Mira', tipo: 'lugar', seguir: true }, C]);
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  m.estadoMision(Q, { entregada: true });
  m.disparar('QUEST_TURNED_IN', Q);
  ciclo(m);
  assert.equal(terminada().n, 0);
  ponerEn(m, 60, 30, 3);
  comprobar(m);
  ciclo(m);
  assert.equal(terminada().n, 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Guardado y recuperación
// ---------------------------------------------------------------------------------------------------

test('aceptar guarda la ruta en SnetForeverPJ.ia.ruta con las etiquetas sin numerar', () => {
  const m = maquina();
  aceptar(m);
  const ruta = m.lua('SnetForeverPJ.ia.ruta');
  assert.equal(ruta.titulo, 'Misión de Garra');
  assert.deepEqual(ruta.puntos.map((p) => p.etiqueta), ['Habla con Garra', 'Caza jabalíes', 'Vuelve con Garra']);
  assert.deepEqual(ruta.puntos.map((p) => p.tipo), ['recoger', 'objetivo', 'entregar']);
  assert.equal(ruta.puntos[1].obj, 'Jabalí');
  assert.equal(ruta.puntos[1].q, Q);
  sinErrores(m);
});

test('recargar() recupera la ruta con su estado', () => {
  let m = maquina();
  aceptar(m);
  m.estadoMision(Q, { enDiario: true, objetivos: [JABALI(2)] });
  m.disparar('QUEST_ACCEPTED', 1, Q);
  ciclo(m);
  m = m.recargar();
  ciclo(m);
  const puntos = m.lua('SnetForever.Capa.puntos("ia")');
  assert.equal(puntos.length, 3);
  assert.deepEqual(puntos.map((p) => p.orden), [1, 2, 3]);
  assert.equal(ordenDestino(m), 2);
  assert.equal(xDestino(m), 60);
  assert.match(etiquetas(m)[1], /^2\. Caza jabalíes — Jabalí: 2\/8$/);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta.puntos[2].etiqueta'), 'Caza jabalíes');
  sinErrores(m);
});

test('recargar() tras terminar la ruta no la vuelve a anunciar', () => {
  let m = maquina();
  aceptar(m);
  m.estadoMision(Q, { entregada: true });
  m.disparar('QUEST_TURNED_IN', Q);
  ciclo(m);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta.terminada'), true);
  m = m.recargar();
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(terminada().n, 0);
  sinErrores(m);
});

test('recargar() tras quitar() no trae nada', () => {
  let m = maquina();
  aceptar(m);
  m.lua('SnetForever.Ruta.quitar()');
  m = m.recargar();
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("ia")'), []);
  sinErrores(m);
});

test('una ruta guardada rota (sin puntos o con basura) se ignora sin error', () => {
  const m = nuevaMaquina({
    jugador: { mapa: 1411, x: 50, y: 25 },
    guardado: { SnetForeverPJ: { esquema: 1, ia: { ruta: { titulo: 'x', puntos: [1, 'a', { etiqueta: 'sin sitio' }] } } } },
  });
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("ia")'), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1
// ---------------------------------------------------------------------------------------------------

const LUGAR = { mapa: 1411, x: 60, y: 30, etiqueta: 'Mira', tipo: 'lugar', seguir: true };

test('ronda 1: llegar al lugar, un QUEST_LOG_UPDATE y entregar la misión dan exactamente un SNF_IA_RUTA_TERMINADA', () => {
  const m = maquina();
  aceptar(m, [LUGAR, C]);
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  ponerEn(m, 60, 30, 3);
  comprobar(m);
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(terminada().n, 0);
  m.estadoMision(Q, { entregada: true });
  m.disparar('QUEST_TURNED_IN', Q);
  ciclo(m);
  assert.equal(terminada().n, 1);
  sinErrores(m);
});

test('ronda 1: las paradas de lugar alcanzadas se guardan (el progreso de la guía de la ruta) y sobreviven a /reload', () => {
  let m = maquina();
  aceptar(m, [LUGAR, C]);
  ponerEn(m, 60, 30, 3);
  comprobar(m);
  ciclo(m);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2);
  m = m.recargar();
  ciclo(m);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2);
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  m.estadoMision(Q, { entregada: true });
  m.disparar('QUEST_TURNED_IN', Q);
  ciclo(m);
  assert.equal(terminada().n, 1);
  sinErrores(m);
});

// Tarea 11 (aparcado de la tarea 9): tras /reload, una parada `lugar` ya alcanzada da hecho() = true y la flecha no vuelve
// a ella.
test('tarea 11: tras /reload una parada «lugar» ya alcanzada sigue hecha y la flecha sigue con la siguiente', () => {
  let m = maquina();
  aceptar(m, [LUGAR, C]);
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("ia")[1])'), undefined, 'un lugar no tiene fin por misión');
  ponerEn(m, 60, 30, 3);
  comprobar(m);
  ciclo(m);
  ponerEn(m, 50, 25);
  m = m.recargar();
  ciclo(m);
  assert.equal(ordenDestino(m), 2);
  assert.equal(xDestino(m), 80);
  sinErrores(m);
});

test('ronda 1: tope de lo guardado: 40 puntos, etiqueta y obj de 120 bytes, título de 80, sin partir UTF-8', () => {
  const m = maquina();
  const largo = 'é'.repeat(100); // 200 bytes
  const puntos = Array.from({ length: 50 }, (_, i) => ({ mapa: 1411, x: 10 + i, y: 20, etiqueta: largo, obj: largo, tipo: 'objetivo', q: Q, seguir: true }));
  aceptar(m, puntos, 'ñ'.repeat(100));
  const ruta = m.lua('SnetForeverPJ.ia.ruta');
  assert.equal(ruta.puntos.length, 40);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 40);
  const bytes = (s) => Buffer.byteLength(s, 'utf8');
  assert.equal(bytes(ruta.puntos[0].etiqueta), 120);
  assert.equal(bytes(ruta.puntos[0].obj), 120);
  assert.equal(bytes(ruta.titulo), 80);
  assert.ok(!ruta.puntos[0].etiqueta.includes('�') && !ruta.titulo.includes('�'));
  const impar = 'a' + 'é'.repeat(100); // el corte en 120 cae en medio de una «é»
  aceptar(m, [{ ...LUGAR, etiqueta: impar }]);
  const e = m.lua('SnetForeverPJ.ia.ruta.puntos[1].etiqueta');
  assert.equal(bytes(e), 119);
  assert.ok(!e.includes('�'));
  sinErrores(m);
});

test('ronda 1: hecho da nil si el punto no es de la capa «ia» (aunque lleve tipo y q)', () => {
  const m = maquina();
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 50, y = 25, tipo = "recoger", q = ${Q}, seguir = true}})`);
  m.estadoMision(Q, { enDiario: true });
  assert.equal(m.lua('SnetForever.Ruta.hecho(SnetForever.Capa.puntos("jugador")[1])'), undefined);
  sinErrores(m);
});

test('ronda 1: si la capa «ia» se vacía desde fuera, se limpian la ruta y lo guardado', () => {
  const m = maquina();
  aceptar(m);
  m.lua('SnetForever.Capa.quitar("ia")');
  assert.equal(m.lua('SnetForeverPJ.ia.ruta'), undefined);
  const cambios = contar(m, 'SNF_PUNTOS_CAMBIADOS');
  m.estadoMision(Q, { enDiario: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(cambios().n, 0);
  sinErrores(m);
});

test('ronda 1: QUEST_REMOVED también reescribe las etiquetas', () => {
  const m = maquina();
  aceptar(m);
  m.estadoMision(Q, { enDiario: true });
  m.disparar('QUEST_LOG_UPDATE');
  assert.match(etiquetas(m)[0], /(En el registro|In the quest log)$/);
  m.estadoMision(Q, { enDiario: false });
  m.disparar('QUEST_REMOVED', Q);
  assert.match(etiquetas(m)[0], /(Por recoger|To pick up)$/);
  sinErrores(m);
});

test('ronda 1: SNF_PUNTOS_CAMBIADOS("ia") solo sale si alguna etiqueta cambió', () => {
  const m = maquina();
  aceptar(m);
  const cambios = contar(m, 'SNF_PUNTOS_CAMBIADOS');
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(cambios().n, 1); // de «1. …» a «1. … — Por recoger»
  m.disparar('QUEST_LOG_UPDATE');
  m.disparar('UNIT_QUEST_LOG_CHANGED', 'player');
  assert.equal(cambios().n, 1);
  sinErrores(m);
});

test('ronda 1: aceptar con todas las paradas ya hechas termina la ruta enseguida, con un solo evento', () => {
  const m = maquina();
  m.estadoMision(Q, { entregada: true });
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  aceptar(m);
  ciclo(m);
  assert.equal(terminada().n, 1);
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(terminada().n, 1);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta.terminada'), true);
  sinErrores(m);
});

test('ronda 1: recuperar con todas las paradas hechas termina la ruta una vez; si ya estaba terminada, no la repite', () => {
  let m = maquina();
  aceptar(m);
  m.lua('SnetForeverPJ.ia.ruta.terminada = nil'); // como si se hubiera guardado antes de terminar
  m.estadoMision(Q, { entregada: true });
  m = m.recargar();
  ciclo(m);
  // al cargar su guía todos los pasos están hechos: la ruta quedó terminada y guardada
  assert.equal(m.lua('SnetForeverPJ.ia.ruta.terminada'), true);
  const terminada = contar(m, 'SNF_IA_RUTA_TERMINADA');
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(terminada().n, 0);
  m = m.recargar();
  const otra = contar(m, 'SNF_IA_RUTA_TERMINADA');
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(otra().n, 0);
  sinErrores(m);
});

test('ronda 1: SnetForever.RutaIA es el mismo módulo que SnetForever.Ruta', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.RutaIA == SnetForever.Ruta'), true);
  sinErrores(m);
});
