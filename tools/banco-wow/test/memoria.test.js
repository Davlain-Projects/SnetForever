// Memoria del propio addon (tarea 22, punto 4). En el juego GetAddOnMemoryUsage dio 64.808 kB para SnetForever (más
// 80.739 kB de SnetForever_Rutas y 108.401 kB de SnetForever_Misiones, que son tablas estáticas). Con los datos reales
// en el banco, lo que el addon tiene VIVO tras arrancar es del orden de 0,5-1 MB (test/memoria.js, estimarMemoria):
// los 64 MB eran sobre todo basura sin recoger, creada en cada fotograma por la flecha (Navegacion.destino), cada
// 0,1 s por los pines del minimapa y cada PERIODO por la navegación. Estas pruebas fijan un tope a las dos cosas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { estimarMemoria, contarTablas } from './memoria.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const reales = { skip: hayDatos ? false : 'no están los addons de datos de la fase 1', timeout: 600000 };
const M = 'SnetForever.Ventana.marcos';
// Tarea D3: saltar el primer paso como el jugador, con el clic derecho y «Saltar este paso».
const SALTAR_PRIMERO = `${M}.pasos[1].marco:Click("RightButton")
  for _, f in ipairs(${M}.contexto.filas) do
    if f:IsVisible() and f.texto:GetText() == SnetForever.L.t("SALTAR_PASO") then f:Click(); break end
  end
  SnetForever.Ventana.cerrarContexto()`;

const ORCO = { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', nivel: 1 };
const conDatosReales = (opciones = {}) => nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: ORCO, forever: true, ...opciones });
const kB = (b) => `${(b / 1024).toFixed(0)} kB`;

// Tope de la memoria viva del propio addon: medido ~470 kB tras arrancar y ~735 kB tras 30 repintados y 50 «Saltar»
// (orco guerrero, Durotar; el informe de la tarea 22 trae las cifras). 2 MB deja margen y salta si vuelven las copias
// grandes (los 64 MB del juego). 12-nov: con la red de caminos a pie y la previsión de pasos que no se pueden hacer se
// midieron 2049 kB tras los 50 «Saltar»; el tope pasa a 3 MB, que sigue saltando con cualquier copia grande.
const TOPE_VIVA = 3 * 1024 * 1024;
// Tope de tablas nuevas por segundo de juego en el banco (20 fotogramas por segundo, mapa abierto, flecha y minimapa):
// eran 307/s antes de la tarea 22 y ahora 63/s (las que quedan: Coord.jugador y el resultado de Navegacion.destino).
const TOPE_TABLAS_SEG = 120;

test('banco: estimarMemoria cuenta lo que cuelga del addon y no lo de los addons de datos', () => {
  const m = nuevaMaquina();
  // La clave se crea antes de medir: si SnetForever tiene justo 2^k claves (64 con el comercio y «Mis guías»), una
  // clave nueva dobla su parte hash y el aumento no sería de la referencia a los datos.
  m.lua('SnetForever.pruebaMemoria = false');
  const antes = estimarMemoria(m).bytes;
  m.lua('SnetForever.pruebaMemoria = {}; for i = 1, 1000 do SnetForever.pruebaMemoria[i] = {i} end');
  const despues = estimarMemoria(m).bytes;
  // 1000 tablas de un elemento (56 + 16 B) más la lista (56 + 16·1024 B): unos 88 kB.
  assert.ok(despues - antes > 80000 && despues - antes < 100000, `${despues - antes} B`);
  m.lua('SnetForever.pruebaMemoria = SNF_MISIONES.quest');
  assert.ok(estimarMemoria(m).bytes - antes < 200, 'una referencia a los datos no cuenta');
  m.lua('SnetForever.pruebaMemoria = nil');
  sinErrores(m);
});

test('banco: contarTablas atribuye las tablas al archivo del addon que las crea', () => {
  const m = nuevaMaquina();
  const r = contarTablas(() => m.lua('SnetForever.Motor.estado()'));
  assert.ok(r.total >= 3, JSON.stringify(r));
  assert.ok(Object.keys(r.porLinea).every((k) => k.startsWith('@SnetForever/motor/pasos.lua:')), JSON.stringify(r.porLinea));
  const fuera = contarTablas(() => m.lua('local t = {} for i = 1, 10 do t[i] = {} end'));
  assert.equal(fuera.total, 0, 'las tablas de la prueba no son del addon');
  sinErrores(m);
});

