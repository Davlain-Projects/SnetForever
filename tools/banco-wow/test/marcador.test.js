// Los pines de la IA como «Marcador de mapa» de Blizzard (mapa/marcador.lua, SNF.Marcador): el primer pin de una propuesta
// aceptada pasa a ser el marcador del mapa (flecha de seguimiento y distancia del juego), sin tocar nunca uno que puso el
// jugador. Los pines se pintan con el atlas del marcador y sin número; los números quedan para las paradas.
// Mapa 1411 del banco (src/wow-falso.lua). Los nombres de los sitios son inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const MK = 'SnetForever.Marcador';
const MC = 'SnetForever.Chat.marcos';
const Q = 4641;

const pin = (etiqueta, x, y, extra = {}) => ({ mapa: 1411, x, y, etiqueta, tipo: 'lugar', ...extra });
const PINES = [pin('Pozo viejo', 30, 40), pin('Torre caída', 50, 60), pin('Cueva norte', 70, 20)];
const PARADA_A = { mapa: 1411, x: 40, y: 20, etiqueta: 'Habla con Garra', tipo: 'recoger', q: Q, seguir: true };
const PARADA_C = { mapa: 1411, x: 80, y: 40, etiqueta: 'Vuelve con Garra', tipo: 'entregar', q: Q, seguir: true };

const sinColor = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');
const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

function maquina(opciones = {}) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25, idioma: 'esES' }, ...opciones });
  m.datoMision(Q, { name: 'Your Place In The World', startedBy: [[10176]], finishedBy: [[3143]], requiredLevel: 1,
    questLevel: 1, objectives: [[[3]]], zoneOrSort: 363 });
  return m;
}

function aceptar(m, puntos = PINES, tipo = 'pines') {
  m.lua(`SnetForever.Ruta.proponer(${aLua({ titulo: 'Sitios', tipo, puntos })})`);
  return m.lua('SnetForever.Ruta.aceptar()');
}

// El marcador del banco: {mapa, x, y} (0-1) o undefined.
const marcador = (m) => m.lua(`(function()
  if not C_Map.HasUserWaypoint() then return nil end
  local p = C_Map.GetUserWaypoint()
  local x, y = p.position:GetXY()
  return {mapa = p.uiMapID, x = x, y = y}
end)()`);
const enSitio = (mk, mapa, x, y) => mk && mk.mapa === mapa && cerca(mk.x, x / 100) && cerca(mk.y, y / 100);
const jugadorPone = (m, mapa, x, y) => m.lua(`BANCO.ponerMarcadorJugador(${mapa}, ${x}, ${y})`);
const seguido = (m) => m.lua(`(${MK}.seguido() or {}).etiqueta`);
const puestas = (m) => m.llamadas('C_Map.SetUserWaypoint').length;

// Cuenta los mensajes internos `evento` y guarda el último argumento.
function contar(m, evento) {
  m.lua(`CUENTA_${evento} = {n = 0}
  SnetForever.Eventos.escuchar("${evento}", function(a) CUENTA_${evento}.n = CUENTA_${evento}.n + 1; CUENTA_${evento}.ultimo = a end)`);
  return () => m.lua(`CUENTA_${evento}`);
}

const entrarEnCombate = (m) => { m.jugador({ enCombate: true }); m.disparar('PLAYER_REGEN_DISABLED'); };
const salirDeCombate = (m) => { m.jugador({ enCombate: false }); m.disparar('PLAYER_REGEN_ENABLED'); };

// Las líneas del historial del chat, sin colores.
const lineas = (m) => (m.lua(`(function()
  local s, t = ${MC}.mensajes, {}
  for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
  return t
end)()`) || []).map(sinColor).filter((l) => l !== ' ');
const ultima = (m) => { const l = lineas(m); return l[l.length - 1]; };

// Los pines de la capa «ia» en el mapa del mundo: {etiqueta, atlas, numero, aro, i}.
function conMapa(m) {
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1');
  m.lua('SnetForever.PinesMundo.crear()');
  m.lua('WorldMapFrame:Show()');
}
const pinesMundo = (m) => m.lua(`(function()
  local salida = {}
  for i, p in ipairs(SnetForever.PinesMundo.marcos.pines) do
    if p:IsShown() and p.snfPunto and p.snfPunto.origen == "ia" then
      salida[#salida + 1] = {etiqueta = p.snfPunto.etiqueta, atlas = p.snfIcono and p.snfIcono:IsShown() and p.snfIcono:GetAtlas() or nil,
        numero = p.snfNumero:GetText() or "", aro = p.snfCirculo.tramos[1]:IsShown(), i = i}
    end
  end
  return salida
end)()`);
const pinMundo = (m, etiqueta) => pinesMundo(m).find((p) => p.etiqueta === etiqueta);
const tooltipDe = (m, i) => {
  m.lua(`local p = SnetForever.PinesMundo.marcos.pines[${i}]; p:GetScript("OnEnter")(p)`);
  return m.lua('BANCO.lineasTooltip()').map(sinColor);
};

