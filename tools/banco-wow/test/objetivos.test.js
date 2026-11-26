// Marco «Objetivos cercanos» (ui/objetivos.lua), tarea D6 (B3): hasta 12 botones seguros con el icono o el retrato de cada
// objetivo del paso; el JUGADOR fija el objetivo al pulsar (macro /targetexact), con las restricciones de combate.
// Datos del banco: PNJ 3 «Flesh Eater» (esp. «Comecarne», puntos (47, 62) y (48, 61) del mapa 1411), 3143 «Gornek»
// (amistoso, punto (42.1, 68.3)). Mundo del mapa 1411: wx = -2000 - 50·x, wy = 1800 - 35·y, inst 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
// Lote D (D1, ronda 1): con la marca por defecto (la estrella) la macro es la de RestedXP en Forever.
const CON = (nombre, n = 1) => `/cleartarget\n/targetexact ${nombre}\n/tm !${n}`;
const GUID_COMECARNE = 'Creature-0-1-0-0-3-0000ABCDEF';
const GUID_GORNEK = 'Creature-0-1-0-0-3143-0000000001';

const ACEPTAR = (q) => ({ t: 'accept', q, texto: { en: `Accept ${q}`, es: `Acepta ${q}` } });
const MOB = (nombre) => ({ t: 'mob', npcs: [{ nombre }] });
const RARO = (nombre) => ({ t: 'unitscan', npcs: [{ nombre }] });
const OBJ = (nombre, id) => ({ t: 'target', npcs: [{ nombre, ...(id ? { id } : {}) }] });
const mundo = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

function conGuia(pasos, opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  return m;
}

// Flesh Eater (id 3, mob) y Gornek (id 3143, amistoso): el caso normal.
const pasoNormal = () => [{ elementos: [ACEPTAR(788), MOB('Flesh Eater'), OBJ('Gornek', 3143)] }];
const nombres = (prefijo, n) => Array.from({ length: n }, (_, i) => `${prefijo} ${String.fromCharCode(65 + i)}`);

// Estado visible de cada botón (regiones y atributos).
const botones = (m) => m.lua(`(function()
  local salida = {}
  for i, b in ipairs(SnetForever.Objetivos.marcos.botones) do
    local c = {b.bordes.arriba:GetVertexColor()}
    salida[i] = {
      mostrado = b:IsShown(), macro = b:GetAttribute("macrotext") or false, tipo = b:GetAttribute("type") or false,
      alfa = b.icono:GetAlpha(), textura = b.icono:GetTexture() or false, retrato = BANCO.retrato(b.icono) or false,
      borde = b.bordes.arriba:GetHeight(), color = {c[1], c[2], c[3]}, clave = b.clave or false,
      puntos = b:GetNumPoints() > 0 and (function() local p, _, rp, x, y = b:GetPoint(1); return {p, rp, x, y} end)() or false,
    }
  end
  return salida
end)()`);
const visibles = (m) => botones(m).filter((b) => b.mostrado);
const macros = (m) => visibles(m).map((b) => b.macro);
const raiz = (m) => m.marco('SnetForeverObjetivos');
const ancho = (m) => m.lua('SnetForeverObjetivos:GetWidth()');
const alto = (m) => m.lua('SnetForeverObjetivos:GetHeight()');
const anchoPestana = (m) => m.lua('SnetForever.Objetivos.marcos.pestana:GetWidth()');

const cerca = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const igualColor = (a, h) => hex(h).every((v, i) => cerca(a[i], v));

const verTooltip = (m, i) => {
  m.lua(`local b = SnetForever.Objetivos.marcos.botones[${i}]; b:GetScript("OnEnter")(b)`);
  return m.lua('BANCO.lineasTooltip()');
};

// ---------------------------------------------------------------------------------------------------
// Estructura del marco
// ---------------------------------------------------------------------------------------------------

test('crear: SnetForeverObjetivos cuelga de UIParent en MEDIUM, con 12 botones seguros (type macro) y la pestaña «Objetivos cercanos»', () => {
  const m = conGuia(pasoNormal());
  const r = raiz(m);
  assert.equal(r.padre, 'UIParent');
  assert.equal(m.lua('SnetForeverObjetivos:GetFrameStrata()'), 'MEDIUM');
  const b = botones(m);
  assert.equal(b.length, 12);
  assert.ok(b.every((x) => x.tipo === 'macro'));
  for (let i = 1; i <= 12; i++) {
    assert.equal(m.marco(`SnetForever.Objetivos.marcos.botones[${i}]`).plantilla, 'SecureActionButtonTemplate');
    assert.equal(m.lua(`SnetForever.Objetivos.marcos.botones[${i}]:GetParent() == SnetForeverObjetivos`), true);
  }
  const p = m.marco('SnetForever.Objetivos.marcos.pestana');
  assert.equal(p.alto, 17);
  assert.deepEqual(p.puntos[0], { punto: 'TOPLEFT', relativo: 'SnetForeverObjetivos', relPunto: 'TOPLEFT', x: 5, y: 8 });
  assert.equal(m.lua('SnetForever.Objetivos.marcos.pestana.texto:GetText()'), 'Objetivos cercanos');
  assert.equal(anchoPestana(m), m.lua('SnetForever.Objetivos.marcos.pestana.texto:GetUnboundedStringWidth()') + 10);
  assert.equal(m.llamadas('GameTooltip:SetOwner').length, 0);
  sinErrores(m);
});

test('crear: por defecto va en LEFT (20, 60) de UIParent, sin anclarse a la ventana, y el botón mide 26x26', () => {
  const m = conGuia(pasoNormal());
  assert.deepEqual(raiz(m).puntos, [{ punto: 'LEFT', relativo: 'UIParent', relPunto: 'LEFT', x: 20, y: 60 }]);
  const b = m.marco('SnetForever.Objetivos.marcos.botones[1]');
  assert.equal(b.ancho, 26);
  assert.equal(b.alto, 26);
  sinErrores(m);
});

