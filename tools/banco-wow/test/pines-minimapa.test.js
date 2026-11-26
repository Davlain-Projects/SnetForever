// Pines del minimapa (mapa/pines-minimapa.lua), tarea 19: marcos Button hijos de Minimap, sin librerías y sin tocar
// nada protegido (plano 3 §3.2 y §7). El jugador de las pruebas está en (50, 25) del mapa 1411 del banco = wx -4500,
// wy 925 (inst 1); wx crece hacia el oeste y wy hacia el norte. Minimapa del banco: 140x140, radio de vista 200.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const PI = Math.PI;
const JX = -4500;
const JY = 925;

// Punto a (este, norte) yardas del jugador (este = hacia la derecha: wx = JX - este).
const punto = (este, norte, extra = {}) => ({ mapa: 1411, inst: 1, wx: JX - este, wy: JY + norte, etiqueta: 'P', ...extra });

function conMinimapa({ puntos = [], minimapa = {}, ajustes = {}, rumbo = 0, opciones = {}, origen = 'jugador' } = {}) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25, rumbo }, ...opciones });
  for (const [clave, valor] of Object.entries(ajustes)) m.lua(`SnetForever.Ajustes.set(${aLua(clave)}, ${aLua(valor)})`);
  for (const [clave, valor] of Object.entries(minimapa)) m.lua(`BANCO.minimapa.${clave} = ${aLua(valor)}`);
  m.lua(`SnetForever.Capa.poner(${aLua(origen)}, ${aLua(puntos)})`);
  m.lua('SnetForever.PinesMinimapa.crear()');
  return m;
}

// posicion() de un punto de mundo: [dx, dy, visible].
// (los nil de Lua no llegan a JS en una tabla: se pasan a false)
const posicion = (m, p) => m.lua(`(function(a, b, c) return {a or false, b or false, c} end)(SnetForever.PinesMinimapa.posicion(${aLua(p)}))`);

// Pines visibles: {x, y, punto, relativoMinimapa, hijo, ancho, alto}.
const visibles = (m) => m.lua(`(function()
  local salida = {}
  for _, p in ipairs(SnetForever.PinesMinimapa.marcos.pines) do
    if p:IsShown() then
      local punto, relativo, relPunto, x, y = p:GetPoint(1)
      salida[#salida + 1] = {x = x, y = y, punto = punto, relPunto = relPunto, relativoMinimapa = relativo == Minimap,
        hijo = p:GetParent() == Minimap, ancho = p:GetWidth(), alto = p:GetHeight()}
    end
  end
  return salida
end)()`);

// ---------------------------------------------------------------------------------------------------
// Banco: lo nuevo de la tarea 19
// ---------------------------------------------------------------------------------------------------

test('banco: Minimap de 140x140 con GetZoom, C_Minimap.GetViewRadius, GetCVar, GetMinimapShape e IsIndoors', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('{Minimap:GetWidth(), Minimap:GetHeight()}'), [140, 140]);
  assert.equal(m.lua('Minimap:IsShown()'), true);
  assert.equal(m.lua('Minimap:GetZoom()'), 0);
  assert.equal(m.lua('C_Minimap.GetViewRadius()'), 200);
  assert.equal(m.lua('GetCVar("rotateMinimap")'), '0');
  assert.equal(m.lua('GetMinimapShape()'), 'ROUND');
  assert.equal(m.lua('IsIndoors()'), false);
  m.lua('BANCO.minimapa.zoom = 3; BANCO.minimapa.radio = 150; BANCO.minimapa.rotar = true; BANCO.minimapa.forma = "SQUARE"; BANCO.minimapa.interior = true');
  assert.equal(m.lua('Minimap:GetZoom()'), 3);
  assert.equal(m.lua('C_Minimap.GetViewRadius()'), 150);
  assert.equal(m.lua('GetCVar("rotateMinimap")'), '1');
  assert.equal(m.lua('GetMinimapShape()'), 'SQUARE');
  assert.equal(m.lua('IsIndoors()'), true);
  assert.throws(() => m.lua('GetCVar("otroCVar")'), /no imitado: CVar otroCVar/);
  sinErrores(m);
});

