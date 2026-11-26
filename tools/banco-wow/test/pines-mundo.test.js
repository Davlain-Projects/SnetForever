// Pines del mapa del mundo (mapa/pines-mundo.lua), tarea 18: marcos Button hijos del lienzo del mapa de Blizzard
// (plano 3 §3.5, opción A), sin proveedor de datos. Mapas del banco (src/wow-falso.lua): Durotar 1411 dentro de
// Kalimdor 1414; Ventormenta 1453 en otra instancia. Lienzo de 1000x667 y escala 1 por defecto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina as maquinaEntera, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

// Sin entrar al mundo: el arranque aún no ha cargado la guía, así que la capa "guia" está vacía y los pines que se
// cuentan son solo los que pone cada prueba.
const nuevaMaquina = (opciones = {}) => maquinaEntera({ entrar: false, ...opciones });

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Máquina con el mapa del mundo abierto en `mapa` y los puntos de `jugador` en la capa del jugador.
function conMapa({ mapa = 1411, puntos = [{ mapa: 1411, x: 50, y: 25, orden: 1, etiqueta: 'Aquí' }], escala = 1, ajustes = {}, opciones = {} } = {}) {
  const m = nuevaMaquina(opciones);
  for (const [clave, valor] of Object.entries(ajustes)) m.lua(`SnetForever.Ajustes.set(${aLua(clave)}, ${aLua(valor)})`);
  m.lua(`BANCO.mapaMundo = ${mapa}; BANCO.escalaLienzo = ${escala}`);
  m.lua(`SnetForever.Capa.poner("jugador", ${aLua(puntos)})`);
  m.lua('SnetForever.PinesMundo.crear()');
  m.lua('WorldMapFrame:Show()');
  return m;
}

// Pines visibles: {x, y, hijoDelLienzo, escala, texto, punto}.
const visibles = (m) => m.lua(`(function()
  local salida = {}
  for _, p in ipairs(SnetForever.PinesMundo.marcos.pines) do
    if p:IsShown() then
      local punto, relativo, relPunto, x, y = p:GetPoint(1)
      salida[#salida + 1] = {
        x = x, y = y, punto = punto, relPunto = relPunto, relativoLienzo = relativo == WorldMapFrame:GetCanvas(),
        hijo = p:GetParent() == WorldMapFrame:GetCanvas(), escala = p:GetScale(), ancho = p:GetWidth(), alto = p:GetHeight(),
        texto = p.snfNumero and p.snfNumero:GetText(),
      }
    end
  end
  return salida
end)()`);
const total = (m) => m.lua('#SnetForever.PinesMundo.marcos.pines');
const repintar = (m) => m.lua('WorldMapFrame:OnMapChanged()');

// ---------------------------------------------------------------------------------------------------
// Banco: lo nuevo de la tarea 18
// ---------------------------------------------------------------------------------------------------

test('banco: WorldMapFrame con GetCanvas, GetMapID, GetCanvasScale, OnMapChanged, HookScript e IsShown', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('WorldMapFrame:IsShown()'), false);
  assert.deepEqual(m.lua('{WorldMapFrame:GetCanvas():GetSize()}'), [1000, 667]);
  assert.equal(m.lua('WorldMapFrame:GetCanvas():GetParent() == WorldMapFrame'), true);
  assert.equal(m.lua('WorldMapFrame:GetMapID()'), 1411);
  assert.equal(m.lua('WorldMapFrame:GetCanvasScale()'), 1);
  m.lua('BANCO.mapaMundo = 1414; BANCO.escalaLienzo = 2.5');
  assert.equal(m.lua('WorldMapFrame:GetMapID()'), 1414);
  assert.equal(m.lua('WorldMapFrame:GetCanvasScale()'), 2.5);
  // OnMapChanged es una función propia del falso; con hooksecurefunc la original sigue llamándose.
  m.lua(`LLAMADO = 0; hooksecurefunc(WorldMapFrame, "OnMapChanged", function() LLAMADO = LLAMADO + 1 end)
  WorldMapFrame:OnMapChanged()`);
  assert.equal(m.lua('LLAMADO'), 1);
  assert.deepEqual(m.llamadas('WorldMapFrame:OnMapChanged'), [[]]);
  assert.equal(m.lua('BANCO.originalDe(WorldMapFrame.OnMapChanged) == BANCO.WorldMapFrameOriginal.OnMapChanged'), true);
  // HookScript("OnShow") salta al enseñar el mapa; AddDataProvider apunta la llamada.
  m.lua('SHOWS = 0; WorldMapFrame:HookScript("OnShow", function() SHOWS = SHOWS + 1 end); WorldMapFrame:Show()');
  assert.equal(m.lua('SHOWS'), 1);
  m.lua('WorldMapFrame:AddDataProvider({})');
  assert.deepEqual(m.llamadas('AddDataProvider').length, 1);
  sinErrores(m);
});