test('crear: por defecto queda a la izquierda de la ventana de guía (como «Active Targets» de RestedXP), sin solaparse', () => {
  // Lo más ancho posible: 12 objetivos (4 columnas), en español y en inglés.
  for (const idioma of ['es', 'en']) {
    const guardado = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma } } };
    const m = conGuia([{ elementos: [ACEPTAR(788), ...nombres('Bicho', 12).map(MOB)] }], { guardado });
    m.lua('SnetForever.Ventana.crear(); SnetForever.Ventana.pintar()');
    const obj = raiz(m).puntos[0];
    const ven = m.marco('SnetForeverVentana').puntos[0];
    assert.deepEqual([obj.relativo, obj.punto, obj.relPunto], ['UIParent', 'LEFT', 'LEFT']);
    assert.deepEqual([ven.relativo, ven.punto, ven.relPunto], ['UIParent', 'LEFT', 'LEFT']);
    assert.equal(obj.y, ven.y, 'a la misma altura que la ventana');
    assert.equal(visibles(m).length, 12);
    const derecha = obj.x + ancho(m) * m.lua('SnetForeverObjetivos:GetScale()');
    assert.ok(derecha + 8 <= ven.x, `${idioma}: «Objetivos cercanos» acaba en ${derecha} y la ventana empieza en ${ven.x}`);
    sinErrores(m);
  }
});

test('crear: guarda la posición en objetivos.pos al soltar la pestaña tras arrastrarla (fuera de combate)', () => {
  const m = conGuia(pasoNormal());
  m.lua(`local p = SnetForever.Objetivos.marcos.pestana
    p:GetScript("OnDragStart")(p)
    SnetForeverObjetivos:ClearAllPoints()
    SnetForeverObjetivos:SetPoint("CENTER", UIParent, "CENTER", 40, 50)
    p:GetScript("OnDragStop")(p)`);
  assert.deepEqual(m.lua('SnetForever.Ajustes.get("objetivos.pos")'), { punto: 'CENTER', relPunto: 'CENTER', x: 40, y: 50 });
  assert.equal(m.lua('SnetForeverObjetivos:IsMovable()'), true);
  // La posición guardada se respeta al volver a colocar el marco.
  m.lua('SnetForever.Ajustes.set("objetivos.pos", {punto = "TOP", relPunto = "TOP", x = 1, y = -2})');
  assert.deepEqual(raiz(m).puntos, [{ punto: 'TOP', relativo: 'UIParent', relPunto: 'TOP', x: 1, y: -2 }]);
  sinErrores(m);
});

test('crear: en combate no se puede arrastrar la pestaña', () => {
  const m = conGuia(pasoNormal());
  m.jugador({ enCombate: true });
  m.lua('local p = SnetForever.Objetivos.marcos.pestana; p:GetScript("OnDragStart")(p); p:GetScript("OnDragStop")(p)');
  assert.equal(m.bloqueos().length, 0);
  assert.equal(m.lua('SnetForever.Ajustes.get("objetivos.pos")'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Visibilidad y macros
// ---------------------------------------------------------------------------------------------------

test('visibilidad: el marco solo sale si el paso activo trae objetivos (y si objetivos.activo no está apagado)', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788)] }]);
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), false);
  assert.equal(visibles(m).length, 0);
  const n = conGuia(pasoNormal());
  assert.equal(n.lua('SnetForeverObjetivos:IsShown()'), true);
  assert.equal(visibles(n).length, 2);
  n.lua('SnetForever.Ajustes.set("objetivos.activo", false)');
  assert.equal(n.lua('SnetForeverObjetivos:IsShown()'), false);
  n.lua('SnetForever.Ajustes.set("objetivos.activo", true)');
  assert.equal(n.lua('SnetForeverObjetivos:IsShown()'), true);
  sinErrores(m);
  sinErrores(n);
});

test('visibilidad: al cambiar a un paso sin objetivos el marco se oculta (fuera de combate)', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater')] }, { elementos: [ACEPTAR(789)] }]);
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), true);
  m.lua('SnetForever.Motor.saltar(1)'); // pasa al paso 2, que no trae objetivos
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), false);
  assert.equal(visibles(m).length, 0);
  sinErrores(m);
});

test('macro: con la marca en «ninguna», solo «/targetexact <nombre del cliente>», sin /cleartarget y con type = macro (esES)', () => {
  const m = conGuia(pasoNormal());
  m.lua('SnetForever.Ajustes.set("objetivos.marca", 0)');
  assert.deepEqual(macros(m), ['/targetexact Comecarne', '/targetexact Gornek']);
  assert.ok(botones(m).every((b) => !String(b.macro).includes('cleartarget')));
  assert.equal(botones(m)[0].tipo, 'macro');
  sinErrores(m);
});

test('macro: en enUS el nombre del cliente es el inglés', () => {
  const m = conGuia(pasoNormal(), { jugador: { idioma: 'enUS' } });
  assert.deepEqual(macros(m), [CON('Flesh Eater'), CON('Gornek')]);
  sinErrores(m);
});

test('macro: sin id (ni datos) se usa el nombre inglés de la guía', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Bicho Raro')] }]);
  assert.deepEqual(macros(m), [CON('Bicho Raro')]);
  sinErrores(m);
});

test('macro: con el PNJ visto, la macro pasa a su UnitName real (fuera de combate)', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne el Viejo' });
  // Visto: además lleva la marca por defecto (lote D, D1).
  assert.equal(botones(m)[0].macro, CON('Comecarne el Viejo'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Orden, soloCercanos y máximo
// ---------------------------------------------------------------------------------------------------

test('orden: primero los vistos, luego los cercanos y luego los lejos (dentro de cada grupo, el orden de la guía)', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Zzz Lejano'), MOB('Flesh Eater'), MOB('Zzz Visto'), MOB('Zzz Otro')] }]);
  assert.deepEqual(macros(m), [CON('Zzz Lejano'), CON('Comecarne'), CON('Zzz Visto'), CON('Zzz Otro')]);
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 30, inst: 1 } });
  m.avanzar(1.1); // Flesh Eater: cerca
  m.placa('nameplate1', { guid: 'Creature-0-1-0-0-9999-0000000001', nombre: 'Zzz Visto' });
  // El visto y el cercano llevan la marca por defecto (lote D, D1); los lejos, no.
  assert.deepEqual(macros(m), [CON('Zzz Visto'), CON('Comecarne'), CON('Zzz Lejano'), CON('Zzz Otro')]);
  assert.deepEqual(visibles(m).map((x) => x.alfa), [1, 0.8, 0.45, 0.45]);
  sinErrores(m);
});

