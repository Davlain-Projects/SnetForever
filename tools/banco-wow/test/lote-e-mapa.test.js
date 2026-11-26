// Lote E4: con una ruta de la IA activa, el mapa del mundo (el de Blizzard o el de OpenMap) dibuja la línea que une las
// paradas entre sí, en orden (mapa/pines-mundo.lua). El tramo que sale de la parada actual va resaltado. Solo los tramos
// del mapa que se ve; nada por fotograma: se redibuja con los eventos. Mapas del banco: Durotar 1411 (inst 1), Ventormenta
// 1453 (inst 0). Lienzo de 1000 x 667. Mapa 1411: wx = -2000 - 5000·x/100, wy = 1800 - 3500·y/100.
// 16-nov (regla del jugador: «mejor sin línea que una por donde no se puede ir»): la línea va de parada a parada por el
// camino a pie (RutaPie.tramos), no en recta; sin camino conocido, sin línea. El tramo del jugador a la parada actual ya
// no es de la E4 (ni su temporizador): lo pinta la línea a pie de la flecha. Por eso las pruebas ponen una guía de solo ir
// por las tres paradas (CAMINO): con ella hay camino entre ellas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina as maquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const R = 'SnetForever.Ruta';
const LUGARES = [
  { mapa: 1411, x: 60, y: 30, etiqueta: 'Mira A', tipo: 'lugar', seguir: true },
  { mapa: 1411, x: 70, y: 30, etiqueta: 'Mira B', tipo: 'lugar', seguir: true },
  { mapa: 1411, x: 80, y: 30, etiqueta: 'Mira C', tipo: 'lugar', seguir: true },
];
const IR = (x, y) => ({ t: 'goto', mapa: 1411, x, y, modo: 'flecha' });
const CAMINO = { ...guiaDePrueba([{ elementos: [IR(60, 30), IR(70, 30), IR(80, 30)] }]), clave: 'Prueba\\camino' };
const mundo1411 = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });
const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// La máquina con la guía del camino (o la que se pase) en la red de caminos a pie.
function nuevaMaquina(opciones = {}, guias = [CAMINO]) {
  const m = maquina(opciones);
  for (const g of guias) m.ponerGuia(g);
  m.lua('SnetForever.RutaPie.redes = {}');
  return m;
}

function conMapa(opciones = {}, guias) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 }, ...opciones }, guias);
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1');
  m.lua('SnetForever.PinesMundo.crear()');
  m.lua('WorldMapFrame:Show()');
  return m;
}

function aceptar(m, puntos = LUGARES, tipo) {
  m.lua(`${R}.proponer(${aLua({ titulo: 'Bosque', tipo, puntos })}); ${R}.aceptar()`);
}

// Tramos visibles: {desde = {x, y}, hasta = {x, y}, grosor, alfa}, en el orden en que se dibujaron.
const tramos = (m) => m.lua(`(function()
  local salida = {}
  for _, l in ipairs(SnetForever.PinesMundo.marcos.lineas) do
    if l:IsShown() then
      local _, _, x1, y1 = l:GetStartPoint()
      local _, _, x2, y2 = l:GetEndPoint()
      local _, _, _, a = l:GetVertexColor()
      salida[#salida + 1] = {desde = {x1, y1}, hasta = {x2, y2}, grosor = l:GetThickness(), alfa = a}
    end
  end
  return salida
end)()`) || [];
const repintar = (m) => m.lua('WorldMapFrame:OnMapChanged()');
const lienzo = (x, y) => [x / 100 * 1000, -y / 100 * 667];