test('banco: sinApi quita WorldMapFrame y sus métodos', () => {
  const m = nuevaMaquina({ sinApi: ['WorldMapFrame.OnCanvasScaleChanged'] });
  assert.equal(m.lua('WorldMapFrame.OnCanvasScaleChanged'), undefined);
  assert.equal(m.lua('type(WorldMapFrame.OnMapChanged)'), 'function');
  const n = nuevaMaquina({ sinApi: ['WorldMapFrame'] });
  assert.equal(n.lua('WorldMapFrame'), undefined);
});

// ---------------------------------------------------------------------------------------------------
// Colocación
// ---------------------------------------------------------------------------------------------------

test('mapa 1411 abierto y el punto (50, 25): un pin, hijo del lienzo, en (500, -166.75), 28x28, con el número del paso', () => {
  const m = conMapa();
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.equal(v[0].hijo, true);
  assert.equal(v[0].relativoLienzo, true);
  assert.equal(v[0].punto, 'CENTER');
  assert.equal(v[0].relPunto, 'TOPLEFT');
  assert.ok(cerca(v[0].x, 500) && cerca(v[0].y, -166.75), `${v[0].x}, ${v[0].y}`);
  assert.equal(v[0].escala, 1);
  assert.deepEqual([v[0].ancho, v[0].alto], [28, 28]);
  assert.equal(v[0].texto, '1');
  sinErrores(m);
});