test('estados: el borde es de 1 px «borde» (lejos), 1 px «secundario» (cerca) y 2 px del color del tipo (visto)', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Zzz Visto'), MOB('Flesh Eater'), MOB('Zzz Lejano')] }]);
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 30, inst: 1 } });
  m.avanzar(1.1);
  m.placa('nameplate1', { guid: 'Creature-0-1-0-0-9999-0000000001', nombre: 'Zzz Visto' });
  const [visto, cercano, lejano] = botones(m);
  assert.equal(visto.borde, 2);
  assert.ok(igualColor(visto.color, 'FF5722'), JSON.stringify(visto.color));
  assert.equal(cercano.borde, 1);
  assert.deepEqual(cercano.color.map((v) => Math.round(v * 1000)), m.lua('(function() local c = SnetForever.Estilo.color("secundario"); return {math.floor(c[1] * 1000 + 0.5), math.floor(c[2] * 1000 + 0.5), math.floor(c[3] * 1000 + 0.5)} end)()').map(Number));
  assert.equal(lejano.borde, 1);
  assert.deepEqual(lejano.color.map((v) => Math.round(v * 1000)), m.lua('(function() local c = SnetForever.Estilo.color("borde"); return {math.floor(c[1] * 1000 + 0.5), math.floor(c[2] * 1000 + 0.5), math.floor(c[3] * 1000 + 0.5)} end)()').map(Number));
  sinErrores(m);
});

test('estados: visto en 2 px: peligroso (unitscan) #FCDC00 y amistoso #00FF25; un unitscan sin ver lleva borde de aviso', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), RARO('Zzz Raro'), OBJ('Gornek', 3143)] }]);
  const antes = botones(m);
  assert.ok(igualColor(antes[0].color, 'FCDC00')); // aviso, también sin ver
  assert.equal(antes[0].borde, 1);
  m.placa('nameplate1', { guid: 'Creature-0-1-0-0-9998-0000000001', nombre: 'Zzz Raro' });
  m.placa('nameplate2', { guid: GUID_GORNEK, nombre: 'Gornek' });
  const [raro, amistoso] = botones(m);
  assert.equal(raro.borde, 2);
  assert.ok(igualColor(raro.color, 'FCDC00'));
  assert.equal(amistoso.borde, 2);
  assert.ok(igualColor(amistoso.color, '00FF25'));
  sinErrores(m);
});

test('iconos: provisional (espada para mob y unitscan, bocadillo para amistoso) y retrato al verse', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater'), RARO('Zzz Raro'), OBJ('Gornek', 3143)] }]);
  const antes = botones(m);
  assert.equal(antes[0].textura, 'Interface\\Icons\\INV_Sword_04');
  assert.equal(antes[1].textura, 'Interface\\Icons\\INV_Sword_04');
  assert.equal(antes[2].textura, 'Interface\\WorldMap\\ChatBubble_64Grey');
  assert.ok(antes.slice(0, 3).every((b) => b.retrato === false));
  assert.deepEqual(m.lua('{SnetForever.Objetivos.marcos.botones[1].icono:GetTexCoord()}').map((v) => Math.round(v * 100)), [8, 8, 8, 92, 92, 8, 92, 92]);
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  const visto = botones(m)[0];
  assert.equal(visto.retrato, 'nameplate1');
  assert.equal(visto.textura, false);
  assert.deepEqual(m.lua('{SnetForever.Objetivos.marcos.botones[1].icono:GetTexCoord()}'), [0, 0, 0, 1, 1, 0, 1, 1]);
  assert.equal(visto.alfa, 1);
  sinErrores(m);
});

test('iconos: el ratón y el objetivo dan retrato con la unidad que toca (mouseover, target)', () => {
  const m = conGuia(pasoNormal());
  m.unidad('mouseover', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  assert.equal(botones(m)[0].retrato, 'mouseover');
  m.unidad('target', { guid: GUID_GORNEK, nombre: 'Gornek' });
  m.disparar('PLAYER_TARGET_CHANGED');
  const b = botones(m);
  assert.equal(b[0].retrato, 'mouseover');
  assert.equal(b[1].retrato, 'target');
  sinErrores(m);
});

test('iconos: con el ratón ya sobre otra unidad o sobre nada, el botón no pinta el retrato de «mouseover» y conserva el bueno', () => {
  const m = conGuia(pasoNormal());
  m.unidad('mouseover', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  assert.equal(botones(m)[0].retrato, 'mouseover');
  // Desde aquí se anota de quién es cada retrato que se pinta en el botón 1 (el GUID de la unidad en ese momento).
  m.lua(`(function()
    local icono1 = SnetForever.Objetivos.marcos.botones[1].icono
    local original = SetPortraitTexture
    BANCO_RETRATOS1 = {}
    SetPortraitTexture = function(textura, unidad, ...)
      if textura == icono1 then BANCO_RETRATOS1[#BANCO_RETRATOS1 + 1] = tostring(UnitGUID(unidad)) end
      return original(textura, unidad, ...)
    end
  end)()`);
  // El ratón pasa a Gornek (la entrada de Comecarne sigue «vista» por el ratón 10 s) y se repinta.
  m.unidad('mouseover', { guid: GUID_GORNEK, nombre: 'Gornek' });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  m.lua('SnetForever.Eventos.emitir("SNF_OBJETIVOS_CAMBIADOS")');
  // Y luego a nada.
  m.unidad('mouseover', undefined);
  m.lua('SnetForever.Eventos.emitir("SNF_OBJETIVOS_CAMBIADOS")');
  const pintados = m.lua('BANCO_RETRATOS1') || [];
  assert.deepEqual(pintados.filter((g) => g !== GUID_COMECARNE), [], `retratos del botón 1: ${pintados.join(', ')}`);
  const b = botones(m)[0];
  assert.equal(b.clave, 'flesh eater');
  assert.equal(b.textura, false, 'sigue con el último retrato bueno, no con el icono provisional');
  assert.equal(b.retrato, 'mouseover');
  sinErrores(m);
});

test('iconos: pasado el ratón la unidad deja de verse y el botón vuelve a «lejos» (el borde y el alfa bajan)', () => {
  const m = conGuia(pasoNormal());
  m.unidad('mouseover', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.disparar('UPDATE_MOUSEOVER_UNIT');
  assert.equal(botones(m)[0].alfa, 1);
  m.avanzar(11);
  const b = botones(m)[0];
  assert.equal(b.alfa, 0.45);
  assert.equal(b.borde, 1);
  sinErrores(m);
});

test('soloCercanos: con true no salen los lejos; por defecto (false) salen todos', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater'), MOB('Zzz Lejano'), OBJ('Gornek', 3143)] }]);
  assert.equal(m.lua('SnetForever.Ajustes.get("objetivos.soloCercanos")'), false);
  assert.equal(visibles(m).length, 3);
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 30, inst: 1 } });
  m.avanzar(1.1);
  m.lua('SnetForever.Ajustes.set("objetivos.soloCercanos", true)');
  assert.deepEqual(macros(m), [CON('Comecarne')]); // cerca: con la marca (D1)
  assert.equal(visibles(m).length, 1);
  assert.equal(botones(m).filter((b) => b.mostrado).length, 1);
  m.lua('SnetForever.Ajustes.set("objetivos.soloCercanos", false)');
  assert.equal(visibles(m).length, 3);
  sinErrores(m);
});