// ---------------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------------

test('banco: el marcador del mapa de Blizzard (C_Map, UiMapPoint, C_SuperTrack y USER_WAYPOINT_UPDATED) y sobrevive a /reload', () => {
  const m = maquina();
  assert.equal(m.lua('C_Map.HasUserWaypoint()'), false);
  assert.equal(m.lua('C_Map.GetUserWaypoint()'), undefined);
  assert.equal(m.lua('C_Map.CanSetUserWaypointOnMap(1411)'), true);
  m.lua(`EVENTOS_MARCADOR = 0
  local f = CreateFrame("Frame"); f:RegisterEvent("USER_WAYPOINT_UPDATED")
  f:SetScript("OnEvent", function() EVENTOS_MARCADOR = EVENTOS_MARCADOR + 1 end)`);
  m.lua('C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(1411, 0.25, 0.5))');
  assert.equal(m.lua('C_Map.HasUserWaypoint()'), true);
  assert.ok(enSitio(marcador(m), 1411, 25, 50));
  assert.equal(m.lua('EVENTOS_MARCADOR'), 1);
  assert.equal(m.lua('C_SuperTrack.IsSuperTrackingUserWaypoint()'), false);
  m.lua('C_SuperTrack.SetSuperTrackedUserWaypoint(true)');
  assert.equal(m.lua('C_SuperTrack.IsSuperTrackingUserWaypoint()'), true);
  const n = m.recargar();
  assert.ok(enSitio(marcador(n), 1411, 25, 50), 'el cliente lo guarda tras un /reload');
  assert.equal(n.lua('C_SuperTrack.IsSuperTrackingUserWaypoint()'), true);
  n.lua('C_Map.ClearUserWaypoint()');
  assert.equal(n.lua('C_Map.HasUserWaypoint()'), false);
  assert.equal(n.lua('C_SuperTrack.IsSuperTrackingUserWaypoint()'), false);
  // Un mapa donde no se puede poner, y el marcador que pone el jugador a mano (lanza el evento).
  n.lua('BANCO.mapasSinMarcador[1411] = true');
  assert.equal(n.lua('C_Map.CanSetUserWaypointOnMap(1411)'), false);
  n.lua('BANCO.mapasSinMarcador[1411] = nil');
  jugadorPone(n, 1411, 10, 20);
  assert.ok(enSitio(marcador(n), 1411, 10, 20));
  sinErrores(n);
});