test('mapa 1414 con GetMapRectOnMap(1411, 1414) = (0.4, 0.6, 0.3, 0.5): el pin en (500, -233.45)', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.ponerRectEnMapa(1411, 1414, 0.4, 0.6, 0.3, 0.5)');
  m.lua('BANCO.mapaMundo = 1414');
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 50, y = 25, orden = 1, etiqueta = "Aquí"}})`);
  m.lua('SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.ok(cerca(v[0].x, 500) && cerca(v[0].y, -233.45), `${v[0].x}, ${v[0].y}`);
  sinErrores(m);
});

test('mapa 1453 (otra instancia): ningún pin visible', () => {
  const m = conMapa({ mapa: 1453 });
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

test('un punto {mapa, inst, wx, wy} se coloca igual que su equivalente en %', () => {
  // (50, 25) de Durotar: wx = -2000 - 5000/2 = -4500, wy = 1800 - 3500/4 = 925.
  const m = conMapa({ puntos: [{ mapa: 1411, inst: 1, wx: -4500, wy: 925, orden: 2, etiqueta: 'Mundo' }] });
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.ok(cerca(v[0].x, 500) && cerca(v[0].y, -166.75), `${v[0].x}, ${v[0].y}`);
  assert.equal(v[0].texto, '2');
  sinErrores(m);
});

test('con escala 2: SetScale(0.5) y los desplazamientos multiplicados por 2', () => {
  const m = conMapa({ escala: 2 });
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.equal(v[0].escala, 0.5);
  assert.ok(cerca(v[0].x, 1000) && cerca(v[0].y, -333.5), `${v[0].x}, ${v[0].y}`);
  sinErrores(m);
});

test('al cambiar la escala del lienzo (OnCanvasScaleChanged) los pines se recolocan', () => {
  const m = conMapa();
  m.lua('BANCO.escalaLienzo = 2; WorldMapFrame:OnCanvasScaleChanged()');
  const v = visibles(m);
  assert.equal(v[0].escala, 0.5);
  assert.ok(cerca(v[0].x, 1000));
  sinErrores(m);
});

test('un punto fuera del mapa abierto (x > 100) o sin pin (sinPin) no sale', () => {
  const m = conMapa({
    puntos: [
      { mapa: 1411, x: 50, y: 25, orden: 1, etiqueta: 'A', sinPin: true },
      { mapa: 1411, x: 120, y: 25, orden: 2, etiqueta: 'B' },
      { mapa: 1411, x: 10, y: 90, orden: 3, etiqueta: 'C' },
    ],
  });
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.equal(v[0].texto, '3');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ajustes, instancias y mapa cerrado
// ---------------------------------------------------------------------------------------------------

test('con pines.mundo apagado no hay pines; al volver a encenderlo vuelven', () => {
  const m = conMapa({ ajustes: { 'pines.mundo': false } });
  assert.equal(visibles(m).length, 0);
  m.lua('SnetForever.Ajustes.set("pines.mundo", true)');
  assert.equal(visibles(m).length, 1);
  m.lua('SnetForever.Ajustes.set("pines.mundo", false)');
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

test('un punto "ia" con pines.ia apagado no sale; uno "jugador" sí', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Ajustes.set("pines.ia", false)');
  m.lua(`SnetForever.Capa.poner("ia", {{mapa = 1411, x = 50, y = 25, orden = 1, etiqueta = "IA"}})
  SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 20, y = 20, orden = 2, etiqueta = "Yo"}})`);
  m.lua('SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.equal(v[0].texto, '2');
  m.lua('SnetForever.Ajustes.set("pines.ia", true)');
  assert.equal(visibles(m).length, 2);
  sinErrores(m);
});

test('colores: guía (0.98, 0.82, 0.2), IA (0.4, 0.8, 1) y jugador (0.6, 1, 0.6)', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Capa.poner("guia", {{mapa = 1411, x = 10, y = 10, orden = 1}})
  SnetForever.Capa.poner("ia", {{mapa = 1411, x = 20, y = 20, orden = 2}})
  SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 30, y = 30, orden = 3}})`);
  m.lua('SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  const colores = m.lua(`(function()
    local s = {}
    for _, p in ipairs(SnetForever.PinesMundo.marcos.pines) do
      if p:IsShown() then s[#s + 1] = {p.snfNumero:GetText(), p.snfCirculo:GetVertexColor()} end
    end
    return s
  end)()`);
  const porPaso = Object.fromEntries(colores.map(([n, r, g, b]) => [n, [r, g, b]]));
  assert.deepEqual(porPaso['1'], [0.98, 0.82, 0.2]);
  assert.deepEqual(porPaso['2'], [0.4, 0.8, 1]);
  assert.deepEqual(porPaso['3'], [0.6, 1, 0.6]);
  sinErrores(m);
});

// Historia (pruebas en el juego): UI-Minimap-Background es NEGRA (pines negros); CheckButtonHilight salía como un
// cuadrado amarillo; el atlas de OpenMap se veía como un puntito negro; y el círculo macizo tapaba el sitio («dos
// manchones»). 11-nov: un aro hueco de tramos (color del origen) sobre otro oscuro más grueso, y el número en morado.
test('11-nov: el pin es un aro hueco de 24 tramos teñido, sobre un aro oscuro; el número, dentro, en morado y fuente 14 OUTLINE', () => {
  const m = conMapa();
  const P = 'SnetForever.PinesMundo.marcos.pines[1]';
  assert.equal(m.lua(`#${P}.snfCirculo.tramos`), 24);
  assert.equal(m.lua(`#${P}.snfBorde.tramos`), 24);
  assert.equal(m.lua(`${P}.snfCirculo.tramos[1]:GetDrawLayer()`), 'ARTWORK');
  assert.equal(m.lua(`${P}.snfBorde.tramos[1]:GetDrawLayer()`), 'BORDER', 'el aro oscuro va debajo del de color');
  const borde = m.lua(`{${P}.snfBorde:GetVertexColor()}`);
  assert.ok(borde[0] < 0.2 && borde[1] < 0.2 && borde[2] < 0.2, 'el aro de debajo es oscuro');
  const color = m.lua(`{${P}.snfCirculo.tramos[5]:GetVertexColor()}`);
  assert.deepEqual(color.slice(0, 3), [0.6, 1, 0.6], 'cada tramo lleva el color del origen (jugador)');
  // Hueco: el radio deja el centro libre (el pin mide 28 y el aro va a unos 12 px del centro).
  const radio = m.lua(`${P}.snfCirculo.radio`);
  assert.ok(radio > 10 && radio < 14, String(radio));
  const fuente = m.lua(`{${P}.snfNumero:GetFont()}`);
  assert.deepEqual([fuente[1], fuente[2]], [14, 'OUTLINE']);
  const morado = m.lua(`{${P}.snfNumero:GetTextColor()}`);
  assert.deepEqual(morado.slice(0, 3), [0.8, 0.5, 1]);
  assert.equal(m.lua(`${P}.snfNumero:GetDrawLayer()`), 'OVERLAY', 'el número se dibuja encima');
  sinErrores(m);
});