test('datos reales: la memoria viva del addon tras arrancar, repintar y 50 «Saltar» queda por debajo de 3 MB', reales, (t) => {
  const m = conDatosReales();
  const arranque = estimarMemoria(m);
  t.diagnostic(`tras el arranque: ${kB(arranque.bytes)} (${arranque.tablas} tablas, ${arranque.textos} textos, ${arranque.cierres} cierres)`);
  assert.ok(arranque.bytes < TOPE_VIVA, kB(arranque.bytes));
  for (let i = 0; i < 30; i++) {
    m.lua('SnetForever.Ventana.pintar()');
    m.disparar('QUEST_LOG_UPDATE');
    m.avanzar(0.5);
  }
  for (let i = 0; i < 50; i++) {
    if (m.lua(`${M}.pasos[1] ~= nil and ${M}.pasos[1].marco:IsVisible()`)) m.lua(SALTAR_PRIMERO);
    m.avanzar(0.3);
  }
  const despues = estimarMemoria(m);
  t.diagnostic(`tras 30 repintados y 50 «Saltar»: ${kB(despues.bytes)} (${despues.tablas} tablas)`);
  assert.ok(despues.bytes < TOPE_VIVA, kB(despues.bytes));
  sinErrores(m);
});

test('datos reales: en 60 s de juego con el mapa abierto el addon crea menos de 120 tablas por segundo', reales, (t) => {
  const m = conDatosReales();
  m.avanzar(1);
  m.lua('WorldMapFrame:Show()');
  const r = contarTablas(() => m.avanzar(60));
  const porSeg = r.total / 60;
  const principales = Object.entries(r.porLinea).sort((a, b) => b[1] - a[1]).slice(0, 5);
  t.diagnostic(`${r.total} tablas en 60 s (${porSeg.toFixed(0)}/s): ${principales.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  assert.ok(porSeg < TOPE_TABLAS_SEG, `${porSeg.toFixed(0)} tablas/s`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Lo que se reutiliza (con los fixtures: rápido)
// ---------------------------------------------------------------------------------------------------

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const IR = { t: 'goto', mapa: 1411, x: 50, y: 20, modo: 'objetivo', radio: 1, texto: { en: 'Go', es: 'Ve' } };

function conFlecha() {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.ponerGuia(guiaDePrueba([{ elementos: [IR] }]));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.avanzar(0.1);
  return m;
}

test('la flecha no rehace su texto en cada fotograma: solo si cambia el punto, la yarda o el idioma', () => {
  const m = conFlecha();
  assert.ok(m.lua('SnetForever.Navegacion.destino() ~= nil'), 'hay destino');
  m.lua(`HECHOS = 0; local original = SnetForever.L.t
    SnetForever.L.t = function(clave, ...) if clave == "FLECHA_DISTANCIA" then HECHOS = HECHOS + 1 end return original(clave, ...) end`);
  m.avanzar(2); // 40 fotogramas sin moverse
  assert.equal(m.lua('HECHOS'), 0);
  m.jugador({ mapa: 1411, x: 50, y: 24 });
  m.avanzar(0.05);
  assert.equal(m.lua('HECHOS'), 1, 'la yarda cambió: un texto nuevo');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.avanzar(0.05);
  assert.equal(m.lua('HECHOS'), 2, 'el idioma cambió: un texto nuevo');
  assert.match(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), /yd/);
  sinErrores(m);
});

test('Capa.visibles() devuelve la misma lista mientras no cambian los puntos ni pines.ia, y una nueva si cambian', () => {
  const m = nuevaMaquina({ entrar: false });
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 1, y = 1}})
    SnetForever.Capa.poner("ia", {{mapa = 1411, x = 2, y = 2}})`);
  assert.equal(m.lua('SnetForever.Capa.visibles() == SnetForever.Capa.visibles()'), true);
  assert.equal(m.lua('#SnetForever.Capa.visibles()'), 2);
  m.lua('A = SnetForever.Capa.visibles(); SnetForever.Ajustes.set("pines.ia", false)');
  assert.equal(m.lua('A ~= SnetForever.Capa.visibles() and #SnetForever.Capa.visibles()'), 1);
  m.lua('B = SnetForever.Capa.visibles(); SnetForever.Capa.poner("guia", {{mapa = 1411, x = 3, y = 3}})');
  assert.equal(m.lua('B ~= SnetForever.Capa.visibles() and #SnetForever.Capa.visibles()'), 2);
  m.lua('C = SnetForever.Capa.visibles(); SnetForever.Capa.quitar("guia")');
  assert.equal(m.lua('C ~= SnetForever.Capa.visibles() and #SnetForever.Capa.visibles()'), 1);
  sinErrores(m);
});

test('Navegacion.destino() en cada fotograma: como mucho 3 tablas por llamada (antes 9 o más)', () => {
  const m = conFlecha();
  m.lua('SnetForever.Navegacion.destino()');
  const r = contarTablas(() => m.lua('for i = 1, 100 do SnetForever.Navegacion.destino() end'));
  assert.ok(r.total <= 300, `${r.total} tablas en 100 llamadas: ${JSON.stringify(r.porLinea)}`);
  sinErrores(m);
});