test('banco: sinApi quita Minimap, C_Minimap.GetViewRadius, GetMinimapShape, IsIndoors y Minimap.GetZoom', () => {
  const m = nuevaMaquina({ sinApi: ['C_Minimap.GetViewRadius', 'GetMinimapShape', 'IsIndoors', 'Minimap.GetZoom'] });
  assert.equal(m.lua('C_Minimap.GetViewRadius'), undefined);
  assert.equal(m.lua('GetMinimapShape'), undefined);
  assert.equal(m.lua('IsIndoors'), undefined);
  assert.equal(m.lua('Minimap.GetZoom'), undefined);
  assert.equal(nuevaMaquina({ sinApi: ['Minimap'] }).lua('Minimap'), undefined);
});

// ---------------------------------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------------------------------

test('100 yd al norte con radio 200 y minimapa de 140: (0, 35) y visible', () => {
  const m = conMinimapa();
  const [dx, dy, ok] = posicion(m, punto(0, 100));
  assert.ok(cerca(dx, 0) && cerca(dy, 35), `${dx}, ${dy}`);
  assert.equal(ok, true);
  sinErrores(m);
});

test('100 yd al este: (35, 0); 100 yd al oeste: (-35, 0); 100 yd al sur: (0, -35)', () => {
  const m = conMinimapa();
  let [dx, dy] = posicion(m, punto(100, 0));
  assert.ok(cerca(dx, 35) && cerca(dy, 0), `este ${dx}, ${dy}`);
  [dx, dy] = posicion(m, punto(-100, 0));
  assert.ok(cerca(dx, -35) && cerca(dy, 0), `oeste ${dx}, ${dy}`);
  [dx, dy] = posicion(m, punto(0, -100));
  assert.ok(cerca(dx, 0) && cerca(dy, -35), `sur ${dx}, ${dy}`);
  sinErrores(m);
});

test('con el minimapa girando y rumbo π/2 (mirando al oeste), el norte queda a la derecha: (35, 0)', () => {
  const m = conMinimapa({ minimapa: { rotar: true }, rumbo: PI / 2 });
  const [dx, dy, ok] = posicion(m, punto(0, 100));
  assert.ok(cerca(dx, 35, 1e-6) && cerca(dy, 0, 1e-6), `${dx}, ${dy}`);
  assert.equal(ok, true);
  // Y el oeste queda arriba (hacia donde mira el jugador).
  const [ox, oy] = posicion(m, punto(-100, 0));
  assert.ok(cerca(ox, 0) && cerca(oy, 35), `${ox}, ${oy}`);
  sinErrores(m);
});

test('sin girar el minimapa, el rumbo no cambia nada', () => {
  const m = conMinimapa({ minimapa: { rotar: false }, rumbo: PI / 2 });
  const [dx, dy] = posicion(m, punto(0, 100));
  assert.ok(cerca(dx, 0) && cerca(dy, 35), `${dx}, ${dy}`);
  sinErrores(m);
});

test('a 190 yd al norte (más del 90 % del radio 200) queda oculto; a 179 yd, visible', () => {
  const m = conMinimapa();
  assert.equal(posicion(m, punto(0, 190))[2], false);
  assert.equal(posicion(m, punto(0, 179))[2], true);
  sinErrores(m);
});

test('Vigilancia 3: (0.8·r, 0.8·r) en diagonal, oculto en minimapa redondo y visible en uno "SQUARE"', () => {
  const redondo = conMinimapa();
  assert.equal(posicion(redondo, punto(160, 160))[2], false);
  const cuadrado = conMinimapa({ minimapa: { forma: 'SQUARE' } });
  const [dx, dy, ok] = posicion(cuadrado, punto(160, 160));
  assert.equal(ok, true);
  assert.ok(cerca(dx, 56) && cerca(dy, 56), `${dx}, ${dy}`);
  // En el cuadrado el límite es por eje: 0.9·r = 180.
  assert.equal(posicion(cuadrado, punto(181, 0))[2], false);
  assert.equal(posicion(cuadrado, punto(0, 181))[2], false);
  assert.equal(posicion(cuadrado, punto(179, 179))[2], true);
  sinErrores(redondo);
  sinErrores(cuadrado);
});