test('banco: sinApi quita las funciones del marcador', () => {
  const m = maquina({ sinApi: ['C_Map.SetUserWaypoint', 'UiMapPoint', 'C_SuperTrack.SetSuperTrackedUserWaypoint'] });
  assert.equal(m.lua('C_Map.SetUserWaypoint'), undefined);
  assert.equal(m.lua('UiMapPoint'), undefined);
  assert.equal(m.lua('C_SuperTrack.SetSuperTrackedUserWaypoint'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Aceptar
// ---------------------------------------------------------------------------------------------------

test('aceptar 3 pines: el primero es el marcador de Blizzard y se sigue; los 3 en la capa sin número y con su nombre', () => {
  const m = maquina();
  const cambios = contar(m, 'SNF_MARCADOR_CAMBIADO');
  assert.equal(aceptar(m), true);
  assert.ok(enSitio(marcador(m), 1411, 30, 40), JSON.stringify(marcador(m)));
  assert.equal(m.lua('C_SuperTrack.IsSuperTrackingUserWaypoint()'), true);
  assert.equal(puestas(m), 1);
  assert.equal(m.lua(`${MK}.esNuestro()`), true);
  assert.equal(seguido(m), 'Pozo viejo');
  assert.ok(cambios().n >= 1, 'SNF_MARCADOR_CAMBIADO');
  const puntos = m.lua('SnetForever.Capa.puntos("ia")');
  assert.deepEqual(puntos.map((p) => p.etiqueta), ['Pozo viejo', 'Torre caída', 'Cueva norte']);
  assert.deepEqual(puntos.map((p) => p.esPin), [true, true, true]);
  assert.deepEqual(puntos.map((p) => p.orden), [undefined, undefined, undefined]);
  const g = m.lua('SnetForeverPJ.ia.marcador');
  assert.equal(g.mapa, 1411);
  assert.ok(cerca(g.x, 0.3) && cerca(g.y, 0.4));
  assert.equal(typeof g.clave, 'string');
  sinErrores(m);
});

test('una ruta con paradas y un pin: las paradas se numeran entre ellas (1 y 2); el pin va sin número y es el marcador', () => {
  const m = maquina();
  aceptar(m, [PARADA_A, pin('Atalaya rota', 20, 70), PARADA_C], 'ruta');
  const puntos = m.lua('SnetForever.Capa.puntos("ia")');
  assert.deepEqual(puntos.map((p) => p.etiqueta), ['1. Habla con Garra', 'Atalaya rota', '2. Vuelve con Garra']);
  assert.deepEqual(puntos.map((p) => p.esPin === true), [false, true, false]);
  assert.deepEqual(puntos.map((p) => p.orden), [1, undefined, 2]);
  assert.ok(enSitio(marcador(m), 1411, 20, 70));
  m.avanzar(1);
  const e = m.lua('SnetForever.Ruta.estado()');
  assert.equal(e.n, 1);
  assert.equal(e.total, 2, 'el total cuenta solo las paradas');
  assert.deepEqual(e.quedan.map((q) => q.n), [2]);
  // Tras los eventos de misión, igual.
  m.disparar('QUEST_LOG_UPDATE');
  assert.ok(m.lua('SnetForever.Capa.puntos("ia")')[2].etiqueta.startsWith('2. Vuelve con Garra'));
  sinErrores(m);
});

test('una ruta nueva cuyo primer pin no se puede marcar quita el marcador nuestro de antes', () => {
  const m = maquina();
  aceptar(m);
  assert.ok(enSitio(marcador(m), 1411, 30, 40));
  m.lua('BANCO.mapasSinMarcador[1453] = true');
  aceptar(m, [{ mapa: 1453, x: 50, y: 50, etiqueta: 'Plaza', tipo: 'lugar' }]);
  assert.equal(marcador(m), undefined);
  assert.equal(m.lua('SnetForeverPJ.ia.marcador'), undefined);
  sinErrores(m);
});

test('una ruta sin pines no pone marcador; el primer pin sin sitio válido se salta', () => {
  const m = maquina();
  aceptar(m, [PARADA_A, PARADA_C], 'ruta');
  assert.equal(marcador(m), undefined);
  assert.equal(puestas(m), 0);
  aceptar(m, [pin('Fuera del mapa', 130, 40), pin('Bien', 45, 55)]);
  assert.ok(enSitio(marcador(m), 1411, 45, 55));
  sinErrores(m);
});

test('los eventos de misión reescriben las etiquetas: los pines siguen sin número', () => {
  const m = maquina();
  aceptar(m, [PARADA_A, pin('Habla con el cocinero', 20, 70, { tipo: 'recoger', q: Q })], 'ruta');
  m.disparar('QUEST_LOG_UPDATE');
  const etiquetas = m.lua('SnetForever.Capa.puntos("ia")').map((p) => p.etiqueta);
  assert.equal(etiquetas[0], '1. Habla con Garra — Por recoger');
  assert.equal(etiquetas[1], 'Habla con el cocinero — Por recoger');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// El marcador del jugador
// ---------------------------------------------------------------------------------------------------

test('con un marcador del jugador: no se toca y sale la pregunta en el chat; «Cambiarlo» lo cambia', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("chat")');
  jugadorPone(m, 1411, 10, 10);
  const preguntas = contar(m, 'SNF_IA_MARCADOR_PREGUNTA');
  aceptar(m);
  assert.ok(enSitio(marcador(m), 1411, 10, 10), 'el del jugador sigue');
  assert.equal(puestas(m), 0);
  assert.equal(m.lua(`${MK}.esNuestro()`), false);
  assert.equal(preguntas().n, 1);
  assert.equal(preguntas().ultimo.etiqueta, 'Pozo viejo');
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), true);
  assert.equal(m.lua(`${MC}.marcador.texto:GetText()`), 'Ya tienes un marcador tuyo en el mapa. ¿Lo cambio por «Pozo viejo»?');
  assert.equal(m.lua(`${MC}.marcador.cambiar.texto:GetText()`), 'Cambiarlo');
  assert.equal(m.lua(`${MC}.marcador.dejar.texto:GetText()`), 'Dejar el mío');
  m.lua(`${MC}.marcador.cambiar:Click()`);
  assert.ok(enSitio(marcador(m), 1411, 30, 40));
  assert.equal(m.lua(`${MK}.esNuestro()`), true);
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), false);
  sinErrores(m);
});

test('«Dejar el mío» quita la pregunta y no toca el marcador del jugador', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("chat")');
  jugadorPone(m, 1411, 10, 10);
  aceptar(m);
  m.lua(`${MC}.marcador.dejar:Click()`);
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), false);
  assert.ok(enSitio(marcador(m), 1411, 10, 10));
  sinErrores(m);
});