test('soloCercanos: si no queda ninguno cerca, el marco se oculta', () => {
  const m = conGuia(pasoNormal());
  m.lua('SnetForever.Ajustes.set("objetivos.soloCercanos", true)');
  assert.equal(visibles(m).length, 0);
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), false);
  sinErrores(m);
});

test('máximo: con 13 entradas en la lista se pintan 12 (y con 13 PNJ en el paso, la detección ya entrega 12)', () => {
  const m = conGuia(pasoNormal());
  m.lua(`SnetForever.Cercanos.ordenada = function()
    local s = {}
    for i = 1, 13 do
      s[i] = {clave = "bicho" .. i, tipo = "mob", paso = 1, ids = {}, nombres = {}, nombreMacro = "Bicho" .. i, estado = "lejos"}
    end
    return s
  end
  SnetForever.Eventos.emitir("SNF_OBJETIVOS_CAMBIADOS")`);
  assert.equal(visibles(m).length, 12);
  assert.equal(botones(m).length, 12);
  assert.equal(macros(m)[11], CON('Bicho12'));
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), true);

  const real = conGuia([{ elementos: [ACEPTAR(788), ...nombres('Bicho', 13).map(MOB)] }]);
  assert.equal(visibles(real).length, 12);
  sinErrores(m);
  sinErrores(real);
});

// ---------------------------------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------------------------------

// Ancho = max(pestaña + 10, 6 + columnas·28 − 2 + 6); alto = 15 + filas·28 − 2 + 6 (+5 con enemigos y amistosos).
function medidasEsperadas(m, enemigos, amistosos) {
  const filas = (n) => Math.ceil(n / 4);
  const columnas = Math.max(Math.min(enemigos, 4), Math.min(amistosos, 4));
  const f = filas(enemigos) + filas(amistosos);
  return {
    ancho: Math.max(anchoPestana(m) + 10, 6 + columnas * 28 - 2 + 6),
    alto: 15 + f * 28 - 2 + 6 + (enemigos > 0 && amistosos > 0 ? 5 : 0),
  };
}

for (const [enemigos, amistosos] of [[1, 0], [2, 1], [4, 0], [5, 0], [0, 3], [3, 5], [8, 4], [12, 0], [0, 12], [6, 6]]) {
  test(`medidas: ${enemigos} enemigos y ${amistosos} amistosos cumplen las fórmulas de ancho y alto`, () => {
    const el = [ACEPTAR(788), ...nombres('Mob', enemigos).map(MOB), ...nombres('Amigo', amistosos).map((n) => OBJ(n))];
    const m = conGuia([{ elementos: el }]);
    const esperado = medidasEsperadas(m, Math.min(enemigos, 12), Math.min(amistosos, Math.max(0, 12 - enemigos)));
    assert.equal(ancho(m), esperado.ancho);
    assert.equal(alto(m), esperado.alto);
    sinErrores(m);
  });
}

test('medidas: el ancho mínimo lo da la pestaña (pestaña + 10) cuando hay pocos botones', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater')] }]);
  assert.equal(ancho(m), Math.max(anchoPestana(m) + 10, 6 + 28 - 2 + 6));
  assert.ok(ancho(m) >= anchoPestana(m) + 10);
  sinErrores(m);
});

test('medidas: los botones van cada 28, de 4 en 4, con 5 de hueco entre enemigos y amistosos y márgenes de 6 y 15', () => {
  const el = [ACEPTAR(788), ...nombres('Mob', 5).map(MOB), ...nombres('Amigo', 2).map((n) => OBJ(n))];
  const m = conGuia([{ elementos: el }]);
  const b = botones(m).filter((x) => x.mostrado);
  const pos = b.map((x) => [x.puntos[0], x.puntos[2], x.puntos[3]]);
  assert.ok(pos.every(([p]) => p === 'TOPLEFT'));
  assert.deepEqual(pos.slice(0, 5).map(([, x, y]) => [x, y]), [[6, -15], [34, -15], [62, -15], [90, -15], [6, -43]]);
  assert.deepEqual(pos.slice(5).map(([, x, y]) => [x, y]), [[6, -76], [34, -76]]); // 15 + 2·28 + 5
  sinErrores(m);
});

test('escala: objetivos.escala se aplica al marco', () => {
  const m = conGuia(pasoNormal());
  m.lua('SnetForever.Ajustes.set("objetivos.escala", 1.4)');
  assert.ok(cerca(m.lua('SnetForeverObjetivos:GetScale()'), 1.4));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ayuda
// ---------------------------------------------------------------------------------------------------

test('ayuda del botón: nombre, «Enemigo del paso N» o «PNJ del paso N» y «Clic: fijarlo como objetivo»', () => {
  const m = conGuia(pasoNormal());
  assert.deepEqual(verTooltip(m, 1), ['Comecarne', 'Enemigo del paso 1', 'Clic: fijarlo como objetivo']);
  assert.deepEqual(verTooltip(m, 2), ['Gornek', 'PNJ del paso 1', 'Clic: fijarlo como objetivo']);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua('local b = SnetForever.Objetivos.marcos.botones[1]; b:GetScript("OnLeave")(b)');
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  sinErrores(m);
});

test('ayuda del botón: en combate añade «La lista se actualiza al salir de combate»', () => {
  const m = conGuia(pasoNormal());
  m.jugador({ enCombate: true });
  assert.deepEqual(verTooltip(m, 1), ['Comecarne', 'Enemigo del paso 1', 'Clic: fijarlo como objetivo', 'La lista se actualiza al salir de combate']);
  sinErrores(m);
});

test('ayuda del botón: con el GameTooltip prohibido no se toca', () => {
  const m = conGuia(pasoNormal());
  m.lua('BANCO.tooltipProhibido = true');
  assert.deepEqual(verTooltip(m, 1), []);
  m.lua('local b = SnetForever.Objetivos.marcos.botones[1]; b:GetScript("OnLeave")(b)');
  sinErrores(m);
});

test('ayuda de la pestaña: «Pulsa un icono…» y, con las placas enemigas apagadas, el aviso de la tecla V (solo se lee el CVar)', () => {
  const m = conGuia(pasoNormal());
  m.cvar('nameplateShowEnemies', '1');
  m.lua('local p = SnetForever.Objetivos.marcos.pestana; p:GetScript("OnEnter")(p)');
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Pulsa un icono para fijar ese objetivo']);
  m.cvar('nameplateShowEnemies', '0');
  m.lua('local p = SnetForever.Objetivos.marcos.pestana; p:GetScript("OnEnter")(p)');
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), ['Pulsa un icono para fijar ese objetivo', 'Activa las placas de nombre (tecla V) para ver qué tienes cerca']);
  assert.equal(m.llamadas('SetCVar').length, 0);
  sinErrores(m);
});