test('otras formas (por ejemplo "CORNER-TOPLEFT") se tratan como redondas', () => {
  const m = conMinimapa({ minimapa: { forma: 'CORNER-TOPLEFT' } });
  assert.equal(posicion(m, punto(160, 160))[2], false);
  sinErrores(m);
});

test('sin C_Minimap.GetViewRadius y con zoom 0 en exterior: radio 233.33 (466.6667 / 2)', () => {
  const m = conMinimapa({ opciones: { sinApi: ['C_Minimap.GetViewRadius'] } });
  const [dx, dy] = posicion(m, punto(0, 100));
  assert.ok(cerca(dy, 100 / (466.6667 / 2) * 70, 1e-4), `${dy}`);
  assert.ok(cerca(dx, 0));
  // 0.9·233.33 = 210: 209 yd entra, 211 no.
  assert.equal(posicion(m, punto(0, 209))[2], true);
  assert.equal(posicion(m, punto(0, 211))[2], false);
  sinErrores(m);
});

test('respaldo por zoom, exterior: 466.6667, 400, 333.3333, 266.6667, 200 y 133.3333 (diámetros)', () => {
  const diametros = [466.6667, 400, 333.3333, 266.6667, 200, 133.3333];
  diametros.forEach((d, zoom) => {
    const m = conMinimapa({ minimapa: { zoom }, opciones: { sinApi: ['C_Minimap.GetViewRadius'] } });
    const [, dy] = posicion(m, punto(0, 50));
    assert.ok(cerca(dy, 50 / (d / 2) * 70, 1e-4), `zoom ${zoom}: ${dy}`);
    sinErrores(m);
  });
});

test('respaldo por zoom, interior (IsIndoors): 300, 240, 180, 120, 80 y 50 (diámetros)', () => {
  const diametros = [300, 240, 180, 120, 80, 50];
  diametros.forEach((d, zoom) => {
    const m = conMinimapa({ minimapa: { zoom, interior: true }, opciones: { sinApi: ['C_Minimap.GetViewRadius'] } });
    const [, dy] = posicion(m, punto(0, 20));
    assert.ok(cerca(dy, 20 / (d / 2) * 70, 1e-4), `zoom ${zoom}: ${dy}`);
    sinErrores(m);
  });
});

test('sin IsIndoors, sin GetMinimapShape y sin Minimap.GetZoom el addon no se rompe (exterior, redondo, zoom 0)', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)], opciones: { sinApi: ['C_Minimap.GetViewRadius', 'IsIndoors', 'GetMinimapShape', 'Minimap.GetZoom'] } });
  const [, dy, ok] = posicion(m, punto(0, 100));
  assert.ok(cerca(dy, 100 / (466.6667 / 2) * 70, 1e-4));
  assert.equal(ok, true);
  assert.equal(visibles(m).length, 1);
  sinErrores(m);
});

test('sin C_Minimap.GetViewRadius con zoom 6 o negativo: se usa el límite de la tabla, sin romperse', () => {
  const m = conMinimapa({ minimapa: { zoom: 9 }, opciones: { sinApi: ['C_Minimap.GetViewRadius'] } });
  const [, dy] = posicion(m, punto(0, 50));
  assert.ok(cerca(dy, 50 / (133.3333 / 2) * 70, 1e-4), `${dy}`);
  sinErrores(m);
});

test('el tamaño del minimapa escala el desplazamiento: 200x100 con radio 200 y 100 yd al norte/este', () => {
  const m = conMinimapa();
  m.lua('Minimap:SetSize(200, 100)');
  const [dx, dy] = posicion(m, punto(100, 100));
  assert.ok(cerca(dx, 50) && cerca(dy, 25), `${dx}, ${dy}`);
  sinErrores(m);
});

