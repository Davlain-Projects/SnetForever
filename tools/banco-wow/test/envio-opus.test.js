// «El más capaz» (opus): la app le deja hasta 300 s, así que el addon espera más. Con un mensaje mandado con «opus» y con sonido
// hay dos repasos más, a los 240 y 300 s. Desde la tarea 16 el error CHAT_SIN_RESPUESTA llega a los 420 s con todos los
// modelos (las guías de la IA tardan) y sin sonido los repasos son 5, 12, 25, 45, 75, 120, 210, 330 y 405 s (revisión
// final: el de 405 s mira el buzón poco antes del error, para no dejar 90 s sin mirar).
// Los otros modelos no cambian, y una respuesta tardía tras el error se sigue recogiendo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores } from './ayuda.js';

const maquinas = [];
const carpetas = [];
after(() => {
  maquinas.forEach((m) => m.cerrar());
  carpetas.forEach((c) => rmSync(c, { recursive: true, force: true }));
});

function nueva(opciones = {}) {
  const m = crearMaquina({ codificacion: true, ...opciones });
  maquinas.push(m);
  return m;
}

const TIMBRES = ['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar', 'vivo_a', 'vivo_b', 'presente'];
const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;

// Máquina con carpeta de AddOns de verdad (con sonido): los 7 .wav y las ranuras vacías.
function conSonido(ranuras = 6) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-opus-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever', 'senales'), { recursive: true });
  for (const t of TIMBRES) writeFileSync(join(dir, 'SnetForever', 'senales', `${t}.wav`), '');
  for (let i = 1; i <= ranuras; i++) {
    mkdirSync(join(dir, nombreRanura(i)), { recursive: true });
    writeFileSync(join(dir, nombreRanura(i), `${nombreRanura(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\nbuzon.lua\n`);
    writeFileSync(join(dir, nombreRanura(i), 'buzon.lua'), 'SNF_BUZON = nil\n');
  }
  return nueva({ addonsDir: dir });
}

const E = 'SnetForever.Envio';
const enviar = (m, texto) => m.lua(`{${E}.enviar(${JSON.stringify(texto)})}`);
const estado = (m) => m.lua(`${E}.estado()`);
const fase = (m) => estado(m).fase;
const cargas = (m) => m.llamadas('C_AddOns.LoadAddOn').length;
const modelo = (m, valor) => m.lua(`SnetForever.Ajustes.set("ia.modelo", ${JSON.stringify(valor)})`);

function anotar(m) {
  m.lua(`rawset(_G, "EVT", {})
    SnetForever.escuchar("SNF_IA_RESPUESTA", function(r) EVT[#EVT + 1] = "RESPUESTA:" .. tostring(type(r) == "table" and r.msg) end)`);
  return () => m.lua('EVT') || [];
}

// Avanza hasta justo antes y justo después de cada plazo y mira cuántas cargas de repaso van.
function repasos(m, base, desde, plazos) {
  let t = desde;
  plazos.forEach((p, i) => {
    m.avanzar(p - 0.3 - t);
    assert.equal(cargas(m) - base, i, `antes de los ${p} s`);
    assert.equal(fase(m), 'pensando', `antes de los ${p} s`);
    m.avanzar(0.6);
    assert.equal(cargas(m) - base, i + 1, `a los ${p} s`);
    t = p + 0.3;
  });
  return t;
}

test('opus con sonido: repasos a los 60, 150, 240 y 300 s y CHAT_SIN_RESPUESTA a los 420 s', () => {
  const m = conSonido();
  modelo(m, 'opus');
  enviar(m, 'hola');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  const base = cargas(m);
  const t = repasos(m, base, 0, [60, 150, 240, 300]);
  m.avanzar(419.7 - t);
  assert.equal(fase(m), 'pensando');
  m.avanzar(0.6);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  assert.equal(cargas(m) - base, 4);
  sinErrores(m);
});

test('opus sin sonido: repasos a los 5, 12, 25, 45, 75, 120, 210, 330 y 405 s y CHAT_SIN_RESPUESTA a los 420 s', () => {
  const m = nueva({ sonido: false });
  modelo(m, 'opus');
  // La franja solo se ve anclada al hueco del chat (regla de interfaz del 16-nov): sin ancla no da vueltas.
  m.lua('SnetForever.Chat.abrir()');
  const base = cargas(m);
  enviar(m, 'hola');
  m.avanzar(3.2); // 1 parte: 2 vueltas y 3 s, pasa a pensando
  assert.equal(fase(m), 'pensando');
  const t = repasos(m, base, 3.2, [5, 12, 25, 45, 75, 120, 210, 330, 405]);
  m.avanzar(419.7 - t);
  assert.equal(fase(m), 'pensando');
  m.avanzar(0.6);
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  assert.equal(cargas(m) - base, 9);
  sinErrores(m);
});

test('los otros modelos no cambian: con sonnet o un valor raro, dos repasos y error a los 420 s', () => {
  for (const valor of ['sonnet', 'fable']) {
    const m = conSonido();
    modelo(m, valor);
    enviar(m, 'hola');
    m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
    const base = cargas(m);
    m.avanzar(419.7);
    assert.equal(fase(m), 'pensando', valor);
    assert.equal(cargas(m) - base, 2, valor);
    m.avanzar(0.6);
    assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA', valor);
    assert.equal(cargas(m) - base, 2, valor);
    sinErrores(m);
  }
});

test('el plazo es el del modelo con que se mandó: cambiar a opus con el mensaje en camino no lo alarga', () => {
  const m = conSonido();
  enviar(m, 'hola');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  modelo(m, 'opus');
  m.avanzar(420.3);
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  sinErrores(m);
});

test('opus: tras CHAT_SIN_RESPUESTA a los 420 s, una respuesta tardía del mismo id se sigue recogiendo', () => {
  const m = conSonido();
  const eventos = anotar(m);
  modelo(m, 'opus');
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  m.avanzar(421);
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", t = "respuesta", texto = "tarde"})`);
  assert.equal(fase(m), 'libre');
  assert.ok(eventos().includes(`RESPUESTA:${id}`), JSON.stringify(eventos()));
  sinErrores(m);
});
