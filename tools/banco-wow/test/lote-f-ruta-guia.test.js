// Lote F (10-nov, lo que vio el jugador con la 0.4.6): la ruta de la IA se ve con el diseño de la guía. Una propuesta de tipo
// «ruta» (lote E1c) se convierte al aceptarla en una guía lateral `tipo = "ia"` con un paso por parada (ia/ruta.lua): la
// ventana la enseña como cualquier guía (cabecera, tarjetas de paso con sus iconos, lista y «Volver»), sus PNJ y enemigos
// salen en «Objetivos cercanos» y la línea del mapa (E4) sigue a su paso actual. Ya no hay tarjeta «Ruta de la IA» ni
// guía atenuada. Los nombres de misión de los pasos son los del juego (Datos.nombreMision).
// Datos del banco: 793 «Prueba de élite» (la da y la recoge Gornek, 3143, en (42.1, 68.3) de 1411; pide matar un
// Flesh Eater, id 3, «Comecarne», en (47, 62)). Mapa 1411: wx = -2000 - 50·x, wy = 1800 - 35·y, inst 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withGuideDetails as nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const PRINCIPAL = 'Prueba\\01-60 Guía de prueba';
const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const R = 'SnetForever.Ruta';
const Q = 793;
const mundo1411 = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

const GUIA = guiaDePrueba([
  { elementos: [
    { t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'flecha' },
    { t: 'manual', texto: { en: 'Talk to Deathstalker Lesh', es: 'Habla con Mortacechadora Lesh' } },
  ] },
  { elementos: [{ t: 'manual', texto: { en: 'Next', es: 'Siguiente' } }] },
]);

// La ruta de 793 como la manda la app (lote F: con `objetivo` y `npcs`), y un lugar al final.
const PARADAS = [
  { mapa: 1411, x: 42.1, y: 68.3, etiqueta: 'Recoger «Prueba de élite» (Gornek)', tipo: 'recoger', q: Q, npcs: [3143], seguir: true },
  { mapa: 1411, x: 47, y: 62, etiqueta: 'Prueba de élite: Comecarne', tipo: 'objetivo', q: Q, obj: 'Comecarne', objetivo: 1, npcs: [3], seguir: true },
  { mapa: 1411, x: 42.1, y: 68.3, etiqueta: 'Entregar «Prueba de élite» (Gornek)', tipo: 'entregar', q: Q, npcs: [3143], seguir: true },
  { mapa: 1411, x: 80, y: 30, etiqueta: 'Mirador del este', tipo: 'lugar', seguir: true },
];

function maquina(opciones = {}) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 }, ...opciones });
  m.ponerGuia(GUIA);
  m.lua(`SnetForever.Guias.cargar(${aLua(PRINCIPAL)}); ${V}.pintar()`);
  return m;
}

function aceptar(m, puntos = PARADAS, extra = {}) {
  m.lua(`${R}.proponer(${aLua({ titulo: 'Ruta de Durotar', puntos, ...extra })})`);
  return m.lua(`${R}.aceptar()`);
}

const estado = (m) => m.lua('SnetForever.Motor.estado()');
const guia = (m) => m.lua(`SnetForever.Datos.guia(SnetForever.Motor.estado().clave)`);
const tipos = (m, i) => m.lua(`(function() local t = {}
  for k, e in ipairs(SnetForever.Motor.paso(${i}).datos.elementos) do t[k] = e.t end
  return t end)()`);
const ponerEn = (m, x, y, dy = 3) => {
  const w = mundo1411(x, y);
  m.jugador({ mundo: { wx: w.wx, wy: w.wy + dy, inst: 1 } });
};
const lineas = (m) => m.lua(`(function() local t = {}
  for i, l in ipairs(${M}.pasos[1].lineas) do t[i] = {texto = l:GetText(), icono = l.icono and l.icono:GetTexture()} end
  return t end)()`) || [];
const cercanos = (m) => (m.lua(`(function() local t = {}
  for i, e in ipairs(SnetForever.Cercanos.lista()) do t[i] = e.tipo .. ":" .. e.clave end
  return t end)()`) || []);
const destino = (m) => m.lua('SnetForever.Navegacion.destino()');
const ciclo = (m) => m.avanzar(0.5);