test('con pines.minimapa apagado, ninguno visible; al encenderlo vuelven', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)], ajustes: { 'pines.minimapa': false } });
  assert.equal(posicion(m, punto(0, 100))[2], false);
  assert.equal(visibles(m).length, 0);
  m.lua('SnetForever.Ajustes.set("pines.minimapa", true)');
  assert.equal(visibles(m).length, 1);
  m.lua('SnetForever.Ajustes.set("pines.minimapa", false)');
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

test('un punto de otra instancia (otro continente) no se pinta', () => {
  const m = conMinimapa({ puntos: [punto(0, 100, { inst: 0 })] });
  assert.equal(posicion(m, punto(0, 100, { inst: 0 }))[2], false);
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

test('dentro de una instancia (el jugador no tiene posición) no hay pines', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)] });
  assert.equal(visibles(m).length, 1);
  m.jugador({ enInstancia: true });
  m.avanzar(0.2);
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

test('un punto sin coordenadas utilizables no da posición ni rompe', () => {
  const m = conMinimapa();
  assert.deepEqual(posicion(m, { mapa: 99999, x: 1, y: 1 }), [false, false, false]);
  assert.deepEqual(m.lua('(function(a, b, c) return {a or false, b or false, c} end)(SnetForever.PinesMinimapa.posicion(nil))'), [false, false, false]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Marcos
// ---------------------------------------------------------------------------------------------------

test('el pin es un Button de 20x20 hijo de Minimap anclado al centro con (dx, dy)', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)] });
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.equal(v[0].hijo, true);
  assert.equal(v[0].relativoMinimapa, true);
  assert.equal(v[0].punto, 'CENTER');
  assert.equal(v[0].relPunto, 'CENTER');
  assert.ok(cerca(v[0].x, 0) && cerca(v[0].y, 35), `${v[0].x}, ${v[0].y}`);
  assert.deepEqual([v[0].ancho, v[0].alto], [16, 16]);
  assert.equal(m.lua('SnetForever.PinesMinimapa.marcos.pines[1]:GetObjectType()'), 'Button');
  sinErrores(m);
});

// Tarea 22 (prueba en el juego): los pines salían negros (UI-Minimap-Background es negra y SetVertexColor multiplica).
// Ahora el aspecto de los de OpenMap, que se ven bien en Forever (mapa/pines-mundo.lua, PinesMundo.vestir).
test('el pin del minimapa: el aro hueco teñido con el color de su origen y sin anillo detrás', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua(`SnetForever.Capa.poner("guia", ${aLua([punto(0, 20)])})
  SnetForever.Capa.poner("ia", ${aLua([punto(0, 40)])})
  SnetForever.Capa.poner("jugador", ${aLua([punto(0, 60)])})`);
  m.lua('SnetForever.PinesMinimapa.crear()');
  const pines = m.lua(`(function()
    local s = {}
    for _, p in ipairs(SnetForever.PinesMinimapa.marcos.pines) do
      if p:IsShown() then
        local _, _, _, _, y = p:GetPoint(1)
        s[#s + 1] = {y = y, tramos = #p.snfCirculo.tramos, color = {p.snfCirculo:GetVertexColor()},
          capa = p.snfCirculo.tramos[1]:GetDrawLayer(), anillo = p.snfAnillo ~= nil}
      end
    end
    return s
  end)()`);
  assert.equal(pines.length, 3);
  const porY = Object.fromEntries(pines.map((p) => [Math.round(p.y), p]));
  for (const p of pines) {
    assert.equal(p.tramos, 24, "11-nov: el mismo aro hueco que en el mapa del mundo");
    assert.equal(p.capa, "ARTWORK");
    assert.equal(p.anillo, false, 'sin el cuadrado amarillo de CheckButtonHilight');
  }
  // 20 yd → 7 px, 40 yd → 14 px, 60 yd → 21 px (radio 200, minimapa de 140).
  assert.deepEqual(porY[7].color.slice(0, 3), [0.98, 0.82, 0.2]);
  assert.deepEqual(porY[14].color.slice(0, 3), [0.4, 0.8, 1]);
  assert.deepEqual(porY[21].color.slice(0, 3), [0.6, 1, 0.6]);
  sinErrores(m);
});