test('Marcador.seguir: «del_jugador» sin forzar; con forzar lo cambia', () => {
  const m = maquina();
  jugadorPone(m, 1411, 10, 10);
  const p = aLua(pin('Sitio', 60, 60));
  assert.equal(m.lua(`${MK}.seguir(${p})`), 'del_jugador');
  assert.ok(enSitio(marcador(m), 1411, 10, 10));
  assert.equal(m.lua(`${MK}.seguir(${p}, {forzar = true})`), 'puesto');
  assert.ok(enSitio(marcador(m), 1411, 60, 60));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------------------------------

test('en combate no se llama a SetUserWaypoint hasta PLAYER_REGEN_ENABLED; el chat lo avisa', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("chat")');
  const combate = contar(m, 'SNF_IA_MARCADOR_COMBATE');
  entrarEnCombate(m);
  aceptar(m);
  assert.equal(puestas(m), 0);
  assert.equal(marcador(m), undefined);
  assert.equal(combate().n, 1);
  assert.equal(combate().ultimo.etiqueta, 'Pozo viejo');
  assert.equal(ultima(m), 'En combate: pongo el marcador de «Pozo viejo» al salir.');
  assert.equal(m.lua(`${MK}.seguir(${aLua(pin('Otro', 60, 60))})`), 'combate');
  m.avanzar(1);
  assert.equal(puestas(m), 0);
  salirDeCombate(m);
  assert.equal(puestas(m), 1, 'solo el último pendiente');
  assert.ok(enSitio(marcador(m), 1411, 60, 60));
  assert.equal(m.lua(`${MK}.esNuestro()`), true);
  salirDeCombate(m);
  assert.equal(puestas(m), 1, 'lo pendiente se pone una vez');
  sinErrores(m);
});

test('en combate, si el jugador pone su marcador antes de salir, no se toca y sale la pregunta', () => {
  const m = maquina();
  const preguntas = contar(m, 'SNF_IA_MARCADOR_PREGUNTA');
  entrarEnCombate(m);
  aceptar(m);
  jugadorPone(m, 1411, 10, 10);
  salirDeCombate(m);
  assert.equal(puestas(m), 0);
  assert.ok(enSitio(marcador(m), 1411, 10, 10));
  assert.equal(preguntas().n, 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Sin API o sin poder
// ---------------------------------------------------------------------------------------------------

test('CanSetUserWaypointOnMap falso: «no_se_puede», sin marcador y los pines siguen en el mapa', () => {
  const m = maquina();
  m.lua('BANCO.mapasSinMarcador[1411] = true');
  assert.equal(m.lua(`${MK}.seguir(${aLua(pin('Sitio', 60, 60))})`), 'no_se_puede');
  assert.equal(aceptar(m), true);
  assert.equal(marcador(m), undefined);
  assert.equal(puestas(m), 0);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 3);
  sinErrores(m);
});

for (const quitar of ['C_Map.SetUserWaypoint', 'UiMapPoint', 'C_SuperTrack', 'C_Map.CanSetUserWaypointOnMap']) {
  test(`sin ${quitar}: nada roto`, () => {
    const m = maquina({ sinApi: [quitar] });
    const esperado = quitar === 'C_Map.CanSetUserWaypointOnMap' ? 'puesto' : 'no_se_puede';
    assert.equal(m.lua(`${MK}.seguir(${aLua(pin('Sitio', 60, 60))})`), esperado);
    assert.equal(aceptar(m), true);
    assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 3);
    conMapa(m);
    // Con el marcador puesto, el pin que sigue lo pinta Blizzard; sin él, salen los tres.
    assert.equal(pinesMundo(m).length, esperado === 'puesto' ? 2 : 3);
    m.lua('SnetForever.Ruta.quitar()');
    sinErrores(m);
  });
}

test('un punto inválido da «no_se_puede»', () => {
  const m = maquina();
  for (const p of ['nil', '{}', '{mapa = 1411}', '{mapa = 1411.5, x = 1, y = 1}', '{mapa = 1411, x = -1, y = 5}', '{mapa = 1411, x = 5, y = 101}', '"x"']) {
    assert.equal(m.lua(`${MK}.seguir(${p})`), 'no_se_puede', p);
  }
  assert.equal(puestas(m), 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Mapa del mundo y minimapa
// ---------------------------------------------------------------------------------------------------

test('mapa del mundo: los pines con el atlas visible y sin número; el seguido no se pinta (lo pinta Blizzard); clic en otro pin lo sigue', () => {
  const m = maquina();
  aceptar(m, [PARADA_A, ...PINES], 'ruta');
  conMapa(m);
  const lista = pinesMundo(m);
  assert.equal(lista.length, 3, 'la parada y los dos pines que no se siguen');
  const parada = pinMundo(m, '1. Habla con Garra');
  assert.equal(parada.numero, '1');
  assert.equal(parada.atlas, undefined);
  assert.equal(pinMundo(m, 'Pozo viejo'), undefined, 'el seguido ya lo pinta el marcador de Blizzard');
  assert.equal(pinMundo(m, 'Torre caída').atlas, 'Waypoint-MapPin-Tracked');
  assert.equal(pinMundo(m, 'Torre caída').numero, '');
  assert.equal(pinMundo(m, 'Torre caída').aro, false);
  assert.equal(pinMundo(m, 'Cueva norte').atlas, 'Waypoint-MapPin-Tracked');
  const torre = pinMundo(m, 'Torre caída');
  assert.deepEqual(tooltipDe(m, torre.i), ['Torre caída', 'Clic: seguir este pin']);
  m.lua(`SnetForever.PinesMundo.marcos.pines[${torre.i}]:Click("LeftButton")`);
  assert.ok(enSitio(marcador(m), 1411, 50, 60));
  assert.equal(seguido(m), 'Torre caída');
  assert.equal(m.lua('GameTooltip:IsShown()'), false, 'tras el clic el tooltip se esconde (los marcos se reciclan)');
  assert.equal(pinMundo(m, 'Torre caída'), undefined, 'repintado con SNF_MARCADOR_CAMBIADO');
  assert.equal(pinMundo(m, 'Pozo viejo').atlas, 'Waypoint-MapPin-Tracked');
  // El clic derecho no hace nada; el clic en una parada, tampoco.
  m.lua(`SnetForever.PinesMundo.marcos.pines[${pinMundo(m, 'Cueva norte').i}]:Click("RightButton")`);
  m.lua(`SnetForever.PinesMundo.marcos.pines[${pinMundo(m, '1. Habla con Garra').i}]:Click("LeftButton")`);
  assert.ok(enSitio(marcador(m), 1411, 50, 60));
  sinErrores(m);
});

test('mapa del mundo: clic en un pin con el marcador del jugador puesto pregunta', () => {
  const m = maquina();
  aceptar(m);
  jugadorPone(m, 1411, 10, 10);
  conMapa(m);
  const preguntas = contar(m, 'SNF_IA_MARCADOR_PREGUNTA');
  m.lua(`SnetForever.PinesMundo.marcos.pines[${pinMundo(m, 'Cueva norte').i}]:Click("LeftButton")`);
  assert.ok(enSitio(marcador(m), 1411, 10, 10));
  assert.equal(preguntas().n, 1);
  assert.equal(preguntas().ultimo.etiqueta, 'Cueva norte');
  // El chat estaba cerrado: se abre con la pregunta.
  assert.equal(m.lua('SnetForeverChat:IsVisible()'), true);
  assert.equal(m.lua(`${MC}.marcador.texto:GetText()`), 'Ya tienes un marcador tuyo en el mapa. ¿Lo cambio por «Cueva norte»?');
  m.lua(`${MC}.marcador.cambiar:Click()`);
  assert.ok(enSitio(marcador(m), 1411, 70, 20));
  sinErrores(m);
});

test('textos del marcador en inglés', () => {
  const m = maquina({ jugador: { mapa: 1411, x: 50, y: 25, idioma: 'enUS' } });
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.lua('SlashCmdList.SNET("chat")');
  jugadorPone(m, 1411, 10, 10);
  aceptar(m);
  assert.equal(m.lua(`${MC}.marcador.texto:GetText()`), 'You already have your own map pin. Replace it with “Pozo viejo”?');
  assert.equal(m.lua(`${MC}.marcador.cambiar.texto:GetText()`), 'Replace it');
  assert.equal(m.lua(`${MC}.marcador.dejar.texto:GetText()`), 'Keep mine');
  assert.equal(m.lua('SnetForever.L.t("CHAT_MARCADOR_COMBATE", "Pozo viejo")'), 'In combat: I\'ll place the map pin for “Pozo viejo” when it ends.');
  assert.equal(m.lua('SnetForever.L.t("PIN_CLIC_SEGUIR")'), 'Click: track this pin');
  assert.equal(m.lua('SnetForever.L.t("PIN_LO_SIGUES")'), 'Tracking it now');
  sinErrores(m);
});

test('mapa del mundo: sin el atlas en el cliente, el aro de siempre sin número', () => {
  const m = maquina();
  m.lua('BANCO.atlas = {}');
  aceptar(m);
  conMapa(m);
  const p = pinMundo(m, 'Torre caída');
  assert.equal(p.atlas, undefined);
  assert.equal(p.aro, true);
  assert.equal(p.numero, '');
  sinErrores(m);
});

test('mapa del mundo: un pin no se junta con el número de una parada que está al lado', () => {
  const m = maquina();
  aceptar(m, [PARADA_A, pin('Lejos', 80, 80), pin('Al lado', 40.5, 20.5)], 'ruta');
  conMapa(m);
  assert.equal(pinMundo(m, '1. Habla con Garra').numero, '1');
  assert.equal(pinMundo(m, 'Al lado').atlas, 'Waypoint-MapPin-Tracked');
  sinErrores(m);
});

test('mapa del mundo: sin la API del marcador o con el marcador del jugador, el primer pin se pinta como los demás', () => {
  const sinApi = maquina({ sinApi: ['C_Map.SetUserWaypoint'] });
  aceptar(sinApi);
  conMapa(sinApi);
  assert.equal(pinMundo(sinApi, 'Pozo viejo').atlas, 'Waypoint-MapPin-Tracked');
  sinErrores(sinApi);
  const m = maquina();
  jugadorPone(m, 1411, 10, 10);
  aceptar(m);
  conMapa(m);
  assert.equal(pinesMundo(m).length, 3);
  assert.equal(pinMundo(m, 'Pozo viejo').atlas, 'Waypoint-MapPin-Tracked');
  // El jugador cambia el marcador: nuestro pin vuelve a salir.
  const n = maquina();
  aceptar(n);
  conMapa(n);
  assert.equal(pinMundo(n, 'Pozo viejo'), undefined);
  jugadorPone(n, 1411, 15, 15);
  assert.equal(pinMundo(n, 'Pozo viejo').atlas, 'Waypoint-MapPin-Tracked');
  sinErrores(m);
  sinErrores(n);
});

test('minimapa: los pines con el atlas del marcador; las paradas con el aro', () => {
  const m = maquina();
  aceptar(m, [{ ...PARADA_A, x: 50.2, y: 25.2 }, pin('Cerca', 50.5, 25.5), pin('Cerca dos', 49.5, 24.5)], 'ruta');
  m.lua('SnetForever.PinesMinimapa.crear()');
  const lista = m.lua(`(function()
    local salida = {}
    for _, p in ipairs(SnetForever.PinesMinimapa.marcos.pines) do
      if p:IsShown() and p.snfPunto and p.snfPunto.origen == "ia" then
        salida[#salida + 1] = {etiqueta = p.snfPunto.etiqueta, atlas = p.snfIcono and p.snfIcono:IsShown() and p.snfIcono:GetAtlas() or nil,
          aro = p.snfCirculo.tramos[1]:IsShown()}
      end
    end
    return salida
  end)()`);
  const de = (e) => lista.find((p) => p.etiqueta === e);
  assert.equal(de('Cerca'), undefined, 'el seguido lo pinta Blizzard');
  assert.equal(de('Cerca dos').atlas, 'Waypoint-MapPin-Tracked');
  assert.equal(de('Cerca dos').aro, false);
  assert.equal(de('1. Habla con Garra').atlas, undefined);
  assert.equal(de('1. Habla con Garra').aro, true);
  sinErrores(m);
});

test('si el jugador sigue otra cosa (una misión), nuestro pin vuelve a pintarse y se puede pulsar', () => {
  const m = maquina();
  aceptar(m);
  conMapa(m);
  assert.equal(pinMundo(m, 'Pozo viejo'), undefined);
  const cambios = contar(m, 'SNF_MARCADOR_CAMBIADO');
  m.lua('BANCO.seguirOtraCosa()');
  assert.equal(cambios().n, 1);
  assert.equal(seguido(m), undefined);
  assert.equal(pinMundo(m, 'Pozo viejo').atlas, 'Waypoint-MapPin-Tracked');
  assert.deepEqual(tooltipDe(m, pinMundo(m, 'Pozo viejo').i), ['Pozo viejo', 'Clic: seguir este pin']);
  m.lua(`SnetForever.PinesMundo.marcos.pines[${pinMundo(m, 'Pozo viejo').i}]:Click("LeftButton")`);
  assert.equal(m.lua('C_SuperTrack.IsSuperTrackingUserWaypoint()'), true);
  assert.equal(seguido(m), 'Pozo viejo');
  assert.equal(pinMundo(m, 'Pozo viejo'), undefined);
  sinErrores(m);
});

test('con OpenMap cosido el pin seguido se pinta (el de Blizzard queda debajo de su dibujo)', () => {
  const m = maquina();
  m.lua(`OpenMapAPI = {
    IsStitched = function() return true end,
    ArtTopLevel = function() return 10 end,
    CanvasFromWorldPos = function(c, wy, wx) return (-2000 - wx) / 5000, (1800 - wy) / 3500 end,
    RegisterCallback = function() end,
  }`);
  aceptar(m);
  conMapa(m);
  assert.equal(seguido(m), 'Pozo viejo');
  assert.equal(pinMundo(m, 'Pozo viejo').atlas, 'Waypoint-MapPin-Tracked');
  sinErrores(m);
});

test('vestirPin no toca nada si no cambia; sin el atlas lo apunta una vez (minimapa cada 0,1 s)', () => {
  const m = maquina();
  m.lua('BANCO.atlas = {}');
  aceptar(m, [pin('Cerca', 50.5, 25.5), pin('Cerca dos', 49.5, 24.5), pin('Cerca tres', 50.3, 24.7)]);
  m.lua('SnetForever.PinesMinimapa.crear()');
  const consultas = m.llamadas('C_Texture.GetAtlasInfo').length;
  assert.ok(consultas <= 1, `${consultas}`);
  m.lua(`TOQUES = 0
  for _, p in ipairs(SnetForever.PinesMinimapa.marcos.pines) do
    local icono, aro = p.snfIcono, p.snfCirculo
    local a, b = icono.SetShown, aro.SetShown
    icono.SetShown = function(...) TOQUES = TOQUES + 1; return a(...) end
    aro.SetShown = function(...) TOQUES = TOQUES + 1; return b(...) end
  end`);
  m.avanzar(1);
  assert.equal(m.llamadas('C_Texture.GetAtlasInfo').length, consultas, 'sin volver a mirar el atlas');
  assert.equal(m.lua('TOQUES'), 0, 'sin tocar los marcos');
  sinErrores(m);
});

test('/reload: un USER_WAYPOINT_UPDATED durante la carga no olvida lo nuestro', () => {
  const g = { mapa: 1411, x: 0.3, y: 0.4, clave: '1411:30.00:40.00' };
  const n = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 }, guardado: { SnetForeverPJ: { ia: { marcador: g } } }, entrar: false });
  // Antes de entrar al mundo: ni con el marcador aún sin leer ni sin marcador todavía.
  n.lua('BANCO.marcador.punto = {mapa = 1411, x = 0.3, y = 0.4}; BANCO.marcadorIlegible = true');
  n.disparar('USER_WAYPOINT_UPDATED');
  assert.ok(n.lua('SnetForeverPJ.ia.marcador'), 'marcador aún sin leer');
  n.lua('BANCO.marcador.punto = nil');
  n.disparar('USER_WAYPOINT_UPDATED');
  assert.ok(n.lua('SnetForeverPJ.ia.marcador'), 'sin marcador antes de entrar');
  n.lua('BANCO.marcador.punto = {mapa = 1411, x = 0.3, y = 0.4}');
  n.disparar('PLAYER_ENTERING_WORLD');
  // Ya en el mundo: si aún no se lee, tampoco se olvida.
  n.disparar('USER_WAYPOINT_UPDATED');
  assert.ok(n.lua('SnetForeverPJ.ia.marcador'), 'en el mundo, aún sin leer');
  n.lua('BANCO.marcadorIlegible = false');
  n.disparar('USER_WAYPOINT_UPDATED');
  assert.equal(n.lua(`${MK}.esNuestro()`), true);
  // Ya en el mundo y sin marcador: ahora sí.
  n.lua('C_Map.ClearUserWaypoint()');
  assert.equal(n.lua('SnetForeverPJ.ia.marcador'), undefined);
  sinErrores(n);
});

// ---------------------------------------------------------------------------------------------------
// La pregunta del chat
// ---------------------------------------------------------------------------------------------------

test('la pregunta se quita sola si su pin ya no está o si ya no hay marcador', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("chat")');
  jugadorPone(m, 1411, 10, 10);
  aceptar(m);
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), true);
  m.lua('SnetForever.Ruta.quitar()');
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), false, 'sin su pin');
  aceptar(m);
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), true);
  m.lua('C_Map.ClearUserWaypoint()');
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), false, 'sin marcador');
  sinErrores(m);
});