test('textos: la ayuda sale en inglés si el idioma del addon es inglés', () => {
  const m = conGuia(pasoNormal(), { jugador: { idioma: 'enUS' } });
  assert.equal(verTooltip(m, 1)[2], 'Click: set as target');
  assert.equal(m.lua('SnetForever.Objetivos.marcos.pestana.texto:GetText()'), 'Nearby targets');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------------------------------

test('combate: crear los 12 botones seguros se hace fuera de combate: sin un solo bloqueo al cargar', () => {
  const m = conGuia(pasoNormal());
  assert.equal(m.bloqueos().length, 0);
  assert.equal(botones(m).length, 12);
  sinErrores(m);
});

test('combate: en combate no se llama a SetAttribute, Show, Hide ni SetPoint del botón ni del marco; las regiones sí cambian; al salir se aplica', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Zzz Lejano'), MOB('Flesh Eater'), OBJ('Gornek', 3143)] }]);
  const antes = botones(m);
  assert.deepEqual(macros(m), [CON('Zzz Lejano'), CON('Comecarne'), CON('Gornek')]);
  const anchoAntes = ancho(m);

  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  // Se ve a Comecarne (por su id, con otro nombre) y a Gornek: el orden y la macro querrían cambiar.
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne el Viejo' });
  m.placa('nameplate2', { guid: GUID_GORNEK, nombre: 'Gornek' });
  assert.deepEqual(m.bloqueos(), []);
  const durante = botones(m);
  assert.deepEqual(durante.map((b) => b.macro), antes.map((b) => b.macro)); // congelada
  assert.deepEqual(durante.map((b) => b.mostrado), antes.map((b) => b.mostrado));
  assert.deepEqual(durante.map((b) => b.puntos), antes.map((b) => b.puntos));
  // Las regiones sí cambian: el botón que llevaba a Comecarne (el segundo) y el de Gornek (el tercero).
  assert.equal(durante[1].alfa, 1);
  assert.equal(durante[1].retrato, 'nameplate1');
  assert.equal(durante[1].borde, 2);
  assert.equal(durante[2].alfa, 1);
  assert.equal(durante[2].retrato, 'nameplate2');
  assert.equal(durante[0].alfa, 0.45);
  assert.equal(m.lua('SnetForever.Objetivos.hayPendiente()'), true);
  assert.equal(ancho(m), anchoAntes);
  sinErrores(m);

  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua('SnetForever.Objetivos.hayPendiente()'), false);
  // Vistos: con la marca por defecto (lote D, D1).
  assert.deepEqual(macros(m), [CON('Comecarne el Viejo'), CON('Zzz Lejano'), CON('Gornek')]);
  assert.equal(botones(m)[0].retrato, 'nameplate1');
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

test('combate: si en combate el paso pasa a no traer objetivos, el marco sigue mostrado hasta salir y entonces se oculta', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater')] }]);
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('SnetForever.Ajustes.set("objetivos.activo", false)');
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), true);
  assert.deepEqual(m.bloqueos(), []);
  assert.equal(m.lua('SnetForever.Objetivos.hayPendiente()'), true);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), false);
  sinErrores(m);
});

test('combate: un cambio de escala o de posición en combate se aplica al salir', () => {
  const m = conGuia(pasoNormal());
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('SnetForever.Ajustes.set("objetivos.escala", 1.5); SnetForever.Ajustes.set("objetivos.pos", {punto = "TOP", relPunto = "TOP", x = 3, y = -4})');
  assert.deepEqual(m.bloqueos(), []);
  assert.equal(m.lua('SnetForeverObjetivos:GetScale()'), 1);
  assert.equal(raiz(m).puntos[0].punto, 'LEFT');
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(m.lua('SnetForeverObjetivos:GetScale()'), 1.5);
  assert.deepEqual(raiz(m).puntos, [{ punto: 'TOP', relativo: 'UIParent', relPunto: 'TOP', x: 3, y: -4 }]);
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

test('combate: si se carga en combate los botones se crean al salir (PLAYER_REGEN_ENABLED) y no hay errores mientras tanto', () => {
  const m = nuevaMaquina({ jugador: { enCombate: true } });
  assert.equal(m.lua('#SnetForever.Objetivos.marcos.botones'), 0);
  m.ponerGuia(guiaDePrueba(pasoNormal()));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.equal(m.lua('#SnetForever.Objetivos.marcos.botones'), 0);
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), false);
  assert.deepEqual(m.bloqueos(), []);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(botones(m).length, 12);
  assert.deepEqual(macros(m), [CON('Comecarne'), CON('Gornek')]);
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), true);
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