test('los puntos con sinPin no se pintan; los de la guía, la IA y el jugador sí', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua(`SnetForever.Capa.poner("guia", ${aLua([punto(10, 10, { sinPin: true }), punto(20, 20)])})
  SnetForever.Capa.poner("ia", ${aLua([punto(30, 30)])})
  SnetForever.Capa.poner("jugador", ${aLua([punto(40, 40)])})`);
  m.lua('SnetForever.PinesMinimapa.crear()');
  assert.equal(visibles(m).length, 3);
  m.lua('SnetForever.Ajustes.set("pines.ia", false)');
  assert.equal(visibles(m).length, 2);
  sinErrores(m);
});

test('los pines se reciclan: 100 repintados con 3 puntos crean como mucho 3 marcos', () => {
  const m = conMinimapa({ puntos: [punto(10, 10), punto(20, 20), punto(30, 30)] });
  for (let i = 0; i < 100; i++) m.avanzar(0.1);
  assert.ok(m.lua('#SnetForever.PinesMinimapa.marcos.pines') <= 3);
  assert.equal(visibles(m).length, 3);
  m.lua(`SnetForever.Capa.poner("jugador", ${aLua([punto(10, 10)])})`);
  assert.equal(visibles(m).length, 1);
  assert.ok(m.lua('#SnetForever.PinesMinimapa.marcos.pines') <= 3);
  sinErrores(m);
});

test('crear() es idempotente y devuelve true; sin Minimap devuelve false y el addon sigue', () => {
  const m = conMinimapa();
  assert.equal(m.lua('SnetForever.PinesMinimapa.crear()'), true);
  assert.equal(m.lua('SnetForever.PinesMinimapa.crear()'), true);
  const n = nuevaMaquina({ sinApi: ['Minimap'] });
  n.lua(`SnetForever.Capa.poner("jugador", ${aLua([punto(0, 100)])})`);
  assert.equal(n.lua('SnetForever.PinesMinimapa.crear()'), false);
  assert.equal(n.lua('#SnetForever.PinesMinimapa.marcos.pines'), 0);
  n.avanzar(0.5);
  sinErrores(m);
  sinErrores(n);
});

// ---------------------------------------------------------------------------------------------------
// Repintado
// ---------------------------------------------------------------------------------------------------

test('se repinta cada 0,1 s en OnUpdate: al mover al jugador, el pin se mueve', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)] });
  assert.ok(cerca(visibles(m)[0].y, 35));
  // El jugador avanza 50 yd al norte: el punto queda a 50 yd.
  m.jugador({ mundo: { wx: JX, wy: JY + 50, inst: 1 } });
  m.avanzar(0.04);
  assert.ok(cerca(visibles(m)[0].y, 35), 'aún no han pasado 0,1 s');
  m.avanzar(0.1);
  assert.ok(cerca(visibles(m)[0].y, 17.5), `${visibles(m)[0].y}`);
  sinErrores(m);
});

test('MINIMAP_UPDATE_ZOOM repinta al momento', () => {
  const m = conMinimapa({ puntos: [punto(0, 50)], opciones: { sinApi: ['C_Minimap.GetViewRadius'] } });
  const antes = visibles(m)[0].y;
  m.lua('BANCO.minimapa.zoom = 4');
  m.disparar('MINIMAP_UPDATE_ZOOM');
  const despues = visibles(m)[0].y;
  assert.ok(cerca(antes, 50 / (466.6667 / 2) * 70, 1e-4));
  assert.ok(cerca(despues, 50 / (200 / 2) * 70, 1e-4), `${despues}`);
  sinErrores(m);
});

