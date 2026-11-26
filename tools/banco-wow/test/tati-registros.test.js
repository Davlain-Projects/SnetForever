// Puente TATI, tarea A2: lo que TATI manda sin pregunta (origen = "tati") se enseña como una respuesta sin tocar el
// envío del jugador, y «TATI» sale como nombre del motor (ia/envio.lua, ui/chat.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DATOS = ['rutas-mini.lua', 'misiones-mini.lua', 'laterales-mini.lua'].map((f) => join(FIXTURES, f));
const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 };
const MC = 'SnetForever.Chat.marcos';
const ES = { datos: DATOS, jugador: { ...DRUIDA, idioma: 'esES' } };
const sinColor = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');

const P1 = { mapa: 1411, x: 40, y: 20, etiqueta: 'Sitio uno', tipo: 'lugar', seguir: false };
const P2 = { mapa: 1411, x: 60, y: 30, etiqueta: 'Sitio dos', tipo: 'lugar', seguir: false };
const GUIA = {
  clave: 'IA\\Ruta de prueba', tipo: 'ia', sinVerificar: true, grupo: 'IA', nombre: 'Ruta de prueba',
  titulo: { es: 'Ruta de prueba', en: 'Test route' }, faccion: 'Horde',
  niveles: { min: 5, max: 12 }, siguientes: [], mazmorras: {}, fuente: { archivo: 'ia', linea: 0 },
  resumen: { misiones: 1, pasos: 1, elites: 0, grupo: 0 },
  pasos: [{ id: 'ia1', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [
    { t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' }, { t: 'accept', q: 7001 }] }],
};

const INICIO = 'Prueba (H)\\01-02 Inicio';
const abierto = () => {
  const m = nuevaMaquina(ES);
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  m.lua('SlashCmdList.SNET("chat")');
  return m;
};
const pj = (m) => m.lua('SnetForever.Personaje.clave()');
const estado = (m) => m.lua('SnetForever.Envio.estado()');
const emitir = (m, campos) => m.lua(
  `SnetForever.Eventos.emitir("SNF_IA_REGISTRO", ${aLua({ seq: 100, pj: pj(m), msg: 'tati-100', t: 'respuesta', origen: 'tati', ...campos })})`);
const lineas = (m) => (m.lua(`(function()
  local s, t = ${MC}.mensajes, {}
  for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
  return t
end)()`) || []).map(sinColor);
const hay = (m, texto) => lineas(m).some((l) => l.includes(texto));

// T3: la guiaIA con abrirGuiaIA solo se abre sola sin guía cargada o con la cargada acabada (aquí, una de un paso cuya
// misión ya está en el diario).
function conGuiaAcabada(m) {
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 4641 }] }]));
  m.estadoMision(4641, { enDiario: true });
  m.lua(`SnetForever.Guias.cargar(${aLua(guiaDePrueba([]).clave)})`);
  m.lua('SnetForever.Motor.actualizar()');
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
}

test('un registro de TATI con texto y guía con abrirGuiaIA pinta «IA: …» y abre la guía (con la cargada acabada, T3)', () => {
  const m = abierto();
  conGuiaAcabada(m);
  emitir(m, { texto: 'Te propongo esto.', guiaIA: GUIA, abrirGuiaIA: true });
  assert.ok(hay(m, 'IA: Te propongo esto.'), lineas(m).join(' | '));
  assert.ok(hay(m, 'Guía de la IA abierta: Ruta de prueba'), lineas(m).join(' | '));
  assert.equal(estado(m).fase, 'libre');
  sinErrores(m);
});

test('un registro de TATI con propuesta de pines enseña la tarjeta Aceptar y Descartar', () => {
  const m = abierto();
  emitir(m, { texto: 'Mira estos sitios.', propuesta: { titulo: 'Pines', puntos: [P1, P2] } });
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), true);
  assert.equal(m.lua(`${MC}.propuesta.aceptar:IsVisible()`), true);
  assert.equal(m.lua(`${MC}.propuesta.descartar:IsVisible()`), true);
  sinErrores(m);
});

test('con un mensaje del jugador en «pensando», TATI se enseña y el estado sigue en «pensando»', () => {
  const m = abierto();
  m.lua(`${MC}.entrada:SetText("hola")`);
  m.lua(`${MC}.entrada:GetScript("OnEnterPressed")(${MC}.entrada)`);
  m.avanzar(4);
  const antes = estado(m);
  assert.equal(antes.fase, 'pensando');
  emitir(m, { texto: 'Aviso de TATI.' });
  assert.ok(hay(m, 'IA: Aviso de TATI.'));
  const despues = estado(m);
  assert.equal(despues.fase, 'pensando');
  assert.equal(despues.id, antes.id);
  assert.equal(despues.desde, antes.desde);
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", ${aLua({ seq: 101, pj: pj(m), msg: antes.id, t: 'respuesta', texto: 'La respuesta.' })})`);
  assert.equal(estado(m).fase, 'libre');
  assert.ok(hay(m, 'IA: La respuesta.'));
  sinErrores(m);
});

test('un registro de TATI de otro personaje no se enseña', () => {
  const m = abierto();
  emitir(m, { texto: 'De otro.', pj: 'Otro Jugador-Reino Prueba' });
  assert.equal(hay(m, 'De otro.'), false);
  sinErrores(m);
});

test('un registro con origen raro, o sin origen y de otro mensaje, no se enseña', () => {
  const m = abierto();
  emitir(m, { texto: 'Raro.', origen: 'otro' });
  emitir(m, { texto: 'Sin origen.', origen: undefined });
  assert.equal(hay(m, 'Raro.'), false);
  assert.equal(hay(m, 'Sin origen.'), false);
  sinErrores(m);
});

test('con motorNombre = "tati" la cabecera dice «TATI» y el modelo sin «con …», en es y en', () => {
  for (const idioma of ['esES', 'enUS']) {
    const m = nuevaMaquina({ ...ES, jugador: { ...DRUIDA, idioma } });
    m.lua('SlashCmdList.SNET("chat")');
    m.lua('SnetForever.Buzon.estadoApp = function() return {motor = "ok", motorNombre = "tati"} end');
    m.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
    assert.equal(m.lua('SnetForever.Chat.textoMotor()'), idioma === 'esES' ? 'Motor: TATI' : 'Engine: TATI', idioma);
    assert.ok(m.lua(`${MC}.subtitulo:GetText()`).includes('TATI'), idioma);
    assert.equal(m.lua('SnetForever.Chat.textoModelo("opus")'), m.lua('SnetForever.L.t("MODELO_OPUS")'));
    sinErrores(m);
  }
});
