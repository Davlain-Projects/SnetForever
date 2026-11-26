// Lote E3: el historial del chat (ScrollingMessageFrame de ui/chat.lua) no corta la primera línea visible. El marco de
// los mensajes mide un número entero de renglones (alto de la letra + el espacio entre líneas) y va pegado abajo: con el
// historial abajo del todo, la línea de arriba cae entera. Al llegar una respuesta, el chat baja al final.
// El banco no tiene motor de texto: aquí se comprueba la medida (múltiplo del renglón) y el desplazamiento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const MC = 'SnetForever.Chat.marcos';

function conChat(opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.lua('SnetForever.Chat.abrir()');
  return m;
}

const medidas = (m) => m.lua(`(function()
  local s = ${MC}.mensajes
  local _, tamano = s:GetFont()
  local p, rel, rp, x, y = s:GetPoint(1)
  return {alto = s:GetHeight(), renglon = tamano, caja = ${MC}.cajaMensajes:GetHeight(), punto = p, relPunto = rp,
    relCaja = rel == ${MC}.cajaMensajes, y = y, puntos = s:GetNumPoints()}
end)()`);

function comprobarRenglones(m, etiqueta) {
  const d = medidas(m);
  assert.ok(d.renglon > 0, etiqueta);
  const renglones = d.alto / d.renglon;
  assert.ok(Math.abs(renglones - Math.round(renglones)) < 1e-9, `${etiqueta}: ${d.alto} no es un número entero de renglones de ${d.renglon}`);
  assert.ok(Math.round(renglones) >= 4, `${etiqueta}: al menos cuatro renglones (${renglones})`);
  // Cabe en su caja (con su relleno) y va pegado abajo: lo que sobra queda arriba, por encima de la primera línea.
  assert.ok(d.alto <= d.caja - 2 * 5 + 1e-9, `${etiqueta}: ${d.alto} cabe en ${d.caja}`);
  assert.equal(d.punto.startsWith('BOTTOM'), true, `${etiqueta}: anclado abajo (${d.punto})`);
  assert.equal(d.relCaja, true);
  return d;
}

test('E3: el historial mide un número entero de renglones y va pegado abajo de su caja', () => {
  const m = conChat();
  comprobarRenglones(m, 'reposo');
  sinErrores(m);
});

test('E3: con el aviso de la app o una propuesta (la caja cambia de alto), sigue en renglones enteros', () => {
  const m = conChat();
  const antes = medidas(m).caja;
  m.lua(`SnetForever.Ruta.proponer({titulo = "R", puntos = {{mapa = 1411, x = 40, y = 20, etiqueta = "A", tipo = "lugar", seguir = true}}})`);
  const d = comprobarRenglones(m, 'con propuesta');
  assert.notEqual(d.caja, antes, 'la caja cambió de alto');
  sinErrores(m);
});

test('E3: al llegar una respuesta, el chat baja al final aunque el jugador hubiera subido', () => {
  const m = conChat();
  for (let i = 0; i < 30; i++) m.lua(`SnetForever.Chat.anadir("sistema", "línea ${i}")`);
  m.lua(`${MC}.mensajes:ScrollUp(); ${MC}.mensajes:ScrollUp()`);
  assert.ok(m.lua(`${MC}.mensajes:GetScrollOffset()`) > 0);
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RESPUESTA", {texto = "Te queda pendiente aquí, en este orden."})');
  assert.equal(m.lua(`${MC}.mensajes:GetScrollOffset()`), 0);
  comprobarRenglones(m, 'tras la respuesta');
  sinErrores(m);
});