test('cambiar los puntos de la capa repinta sin esperar al reloj', () => {
  const m = conMinimapa();
  assert.equal(visibles(m).length, 0);
  m.lua(`SnetForever.Capa.poner("jugador", ${aLua([punto(0, 100)])})`);
  assert.equal(visibles(m).length, 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tooltip y taint
// ---------------------------------------------------------------------------------------------------

test('el pin enseña la etiqueta en el tooltip; con IsForbidden() == true no se usa ni en OnEnter ni en OnLeave', () => {
  const m = conMinimapa({ puntos: [punto(0, 100, { orden: 4, etiqueta: '|cRXP_FRIENDLY_Thrall|r' })] });
  m.lua('local p = SnetForever.PinesMinimapa.marcos.pines[1]; p:GetScript("OnEnter")(p)');
  assert.equal(m.llamadas('GameTooltip:SetOwner').length, 1);
  assert.ok(m.lua('BANCO.lineasTooltip()')[0].includes('Thrall'));
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua('local p = SnetForever.PinesMinimapa.marcos.pines[1]; p:GetScript("OnLeave")(p)');
  assert.equal(m.lua('GameTooltip:IsShown()'), false);

  const n = conMinimapa({ puntos: [punto(0, 100)] });
  n.lua('BANCO.tooltipProhibido = true');
  n.lua('local p = SnetForever.PinesMinimapa.marcos.pines[1]; p:GetScript("OnEnter")(p); p:GetScript("OnLeave")(p)');
  assert.deepEqual(n.llamadas('GameTooltip:SetOwner'), []);
  sinErrores(n);
  sinErrores(m);
});

test('si el pin se oculta con el ratón encima, se cierra el tooltip que es suyo; el de otro dueño no se toca', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)] });
  m.lua('local p = SnetForever.PinesMinimapa.marcos.pines[1]; p:GetScript("OnEnter")(p)');
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua('SnetForever.Ajustes.set("pines.minimapa", false)');
  assert.equal(m.lua('GameTooltip:IsShown()'), false);

  const n = conMinimapa({ puntos: [punto(0, 100)] });
  n.lua('GameTooltip:SetOwner(UIParent, "ANCHOR_RIGHT"); GameTooltip:SetText("ajeno"); GameTooltip:Show()');
  n.lua('SnetForever.Ajustes.set("pines.minimapa", false)');
  assert.equal(n.lua('GameTooltip:IsShown()'), true);
  sinErrores(m);
  sinErrores(n);
});

test('sin taint: no usa SetCVar, TargetUnit ni nada de Blizzard salvo leer el CVar del minimapa', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)] });
  m.avanzar(0.5);
  assert.deepEqual(m.llamadas('SetCVar'), []);
  assert.deepEqual(m.llamadas('TargetUnit'), []);
  assert.ok(m.llamadas('GetCVar').every((l) => l[0] === 'rotateMinimap'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglos ronda 1: minimapa girando sin rumbo (como HereBeDragons-Pins-2.0.lua:216-223, no se pinta)
// ---------------------------------------------------------------------------------------------------

test('con el minimapa girando y GetPlayerFacing() nil: posicion da nil, nil, false y no se pinta ningún pin', () => {
  const m = conMinimapa({ puntos: [punto(0, 100)], minimapa: { rotar: true }, rumbo: PI / 2 });
  assert.equal(visibles(m).length, 1);
  m.lua('BANCO.jugador.rumbo = nil');
  assert.equal(m.lua('GetPlayerFacing()'), undefined);
  assert.deepEqual(posicion(m, punto(0, 100)), [false, false, false]);
  m.avanzar(0.2);
  assert.equal(visibles(m).length, 0);
  // Sin girar el minimapa, la falta de rumbo no importa.
  m.lua('BANCO.minimapa.rotar = false');
  m.avanzar(0.2);
  assert.equal(visibles(m).length, 1);
  sinErrores(m);
});

// Prueba en el juego: a 12 px el pin del minimapa era un puntito casi invisible sobre la hierba.
test('el pin del minimapa mide 20 px', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua(`SnetForever.Capa.poner("guia", ${aLua([punto(0, 20)])})`);
  m.lua('SnetForever.PinesMinimapa.crear()');
  assert.deepEqual(m.lua('{SnetForever.PinesMinimapa.marcos.pines[1]:GetSize()}'), [16, 16]);
  sinErrores(m);
});
