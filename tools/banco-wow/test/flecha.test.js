// Flecha propia (ui/flecha.lua), tarea 17: apunta al destino de Navegacion con su distancia, sin TomTom ni HereBeDragons.
// Mapa 1411 del banco (src/wow-falso.lua): wx = -2000 - 5000·x/100, wy = 1800 - 3500·y/100, inst 1; wx crece hacia el
// oeste y wy hacia el norte. El jugador de las pruebas está en (50, 25) del mapa 1411 = wx -4500, wy 925.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';
import { contarTablas } from './memoria.js';

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const PI = Math.PI;

// Destinos a partir del jugador (wx -4500, wy 925): puntos de mundo con una ruta del jugador (Capa.ruta tiene prioridad).
const NORTE = { wx: -4500, wy: 1025 }; // 100 yd al norte
const OESTE = { wx: -4400, wy: 925 }; // 100 yd al oeste (wx crece hacia el oeste)
const SUR = { wx: -4500, wy: 825 };
const ESTE = { wx: -4600, wy: 925 };

function conFlecha(destino, { rumbo = 0, ajustes = {}, jugador = {}, entrar = true } = {}) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25, rumbo, ...jugador }, entrar });
  for (const [clave, valor] of Object.entries(ajustes)) m.lua(`SnetForever.Ajustes.set(${aLua(clave)}, ${aLua(valor)})`);
  m.initialRotations = m.llamadas('Texture:SetRotation').length;
  if (destino) ponerDestino(m, destino);
  m.lua('SnetForever.Flecha.crear()');
  m.lua('SnetForever.Flecha.actualizar(0)');
  return m;
}

