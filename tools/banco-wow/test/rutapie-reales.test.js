// 11-nov: la red de caminos a pie con los datos reales (motor/rutapie.lua). el jugador siguió la flecha en línea recta desde
// Refugio Roca del Sol (Sierra Espolón) hacia Vallefresno y acabó contra una montaña.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { estimarMemoria } from './memoria.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const reales = { skip: hayDatos ? false : 'no están los addons de datos', timeout: 900000 };
const DRUIDA = { raza: 'Tauren', clase: 'DRUID', faccion: 'Horde', nivel: 24 };

// 16-nov: los sitios de misión seguidos ya no son camino (más de 250 yd). De Roca del Sol a Zoram'gar el camino de antes
// saltaba entre sitios de misión de 474 a 847 yd y ya no sale; el Paso de Talondeep sí: el goto «Entra en El Paso del
// Espolón» es un paso de solo ir, y los tramos que llegan y salen de él siguen siendo camino. Se prueba de un lado del
// paso (Sierra Espolón 72.0, 59.9) al otro (Vallefresno 40.4, 61.3).
test('datos reales: la red de Kalimdor cruza de Sierra Espolón a Vallefresno por el Paso de Talondeep', reales, (t) => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: DRUIDA, forever: true });
  // Rectángulos reales de Sierra Espolón (1442) y Vallefresno (1440), sacados de dos maestros de vuelo de cada zona: su
  // sitio en el mundo (OpenMap, Data/Forever/FlightData.lua) y en el mapa de la zona (la base). El de Durotar del banco
  // es inventado y se quita para que sus puntos no caigan encima.
  m.lua(`BANCO.mapas[1442] = {nombre = "Stonetalon", inst = 1, padre = 1414, tipo = 3, izquierda = 3230.8, arriba = 2914.9, ancho = 4854.8, alto = 3255.8}
  BANCO.mapas[1440] = {nombre = "Ashenvale", inst = 1, padre = 1414, tipo = 3, izquierda = 1704.3, arriba = 4678.9, ancho = 5778.8, alto = 3858.6}`);
  m.jugador({ mapa: 1442, x: 45, y: 60 });
  m.lua("BANCO.mapas[1411] = nil");
  const antes = estimarMemoria(m).bytes;
  const t0 = Date.now();
  const n = m.lua('(function() local r = SnetForever.RutaPie.construir(1) return r and r.n end)()');
  const ms = Date.now() - t0;
  const despues = estimarMemoria(m).bytes;
  t.diagnostic(`red de Kalimdor: ${n} nudos, ${((despues - antes) / 1024).toFixed(0)} kB, ${ms} ms en el banco`);
  assert.ok(n > 1000, String(n));
  const r = m.lua(`(function()
    local desde = SnetForever.Coord.aMundo({mapa = 1442, x = 72.0, y = 59.9})
    local hasta = SnetForever.Coord.aMundo({mapa = 1440, x = 40.4, y = 61.3})
    local c = SnetForever.RutaPie.buscar(desde, hasta)
    local dx, dy = desde.wx - hasta.wx, desde.wy - hasta.wy
    -- La entrada del Paso de Talondeep en Sierra Espolón (el goto «Entra en El Paso del Espolón» de la guía).
    local talondeep
    for _, p in ipairs(c and c.puntos or {}) do
      local ex, ey = p.wx - (-577.33), p.wy - 1532.43
      local d = math.sqrt(ex * ex + ey * ey)
      if talondeep == nil or d < talondeep then talondeep = d end
    end
    return {recta = math.sqrt(dx * dx + dy * dy), largo = c and c.largo, puntos = c and #c.puntos, talondeep = talondeep}
  end)()`);
  t.diagnostic(`Sierra Espolón → Vallefresno: recta ${Math.round(r.recta)} yd, camino ${Math.round(r.largo ?? 0)} yd en ${r.puntos} puntos`);
  assert.ok(r.largo, 'hay camino');
  assert.ok(r.largo >= r.recta, 'por el camino, no más corto que la recta');
  assert.ok(r.talondeep < 150, `pasa por el Paso de Talondeep (a ${Math.round(r.talondeep)} yd de su entrada)`);
  sinErrores(m);
});