test('el pin no lleva nada detrás de la marca (CheckButtonHilight salía en el juego como un cuadrado amarillo)', () => {
  const m = conMapa();
  const P = 'SnetForever.PinesMundo.marcos.pines[1]';
  assert.equal(m.lua(`${P}.snfAnillo`), undefined);
  sinErrores(m);
});

test('dentro de una instancia no hay pines', () => {
  const m = conMapa();
  assert.equal(visibles(m).length, 1);
  m.jugador({ enInstancia: true });
  repintar(m);
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

test('con el mapa cerrado no se pinta; al abrirlo (OnShow) salen los pines', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 50, y = 25, orden = 1}})`);
  m.lua('SnetForever.PinesMundo.crear()');
  assert.equal(total(m), 0);
  m.lua('WorldMapFrame:Show()');
  assert.equal(visibles(m).length, 1);
  m.lua('WorldMapFrame:Hide()');
  assert.equal(visibles(m).length, 1); // el lienzo oculto los esconde; no hace falta tocarlos
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Sin taint: sin proveedor de datos y solo con enganches
// ---------------------------------------------------------------------------------------------------

test('crear() no sustituye OnMapChanged (solo lo engancha) y no usa AddDataProvider ni pinPools', () => {
  const m = nuevaMaquina({ arrancar: false }); // antes de PLAYER_LOGIN, donde el arranque ya llama a crear()
  m.lua('ANTES = WorldMapFrame.OnMapChanged');
  m.lua('SnetForever.PinesMundo.crear()');
  // hooksecurefunc deja un envoltorio que sigue llamando a la original, que es la misma función de antes.
  assert.equal(m.lua('BANCO.originalDe(WorldMapFrame.OnMapChanged) == ANTES'), true);
  assert.equal(m.lua('BANCO.originalDe(WorldMapFrame.OnMapChanged) == BANCO.WorldMapFrameOriginal.OnMapChanged'), true);
  assert.deepEqual(m.llamadas('AddDataProvider'), []);
  assert.equal(m.lua('next(WorldMapFrame.pinPools) == nil'), true);
  m.lua('WorldMapFrame:OnMapChanged()');
  assert.deepEqual(m.llamadas('WorldMapFrame:OnMapChanged').length, 1); // la original sigue funcionando
  sinErrores(m);
});

test('crear() es idempotente: dos llamadas no duplican los enganches', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 50, y = 25, orden = 1}})`);
  m.lua('SnetForever.PinesMundo.crear(); SnetForever.PinesMundo.crear(); WorldMapFrame:Show()');
  const antes = m.llamadas('IsInInstance').length; // cada pintar() consulta IsInInstance una vez
  repintar(m);
  assert.equal(m.llamadas('IsInInstance').length - antes, 1);
  assert.equal(total(m), 1);
  sinErrores(m);
});