test('combate: soltar la pestaña en combate aplaza guardar la posición (StopMovingOrSizing está restringido)', () => {
  const m = conGuia(pasoNormal());
  m.lua('local p = SnetForever.Objetivos.marcos.pestana; p:GetScript("OnDragStart")(p)');
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('local p = SnetForever.Objetivos.marcos.pestana; p:GetScript("OnDragStop")(p)');
  assert.deepEqual(m.bloqueos(), []);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.deepEqual(m.bloqueos(), []);
  assert.ok(m.lua('SnetForever.Ajustes.get("objetivos.pos")') !== undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Si falta algo
// ---------------------------------------------------------------------------------------------------

function sinSeguro() {
  const m = nuevaMaquina({ arrancar: false });
  m.disparar('ADDON_LOADED', 'SnetForever');
  m.lua('BANCO.creacionSeguraFalla = true');
  m.disparar('PLAYER_LOGIN');
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.ponerGuia(guiaDePrueba(pasoNormal()));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  return m;
}

test('plan B: si CreateFrame falla con la plantilla segura salen botones normales, sin acción y sin errores', () => {
  const m = sinSeguro();
  const b = botones(m);
  assert.equal(b.length, 12);
  assert.equal(visibles(m).length, 2);
  for (let i = 1; i <= 12; i++) assert.equal(m.marco(`SnetForever.Objetivos.marcos.botones[${i}]`).plantilla, undefined);
  assert.ok(b.every((x) => x.tipo === false)); // sin type = macro: el clic no hace nada
  assert.equal(m.lua('SnetForever.Objetivos.marcos.botones[1]:GetAttribute("type")'), undefined);
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

test('plan B: la ayuda dice «Escribe /tar Nombre» en lugar de «Clic: fijarlo como objetivo»', () => {
  const m = sinSeguro();
  assert.deepEqual(verTooltip(m, 1), ['Comecarne', 'Enemigo del paso 1', 'Escribe /tar Comecarne']);
  sinErrores(m);
});

test('sin SetPortraitTexture el botón se queda con el icono provisional', () => {
  const m = conGuia(pasoNormal(), { sinApi: ['SetPortraitTexture'] });
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  const b = botones(m)[0];
  assert.equal(b.retrato, false);
  assert.equal(b.textura, 'Interface\\Icons\\INV_Sword_04');
  assert.equal(b.alfa, 1);
  sinErrores(m);
});

test('una unidad cuyo retrato falla (SetPortraitTexture con error) no rompe el marco', () => {
  const m = conGuia(pasoNormal());
  m.lua('SetPortraitTexture = function() error("sin retrato") end');
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.equal(botones(m)[0].textura, 'Interface\\Icons\\INV_Sword_04');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Aspecto y límites
// ---------------------------------------------------------------------------------------------------

test('aspecto: el marco usa Estilo.tarjeta (fondo y borde de 1 px) y la pestaña usa Estilo.pestana; solo texturas de Blizzard', () => {
  const m = conGuia(pasoNormal());
  assert.equal(m.lua('SnetForeverObjetivos.snfToken'), 'fondo');
  assert.equal(m.lua('SnetForever.Objetivos.marcos.pestana.snfToken'), 'fondoCabecera');
  const rutas = m.lua(`(function()
    local s = {}
    for _, b in ipairs(SnetForever.Objetivos.marcos.botones) do
      s[#s + 1] = b.icono:GetTexture() or "retrato"
      s[#s + 1] = b:GetHighlightTexture():GetTexture()
    end
    return s
  end)()`);
  for (const ruta of rutas) assert.match(String(ruta), /^(retrato|Interface\\)/);
  sinErrores(m);
});

test('aspecto: el resalte es ButtonHilight-Square en ADD', () => {
  const m = conGuia(pasoNormal());
  assert.equal(m.lua('SnetForever.Objetivos.marcos.botones[1]:GetHighlightTexture():GetTexture()'), 'Interface\\Buttons\\ButtonHilight-Square');
  assert.equal(m.lua('SnetForever.Objetivos.marcos.botones[1]:GetHighlightTexture():GetBlendMode()'), 'ADD');
  sinErrores(m);
});

test('límites: nada de TargetUnit, SetRaidTarget, SetCVar, CreateMacro ni SetAlpha del botón seguro', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  for (const api of ['TargetUnit', 'SetRaidTarget', 'SetCVar', 'CreateMacro', 'EditMacro', 'RunMacroText']) {
    assert.equal(m.llamadas(api).length, 0, api);
  }
  assert.equal(m.lua('SnetForever.Objetivos.marcos.botones[1]:GetAlpha()'), 1);
  sinErrores(m);
});

test('límites: repintar sin cambios no vuelve a pedir retratos que no se ven', () => {
  const m = conGuia(pasoNormal());
  const antes = m.llamadas('SetPortraitTexture').length;
  m.lua('SnetForever.Eventos.emitir("SNF_OBJETIVOS_CAMBIADOS")');
  assert.equal(m.llamadas('SetPortraitTexture').length, antes);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1 (F3-26): endurecimiento
// ---------------------------------------------------------------------------------------------------

test('ronda 1: la línea /targetexact de la macro va sin controles ni «|» y con 200 caracteres como mucho', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Mal\n/cast x|r\t'), MOB('A'.repeat(300))] }]);
  const [a, b] = macros(m);
  assert.equal(a, CON('Mal/cast xr'));
  const lineas = a.split('\n');
  assert.equal(lineas.length, 3); // /cleartarget, /targetexact y /tm: el nombre no mete líneas
  assert.ok(!/[\x00-\x1f\x7f|]/.test(lineas[1]));
  assert.equal(b, CON('A'.repeat(200)));
  sinErrores(m);
});

test('ronda 1: los bordes no cambian de tamaño en combate: dos juegos ya dimensionados (1 y 2 px) que se alternan', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater'), MOB('Zzz Lejano')] }]);
  const tamanos = () => m.lua(`(function()
    local s = {}
    for _, b in ipairs(SnetForever.Objetivos.marcos.botones) do
      for _, juego in ipairs({b.bordesFinos, b.bordesGruesos}) do
        s[#s + 1] = {juego.arriba:GetHeight(), juego.abajo:GetHeight(), juego.izquierda:GetWidth(), juego.derecha:GetWidth()}
      end
    end
    return s
  end)()`);
  const antes = tamanos();
  assert.deepEqual(antes[0], [1, 1, 1, 1]);
  assert.deepEqual(antes[1], [2, 2, 2, 2]);
  assert.equal(botones(m)[0].borde, 1);
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.equal(botones(m)[0].borde, 2); // el borde de 2 px se ve (otro juego), sin SetHeight/SetWidth
  assert.deepEqual(tamanos(), antes);
  m.quitarPlaca('nameplate1');
  assert.equal(botones(m)[0].borde, 1);
  assert.deepEqual(tamanos(), antes);
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

test('ronda 1: /snet reiniciar restablece también objetivos.pos y recoloca el marco', () => {
  const m = conGuia(pasoNormal());
  m.lua('SnetForever.Ajustes.set("objetivos.pos", {punto = "TOP", relPunto = "TOP", x = 1, y = -2})');
  assert.equal(raiz(m).puntos[0].punto, 'TOP');
  m.lua('SlashCmdList.SNET("reiniciar")');
  assert.equal(m.lua('SnetForever.Ajustes.get("objetivos.pos")'), undefined);
  assert.deepEqual(raiz(m).puntos, [{ punto: 'LEFT', relativo: 'UIParent', relPunto: 'LEFT', x: 20, y: 60 }]);
  sinErrores(m);
});

test('ronda 1: «Restablecer posición» del panel restablece objetivos.pos y, en combate, recoloca al salir', () => {
  const m = conGuia(pasoNormal());
  m.lua('SlashCmdList.SNET("")');
  m.lua('SnetForever.Ajustes.set("objetivos.pos", {punto = "TOP", relPunto = "TOP", x = 1, y = -2})');
  m.lua('SnetForever.Panel.marcos.restablecerPosicion:Click()');
  assert.equal(m.lua('SnetForever.Ajustes.get("objetivos.pos")'), undefined);
  assert.equal(raiz(m).puntos[0].punto, 'LEFT');
  m.lua('SnetForever.Ajustes.set("objetivos.pos", {punto = "TOP", relPunto = "TOP", x = 1, y = -2})');
  m.jugador({ enCombate: true });
  m.lua('SnetForever.Panel.marcos.restablecerPosicion:Click()');
  assert.equal(raiz(m).puntos[0].punto, 'TOP');
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(raiz(m).puntos[0].punto, 'LEFT');
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Lote D (D1, pedido por el jugador el 10-nov): al pulsar, además de fijar el objetivo, se le pone una marca de banda.
// En Forever SetRaidTarget no se puede llamar desde el código: la marca va en la macro del botón seguro y la pone el clic
// del jugador. Ronda 1 (I1): como el RestedXP instalado (Targeting.lua:53-71), «/cleartarget», «/targetexact <nombre>» y
// «/tm !N» en todos los estados: «!» es la forma de Forever que no alterna (también con los amistosos, ruling) y
// /cleartarget hace que, si el PNJ no está a tiro, /tm no marque al objetivo que ya teníal jugador.
// ---------------------------------------------------------------------------------------------------

const ponerCerca = (m) => {
  const p = mundo(47, 62);
  m.jugador({ mundo: { wx: p.wx, wy: p.wy + 30, inst: 1 } });
  m.avanzar(1.1);
};

test('D1: por defecto la marca es la estrella (1): /cleartarget, /targetexact y «/tm !1», esté lejos, cerca o visto', () => {
  const m = conGuia(pasoNormal());
  assert.equal(m.lua('SnetForever.Ajustes.get("objetivos.marca")'), 1);
  assert.deepEqual(macros(m), [CON('Comecarne'), CON('Gornek')]); // lejos
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.deepEqual(macros(m), [CON('Comecarne'), CON('Gornek')]); // visto
  assert.equal(botones(m)[0].macro, '/cleartarget\n/targetexact Comecarne\n/tm !1');
  sinErrores(m);
});

test('D1: un PNJ cerca (≤ 50 yardas de su punto) lleva la misma macro', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater'), MOB('Zzz Lejano')] }]);
  ponerCerca(m);
  assert.deepEqual(macros(m), [CON('Comecarne'), CON('Zzz Lejano')]);
  sinErrores(m);
});

test('D1: con la opción en «ninguna» (0) solo /targetexact (sin /cleartarget); con la calavera (8), «/tm !8»', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.lua('SnetForever.Ajustes.set("objetivos.marca", 0)');
  assert.deepEqual(macros(m), ['/targetexact Comecarne', '/targetexact Gornek']);
  m.lua('SnetForever.Ajustes.set("objetivos.marca", 8)');
  assert.deepEqual(macros(m), [CON('Comecarne', 8), CON('Gornek', 8)]);
  // Un valor guardado que no es una marca (9, -1, texto) cuenta como «ninguna».
  for (const malo of [9, -1, '"x"']) {
    m.lua(`SnetForever.Ajustes.set("objetivos.marca", ${malo})`);
    assert.deepEqual(macros(m), ['/targetexact Comecarne', '/targetexact Gornek'], String(malo));
  }
  sinErrores(m);
});

test('D1: si ya lleva la marca no se repite: «!» no la quita al pulsar otra vez, también en los amistosos (Helbrim)', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), OBJ('Gornek', 3143)] }]);
  const macro = botones(m)[0].macro;
  assert.match(macro, /\n\/tm !1$/);
  assert.doesNotMatch(macro, /\/tm [0-9~]/); // ni la forma que alterna (/tm 1) ni la de retail 12 (/tm ~1)
  // El addon no marca desde el código ni lee la marca (GetRaidTargetIndex puede ser secreto en Forever).
  for (const api of ['SetRaidTarget', 'GetRaidTargetIndex', 'TargetUnit']) assert.equal(m.llamadas(api).length, 0, api);
  sinErrores(m);
});

test('D1: en combate cambiar la marca no toca el botón seguro: se aplica al salir, sin bloqueos', () => {
  const m = conGuia(pasoNormal());
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('SnetForever.Ajustes.set("objetivos.marca", 5)');
  assert.equal(botones(m)[0].macro, CON('Comecarne', 1));
  assert.equal(m.lua('SnetForever.Objetivos.hayPendiente()'), true);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(botones(m)[0].macro, CON('Comecarne', 5));
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

test('D1: un cliente sin la orden de marcar (SecureCmdList sin TARGET_MARKER) no lleva marca y el panel oculta la opción', () => {
  const m = conGuia(pasoNormal(), { previo: 'SecureCmdList = {}' });
  assert.equal(m.lua('SnetForever.Objetivos.marcaDisponible()'), false);
  m.placa('nameplate1', { guid: GUID_COMECARNE, nombre: 'Comecarne' });
  assert.deepEqual(macros(m), ['/targetexact Comecarne', '/targetexact Gornek']);
  m.lua('SlashCmdList.SNET("")');
  m.lua('SnetForever.Panel.marcos.tarjetas.objetivos:Click()');
  assert.equal(m.lua('SnetForever.Panel.controles["objetivos.marca"]:IsShown()'), false);
  sinErrores(m);
  // Con la orden (o sin poder saberlo: sin SecureCmdList), la opción se ve.
  const n = conGuia(pasoNormal(), { previo: 'SecureCmdList = {TARGET_MARKER = function() end}' });
  assert.equal(n.lua('SnetForever.Objetivos.marcaDisponible()'), true);
  assert.equal(conGuia(pasoNormal()).lua('SnetForever.Objetivos.marcaDisponible()'), true);
});

test('D1: la tarjeta «Objetivos cercanos» del panel tiene el selector de marca: «ninguna» y las 8 de banda, con su icono', () => {
  const m = conGuia(pasoNormal());
  m.lua('SlashCmdList.SNET("")');
  m.lua('SnetForever.Panel.marcos.tarjetas.objetivos:Click()');
  const C = 'SnetForever.Panel.controles["objetivos.marca"]';
  assert.equal(m.lua(`${C}:GetParent() == SnetForever.Panel.marcos.secciones.objetivos`), true);
  assert.equal(m.lua(`${C}:IsShown()`), true);
  const filas = m.lua(`(function() local s = {} for i, f in ipairs(${C}.filas) do s[i] = f.texto:GetText() end return s end)()`);
  assert.equal(filas.length, 9);
  assert.equal(filas[0], 'Ninguna');
  for (let i = 1; i <= 8; i++) assert.ok(filas[i].includes(`UI-RaidTargetingIcon_${i}`), filas[i]);
  assert.match(filas[1], /Estrella/);
  assert.match(filas[8], /Calavera/);
  assert.match(m.lua(`${C}.texto:GetText()`), /Estrella/);
  m.lua(`${C}:Click()`);
  m.lua(`${C}.filas[9]:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("objetivos.marca")'), 8);
  m.lua(`${C}:Click()`);
  m.lua(`${C}.filas[1]:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("objetivos.marca")'), 0);
  sinErrores(m);
});

// Lote C (revisión 52, Minor 12): el botón seguro se registra para «AnyUp» y «AnyDown», como RestedXP en Forever
// (RXPGuides\Targeting.lua:1180 y :1248). En el motor moderno SecureActionButtonTemplate solo ejecuta la mitad que pide
// la variable ActionButtonUseKeyDown, así que la macro va una vez; con una sola mitad, el botón no haría nada para quien
// tenga la variable al revés. Se deja como está a propósito.
test('lote C (52-M12): el botón seguro se registra para AnyUp y AnyDown, como RestedXP en Forever', () => {
  const m = conGuia(pasoNormal(), { vigilarSecretos: ['ui/objetivos.lua'] });
  const clics = m.lua(`(function()
    local t = {}
    for i, b in ipairs(SnetForever.Objetivos.marcos.botones) do t[i] = BANCO.clics(b) end
    return t
  end)()`);
  assert.equal(clics.length, 12);
  for (const c of clics) assert.deepEqual(c, ['AnyUp', 'AnyDown']);
  sinErrores(m);
});

// Ronda 1 del lote C (Importante 1): «Enemigo/PNJ del paso N» lleva el número de la lista de la ventana (sin los pasos de
// otra clase ni los optional); un paso que no sale en la lista lo dice sin número.
test('ronda 1 (52-M8): la ayuda del botón dice el número de la ventana, y sin número en un paso optional', () => {
  const m = conGuia([
    { filtro: [['c:MAGE']], elementos: [{ t: 'manual', texto: { en: 'Mage', es: 'Mago' } }] },
    { elementos: [{ t: 'manual', texto: { en: 'One', es: 'Uno' } }] },
    { etiquetas: { optional: true }, elementos: [MOB('Flesh Eater'), { t: 'manual', texto: { en: 'Kill', es: 'Mata' } }] },
    { elementos: [ACEPTAR(788), MOB('Flesh Eater'), OBJ('Gornek', 3143)] },
  ], { vigilarSecretos: ['ui/objetivos.lua', 'mapa/cercanos.lua'] });
  // Índices del motor: 1 «Uno» (número 1), 2 el optional (sin número), 3 el del PNJ (número 2).
  m.lua('SnetForever.Motor.irA(2)');
  m.avanzar(0.3);
  assert.deepEqual(verTooltip(m, 1).slice(0, 2), ['Comecarne', 'Enemigo de un paso sin número']);
  m.lua('SnetForever.Motor.irA(3)');
  m.avanzar(0.3);
  assert.deepEqual(verTooltip(m, 1).slice(0, 2), ['Comecarne', 'Enemigo del paso 2']);
  assert.deepEqual(verTooltip(m, 2).slice(0, 2), ['Gornek', 'PNJ del paso 2']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Atajo único: todos los objetivos del paso en una sola tecla (CLICK SnetForeverObjetivosTodos:LeftButton)
// ---------------------------------------------------------------------------------------------------

const todos = (m) => m.lua('SnetForever.Objetivos.macroTodos() or false');

test('atajo único: un botón seguro propio fija el primero de la lista que esté a tiro, con la marca, sin tocar los 12', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Zzz Lejano'), MOB('Flesh Eater'), OBJ('Gornek', 3143)] }]);
  const b = m.marco('SnetForeverObjetivosTodos');
  assert.equal(b.plantilla, 'SecureActionButtonTemplate');
  assert.equal(m.lua('SnetForeverObjetivosTodos:GetAttribute("type")'), 'macro');
  assert.equal(m.lua('SnetForeverObjetivosTodos:IsShown()'), false, 'no ocupa pantalla: se pulsa con su tecla');
  assert.equal(botones(m).length, 12);
  // Orden de la lista: Zzz Lejano, Comecarne, Gornek. La última línea es la del primero: es la que gana si está.
  assert.equal(todos(m), '/cleartarget\n/targetexact Gornek\n/targetexact Comecarne\n/targetexact Zzz Lejano\n/tm !1');
  m.lua('SnetForever.Ajustes.set("objetivos.marca", 0)');
  assert.equal(todos(m), '/targetexact Gornek\n/targetexact Comecarne\n/targetexact Zzz Lejano');
  assert.equal(m.lua('_G["BINDING_NAME_CLICK SnetForeverObjetivosTodos:LeftButton"]'), 'Todos los objetivos cercanos del paso');
  assert.equal(m.lua('_G["BINDING_NAME_CLICK SnetForeverObjetivo12:LeftButton"]'), 'Objetivo cercano 12');
  assert.equal(m.lua('_G["BINDING_NAME_CLICK SnetForeverObjetoActivo4:LeftButton"]'), 'Objeto activo 4');
  sinErrores(m);
});

test('atajo único: no pasa del límite de una macro y deja fuera los últimos de la lista', () => {
  const largos = Array.from({ length: 12 }, (_, i) => `Bicho de nombre muy largo ${String.fromCharCode(65 + i)}`);
  const m = conGuia([{ elementos: [ACEPTAR(788), ...largos.map(MOB)] }]);
  const macro = todos(m);
  assert.ok(Buffer.byteLength(macro) <= 255, `${Buffer.byteLength(macro)} bytes`);
  const lineas = macro.split('\n');
  assert.equal(lineas[0], '/cleartarget');
  assert.equal(lineas.at(-1), '/tm !1');
  assert.equal(lineas.at(-2), `/targetexact ${largos[0]}`, 'el primero de la lista nunca se queda fuera');
  assert.ok(!macro.includes(largos[11]));
  sinErrores(m);
});

test('atajo único: en combate conserva la macro anterior y pone la nueva al salir, sin bloqueos', () => {
  const m = conGuia([{ elementos: [ACEPTAR(788), MOB('Flesh Eater')] }, { elementos: [ACEPTAR(789), OBJ('Gornek', 3143)] }]);
  const antes = todos(m);
  assert.equal(antes, '/cleartarget\n/targetexact Comecarne\n/tm !1');
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('SnetForever.Ajustes.set("objetivos.marca", 0)');
  assert.equal(todos(m), antes);
  assert.deepEqual(m.bloqueos(), []);
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(todos(m), '/targetexact Comecarne');
  m.lua('SnetForever.Ajustes.set("objetivos.activo", false)');
  assert.equal(todos(m), false, 'con el marco apagado, la tecla no hace nada');
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});