test('lote F: al aceptar una ruta, la ventana carga una guía lateral «ia» con un paso por parada, en orden', () => {
  const m = maquina({ vigilarSecretos: ['ia/ruta.lua', 'ui/ventana.lua', 'nucleo/datos.lua'] });
  assert.equal(aceptar(m), true);
  const e = estado(m);
  const g = guia(m);
  assert.notEqual(e.clave, PRINCIPAL);
  assert.ok(e.clave.startsWith('IA\\'), e.clave);
  assert.equal(g.tipo, 'ia');
  assert.equal(g.pasos.length, 4);
  assert.deepEqual(tipos(m, 1), ['accept', 'goto', 'target']);
  assert.deepEqual(tipos(m, 2), ['complete', 'goto', 'mob']);
  assert.deepEqual(tipos(m, 3), ['turnin', 'goto', 'target']);
  assert.deepEqual(tipos(m, 4), ['goto']);
  // Cada goto va a su parada; la del complete lleva el objetivo.
  assert.deepEqual(g.pasos.map((p) => { const gt = p.elementos.find((x) => x.t === 'goto'); return [gt.x, gt.y]; }),
    PARADAS.map((p) => [p.x, p.y]));
  assert.equal(g.pasos[1].elementos[0].objetivo, 1);
  // La cabecera es la de una guía: el título empieza por «IA:» y hay «Volver a …» a la principal.
  assert.equal(m.lua(`${M}.titulo:GetText()`), 'IA: Ruta de Durotar');
  assert.equal(m.lua(`${M}.estado.volver:IsVisible()`), true);
  assert.equal(m.lua(`${M}.estado.volver.texto:GetText()`), 'Volver a 1-60 Guía de prueba (paso 1)');
  // Ni tarjeta aparte ni guía atenuada.
  assert.equal(m.lua(`${M}.rutaIA == nil`), true);
  assert.equal(m.lua(`${M}.pasos[1].marco:GetEffectiveAlpha()`), 1);
  sinErrores(m);
});

test('lote F: una parada de misión enseña sus iconos de aceptar, completar y entregar, con el nombre del juego', () => {
  const m = maquina({ vigilarSecretos: ['ia/ruta.lua', 'ui/ventana.lua'] });
  // El juego llama a la misión como la tenga en el registro (como «Caminos vigilados» en el del jugador).
  m.nombreJuego('mision', Q, 'Caminos vigilados');
  aceptar(m);
  let l = lineas(m);
  assert.equal(l[0].texto, 'Acepta Caminos vigilados');
  assert.equal(l[0].icono, 'Interface\\GossipFrame\\AvailableQuestIcon');
  m.estadoMision(Q, { enDiario: true, objetivos: [{ texto: 'Comecarne asesinado: 0/1', hecho: 0, pedido: 1, terminado: false }] });
  m.disparar('QUEST_ACCEPTED', 1, Q);
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(estado(m).actual, 2);
  l = lineas(m);
  assert.equal(l[0].texto, 'Comecarne asesinado: 0/1');
  m.estadoMision(Q, { enDiario: true, completa: true, objetivos: [{ texto: 'Comecarne asesinado: 1/1', hecho: 1, pedido: 1, terminado: true }] });
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(estado(m).actual, 3);
  l = lineas(m);
  assert.equal(l[0].texto, 'Entrega Caminos vigilados');
  assert.equal(l[0].icono, 'Interface\\GossipFrame\\ActiveQuestIcon');
  // Los pines de la IA siguen en el mapa con su número y el nombre que mandó la app.
  assert.deepEqual(m.lua('(function() local t = {} for i, p in ipairs(SnetForever.Capa.puntos("ia")) do t[i] = p.etiqueta end return t end)()')
    .map((s) => s.replace(/ — .*/, '')), PARADAS.map((p, i) => `${i + 1}. ${p.etiqueta}`));
  sinErrores(m);
});

test('lote F: la flecha sigue el paso de la guía; una parada de lugar se da por hecha al llegar', () => {
  const m = maquina();
  aceptar(m, [PARADAS[3]]);
  assert.equal(destino(m).punto.origen, 'guia');
  assert.equal(destino(m).punto.x, 80);
  assert.equal(m.lua(`${M}.pasos[1].lineas[1]:GetText()`), 'Mirador del este');
  ponerEn(m, 80, 30);
  m.lua('SnetForever.Navegacion.comprobarLlegada()');
  ciclo(m);
  assert.equal(estado(m).fin, true, 'la ruta de una parada termina al llegar');
  sinErrores(m);
});

