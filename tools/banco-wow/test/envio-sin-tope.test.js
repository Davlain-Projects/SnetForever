// Turno largo con TATI: el addon deja de cortar por tiempo total mientras conste que el turno sigue (pulsos de «recibido»
// con sonido, cabecera `turno` sin sonido) y se puede parar desde el chat. Sin ninguna señal, todo como antes (420 s).
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

function conRanuras(opciones = {}, ranuras = 20) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-sin-tope-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever', 'senales'), { recursive: true });
  for (const t of TIMBRES) writeFileSync(join(dir, 'SnetForever', 'senales', `${t}.wav`), '');
  for (let i = 1; i <= ranuras; i++) {
    mkdirSync(join(dir, nombreRanura(i)), { recursive: true });
    writeFileSync(join(dir, nombreRanura(i), `${nombreRanura(i)}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\nbuzon.lua\n');
    writeFileSync(join(dir, nombreRanura(i), 'buzon.lua'), 'SNF_BUZON = nil\n');
  }
  return nueva({ addonsDir: dir, ...opciones });
}
const conSonido = () => conRanuras();
// Con sonido, el chat abierto y la app con TATI como cerebro desde antes de enviar.
function tatiConSonido() {
  const m = conRanuras();
  m.lua('SnetForever.Chat.abrir()');
  cabecera(m, '{motorNombre = "tati", sabeParar = true}');
  return m;
}

const E = 'SnetForever.Envio';
const enviar = (m, texto = 'hola') => m.lua(`{${E}.enviar(${JSON.stringify(texto)})}`);
const estado = (m) => m.lua(`${E}.estado()`);
const fase = (m) => estado(m).fase;
const cargas = (m) => m.llamadas('C_AddOns.LoadAddOn').length;
const pulsoCrudo = (m, paridad = 'impar') => m.lua(`SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "${paridad}")`);
// El pulso y, si la franja está a la vista, lo que tarda en dar su primera vuelta (hasta entonces el acuse queda pendiente).
const pulso = (m, paridad = 'impar') => {
  pulsoCrudo(m, paridad);
  for (let i = 0; i < 4 && fase(m) === 'enviando' && m.lua('SnetForever.Franja.visible()'); i++) m.avanzar(0.6);
};
const cabecera = (m, campos) => m.lua(`SnetForever.Buzon.estadoApp = function() return ${campos} end`);
const registro = (m, id, resto) => m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", ${resto}})`);

// Con sonido, en pensando y con pulsos cada 30 s durante `segundos`.
function conPulsos(m, segundos) {
  for (let t = 30; t <= segundos; t += 30) {
    m.avanzar(30);
    pulso(m);
  }
}

test('con sonido: un turno de 600 s con pulsos no se corta ni gasta ranuras', () => {
  const m = tatiConSonido();
  enviar(m);
  pulso(m); // el «recibido»: pasa a pensando y no cuenta como vida
  assert.equal(fase(m), 'pensando');
  assert.equal(estado(m).sigue, undefined, 'el primero no es señal de vida');
  const base = cargas(m);
  conPulsos(m, 600);
  assert.equal(fase(m), 'pensando');
  assert.equal(cargas(m) - base, 0, 'con pulsos no hay repasos');
  assert.ok(estado(m).sigue >= 600, JSON.stringify(estado(m)));
  sinErrores(m);
});

test('con sonido: la paridad contraria no es señal de vida', () => {
  const m = tatiConSonido();
  enviar(m);
  pulso(m);
  m.avanzar(30);
  pulso(m, 'par');
  assert.equal(estado(m).sigue, undefined);
  sinErrores(m);
});

test('app cerrada a mitad: 90 s sin pulso dan CHAT_SIN_APP y la respuesta tardía se recoge', () => {
  const m = tatiConSonido();
  enviar(m);
  const id = estado(m).id;
  pulso(m);
  conPulsos(m, 120);
  m.avanzar(89.5);
  assert.equal(fase(m), 'pensando');
  m.avanzar(1);
  assert.equal(estado(m).detalle, 'CHAT_SIN_APP');
  registro(m, id, 't = "respuesta", texto = "tarde"');
  assert.equal(fase(m), 'libre');
  sinErrores(m);
});

test('sin ningún pulso de vida, todo como antes: CHAT_SIN_RESPUESTA a los 420 s', () => {
  const m = conSonido();
  enviar(m);
  pulso(m);
  const base = cargas(m);
  m.avanzar(419.7);
  assert.equal(fase(m), 'pensando');
  assert.equal(cargas(m) - base, 2, 'los repasos de siempre');
  m.avanzar(0.6);
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  sinErrores(m);
});

function sinSonido(crear = () => nueva({ sonido: false })) {
  const m = crear();
  m.lua('SnetForever.Chat.abrir()');
  enviar(m);
  m.avanzar(3.2);
  assert.equal(fase(m), 'pensando');
  return m;
}

test('sin sonido: con la cabecera no se corta a los 420 s y repasa cada 90 s', () => {
  const m = sinSonido(() => conRanuras({ sonido: false }));
  cabecera(m, `{motorNombre = "tati", turno = "${estado(m).id}"}`);
  const base = cargas(m);
  m.avanzar(410);
  assert.equal(cargas(m) - base, 9, 'la tabla');
  m.avanzar(70); // 483 s
  assert.equal(fase(m), 'pensando');
  assert.equal(cargas(m) - base, 9);
  m.avanzar(15); // 498 s
  assert.equal(cargas(m) - base, 10, 'el de los 495 s');
  m.avanzar(90);
  assert.equal(cargas(m) - base, 11);
  assert.equal(fase(m), 'pensando');
  assert.ok(estado(m).sigue >= 580);
  sinErrores(m);
});

test('sin sonido: sin ranuras de las que la app escribió, CHAT_SIN_RESPUESTA', () => {
  const m = sinSonido(() => conRanuras({ sonido: false }));
  cabecera(m, `{motorNombre = "tati", turno = "${estado(m).id}"}`);
  for (let i = 0; i < 14 && fase(m) === 'pensando'; i++) m.avanzar(90);
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  assert.equal(m.lua('SnetForever.Buzon.proxima()'), 16, 'la última de las escritas queda sin gastar');
  sinErrores(m);
});

test('sin sonido: si la ranura no se puede cargar, una cabecera vieja no lo deja esperando para siempre', () => {
  const m = sinSonido(); // sin carpeta de AddOns: ninguna ranura carga
  cabecera(m, `{motorNombre = "tati", turno = "${estado(m).id}"}`);
  m.avanzar(500);
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  sinErrores(m);
});

test('sin sonido y con la cabecera de otro mensaje: 420 s como siempre', () => {
  const m = sinSonido();
  cabecera(m, '{motorNombre = "tati", turno = "otra-1"}');
  m.avanzar(417.5);
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  sinErrores(m);
});

test('la barra cambia como mucho una vez por minuto', () => {
  const m = tatiConSonido();
  m.lua('rawset(_G, "SIGUES", 0) SnetForever.escuchar("SNF_IA_SIGUE", function() SIGUES = SIGUES + 1 end)');
  enviar(m);
  pulso(m);
  conPulsos(m, 300);
  const n = m.lua('SIGUES');
  assert.ok(n >= 4 && n <= 5, `${n} repintados en 5 min`);
  sinErrores(m);
});

test('puedeParar: solo en pensando y con un mensaje mandado a TATI', () => {
  const m = tatiConSonido();
  assert.equal(m.lua(`${E}.puedeParar()`), false, 'libre');
  enviar(m);
  assert.equal(m.lua(`${E}.puedeParar()`), false, 'enviando');
  pulso(m);
  assert.equal(m.lua(`${E}.puedeParar()`), true);
  sinErrores(m);
  const c = conRanuras();
  c.lua('SnetForever.Chat.abrir()');
  cabecera(c, '{motorNombre = "claude", sabeParar = true}');
  enviar(c);
  pulso(c);
  assert.equal(c.lua(`${E}.puedeParar()`), false, 'con Claude no');
  assert.equal(c.lua(`${E}.parar()`), false);
  assert.equal(estado(c).parando, undefined);
  sinErrores(c);
});

test('parar: enseña la franja sin gastar ranura, la oculta y el registro detenido deja la fase en libre', () => {
  const m = tatiConSonido();
  enviar(m);
  const id = estado(m).id;
  pulso(m);
  m.lua('rawset(_G, "PARTES", nil) local o = SnetForever.Franja.mostrar; SnetForever.Franja.mostrar = function(p, b, x) PARTES = {p[1], b, x and x.sinAviso}; return o(p, b, x) end');
  const base = cargas(m);
  assert.equal(m.lua(`${E}.parar()`), true);
  const [carga, trama, sinAviso] = m.lua('PARTES');
  assert.ok(carga.includes('"tipo":"parar"') || carga.split('\x1f')[2].includes('-P1'), carga);
  assert.ok(carga.split('\x1f')[2].endsWith('-P1'));
  assert.ok(trama >= 49152, String(trama));
  assert.equal(sinAviso, true);
  assert.equal(estado(m).parando, true);
  assert.equal(m.lua(`${E}.puedeParar()`), false, 'mientras para');
  assert.equal(m.lua('SnetForever.Franja.visible()'), true);
  m.avanzar(3.2);
  assert.equal(m.lua('SnetForever.Franja.visible()'), false, 'se oculta tras 2 vueltas y 3 s');
  assert.equal(cargas(m) - base, 0);
  registro(m, id, 't = "error", tipo = "detenido", texto = "Parado"');
  assert.equal(fase(m), 'libre');
  assert.equal(estado(m).detalle, undefined);
  assert.equal(estado(m).parando, undefined);
  sinErrores(m);
});

test('parar sin respuesta: a los 30 s suelta con CHAT_PARADO_SIN_CONFIRMAR y una respuesta tardía se recoge', () => {
  const m = tatiConSonido();
  enviar(m);
  const id = estado(m).id;
  pulso(m);
  m.lua(`${E}.parar()`);
  m.avanzar(29.5);
  assert.equal(fase(m), 'pensando');
  m.avanzar(1);
  assert.equal(estado(m).detalle, 'CHAT_PARADO_SIN_CONFIRMAR');
  registro(m, id, 't = "respuesta", texto = "tarde"');
  assert.equal(fase(m), 'libre');
  sinErrores(m);
});

test('parar justo antes de los 420 s sin pulsos: manda la espera de parar', () => {
  const m = tatiConSonido();
  enviar(m);
  pulso(m);
  m.avanzar(410);
  m.lua(`${E}.parar()`);
  m.avanzar(15); // 425 s
  assert.equal(fase(m), 'pensando');
  m.avanzar(16);
  assert.equal(estado(m).detalle, 'CHAT_PARADO_SIN_CONFIRMAR');
  sinErrores(m);
});

test('ronda1 p1: un pulso con 0 vueltas queda pendiente y no oculta la franja hasta la primera vuelta', () => {
  const m = conRanuras();
  m.lua('SnetForever.Chat.abrir()');
  enviar(m);
  assert.equal(m.lua('SnetForever.Franja.vueltas()'), 0);
  pulsoCrudo(m);
  assert.equal(fase(m), 'enviando', 'la app aún no ha podido leerlo entero');
  assert.equal(m.lua('SnetForever.Franja.visible()'), true);
  for (let i = 0; i < 40 && fase(m) === 'enviando'; i++) m.avanzar(0.25);
  assert.equal(fase(m), 'pensando', 'el acuse no se pierde');
  assert.ok(m.lua('SnetForever.Franja.vueltas()') >= 1);
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
  sinErrores(m);
});

test('ronda1 p1: con el acuse pendiente y el chat cerrado no salta CHAT_SIN_APP; al reabrir sigue', () => {
  const m = conRanuras();
  m.lua('SnetForever.Chat.abrir()');
  enviar(m);
  pulsoCrudo(m);
  m.lua('SnetForeverChat:Hide()');
  m.avanzar(46);
  assert.equal(fase(m), 'enviando');
  assert.equal(typeof estado(m).detalle === 'string', false, JSON.stringify(estado(m).detalle));
  m.lua('SnetForeverChat:Show()');
  for (let i = 0; i < 40 && fase(m) === 'enviando'; i++) m.avanzar(0.25);
  assert.equal(fase(m), 'pensando');
  sinErrores(m);
});

test('ronda1 p1: con TATI y el chat cerrado justo al enviar, sus pulsos evitan el corte de los 420 s', () => {
  const m = tatiConSonido();
  enviar(m);
  pulsoCrudo(m);
  m.lua('SnetForeverChat:Hide()');
  for (let t = 30; t <= 600; t += 30) {
    m.avanzar(30);
    pulsoCrudo(m);
  }
  assert.equal(fase(m), 'enviando', 'la franja sigue guardada para cuando se abra el chat');
  m.lua('SnetForeverChat:Show()');
  for (let i = 0; i < 40 && fase(m) === 'enviando'; i++) m.avanzar(0.25);
  assert.equal(fase(m), 'pensando');
  sinErrores(m);
});

test('ronda1 p1: con TATI, el chat cerrado y sin más pulsos, a los 90 s dice que la app se ha ido', () => {
  const m = tatiConSonido();
  enviar(m);
  pulsoCrudo(m);
  m.lua('SnetForeverChat:Hide()');
  m.avanzar(30);
  pulsoCrudo(m);
  m.avanzar(91);
  assert.equal(fase(m), 'error');
  assert.equal(estado(m).detalle, 'CHAT_SIN_APP');
  sinErrores(m);
});

test('ronda1 p1: el recibido por id vale al momento, con 0 vueltas', () => {
  const m = conRanuras();
  m.lua('SnetForever.Chat.abrir()');
  enviar(m);
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RECIBIDO_ID", "${estado(m).id}")`);
  assert.equal(fase(m), 'pensando');
  sinErrores(m);
});

test('ronda1 p3: cambiar de cerebro a mitad no quita el botón a un mensaje mandado a TATI', () => {
  const m = tatiConSonido();
  enviar(m);
  pulso(m);
  m.avanzar(30);
  pulso(m);
  cabecera(m, '{motorNombre = "claude", sabeParar = true}');
  assert.equal(m.lua(`${E}.puedeParar()`), true);
  assert.equal(m.lua(`${E}.parar()`), true);
  sinErrores(m);
});

test('ronda1 p5: con Claude un pulso suelto no cambia nada: 420 s y sus repasos, como antes', () => {
  for (const motor of ['claude', 'codex']) {
    const m = conRanuras();
    m.lua('SnetForever.Chat.abrir()');
    cabecera(m, `{motorNombre = "${motor}", sabeParar = true}`);
    enviar(m);
    pulso(m);
    assert.equal(fase(m), 'pensando');
    m.avanzar(10);
    pulso(m); // una lectura suelta del mismo .wav
    assert.equal(estado(m).sigue, undefined, motor);
    const base = cargas(m);
    m.avanzar(100);
    assert.equal(fase(m), 'pensando', `${motor}: no baja a 90 s`);
    assert.equal(cargas(m) - base, 1, `${motor}: el repaso de los 60 s`);
    m.avanzar(309);
    assert.equal(fase(m), 'pensando', motor);
    assert.equal(cargas(m) - base, 2, `${motor}: y el de los 150 s`);
    m.avanzar(2);
    assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA', motor);
    sinErrores(m);
  }
});

const silenciar = (m, si = true) => m.lua(`SnetForever.Timbres.sonido = function() return ${si ? 'false' : 'true'} end`);

test('ronda1 p4: silenciar el juego a mitad no da CHAT_SIN_APP: pasa a repasos y sigue con la cabecera', () => {
  const m = tatiConSonido();
  enviar(m);
  const id = estado(m).id;
  pulso(m);
  m.avanzar(30);
  pulso(m);
  cabecera(m, `{motorNombre = "tati", sabeParar = true, turno = "${id}"}`);
  silenciar(m);
  const base = cargas(m);
  m.avanzar(91);
  assert.equal(fase(m), 'pensando', String(estado(m).detalle));
  assert.equal(cargas(m) - base, 1, 'un repaso enseguida');
  m.avanzar(310); // pasados los 420 s
  assert.equal(fase(m), 'pensando', String(estado(m).detalle));
  assert.ok(cargas(m) - base >= 3, `${cargas(m) - base} repasos`);
  sinErrores(m);
});

test('ronda1 p4: si el sonido vuelve y llegan pulsos, sigue con la vida normal', () => {
  const m = tatiConSonido();
  enviar(m);
  pulso(m);
  m.avanzar(30);
  pulso(m);
  silenciar(m);
  m.avanzar(91);
  assert.equal(fase(m), 'pensando', String(estado(m).detalle));
  silenciar(m, false);
  pulso(m);
  const base = cargas(m);
  m.avanzar(60);
  pulso(m);
  assert.equal(cargas(m) - base, 0, 'con pulsos no hay repasos');
  m.avanzar(91);
  assert.equal(estado(m).detalle, 'CHAT_SIN_APP', 'con sonido y sin pulsos, la app se ha ido');
  sinErrores(m);
});

test('ronda1 p7: sin sonido, un repaso a los 20 s de pulsar Parar recoge el detenido', () => {
  const m = conRanuras({ sonido: false });
  m.lua('SnetForever.Chat.abrir()');
  cabecera(m, '{motorNombre = "tati", sabeParar = true}');
  enviar(m);
  const id = estado(m).id;
  m.avanzar(3.2);
  assert.equal(fase(m), 'pensando');
  m.avanzar(122); // 125 s: entre los repasos de 120 y 210 s
  const base = cargas(m);
  assert.equal(m.lua(`${E}.parar()`), true);
  m.avanzar(19.5);
  assert.equal(cargas(m) - base, 0);
  m.avanzar(1);
  assert.equal(cargas(m) - base, 1, 'el repaso de los 20 s');
  registro(m, id, 't = "error", tipo = "detenido", texto = "Parado"');
  assert.equal(fase(m), 'libre');
  sinErrores(m);
});

test('ronda1 p7: con sonido, parar no gasta ninguna ranura', () => {
  const m = tatiConSonido();
  enviar(m);
  pulso(m);
  const base = cargas(m);
  m.lua(`${E}.parar()`);
  m.avanzar(29.5);
  assert.equal(cargas(m) - base, 0);
  sinErrores(m);
});