function ponerDestino(m, d, extra = '') {
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 1, wx = ${d.wx}, wy = ${d.wy}, seguir = true, orden = 1,
    etiqueta = "Destino"${extra}}})`);
}

const rotacion = (m) => m.lua('SnetForever.Flecha.marcos.textura:GetRotation()');
const texto = (m) => m.lua('SnetForever.Flecha.marcos.texto:GetText()');
const visible = (m) => m.lua('SnetForever.Flecha.marcos.raiz:IsShown()');
const giros = (m) => m.llamadas('Texture:SetRotation').slice(m.initialRotations);
const sonidos = (m) => m.llamadas('PlaySound');
const llegar = (m, punto = 'P') => m.lua(`SnetForever.Eventos.emitir("SNF_LLEGADA", ${punto})`);

// ---------------------------------------------------------------------------------------------------
// Banco: lo nuevo de la tarea 17
// ---------------------------------------------------------------------------------------------------

test('banco: Texture SetRotation/GetRotation (0 por defecto), PlaySound apunta la llamada y SOUNDKIT.MAP_PING existe', () => {
  const m = nuevaMaquina();
  m.lua(`local f = CreateFrame("Frame", "SnetForeverPruebaF", UIParent)
  T = f:CreateTexture(nil, "ARTWORK")`);
  assert.equal(m.lua('T:GetRotation()'), 0);
  const before = m.llamadas('Texture:SetRotation').length;
  m.lua('T:SetRotation(1.5)');
  assert.equal(m.lua('T:GetRotation()'), 1.5);
  assert.deepEqual(m.llamadas('Texture:SetRotation').slice(before), [[1.5]]);
  assert.throws(() => m.lua('T:SetRotation("a")'), /uso: SetRotation/);
  assert.equal(typeof m.lua('SOUNDKIT.MAP_PING'), 'number');
  assert.deepEqual(m.lua('{PlaySound(SOUNDKIT.MAP_PING)}')[0], true);
  assert.deepEqual(sonidos(m), [[m.lua('SOUNDKIT.MAP_PING')]]);
  assert.throws(() => m.lua('PlaySound("x")'), /uso: PlaySound/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Giro
// ---------------------------------------------------------------------------------------------------

test('giro: rumbo 0, norte → 0, oeste → π/2, sur → π, este → 3π/2', () => {
  for (const [d, esperado] of [[NORTE, 0], [OESTE, PI / 2], [SUR, PI], [ESTE, 3 * PI / 2]]) {
    const m = conFlecha(d);
    assert.ok(cerca(rotacion(m), esperado), `${JSON.stringify(d)}: ${rotacion(m)} != ${esperado}`);
    assert.equal(visible(m), true);
    sinErrores(m);
  }
});

test('giro: mirando al oeste (π/2) la flecha resta el rumbo: oeste → 0, norte → 3π/2, sur → π/2, este → π', () => {
  for (const [d, esperado] of [[OESTE, 0], [NORTE, 3 * PI / 2], [SUR, PI / 2], [ESTE, PI]]) {
    const m = conFlecha(d, { rumbo: PI / 2 });
    assert.ok(cerca(rotacion(m), esperado), `${JSON.stringify(d)}: ${rotacion(m)} != ${esperado}`);
    sinErrores(m);
  }
});

test('giro: un cambio de 0,01 rad no llama a SetRotation; uno de 0,1 sí; cerca de la vuelta (0 ↔ 2π) tampoco', () => {
  const m = conFlecha(NORTE);
  assert.equal(giros(m).length, 1);
  m.jugador({ rumbo: 0.01 });
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(giros(m).length, 1, '0,01 rad es menos que π/64');
  m.jugador({ rumbo: 0.1 });
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(giros(m).length, 2);
  assert.ok(cerca(rotacion(m), 2 * PI - 0.1));
  // 2π − 0.1 y 0,01 − 0,1 + 2π... la diferencia se mide en el círculo: pasar de 6.18 a 6.28 (≈0) no es un salto de 2π.
  m.jugador({ rumbo: 0.105 });
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(giros(m).length, 2);
  sinErrores(m);
});

test('giro: el OnUpdate del marco llama a actualizar con el tiempo transcurrido', () => {
  const m = conFlecha(NORTE);
  m.jugador({ rumbo: PI / 2 });
  m.avanzar(0.1);
  assert.ok(cerca(rotacion(m), 3 * PI / 2));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------------------------------

test('texto: a 100 yd el texto lleva «100 yd» y el título; con distancia 100,0 no sale «.0»', () => {
  const m = conFlecha(NORTE);
  assert.match(texto(m), /100 yd/);
  assert.match(texto(m), /Destino/);
  assert.doesNotMatch(texto(m), /\.0/);
  sinErrores(m);
});

test('texto: solo se reescribe si cambia la yarda', () => {
  const m = conFlecha(NORTE);
  const escrituras = () => m.lua('SnetForever.Flecha.escrituras');
  const antes = escrituras();
  m.lua('SnetForever.Flecha.actualizar(0)');
  m.jugador({ mundo: { wx: -4500, wy: 925.2, inst: 1 } }); // 99,8 yd: sigue siendo la yarda 100
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(escrituras(), antes);
  m.jugador({ mundo: { wx: -4500, wy: 935, inst: 1 } }); // 90 yd
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(escrituras(), antes + 1);
  assert.match(texto(m), /90 yd/);
  sinErrores(m);
});

test('texto: sin etiqueta, el título es «Paso N» con el número del punto', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 1, wx = -4500, wy = 1025, seguir = true, orden = 3}})`);
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0)');
  assert.match(texto(m), /Paso 3/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------------------------------

test('estados: con flecha.activa apagado, oculta; al encenderlo vuelve', () => {
  const m = conFlecha(NORTE, { ajustes: { 'flecha.activa': false } });
  assert.equal(visible(m), false);
  m.lua('SnetForever.Ajustes.set("flecha.activa", true)');
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(visible(m), true);
  sinErrores(m);
});

test('estados: dentro de una instancia (sin posición ni rumbo) oculta, sin errores', () => {
  const m = conFlecha(NORTE);
  assert.equal(visible(m), true);
  m.jugador({ enInstancia: true });
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(visible(m), false);
  m.avanzar(0.2);
  sinErrores(m);
});

test('estados: sin destino oculta; con destino pero sin rumbo, oculta', () => {
  const m = conFlecha(null, { entrar: false }); // sin entrar al mundo: sin la guía del arranque no hay destino
  assert.equal(visible(m), false);
  ponerDestino(m, NORTE);
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(visible(m), true);
  m.lua('SnetForever.Capa.quitar("jugador"); SnetForever.Flecha.actualizar(0)');
  assert.equal(visible(m), false);
  // Falta el rumbo (nil) con el jugador en el mundo.
  ponerDestino(m, NORTE);
  m.lua(`local original = GetPlayerFacing
  GetPlayerFacing = function() return nil end
  SnetForever.Flecha.actualizar(0)
  GetPlayerFacing = original`);
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('estados: con otro continente enseña «Está en otro continente», sin girar', () => {
  const m = conFlecha(NORTE);
  const antes = giros(m).length;
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 0, wx = 5, wy = 5, seguir = true, orden = 1, etiqueta = "Lejos"}})`);
  m.jugador({ rumbo: 1 });
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(visible(m), true);
  assert.match(texto(m), /Está en otro continente/);
  assert.equal(giros(m).length, antes);
  // Al volver a un destino normal, gira de nuevo.
  ponerDestino(m, NORTE);
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(giros(m).length, antes + 1);
  assert.doesNotMatch(texto(m), /continente/);
  sinErrores(m);
});

test('estados: en inglés el aviso de otro continente sale en inglés', () => {
  const m = conFlecha(NORTE, { ajustes: { idioma: 'en' } });
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 0, wx = 5, wy = 5, seguir = true, orden = 1}})`);
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.match(texto(m), /another continent/);
  sinErrores(m);
});