test('llamar a OnMapChanged repinta', () => {
  const m = conMapa();
  assert.equal(visibles(m)[0].x, 500);
  m.lua('BANCO.mapaMundo = 1453');
  assert.equal(visibles(m).length, 1); // todavía no se ha avisado
  repintar(m);
  assert.equal(visibles(m).length, 0);
  m.lua('BANCO.mapaMundo = 1411');
  repintar(m);
  assert.equal(visibles(m).length, 1);
  sinErrores(m);
});

test('100 repintados con 3 puntos crean como mucho 3 marcos', () => {
  const m = conMapa({
    puntos: [
      { mapa: 1411, x: 10, y: 10, orden: 1 },
      { mapa: 1411, x: 20, y: 20, orden: 2 },
      { mapa: 1411, x: 30, y: 30, orden: 3 },
    ],
  });
  for (let i = 0; i < 100; i++) repintar(m);
  assert.ok(total(m) <= 3, `marcos: ${total(m)}`);
  assert.equal(visibles(m).length, 3);
  // Bajar a un punto los esconde sin crear más.
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 10, y = 10, orden = 1}})`);
  assert.equal(visibles(m).length, 1);
  assert.ok(total(m) <= 3);
  sinErrores(m);
});

test('el pin enseña la etiqueta en el tooltip; con IsForbidden() == true no se usa', () => {
  const m = conMapa({ puntos: [{ mapa: 1411, x: 50, y: 25, orden: 4, etiqueta: '|cRXP_FRIENDLY_Thrall|r' }] });
  m.lua('local p = SnetForever.PinesMundo.marcos.pines[1]; p:GetScript("OnEnter")(p)');
  assert.equal(m.llamadas('GameTooltip:SetOwner').length, 1);
  assert.ok(m.lua('BANCO.lineasTooltip()')[0].includes('Thrall'));
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua('local p = SnetForever.PinesMundo.marcos.pines[1]; p:GetScript("OnLeave")(p)');
  assert.equal(m.lua('GameTooltip:IsShown()'), false);

  const n = conMapa();
  n.lua('BANCO.tooltipProhibido = true');
  n.lua('local p = SnetForever.PinesMundo.marcos.pines[1]; p:GetScript("OnEnter")(p); p:GetScript("OnLeave")(p)');
  assert.deepEqual(n.llamadas('GameTooltip:SetOwner'), []);
  sinErrores(n);
  sinErrores(m);
});

test('sin WorldMapFrame (sinApi) el addon no se rompe: crear() no hace nada y pintar() tampoco', () => {
  const m = nuevaMaquina({ sinApi: ['WorldMapFrame'] });
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, x = 50, y = 25, orden = 1}})`);
  assert.equal(m.lua('SnetForever.PinesMundo.crear()'), false);
  m.lua('SnetForever.PinesMundo.pintar()');
  assert.equal(m.lua('#SnetForever.PinesMundo.marcos.pines'), 0);
  sinErrores(m);
});