test('lote F: «Saltar» es el saltar paso de la guía y «Volver» deja la guía de antes y quita la ruta', () => {
  const m = maquina();
  aceptar(m);
  m.lua('SnetForever.Motor.saltar(SnetForever.Motor.estado().actual)');
  ciclo(m);
  assert.equal(estado(m).actual, 2);
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(estado(m).clave, PRINCIPAL);
  assert.equal(m.lua(`${M}.pasos[1].lineas[1]:GetText()`), 'Habla con Mortacechadora Lesh');
  assert.equal(destino(m).punto.origen, 'guia');
  assert.equal(destino(m).punto.x, 50, 'la flecha vuelve al paso de la guía principal');
  // Ronda 1 (Importante 1): «Volver» quita la ruta como «Quitar pines».
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 0);
  // «Quitar pines» (Ruta.quitar) con la ruta abierta también vuelve a la principal.
  aceptar(m);
  m.lua(`${R}.quitar()`);
  assert.equal(estado(m).clave, PRINCIPAL);
  sinErrores(m);
});

test('lote F: los PNJ y los enemigos de la parada salen en «Objetivos cercanos» con su botón y su estrella', () => {
  const m = maquina({ vigilarSecretos: ['ia/ruta.lua', 'mapa/cercanos.lua'] });
  aceptar(m);
  assert.deepEqual(cercanos(m), ['target:gornek']);
  m.estadoMision(Q, { enDiario: true, objetivos: [{ texto: 'Comecarne asesinado: 0/1', hecho: 0, pedido: 1, terminado: false }] });
  m.disparar('QUEST_ACCEPTED', 1, Q);
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.deepEqual(cercanos(m), ['mob:flesh eater']);
  const macros = m.lua(`(function() local t = {}
    for _, b in ipairs(SnetForever.Objetivos.marcos.botones) do if b:IsShown() then t[#t + 1] = b:GetAttribute("macrotext") end end
    return t end)()`);
  assert.deepEqual(macros, ['/cleartarget\n/targetexact Comecarne\n/tm !1']);
  sinErrores(m);
});

test('lote F: sin `objetivo` ni `npcs` (una ruta guardada con la 0.4.6), los saca de la base', () => {
  const m = maquina();
  const viejas = PARADAS.slice(0, 3).map(({ objetivo, npcs, ...resto }) => resto);
  aceptar(m, viejas);
  assert.deepEqual(tipos(m, 1), ['accept', 'goto', 'target']);
  assert.deepEqual(tipos(m, 2), ['complete', 'goto', 'mob']);
  assert.equal(guia(m).pasos[1].elementos[0].objetivo, 1, 'el objetivo por el nombre «Comecarne» de la base');
  assert.deepEqual(cercanos(m), ['target:gornek']);
  sinErrores(m);
});

test('lote F: una propuesta de solo pines no abre ninguna guía; la de ruta sí, y el menú la vuelve a abrir como guía', () => {
  const m = maquina();
  aceptar(m, PARADAS.map((p) => ({ ...p, seguir: false })), { tipo: 'pines' });
  assert.equal(estado(m).clave, PRINCIPAL);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 4);
  aceptar(m);
  const clave = estado(m).clave;
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(estado(m).clave, PRINCIPAL);
  const id = m.lua(`${R}.rutasGuardadas()[1].id`);
  m.lua(`${R}.activarGuardada(${id})`);
  assert.equal(estado(m).clave, clave);
  assert.equal(m.lua(`${M}.estado.volver.texto:GetText()`), 'Volver a 1-60 Guía de prueba (paso 1)');
  sinErrores(m);
});

test('lote F: tras /reload la ruta sigue abierta como guía, con sus pines y su «Volver»', () => {
  const m = maquina();
  aceptar(m);
  const clave = estado(m).clave;
  const r = m.recargar();
  assert.equal(estado(r).clave, clave);
  assert.equal(r.lua('#SnetForever.Capa.puntos("ia")'), 4);
  assert.equal(r.lua('SnetForeverPJ.volverA'), PRINCIPAL);
  assert.equal(r.lua(`${M}.titulo:GetText()`), 'IA: Ruta de Durotar');
  sinErrores(r);
});

