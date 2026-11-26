import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

test('the trade status changes only after a stable 10-second signal', () => {
  const m = nuevaMaquina();
  try {
    const colors = m.lua(`(function()
      local filter = SnetForever.EstadoComercio.newFilter()
      return {
        filter("verde", 0), filter("error", 1), filter("verde", 5),
        filter("error", 6), filter("error", 15), filter("error", 16),
        filter("verde", 17), filter("verde", 26), filter("verde", 27),
      }
    end)()`);
    assert.deepEqual(colors, ['verde', 'verde', 'verde', 'verde', 'verde', 'error', 'error', 'error', 'verde']);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('an unchanged trade status does not redraw its warning marks', () => {
  const m = nuevaMaquina();
  try {
    const counts = m.lua(`(function()
      local state = { color = "verde", warning = false, lines = {} }
      SnetForever.EstadoComercio.current = function() return state end
      local p = SnetForever.Piezas.puntoEstado(UIParent, 12)
      local calls = 0
      for _, mark in ipairs(p.signo) do
        local original = mark.SetShown
        mark.SetShown = function(self, visible)
          calls = calls + 1
          original(self, visible)
        end
      end
      p:refresh()
      local unchanged = calls
      state.color, state.warning = "error", true
      p:refresh()
      p:refresh()
      return {unchanged, calls, p.signo[1]:IsShown()}
    end)()`);
    assert.deepEqual(counts, [0, 2, true]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});