test('sin OnCanvasScaleChanged crear() sigue enganchando OnMapChanged y OnShow', () => {
  const m = conMapa({ opciones: { sinApi: ['WorldMapFrame.OnCanvasScaleChanged'] } });
  assert.equal(visibles(m).length, 1);
  m.lua('BANCO.mapaMundo = 1453'); repintar(m);
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// La capa de la guía sigue a los pasos
// ---------------------------------------------------------------------------------------------------

test('SNF_PASOS_CAMBIADOS vuelve a poner la capa "guia" con Navegacion.puntosDeGuia()', () => {
  const m = nuevaMaquina();
  m.lua(`LLAMADAS = 0; local original = SnetForever.Navegacion.puntosDeGuia
  SnetForever.Navegacion.puntosDeGuia = function() LLAMADAS = LLAMADAS + 1; return {{mapa = 1411, x = 50, y = 25, orden = 1}} end`);
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(m.lua('LLAMADAS'), 1);
  assert.equal(m.lua('#SnetForever.Capa.puntos("guia")'), 1);
  assert.equal(m.lua('SnetForever.Capa.puntos("guia")[1].origen'), 'guia');
  sinErrores(m);
});

// Pruebas en el juego: a 16 px y luego a 24 (con el atlas de OpenMap y su margen transparente) se veía diminuto.
test('11-nov: el pin del mapa mide 28 px', () => {
  const m = conMapa();
  assert.deepEqual(m.lua('{SnetForever.PinesMundo.marcos.pines[1]:GetSize()}'), [28, 28]);
  sinErrores(m);
});

// Prueba en el juego: con OpenMap el mapa del mundo es su mapa «cosido», dibujado sobre el lienzo de Blizzard; los pines
// quedaban debajo y no se veían. Su API pública (OpenMapAPI, docs/api.md, versión 2) da el sitio en el lienzo
// (CanvasFromWorldPos, con el continente y las yardas en el orden de UnitPosition) y el nivel que alcanza su dibujo
// (ArtTopLevel).
function conOpenMap({ cosido = true, ajustes = {}, arteArriba = 5000 } = {}) {
  const m = nuevaMaquina();
  m.lua(`OpenMapAPI = {
    llamadas = {}, avisos = {},
    IsStitched = function() return ${cosido} end,
    ArtTopLevel = function() return ${arteArriba} end,
    CanvasFromWorldPos = function(c, a, b)
      table.insert(OpenMapAPI.llamadas, {c, a, b})
      return 0.3, 0.6
    end,
    RegisterCallback = function(dueno, evento, metodo) OpenMapAPI.avisos[evento] = metodo end,
  }`);
  for (const [clave, valor] of Object.entries(ajustes)) m.lua(`SnetForever.Ajustes.set(${aLua(clave)}, ${aLua(valor)})`);
  m.lua('BANCO.mapaMundo = 1411; BANCO.escalaLienzo = 1');
  m.lua(`SnetForever.Capa.poner("jugador", ${aLua([{ mapa: 1411, x: 50, y: 25, orden: 1 }])})`);
  m.lua('SnetForever.PinesMundo.crear()');
  m.lua('WorldMapFrame:Show()');
  return m;
}

test('con el mapa de OpenMap: el pin va donde dice CanvasFromWorldPos (inst, wy, wx) y por encima de su dibujo', () => {
  const m = conOpenMap();
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.ok(cerca(v[0].x, 300) && cerca(v[0].y, -0.6 * 667), `${v[0].x}, ${v[0].y}`);
  const w = m.lua('SnetForever.Coord.aMundo({mapa = 1411, x = 50, y = 25})');
  const ll = m.lua('OpenMapAPI.llamadas[#OpenMapAPI.llamadas]');
  assert.deepEqual(ll, [w.inst, w.wy, w.wx]);
  assert.ok(m.lua('SnetForever.PinesMundo.marcos.pines[1]:GetFrameLevel()') > 5000);
  sinErrores(m);
});

test('con OpenMap pero en el mapa de Blizzard (no cosido), o con openmap.usar apagado: como siempre', () => {
  for (const m of [conOpenMap({ cosido: false }), conOpenMap({ ajustes: { 'openmap.usar': false } })]) {
    const v = visibles(m);
    assert.equal(v.length, 1);
    assert.ok(cerca(v[0].x, 500) && cerca(v[0].y, -166.75), `${v[0].x}, ${v[0].y}`);
    assert.ok(m.lua('SnetForever.PinesMundo.marcos.pines[1]:GetFrameLevel()') < 5000);
    sinErrores(m);
  }
});

test('con OpenMap cosido y openmap.usar apagado, pintar() no llama a CanvasFromWorldPos; con él encendido, sí', () => {
  const apagado = conOpenMap({ ajustes: { 'openmap.usar': false } });
  apagado.lua('OpenMapAPI.llamadas = {}; SnetForever.PinesMundo.pintar()');
  assert.equal(apagado.lua('#OpenMapAPI.llamadas'), 0);
  const encendido = conOpenMap();
  encendido.lua('OpenMapAPI.llamadas = {}; SnetForever.PinesMundo.pintar()');
  assert.ok(encendido.lua('#OpenMapAPI.llamadas') > 0);
  sinErrores(apagado);
  sinErrores(encendido);
});

test('con OpenMap se repinta al cambiar entre su mapa y el de Blizzard y al mover su vista', () => {
  const m = conOpenMap();
  assert.equal(m.lua('type(OpenMapAPI.avisos.OpenMap_StitchedChanged)'), 'function');
  assert.equal(m.lua('type(OpenMapAPI.avisos.OpenMap_ViewChanged)'), 'function');
  m.lua('OpenMapAPI.IsStitched = function() return false end; OpenMapAPI.avisos.OpenMap_StitchedChanged("OpenMap_StitchedChanged", false)');
  const v = visibles(m);
  assert.ok(cerca(v[0].x, 500), `${v[0].x}`);
  sinErrores(m);
});

test('si CanvasFromWorldPos da error o nil, el pin cae al cálculo normal sin error', () => {
  const m = conOpenMap();
  m.lua('OpenMapAPI.CanvasFromWorldPos = function() error("roto") end; SnetForever.PinesMundo.pintar()');
  const v = visibles(m);
  assert.equal(v.length, 1);
  assert.ok(cerca(v[0].x, 500), `${v[0].x}`);
  sinErrores(m);
});

// 11-nov (el jugador: varios aros amontonados junto a la flecha): los que se tocan en pantalla van en un solo aro con sus
// números. Lienzo de 1000 de ancho: 0,5 % del mapa son 5 px (se juntan); 10 % son 100 px (no).
test('11-nov: pines a menos de 22 px en pantalla van en un solo aro con sus números («3·4»), más grande; los lejanos, aparte', () => {
  const m = conMapa({ puntos: [
    { mapa: 1411, x: 50, y: 25, orden: 4, etiqueta: 'Mata jabalíes' },
    { mapa: 1411, x: 50.5, y: 25.2, orden: 3, etiqueta: 'Recoge la misión' },
    { mapa: 1411, x: 60, y: 25, orden: 7, etiqueta: 'Lejos' },
  ] });
  const v = visibles(m);
  assert.equal(v.length, 2);
  const textos = v.map((p) => p.texto).sort();
  assert.deepEqual(textos, ['3·4', '7']);
  const grande = m.lua(`(function()
    for _, p in ipairs(SnetForever.PinesMundo.marcos.pines) do
      if p:IsShown() and p.snfNumero:GetText() == "3·4" then return {p:GetWidth(), #p.snfPuntos} end
    end
  end)()`);
  assert.deepEqual(grande, [38, 2]);
  sinErrores(m);
});

test('11-nov: con más de tres números el aro dice «primero-último»', () => {
  assert.equal(conMapa().lua(`SnetForever.PinesMundo.numerosDe({{orden = 9}, {orden = 3}, {orden = 5}, {orden = 4}, {orden = 3}})`), '3-9');
  assert.equal(conMapa().lua(`SnetForever.PinesMundo.numerosDe({{orden = 2}, {orden = 1}})`), '1·2');
});