test('lote F: al terminar la ruta (todo hecho) se avisa una vez y la ventana ofrece volver', () => {
  const m = maquina();
  let n = 0;
  m.lua('CUENTA_FIN = 0; SnetForever.Eventos.escuchar("SNF_IA_RUTA_TERMINADA", function() CUENTA_FIN = CUENTA_FIN + 1 end)');
  aceptar(m, [PARADAS[3]]);
  ponerEn(m, 80, 30);
  m.lua('SnetForever.Navegacion.comprobarLlegada()');
  ciclo(m);
  ciclo(m);
  n = m.lua('CUENTA_FIN');
  assert.equal(n, 1);
  assert.equal(m.lua(`${R}.estado()`), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------
// Ronda 1 (lote-f-review.md)
// ---------------------------------------------------------------------------------------------------------------

test('ronda 1 (Importante 1): tras «Volver» y un /reload no hay pines ni ruta, y la ruta sigue en el menú', () => {
  const m = maquina();
  aceptar(m);
  const clave = estado(m).clave;
  m.lua('SnetForever.Motor.saltar(SnetForever.Motor.estado().actual)');
  ciclo(m);
  assert.equal(m.lua(`type(SnetForeverPJ.progreso[${aLua(clave)}])`), 'table');
  m.lua(`${M}.estado.volver:Click()`);
  const sinRuta = (x) => {
    assert.equal(x.lua('#SnetForever.Capa.puntos("ia")'), 0, 'sin pines');
    assert.equal(x.lua('SnetForeverPJ.ia.ruta'), undefined, 'sin lo guardado');
    assert.equal(x.lua(`SnetForeverPJ.progreso[${aLua(clave)}]`), undefined, 'sin su progreso');
    assert.ok(!x.lua('SnetForever.Datos.claves()').includes(clave), 'sin su clave');
    assert.equal(x.lua(`${R}.estado()`), undefined, 'sin línea en el mapa');
    assert.equal(estado(x).clave, PRINCIPAL);
  };
  sinRuta(m);
  const r = m.recargar();
  r.avanzar(0.1);
  sinRuta(r);
  // Sigue en «Rutas de la IA» y elegirla la abre desde el principio.
  const guardadas = r.lua(`${R}.rutasGuardadas()`);
  assert.equal(guardadas.length, 1);
  assert.equal(guardadas[0].activa, false);
  r.lua(`${R}.activarGuardada(${guardadas[0].id})`);
  assert.equal(estado(r).clave, clave);
  assert.equal(estado(r).actual, 1);
  assert.equal(r.lua('#SnetForever.Capa.puntos("ia")'), 4);
  sinErrores(r);
});

test('ronda 1 (Importante 1): aceptar otra ruta o abrir la misma desde el menú no quita la nueva', () => {
  const m = maquina();
  aceptar(m);
  aceptar(m, [PARADAS[3]], { titulo: 'Otra' });
  assert.equal(estado(m).clave, 'IA\\Paradas 2');
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 1);
  assert.equal(m.lua('SnetForeverPJ.volverA'), PRINCIPAL);
  m.lua(`${R}.activarGuardada(1)`);
  assert.equal(estado(m).clave, 'IA\\Paradas 1');
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 4);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta.id'), 1);
  sinErrores(m);
});

test('ronda 1 (Menor 2): un goto sin mapa entero o con x/y fuera de 0-100 no sale; la parada va sin goto', () => {
  const m = maquina();
  aceptar(m, [
    { ...PARADAS[0], mapa: 1411.5 },
    { ...PARADAS[1], x: 150 },
    { mapa: 1411, wx: -5000, wy: 700, inst: 1, etiqueta: 'Solo mundo', tipo: 'entregar', q: Q, seguir: true },
    { ...PARADAS[3], y: -3 },
    PARADAS[3],
  ]);
  const g = guia(m);
  // El lugar sin sitio válido no tiene nada que hacer: no sale como paso.
  assert.equal(g.pasos.length, 4);
  assert.deepEqual(g.pasos.map((p) => p.elementos.map((e) => e.t)),
    [['accept', 'target'], ['complete', 'mob'], ['turnin', 'target'], ['goto']]);
  assert.deepEqual(g.pasos.map((p) => p.parada), [1, 2, 3, 5]);
  const irA = g.pasos[3].elementos[0];
  assert.deepEqual([irA.mapa, irA.x, irA.y], [1411, 80, 30]);
  sinErrores(m);
});

test('ronda 1 (Menor 5): un objetivo que la base no tiene se ignora (se busca por el nombre o la parada va como lugar)', () => {
  const m = maquina();
  aceptar(m, [
    { ...PARADAS[1], objetivo: 7 },
    { ...PARADAS[1], objetivo: 7, obj: 'Nadie' },
  ]);
  const g = guia(m);
  assert.deepEqual(g.pasos[0].elementos.map((e) => e.t), ['complete', 'goto', 'mob']);
  assert.equal(g.pasos[0].elementos[0].objetivo, 1, 'por el nombre «Comecarne»');
  assert.deepEqual(g.pasos[1].elementos.map((e) => [e.t, e.modo]), [['goto', 'objetivo']]);
  sinErrores(m);
});

test('ronda 1 (Menor 3): con texto, hecho y pedido secretos, la ruta, la ventana y «Objetivos cercanos» no los comparan', () => {
  const m = maquina({ vigilarSecretos: ['ia/ruta.lua', 'ui/texto.lua', 'ui/ventana.lua', 'nucleo/datos.lua',
    'mapa/cercanos.lua', 'ui/flecha.lua', 'mapa/pines-mundo.lua'] });
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1; SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  aceptar(m);
  m.estadoMision(Q, { enDiario: true, objetivos: [{ texto: 'Comecarne asesinado: 0/1', hecho: 0, pedido: 1, terminado: false }] });
  m.lua(`local o = BANCO.misiones[${Q}].objetivos[1]; o.texto = BANCO.secreto(); o.hecho = BANCO.secreto(); o.pedido = BANCO.secreto()`);
  m.disparar('QUEST_ACCEPTED', 1, Q);
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(estado(m).actual, 2);
  assert.equal(lineas(m)[0].texto, 'Prueba de élite: 0/1');
  assert.deepEqual(cercanos(m), ['mob:flesh eater']);
  m.lua('SnetForever.Flecha.actualizar(0)');
  m.lua('WorldMapFrame:OnMapChanged()');
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T3-addon: aceptar una ruta encima de una lateral de la IA a medias deja la vuelta en esa lateral
// ---------------------------------------------------------------------------------------------------

const ZONA = 'IA\\Ruta de prueba (Horda)';
const pasoManual = (id, es) => ({ id, n: Number(id.slice(1)), etiquetas: {}, requisitos: [], linea: 0,
  elementos: [{ t: 'manual', texto: { es, en: es } }] });
const guiaZona = () => ({
  clave: ZONA, tipo: 'ia', sinVerificar: true, grupo: 'IA', nombre: 'Ruta de prueba (Horda)',
  titulo: { es: 'Ruta de prueba (Horda)', en: 'Test route (Horde)' }, faccion: 'Horde',
  niveles: { min: 1, max: 60 }, siguientes: [], mazmorras: {}, fuente: { archivo: 'ia', linea: 0 },
  resumen: { misiones: 0, pasos: 3, elites: 0, grupo: 0 },
  pasos: [pasoManual('z1', 'Uno'), pasoManual('z2', 'Dos'), pasoManual('z3', 'Tres')],
});
function abrirZona(m) {
  m.lua(`${R}.proponerGuia(${aLua(guiaZona())})`);
  assert.equal(m.lua(`${R}.aceptarGuia()`), true);
  assert.equal(estado(m).clave, ZONA);
}
const idActual = (m) => m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).id');

test('T3: aceptar una ruta desde una lateral de la IA a medias deja «Volver a» en esa lateral y volver la reanuda en su paso', () => {
  const m = maquina();
  abrirZona(m);
  m.lua('SnetForever.Motor.irA(2)');
  // La validación numera los pasos por su posición (i1, i2, i3).
  assert.equal(idActual(m), 'i2');
  assert.equal(aceptar(m), true);
  assert.ok(estado(m).clave.startsWith('IA\\Paradas'), estado(m).clave);
  assert.equal(m.lua('SnetForeverPJ.volverA'), ZONA);
  m.lua(`${V}.pintar()`);
  const titulo = m.lua(`SnetForever.Guias.titulo(${aLua(ZONA)})`);
  assert.equal(m.lua(`${M}.estado.volver:IsVisible()`), true);
  assert.equal(m.lua(`${M}.estado.volver.texto:GetText()`), `Volver a ${titulo} (paso 2)`);
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(estado(m).clave, ZONA);
  assert.equal(idActual(m), 'i2');
  sinErrores(m);
});

test('T3: desde una lateral de la IA ya acabada, la vuelta sigue en la principal', () => {
  const m = maquina();
  abrirZona(m);
  assert.equal(m.lua('SnetForeverPJ.volverA'), PRINCIPAL);
  for (let i = 0; i < 4 && !estado(m).fin; i++) {
    m.lua('SnetForever.Motor.marcarManual(SnetForever.Motor.estado().actual, 1, true)');
    ciclo(m);
  }
  assert.equal(estado(m).fin, true);
  assert.equal(aceptar(m), true);
  assert.equal(m.lua('SnetForeverPJ.volverA'), PRINCIPAL);
  sinErrores(m);
});