test('banco: Frame:CreateLine da un Line con SetStartPoint/SetEndPoint/SetThickness (y Get…)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local f = CreateFrame("Frame", nil, UIParent)
    local l = f:CreateLine(nil, "ARTWORK")
    l:SetStartPoint("TOPLEFT", f, 1, -2); l:SetEndPoint("TOPLEFT", f, 3, -4); l:SetThickness(3)
    local p1, r1, x1, y1 = l:GetStartPoint()
    local p2, r2, x2, y2 = l:GetEndPoint()
    return {l:GetObjectType(), l:IsObjectType("Texture"), p1, r1 == f, x1, y1, p2, x2, y2, l:GetThickness()}
  end)()`);
  assert.deepEqual(r, ['Line', true, 'TOPLEFT', true, 1, -2, 'TOPLEFT', 3, -4, 3]);
  sinErrores(m);
});

test('E4: con una ruta de 3 paradas en el mapa visto, 2 tramos (1 → 2, 2 → 3) por el camino, en su sitio del lienzo', () => {
  const m = conMapa();
  assert.equal(tramos(m).length, 0, 'sin ruta, nada');
  aceptar(m);
  const t = tramos(m);
  assert.equal(t.length, 2);
  const esperado = [[lienzo(60, 30), lienzo(70, 30)], [lienzo(70, 30), lienzo(80, 30)]];
  for (let i = 0; i < 2; i++) {
    for (const [a, b] of [[t[i].desde, esperado[i][0]], [t[i].hasta, esperado[i][1]]]) {
      assert.ok(cerca(a[0], b[0], 1e-3) && cerca(a[1], b[1], 1e-3), `tramo ${i + 1}: ${a} frente a ${b}`);
    }
  }
  // El tramo que sale de la parada actual va resaltado (más grueso y más opaco); todos semitransparentes y de 3 a 4,5 px.
  assert.ok(t[0].grosor > t[1].grosor && t[0].alfa > t[1].alfa);
  for (const tramo of t) assert.ok(tramo.grosor >= 3 && tramo.grosor <= 4.5 && tramo.alfa < 1);
  // La parada actual, resaltada: su pin es más grande.
  const tamanos = m.lua(`(function() local t = {}
    for _, p in ipairs(SnetForever.PinesMundo.marcos.pines) do
      if p:IsShown() and p.snfPunto and p.snfPunto.etiqueta then t[p.snfPunto.etiqueta] = p:GetWidth() end
    end
    return t end)()`);
  assert.ok(tamanos['1. Mira A'] > tamanos['2. Mira B'], JSON.stringify(tamanos));
  sinErrores(m);
});

test('16-nov: sin camino conocido entre las paradas no hay línea; con un rodeo por las guías, la línea sigue el rodeo', () => {
  const sin = conMapa({}, []);
  aceptar(sin);
  assert.equal(tramos(sin).length, 0, 'paradas a 500 yd sin camino: sin línea (nunca en recta)');
  sinErrores(sin);
  // De A (60, 30) a B (70, 30) solo por (65, 40): dos tramos de la guía de solo ir.
  const rodeo = { ...guiaDePrueba([{ elementos: [IR(60, 30), IR(65, 40), IR(70, 30)] }]), clave: 'Prueba\\rodeo' };
  const m = conMapa({}, [rodeo]);
  aceptar(m, LUGARES.slice(0, 2));
  const t = tramos(m);
  assert.equal(t.length, 2);
  assert.ok(cerca(t[0].hasta[0], lienzo(65, 40)[0], 1e-3) && cerca(t[0].hasta[1], lienzo(65, 40)[1], 1e-3), JSON.stringify(t[0]));
  sinErrores(m);
});

test('E4: al cambiar a otro mapa, 0 tramos; al volver, 2; al quitar la ruta, 0', () => {
  const m = conMapa();
  aceptar(m);
  m.lua('BANCO.mapaMundo = 1453');
  repintar(m);
  assert.equal(tramos(m).length, 0);
  m.lua('BANCO.mapaMundo = 1411');
  repintar(m);
  assert.equal(tramos(m).length, 2);
  m.lua(`${R}.quitar()`);
  assert.equal(tramos(m).length, 0);
  sinErrores(m);
});

test('E4: al llegar a una parada se redibuja (2 → 3); con solo pines no hay línea', () => {
  const m = conMapa();
  aceptar(m);
  const a = mundo1411(60, 30);
  m.jugador({ mundo: { wx: a.wx, wy: a.wy + 3, inst: 1 } });
  m.lua('SnetForever.Navegacion.comprobarLlegada()');
  m.avanzar(0.5); // lote F: la parada es un paso de la guía de la ruta, que avanza en el siguiente ciclo del motor
  const t = tramos(m);
  assert.equal(t.length, 1);
  assert.ok(cerca(t[0].desde[0], lienzo(70, 30)[0], 1e-3));
  m.lua(`${R}.quitar()`);
  aceptar(m, LUGARES, 'pines');
  assert.equal(tramos(m).length, 0);
  sinErrores(m);
});

test('E4: nada por fotograma ni temporizador: andar con el mapa abierto no redibuja la línea; con el mapa cerrado, nada', () => {
  const m = conMapa();
  aceptar(m);
  const dibujos = () => m.llamadas('Line:SetStartPoint').length;
  let antes = dibujos();
  m.avanzar(0.5);
  assert.equal(dibujos(), antes, 'medio segundo: nada');
  m.jugador({ mundo: mundo1411(55, 25) });
  m.avanzar(2.5);
  assert.equal(dibujos(), antes, 'el jugador no tiene tramo propio en la E4');
  m.lua('WorldMapFrame:Hide()');
  antes = dibujos();
  m.avanzar(5);
  assert.equal(dibujos(), antes, 'con el mapa cerrado no se dibuja');
  sinErrores(m);
});

test('E4: con OpenMap los tramos van donde dice CanvasFromWorldPos; con pines.mundo apagado, nada', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua(`OpenMapAPI = {
    IsStitched = function() return true end,
    ArtTopLevel = function() return 10 end,
    CanvasFromWorldPos = function(c, wy, wx) return (-2000 - wx) / 5000, (1800 - wy) / 3500 end,
    RegisterCallback = function() end,
  }`);
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1; SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  aceptar(m);
  const t = tramos(m);
  assert.equal(t.length, 2);
  assert.ok(cerca(t[0].desde[0], lienzo(60, 30)[0], 1e-3) && cerca(t[0].hasta[1], lienzo(70, 30)[1], 1e-3), JSON.stringify(t[0]));
  m.lua('SnetForever.Ajustes.set("pines.mundo", false)');
  assert.equal(tramos(m).length, 0);
  sinErrores(m);
});

test('E4: sin CreateLine en el cliente, cada tramo es una textura girada en el centro del tramo', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua('BANCO.clases.Frame.metodos.CreateLine = nil');
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1; SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  aceptar(m);
  const t = m.lua(`(function()
    local salida = {}
    for _, l in ipairs(SnetForever.PinesMundo.marcos.lineas) do
      if l:IsShown() then
        local _, _, _, x, y = l:GetPoint(1)
        salida[#salida + 1] = {tipo = l:GetObjectType(), x = x, y = y, ancho = l:GetWidth(), giro = l:GetRotation()}
      end
    end
    return salida
  end)()`);
  assert.equal(t.length, 2);
  assert.equal(t[0].tipo, 'Texture');
  // Paradas 1 → 2: horizontal (de x 60 a 70, y 30): 100 de largo, centro en x 650, sin giro.
  assert.ok(cerca(t[0].x, 650, 1e-3) && cerca(t[0].y, -0.3 * 667, 1e-3) && cerca(t[0].ancho, 100, 1e-3) && cerca(t[0].giro, 0));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------
// Ronda 1
// ---------------------------------------------------------------------------------------------------------------

test('ronda 1 (Important): con la posición del mapa secreta no hay error (vigilarSecretos)', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 }, vigilarSecretos: ['mapa/pines-mundo.lua'] });
  m.lua(`rawset(C_Map, "GetPlayerMapPosition", function()
    return {GetXY = function() return BANCO.secreto("number"), BANCO.secreto("number") end}
  end)`);
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1; SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  aceptar(m);
  const t = tramos(m);
  assert.equal(t.length, 2, 'solo 1 → 2 y 2 → 3');
  assert.ok(cerca(t[0].desde[0], lienzo(60, 30)[0], 1e-3));
  m.avanzar(2.5);
  assert.equal(tramos(m).length, 2);
  sinErrores(m);
});

test('16-nov: la E4 no pone temporizador (antes movía el tramo del jugador)', () => {
  const m = conMapa();
  const vivos = () => m.lua('(function() local n = 0 for _, t in pairs(BANCO.temporizadores) do if not t.cancelado then n = n + 1 end end return n end)()');
  const sinRuta = vivos();
  aceptar(m);
  assert.equal(vivos(), sinRuta);
  m.lua('WorldMapFrame:Hide(); WorldMapFrame:Show()');
  assert.equal(vivos(), sinRuta);
  sinErrores(m);
});

test('ronda 1 (Minor 4): el jugador fuera o dentro del mapa visto no cambia la línea de las paradas', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.jugador({ mundo: { wx: 850, wy: -8575, inst: 0 } }); // en Ventormenta: fuera del mapa visto
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1; SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  aceptar(m);
  assert.equal(tramos(m).length, 2);
  m.jugador({ mundo: mundo1411(50, 25) });
  m.avanzar(1.1);
  assert.equal(tramos(m).length, 2);
  sinErrores(m);
});