test('«Cambiarlo» nunca pone un pin que ya no existe: tras otra propuesta, el de la nueva', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("chat")');
  jugadorPone(m, 1411, 10, 10);
  aceptar(m);
  aceptar(m, [pin('Sitio nuevo', 66, 66)]);
  assert.equal(m.lua(`${MC}.marcador.texto:GetText()`), 'Ya tienes un marcador tuyo en el mapa. ¿Lo cambio por «Sitio nuevo»?');
  m.lua(`${MC}.marcador.cambiar:Click()`);
  assert.ok(enSitio(marcador(m), 1411, 66, 66));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Volver a elegir una ruta de pines («Rutas de la IA»)
// ---------------------------------------------------------------------------------------------------

const idDe = (m, titulo) => m.lua(`(function()
  for _, r in ipairs(SnetForever.Ruta.rutasGuardadas()) do if r.titulo == ${aLua(titulo)} then return r.id end end
end)()`);
function dosRutas(m) {
  m.lua(`SnetForever.Ruta.proponer(${aLua({ titulo: 'Primera', tipo: 'pines', puntos: PINES })})`);
  m.lua('SnetForever.Ruta.aceptar()');
  m.lua(`SnetForever.Ruta.proponer(${aLua({ titulo: 'Segunda', tipo: 'pines', puntos: [pin('Otro sitio', 65, 65)] })})`);
  m.lua('SnetForever.Ruta.aceptar()');
}

test('activarGuardada pone el marcador en el primer pin de la ruta elegida', () => {
  const m = maquina();
  dosRutas(m);
  assert.ok(enSitio(marcador(m), 1411, 65, 65));
  assert.equal(m.lua(`SnetForever.Ruta.activarGuardada(${idDe(m, 'Primera')})`), true);
  assert.ok(enSitio(marcador(m), 1411, 30, 40));
  assert.equal(seguido(m), 'Pozo viejo');
  sinErrores(m);
});

test('activarGuardada con el marcador del jugador pregunta y no lo toca', () => {
  const m = maquina();
  dosRutas(m);
  jugadorPone(m, 1411, 10, 10);
  const preguntas = contar(m, 'SNF_IA_MARCADOR_PREGUNTA');
  m.lua(`SnetForever.Ruta.activarGuardada(${idDe(m, 'Primera')})`);
  assert.ok(enSitio(marcador(m), 1411, 10, 10));
  assert.equal(preguntas().n, 1);
  assert.equal(preguntas().ultimo.etiqueta, 'Pozo viejo');
  sinErrores(m);
});

test('activarGuardada de la ruta activa con su guía a medias también pone el marcador en su primer pin', () => {
  const m = maquina();
  aceptar(m, [PARADA_A, pin('Atalaya rota', 20, 70), PARADA_C], 'ruta');
  m.lua(`${MK}.quitar()`);
  assert.equal(marcador(m), undefined);
  const id = m.lua('SnetForever.Ruta.rutasGuardadas()[1].id');
  m.lua(`SnetForever.Ruta.activarGuardada(${id})`);
  assert.ok(enSitio(marcador(m), 1411, 20, 70));
  sinErrores(m);
});

test('activarGuardada en combate espera a salir', () => {
  const m = maquina();
  dosRutas(m);
  const combate = contar(m, 'SNF_IA_MARCADOR_COMBATE');
  entrarEnCombate(m);
  const antes = puestas(m);
  m.lua(`SnetForever.Ruta.activarGuardada(${idDe(m, 'Primera')})`);
  assert.equal(puestas(m), antes);
  assert.equal(combate().n, 1);
  salirDeCombate(m);
  assert.ok(enSitio(marcador(m), 1411, 30, 40));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Quitar pines, /reload y el jugador que cambia el marcador
// ---------------------------------------------------------------------------------------------------

test('«Quitar pines» quita el marcador nuestro', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("chat")');
  aceptar(m);
  m.lua(`${MC}.quitarPines:Click()`);
  assert.equal(marcador(m), undefined);
  assert.equal(m.lua('SnetForeverPJ.ia.marcador'), undefined);
  assert.equal(m.lua(`${MK}.seguido()`), undefined);
  sinErrores(m);
});

test('«Quitar pines» no quita el marcador del jugador', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("chat")');
  jugadorPone(m, 1411, 10, 10);
  aceptar(m);
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), true);
  m.lua(`${MC}.quitarPines:Click()`);
  assert.ok(enSitio(marcador(m), 1411, 10, 10));
  assert.equal(m.llamadas('C_Map.ClearUserWaypoint').length, 0);
  assert.equal(m.lua(`${MC}.marcador:IsVisible()`), false, 'sin pines, sin pregunta');
  sinErrores(m);
});