test('escala: flecha.escala = 1,5 pone GetScale() = 1,5; el cambio del ajuste se aplica sobre la marcha', () => {
  const m = conFlecha(NORTE, { ajustes: { 'flecha.escala': 1.5 } });
  assert.equal(m.lua('SnetForever.Flecha.marcos.raiz:GetScale()'), 1.5);
  assert.deepEqual(m.lua('{SnetForever.Flecha.marcos.raiz:GetSize()}'), [48, 48]);
  m.lua('SnetForever.Ajustes.set("flecha.escala", 0.8)');
  assert.ok(cerca(m.lua('SnetForever.Flecha.marcos.raiz:GetScale()'), 0.8));
  sinErrores(m);
});

test('marco: SnetForeverFlecha, textura de Blizzard MinimapArrow, movible, y crear() se hace una sola vez', () => {
  const m = conFlecha(NORTE);
  assert.equal(m.lua('SnetForever.Flecha.marcos.raiz:GetName()'), 'SnetForeverFlecha');
  assert.equal(m.lua('SnetForever.Flecha.marcos.textura:GetTexture()'), 'Interface\\Minimap\\MinimapArrow');
  assert.equal(m.lua('SnetForever.Flecha.marcos.raiz:IsMovable()'), true);
  assert.equal(m.lua('SnetForever.Flecha.crear() == SnetForever.Flecha.marcos.raiz'), true);
  sinErrores(m);
});