// 12-nov (en el juego, con capturas): del Puesto del Hachazo (Vallefresno 73.4, 60.3) a Shadumbra (61.2, 51.5) no se puede
// ir en línea recta: el puesto está en alto y al otro lado del río hay una pared en herradura. La guía baja al río y sube
// por la orilla («Corre por el borde del río hasta aquí», 72.3, 49.8). El camino tiene que hacer lo mismo, y empezar por
// la bajada al río (71.75, 63.83), no por la vuelta al sur.
// 16-nov: el último tramo de antes hasta Shadumbra (los sátiros → Ordanus, 369 yd entre dos sitios de misión) ya no es
// camino; se prueba hasta los sátiros (68.2, 54.0), que es a donde llega el «Corre por el borde del río».
test('datos reales: del Puesto del Hachazo a los sátiros, bajando al río y por la orilla', reales, (t) => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: DRUIDA, forever: true });
  m.lua(`BANCO.mapas[1442] = {nombre = "Stonetalon", inst = 1, padre = 1414, tipo = 3, izquierda = 3230.8, arriba = 2914.9, ancho = 4854.8, alto = 3255.8}
  BANCO.mapas[1440] = {nombre = "Ashenvale", inst = 1, padre = 1414, tipo = 3, izquierda = 1704.3, arriba = 4678.9, ancho = 5778.8, alto = 3858.6}`);
  m.jugador({ mapa: 1440, x: 73.4, y: 60.3 });
  m.lua("BANCO.mapas[1411] = nil");
  const r = m.lua(`(function()
    local C = SnetForever.Coord
    local hasta = C.aMundo({mapa = 1440, x = 68.2, y = 54.0})
    local function cerca(c, x, y)
      local w, d = C.aMundo({mapa = 1440, x = x, y = y})
      for _, p in ipairs(c and c.puntos or {}) do
        local e = math.sqrt((p.wx - w.wx) ^ 2 + (p.wy - w.wy) ^ 2)
        if d == nil or e < d then d = e end
      end
      return d
    end
    local out = {}
    for _, yo in ipairs({{73.4, 60.3}, {70.8, 63.1}}) do
      local c = SnetForever.RutaPie.buscar(C.aMundo({mapa = 1440, x = yo[1], y = yo[2]}), hasta)
      out[#out + 1] = {largo = c and c.largo, segundo = c and c.puntos[2] and C.aMundo({mapa = 1440, x = 71.75, y = 63.83}) and
        math.sqrt((c.puntos[2].wx - C.aMundo({mapa = 1440, x = 71.75, y = 63.83}).wx) ^ 2 + (c.puntos[2].wy - C.aMundo({mapa = 1440, x = 71.75, y = 63.83}).wy) ^ 2),
        orilla = cerca(c, 72.3, 49.8)}
    end
    return out
  end)()`);
  for (const [i, c] of r.entries()) {
    t.diagnostic(`desde ${i === 0 ? 'el Puesto del Hachazo' : 'el río'}: camino ${Math.round(c.largo ?? 0)} yd`);
    assert.ok(c.largo && c.largo < 1600, String(c.largo));
    assert.ok(c.segundo < 30, 'empieza por la bajada al río (71.75, 63.83)');
    assert.ok(c.orilla < 30, 'pasa por el borde del río (72.3, 49.8)');
  }
  sinErrores(m);
});

// 16-nov (en el juego, con captura): de Poblado Viento Libre (Las Mil Agujas 45.7, 50.3) a la Cumbre de la Nube Negra
// (31.8, 32.6) la línea naranja saltaba a la cueva de las arpías (838 yd) y a Nido Alto (848 yd) por encima de los
// cortados: eran sitios de misión seguidos de una guía, no un camino. Ahora no hay ningún tramo de más de 250 yd (o no
// hay camino, y la flecha dice «sin camino conocido»).
test('datos reales: de Viento Libre a la Cumbre de la Nube Negra no hay ningún tramo de más de 250 yd', reales, (t) => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: DRUIDA, forever: true });
  // El WorldMapArea clásico de Las Mil Agujas (comprobado con el maestro de vuelo de Viento Libre de OpenMap).
  m.lua(`BANCO.mapas[1441] = {nombre = "Thousand Needles", inst = 1, padre = 1414, tipo = 3, izquierda = -433.33, arriba = -3966.67, ancho = 4400, alto = 2933.33}
  BANCO.mapas[1411] = nil`);
  const r = m.lua(`(function()
    local C = SnetForever.Coord
    local c = SnetForever.RutaPie.buscar(C.aMundo({mapa = 1441, x = 45.7, y = 50.3}), C.aMundo({mapa = 1441, x = 31.8, y = 32.6}))
    local maximo = 0
    for k = 2, #(c and c.puntos or {}) do
      local a, b = c.puntos[k - 1], c.puntos[k]
      maximo = math.max(maximo, math.sqrt((a.wx - b.wx) ^ 2 + (a.wy - b.wy) ^ 2))
    end
    return {hay = c ~= nil, n = c and #c.puntos or 0, maximo = maximo}
  end)()`);
  t.diagnostic(`Viento Libre → Nube Negra: ${r.hay ? `${r.n} puntos, tramo más largo ${Math.round(r.maximo)} yd` : 'sin camino'}`);
  assert.ok(r.maximo <= 250, `tramo de ${Math.round(r.maximo)} yd`);
  sinErrores(m);
});