test('tras /reload se sigue reconociendo el nuestro (sin volver a ponerlo) y «Quitar pines» lo quita', () => {
  const m = maquina();
  aceptar(m);
  const n = m.recargar();
  assert.equal(puestas(n), 0, 'al entrar al mundo no se vuelve a poner');
  assert.ok(enSitio(marcador(n), 1411, 30, 40));
  assert.equal(n.lua(`${MK}.esNuestro()`), true);
  assert.equal(seguido(n), 'Pozo viejo');
  assert.deepEqual(n.lua('SnetForever.Capa.puntos("ia")').map((p) => p.esPin), [true, true, true]);
  n.lua('SnetForever.Ruta.quitar()');
  assert.equal(marcador(n), undefined);
  sinErrores(n);
});

test('el jugador cambia el marcador: lo nuestro se olvida y «Quitar pines» ya no lo quita', () => {
  const m = maquina();
  const cambios = contar(m, 'SNF_MARCADOR_CAMBIADO');
  aceptar(m);
  const antes = cambios().n;
  jugadorPone(m, 1411, 15, 15);
  assert.equal(m.lua(`${MK}.esNuestro()`), false);
  assert.equal(m.lua(`${MK}.seguido()`), undefined);
  assert.equal(m.lua('SnetForeverPJ.ia.marcador'), undefined);
  assert.equal(cambios().n, antes + 1);
  m.lua('SnetForever.Ruta.quitar()');
  assert.ok(enSitio(marcador(m), 1411, 15, 15));
  sinErrores(m);
});

test('el jugador quita el marcador: lo nuestro se olvida', () => {
  const m = maquina();
  aceptar(m);
  m.lua('C_Map.ClearUserWaypoint()');
  assert.equal(m.lua('SnetForeverPJ.ia.marcador'), undefined);
  jugadorPone(m, 1411, 30, 40); // el jugador pone uno suyo en el mismo sitio: ya no es nuestro
  m.lua('SnetForever.Ruta.quitar()');
  assert.ok(enSitio(marcador(m), 1411, 30, 40));
  sinErrores(m);
});