test('movimiento: al soltar guarda flecha.pos y al recargar el marco se coloca ahí', () => {
  const m = conFlecha(NORTE);
  m.lua('SnetForever.Flecha.marcos.raiz:GetScript("OnMouseDown")(SnetForever.Flecha.marcos.raiz, "LeftButton")');
  m.lua('BANCO.arrastre = {x = 30, y = -20}');
  m.lua('SnetForever.Flecha.marcos.raiz:GetScript("OnMouseUp")(SnetForever.Flecha.marcos.raiz, "LeftButton")');
  const pos = m.lua('SnetForever.Ajustes.get("flecha.pos")');
  assert.equal(typeof pos.x, 'number');
  assert.equal(typeof pos.y, 'number');
  assert.ok(pos.punto && pos.relPunto);
  m.lua('SnetForever.Ajustes.set("flecha.pos", {punto = "CENTER", relPunto = "CENTER", x = 11, y = 22})');
  assert.deepEqual(m.lua('{SnetForever.Flecha.marcos.raiz:GetPoint(1)}').filter((v) => typeof v === 'number'), [11, 22]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Llegada
// ---------------------------------------------------------------------------------------------------

test('llegada: SNF_LLEGADA suena una vez (MAP_PING) y enseña «Has llegado» 2 s; el mismo punto no vuelve a sonar', () => {
  const m = conFlecha(NORTE);
  m.lua('P = {mapa = 1411, wx = 1, wy = 1, inst = 1}');
  llegar(m);
  assert.equal(sonidos(m).length, 1);
  assert.deepEqual(sonidos(m)[0], [m.lua('SOUNDKIT.MAP_PING')]);
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.match(texto(m), /Has llegado/);
  assert.equal(visible(m), true);
  llegar(m); // el mismo punto
  assert.equal(sonidos(m).length, 1);
  m.avanzar(1.5);
  assert.match(texto(m), /Has llegado/);
  m.avanzar(0.7);
  assert.doesNotMatch(texto(m), /Has llegado/);
  assert.match(texto(m), /100 yd/);
  // Otro punto sí suena.
  m.lua('P2 = {mapa = 1411, wx = 2, wy = 2, inst = 1}');
  llegar(m, 'P2');
  assert.equal(sonidos(m).length, 2);
  sinErrores(m);
});

test('llegada: con flecha.avisoLlegada apagado no suena ni enseña «Has llegado»', () => {
  const m = conFlecha(NORTE, { ajustes: { 'flecha.avisoLlegada': false } });
  m.lua('P = {mapa = 1411, wx = 1, wy = 1, inst = 1}');
  llegar(m);
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(sonidos(m).length, 0);
  assert.doesNotMatch(texto(m), /Has llegado/);
  sinErrores(m);
});

test('llegada: con la flecha apagada, «Has llegado» no la enseña', () => {
  const m = conFlecha(NORTE, { ajustes: { 'flecha.activa': false } });
  m.lua('P = {mapa = 1411, wx = 1, wy = 1, inst = 1}');
  llegar(m);
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('llegada real: Navegacion emite SNF_LLEGADA al entrar en el radio de un punto de la ruta y la flecha avisa', () => {
  const m = conFlecha(null);
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 1, wx = -4500, wy = 930, seguir = true, orden = 1, radio = 10, etiqueta = "Cerca"}})`);
  m.avanzar(0.4); // el temporizador de 0,3 s de Navegacion detecta la llegada
  assert.equal(sonidos(m).length, 1);
  assert.match(texto(m), /Has llegado/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Rendimiento (revisión del proyecto, I1): la flecha sigue una ruta de la IA de hasta 400 paradas en cada fotograma
// ---------------------------------------------------------------------------------------------------

// 400 paradas de la capa «ia» hacia el norte, cada 10 yd desde 100 yd del jugador, con el orden al revés del puesto
// (para que la ruta tenga que ordenarse de verdad): la primera de la ruta es la «Parada 1», a 100 yd.
const RUTA_400 = `local t = {}
  for i = 1, 400 do
    t[i] = {mapa = 1411, inst = 1, wx = -4500, wy = 925 + 100 + 10 * (400 - i), seguir = true, orden = 401 - i,
      etiqueta = "Parada " .. (401 - i)}
  end
  SnetForever.Capa.poner("ia", t)`;

// fengari no tiene collectgarbage("count") («lua_gc not implemented»): se cuentan las tablas que crea el addon con
// contarTablas (test/memoria.js), que es lo que el recolector tendría que recoger. Margen: 6 tablas en las 600 llamadas
// (una cada 100), por si una caché se rehace alguna vez; una tabla por llamada (o por búsqueda) daría 200 o más.
const TOPE_TABLAS_600 = 6;

test('I1: con 400 paradas, 600 llamadas a Flecha.actualizar (10 s a 60 fps) no crean tablas en cada llamada', () => {
  const m = conFlecha(null);
  m.lua(RUTA_400);
  m.lua('SnetForever.Flecha.actualizar(0)');
  assert.match(texto(m), /Parada 1\n/);
  assert.match(texto(m), /100 yd/);
  assert.ok(cerca(rotacion(m), 0), 'apunta al norte');
  const r = contarTablas(() => m.lua('for i = 1, 600 do SnetForever.Flecha.actualizar(1 / 60) end'));
  assert.ok(r.total <= TOPE_TABLAS_600, `${r.total} tablas en 600 llamadas: ${JSON.stringify(r.porLinea)}`);
  assert.match(texto(m), /Parada 1\n/);
  assert.equal(visible(m), true);
  sinErrores(m);
});

test('I1: entre dos búsquedas del destino el giro se recalcula en cada fotograma con el destino guardado', () => {
  const m = conFlecha(NORTE);
  m.lua('SnetForever.Flecha.actualizar(1 / 60)'); // búsqueda
  m.jugador({ rumbo: PI / 2 });
  m.lua('SnetForever.Flecha.actualizar(1 / 60)'); // sin búsqueda: el mismo punto, giro nuevo
  assert.ok(cerca(rotacion(m), 3 * PI / 2), `${rotacion(m)}`);
  m.jugador({ mundo: { wx: -4500, wy: 935, inst: 1 } }); // 90 yd
  m.lua('SnetForever.Flecha.actualizar(1 / 60)');
  assert.match(texto(m), /90 yd/);
  sinErrores(m);
});

// Paradas «lugar» de una ruta aceptada de la IA (se alcanzan por distancia y lo alcanzado se guarda). Desde el lote F
// la flecha las sigue como pasos de la guía de la ruta (un goto con la etiqueta por texto).
const LUGARES = [
  { mapa: 1411, x: 60, y: 30, etiqueta: 'Mira A', tipo: 'lugar', seguir: true },
  { mapa: 1411, x: 70, y: 30, etiqueta: 'Mira B', tipo: 'lugar', seguir: true },
  { mapa: 1411, x: 80, y: 30, etiqueta: 'Mira C', tipo: 'lugar', seguir: true },
];
const mundo1411 = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

test('I1: la flecha sigue en la parada correcta tras alcanzar una, tras poner/quitar puntos y tras /reload', () => {
  let m = conFlecha(null);
  m.lua(`SnetForever.Ruta.proponer(${aLua({ titulo: 'Paseo', puntos: LUGARES })}); SnetForever.Ruta.aceptar()`);
  m.avanzar(0.1);
  assert.match(texto(m), /Mira A/);
  // Alcanza la primera (el temporizador de 0,3 s de la navegación) y, pasado «Has llegado», apunta a la segunda.
  const a = mundo1411(60, 30);
  m.jugador({ mundo: { wx: a.wx, wy: a.wy + 3, inst: 1 } });
  m.avanzar(0.4);
  assert.match(texto(m), /Has llegado/);
  m.avanzar(2.1);
  assert.match(texto(m), /Mira B/);
  // Un punto nuevo del jugador con orden 0 va antes en la ruta: se ve en el siguiente fotograma, sin esperar.
  m.lua('SnetForever.Flecha.actualizar(1 / 60)');
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 1, wx = -4500, wy = 1025, seguir = true, orden = 0,
    etiqueta = "Mío"}})`);
  m.lua('SnetForever.Flecha.actualizar(1 / 60)');
  assert.match(texto(m), /Mío/);
  m.lua('SnetForever.Capa.quitar("jugador"); SnetForever.Flecha.actualizar(1 / 60)');
  assert.match(texto(m), /Mira B/);
  // Tras /reload la primera sigue alcanzada (el progreso de la guía) y la flecha va a la segunda.
  m = m.recargar();
  m.avanzar(0.1);
  assert.match(texto(m), /Mira B/);
  // Y al alcanzar la segunda, a la tercera.
  const b = mundo1411(70, 30);
  m.jugador({ mundo: { wx: b.wx, wy: b.wy + 3, inst: 1 } });
  m.avanzar(0.4);
  m.avanzar(2.1);
  assert.match(texto(m), /Mira C/);
  sinErrores(m);
});

// 13-nov (en el juego, guía 28-30 Mil Agujas): «salté unos pasos de la guía y la flecha no se actualiza». Saltar sí
// cambiaba el destino, pero los primeros pasos están todos en Cima del Trueno: el texto seguía siendo «vuela a Cima del
// Trueno… Después, a pie: Paso 3» y solo cambiaba el número. Un goto sin texto propio lleva ahora el resumen de su paso.
test('texto: un goto de la guía sin texto propio dice el número y el resumen de su paso, y cambia al saltar', async () => {
  const { guiaDePrueba } = await import('./ayuda.js');
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.ponerGuia(guiaDePrueba([
    // Ronda 1 de T1: el goto es objetivo (un paso de solo goto sin objetivo y nota ya está hecho y se pasa al cargar).
    { elementos: [
      { t: 'goto', mapa: 1411, x: 50, y: 22, modo: 'objetivo' },
      { t: 'nota', texto: { en: 'Talk to |cRXP_FRIENDLY_Melor Stonehoof|r', es: 'Habla con |cRXP_FRIENDLY_Melor Pezuña Pétrea|r' } },
    ] },
    { elementos: [
      { t: 'goto', mapa: 1411, x: 50, y: 28 },
      { t: 'home', texto: { en: 'Set your Hearthstone', es: 'Establece tu Piedra de hogar' } },
    ] },
  ]));
  m.lua(`SnetForever.Guias.cargar(${aLua('Prueba\\01-60 Guía de prueba')})`);
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0)');
  assert.match(texto(m), /^Paso 1: Habla con Melor Pezuña Pétrea\n/);
  assert.doesNotMatch(texto(m), /\|c/);
  m.lua('SnetForever.Motor.saltar(SnetForever.Motor.estado().actual); SnetForever.Flecha.actualizar(0)');
  assert.match(texto(m), /^Paso 2: Establece tu Piedra de hogar\n/);
  sinErrores(m);
});
