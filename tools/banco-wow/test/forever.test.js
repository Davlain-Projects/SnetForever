// Perfil «Forever» (tarea 22, revisión final): el cliente real de WoW Forever 1.60.1 (interfaz 16001) corre sobre el
// motor moderno. Comprobado con /dump: NO existen GetItemCount, GetNumSkillLines, GetSkillLineInfo, GetSpellCooldown,
// UnitBuff, UnitDebuff, GetMinimapShape ni GetQuestLogTitle; SÍ C_Item.GetItemCount, C_SkillInfo.GetSkillLineInfoByID,
// C_Spell.GetSpellCooldown, C_Item.GetItemCooldown, C_UnitAuras, C_Secrets y C_EventUtils. crearMaquina({forever: true})
// quita las primeras; estas pruebas comprueban que el addon (SNF.API, nucleo/espacio.lua) usa las segundas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { SIN_API_FOREVER } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';

const FOREVER = { forever: true };
const CLAVE = 'Prueba\\01-60 Guía de prueba';

let contador = 0;
function elemento(m, el) {
  const id = ++contador;
  m.lua(`BANCO.pruebaEl = BANCO.pruebaEl or {}; BANCO.pruebaEl[${id}] = {el = ${aLua(el)}, mem = {}}`);
  return (...evento) => {
    const args = evento.map((a) => aLua(a)).join(', ');
    return m.lua(`(function()
      local c = BANCO.pruebaEl[${id}]
      local r, x = SnetForever.Elementos.evaluar(c.el, c.mem${args ? `, ${args}` : ''})
      return {r, x}
    end)()`);
  };
}
const res = (m, el, ...evento) => elemento(m, el)(...evento)[0];
const enfriamiento = (m, tipo, id, restante) => m.lua(`BANCO.ponerEnfriamiento(${aLua(tipo)}, ${id}, ${restante})`);
const aura = (m, datos) => m.lua(`BANCO.ponerAura(${aLua(datos)})`);
const habilidad = (m, nombre, rango, max, id) => m.lua(`BANCO.ponerHabilidad(${aLua(nombre)}, ${rango}, ${max}, false, ${id})`);

// ---------------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------------

test('banco: con forever no existen las 8 APIs y sí las del motor moderno', () => {
  const m = nuevaMaquina(FOREVER);
  for (const api of SIN_API_FOREVER) assert.equal(m.lua(`rawget(_G, ${aLua(api)})`), undefined, api);
  for (const api of ['C_Item.GetItemCount', 'C_Item.GetItemCooldown', 'C_Spell.GetSpellCooldown',
    'C_SkillInfo.GetSkillLineInfoByID', 'C_UnitAuras.GetPlayerAuraBySpellID', 'C_UnitAuras.GetAuraDataByIndex',
    'C_Secrets.ShouldAurasBeSecret', 'C_EventUtils.IsEventValid']) {
    assert.equal(m.lua(`type(${api})`), 'function', api);
  }
  // Sin forever siguen estando (las pruebas de los respaldos las usan).
  const viejo = nuevaMaquina();
  assert.equal(viejo.lua('type(GetItemCount)'), 'function');
  sinErrores(m);
});

test('banco: C_Spell.GetSpellCooldown da tabla, C_SkillInfo.GetSkillLineInfoByID solo las líneas con id', () => {
  const m = nuevaMaquina(FOREVER);
  enfriamiento(m, 'spell', 556, 30);
  const info = m.lua('C_Spell.GetSpellCooldown(556)');
  assert.ok(info.duration === 30 && info.startTime > 0, JSON.stringify(info));
  habilidad(m, 'Herboristería', 60, 75, 182);
  assert.deepEqual(m.lua('C_SkillInfo.GetSkillLineInfoByID(182)'), { name: 'Herboristería', rank: 60, maxRank: 75, skillID: 182, isHeader: false });
  assert.equal(m.lua('C_SkillInfo.GetSkillLineInfoByID(186)'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// A. Objetos (C_Item.GetItemCount)
// ---------------------------------------------------------------------------------------------------

test('A: collect, destroy, el texto «n/N» y el requisito de objeto cuentan con C_Item.GetItemCount', () => {
  const m = nuevaMaquina(FOREVER);
  m.objeto(159, 3);
  assert.equal(res(m, { t: 'collect', i: 159, n: 3 }), 'hecho');
  assert.equal(res(m, { t: 'collect', i: 159, n: 4 }), 'pendiente');
  assert.equal(res(m, { t: 'destroy', i: 159 }), 'pendiente');
  assert.match(m.lua('SnetForever.Texto.deElemento({t = "collect", i = 159, n = 5})'), /3\/5$/);
  m.datoMision(5000, { name: 'Con objeto', requiredLevel: 1, requiredSourceItems: [159], questFlags: 0, zoneOrSort: 363 });
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 5000 }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  const req = m.lua('SnetForever.Requisitos.delPaso(SnetForever.Motor.paso(1))').find((r) => r.clave === 'objeto:159');
  assert.equal(req.estado, 'ok');
  m.objeto(159, 0);
  assert.equal(res(m, { t: 'destroy', i: 159 }), 'hecho');
  assert.ok(m.llamadas('C_Item.GetItemCount').length > 0);
  sinErrores(m);
});

test('A: sin C_Item.GetItemCount se usa GetItemCount; sin ninguna, 0 y sin errores', () => {
  const m = nuevaMaquina({ sinApi: ['C_Item.GetItemCount'] });
  m.objeto(159, 2);
  assert.equal(res(m, { t: 'collect', i: 159, n: 2 }), 'hecho');
  assert.ok(m.llamadas('GetItemCount').length > 0);
  const n = nuevaMaquina({ forever: true, sinApi: ['C_Item.GetItemCount'] });
  n.objeto(159, 2);
  assert.equal(res(n, { t: 'collect', i: 159, n: 2 }), 'pendiente');
  sinErrores(m);
  sinErrores(n);
});

// ---------------------------------------------------------------------------------------------------
// A. Profesiones (C_SkillInfo.GetSkillLineInfoByID con el id de la línea, sin depender del idioma)
// ---------------------------------------------------------------------------------------------------

test('A: skill con C_SkillInfo por id: sin nombre del hechizo en la caché y en cualquier idioma', () => {
  const m = nuevaMaquina(FOREVER);
  habilidad(m, 'Herbalism', 60, 75, 182); // nombre en inglés con el cliente en español: da igual
  const el = { t: 'skill', p: 'herbalism', n: 50, efecto: 'objetivo' };
  assert.equal(res(m, el), 'hecho');
  assert.equal(res(m, { ...el, n: 70 }), 'pendiente');
  assert.equal(res(m, { ...el, n: 75, maximo: true }), 'hecho');
  assert.equal(m.lua('SnetForever.Profesiones.nivel("mining")'), -1, 'no la tiene');
  assert.equal(m.lua('SnetForever.Profesiones.nivel("riding")'), undefined, 'sin línea en la tabla');
  assert.deepEqual(m.llamadas('C_SkillInfo.GetSkillLineInfoByID').map((a) => a[0]).includes(182), true);
  sinErrores(m);
});

test('A: los ids de las 14 profesiones (los de PROFESION_DE_SKILL de los requisitos)', () => {
  const IDS = { alchemy: 171, blacksmithing: 164, enchanting: 333, engineering: 202, herbalism: 182, leatherworking: 165,
    mining: 186, skinning: 393, tailoring: 197, cooking: 185, firstaid: 129, fishing: 356, lockpicking: 633, poisons: 40 };
  const m = nuevaMaquina(FOREVER);
  for (const [p, id] of Object.entries(IDS)) habilidad(m, p, id % 300, 300, id);
  for (const [p, id] of Object.entries(IDS)) assert.equal(m.lua(`SnetForever.Profesiones.nivel(${aLua(p)})`), id % 300, p);
  sinErrores(m);
});

test('A: el requisito de profesión de una misión usa el nivel de C_SkillInfo', () => {
  const m = nuevaMaquina(FOREVER);
  habilidad(m, 'Lockpicking', 15, 75, 633);
  m.datoMision(5000, { name: 'Ganzúa', requiredLevel: 1, requiredSkill: [633, 10], questFlags: 0, zoneOrSort: 363 });
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 5000 }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  const req = m.lua('SnetForever.Requisitos.delPaso(SnetForever.Motor.paso(1))').find((r) => r.clave === 'profesion:lockpicking');
  assert.equal(req.estado, 'ok');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// C. Tiempos de reutilización (C_Spell.GetSpellCooldown y C_Item.GetItemCooldown)
// ---------------------------------------------------------------------------------------------------

test('C: cooldown de hechizo con C_Spell.GetSpellCooldown (tabla) y de objeto con C_Item.GetItemCooldown', () => {
  const m = nuevaMaquina(FOREVER);
  const hechizo = { t: 'cooldown', tipo: 'spell', id: 556, op: '>', seg: 0, efecto: 'saltar_si_alcanzado' };
  enfriamiento(m, 'spell', 556, 30);
  assert.equal(res(m, hechizo), 'saltar_paso');
  enfriamiento(m, 'spell', 556, 0);
  assert.equal(res(m, hechizo), 'info');
  const objeto = { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' };
  enfriamiento(m, 'item', 6948, 600);
  assert.equal(res(m, objeto), 'info');
  enfriamiento(m, 'item', 6948, 0);
  assert.equal(res(m, objeto), 'saltar_paso');
  assert.ok(m.llamadas('C_Spell.GetSpellCooldown').length > 0);
  assert.ok(m.llamadas('C_Item.GetItemCooldown').length > 0);
  assert.equal(m.llamadas('C_Container.GetItemCooldown').length, 0, 'C_Item va primero');
  sinErrores(m);
});

test('C: la piedra de hogar del chamán mira el Retorno astral con C_Spell.GetSpellCooldown', () => {
  const m = nuevaMaquina({ forever: true, jugador: { clase: 'SHAMAN' } });
  const el = { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' };
  enfriamiento(m, 'spell', 556, 300);
  assert.equal(res(m, el), 'info');
  sinErrores(m);
});

test('C: con los tiempos secretos (C_Secrets.ShouldCooldownsBeSecret) no se compara: info', () => {
  const m = nuevaMaquina(FOREVER);
  enfriamiento(m, 'item', 6948, 0);
  m.lua('BANCO.secretos.enfriamientos = true');
  assert.equal(res(m, { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' }), 'info');
  assert.equal(m.llamadas('C_Item.GetItemCooldown').length, 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// A y E. Auras (C_UnitAuras; con valores secretos, el resultado anterior)
// ---------------------------------------------------------------------------------------------------

test('A: aura con C_UnitAuras, sin UnitBuff/UnitDebuff; sin GetPlayerAuraBySpellID, por GetAuraDataByIndex', () => {
  const m = nuevaMaquina(FOREVER);
  aura(m, { spellId: 21, restante: 30, cuenta: 2 });
  assert.equal(res(m, { t: 'aura', spell: 21, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'aura', spell: 21, cargas: 2, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(m, { t: 'aura', spell: 22, efecto: 'objetivo' }), 'pendiente');
  const n = nuevaMaquina({ forever: true, sinApi: ['C_UnitAuras.GetPlayerAuraBySpellID'] });
  aura(n, { spellId: 21, restante: 30 });
  aura(n, { spellId: 22, perjuicio: true, cuenta: 3 });
  assert.equal(res(n, { t: 'aura', spell: 21, dur: 10, efecto: 'objetivo' }), 'hecho');
  assert.equal(res(n, { t: 'aura', spell: 22, cargas: 3, efecto: 'objetivo' }), 'hecho', 'un perjuicio (HARMFUL)');
  assert.equal(res(n, { t: 'aura', spell: 23, efecto: 'objetivo' }), 'pendiente');
  assert.ok(n.llamadas('C_UnitAuras.GetAuraDataByIndex').some((a) => a[2] === 'HARMFUL'));
  sinErrores(m);
  sinErrores(n);
});

// Lote A, ronda 1: sin resultado anterior, un objetivo que no se puede medir queda pendiente (con su casilla) y una
// condición informa (Elementos.sinMedir).
test('E: con las auras secretas no se comparan campos: el resultado anterior o, sin él, objetivo pendiente y condición info', () => {
  const m = nuevaMaquina(FOREVER);
  aura(m, { spellId: 21, restante: 30 });
  const el = elemento(m, { t: 'aura', spell: 21, efecto: 'objetivo' });
  assert.equal(el()[0], 'hecho');
  m.lua('BANCO.secretos.auras = true; BANCO.servicios.auras = {}');
  const antes = m.llamadas('C_UnitAuras.GetPlayerAuraBySpellID').length;
  assert.equal(el()[0], 'hecho', 'el anterior, aunque el aura ya no esté');
  assert.equal(m.llamadas('C_UnitAuras.GetPlayerAuraBySpellID').length, antes, 'no se leen las auras');
  assert.equal(res(m, { t: 'aura', spell: 21, efecto: 'objetivo' }), 'pendiente', 'sin resultado anterior: objetivo pendiente');
  assert.equal(res(m, { t: 'aura', spell: 21, efecto: 'saltar_si_alcanzado' }), 'info', 'sin resultado anterior: condición info');
  m.lua('BANCO.secretos.auras = false');
  assert.equal(el()[0], 'pendiente', 'sin secretos se vuelve a mirar');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// D. .fp: el nodo «actual» del mapa de vuelos, sin depender del idioma
// ---------------------------------------------------------------------------------------------------

test('D: fp al abrir el mapa de vuelos con un nodo en estado Current → hecho aunque el nombre esté en otro idioma', () => {
  const m = nuevaMaquina(FOREVER);
  const nodos = (estadoCruce) => m.lua(`BANCO.ponerServicios(${aLua({ nodos: [
    { nodeID: 1, name: 'Orgrimmar, Durotar', state: 1 }, { nodeID: 2, name: 'El Cruce, Los Baldíos', state: estadoCruce }] })})`);
  nodos(0);
  assert.equal(res(m, { t: 'fp', nombre: 'Crossroads' }, 'TAXIMAP_OPENED'), 'hecho');
  assert.equal(res(m, { t: 'fp' }, 'TAXIMAP_OPENED'), 'hecho', 'sin nombre también');
  nodos(1);
  assert.equal(res(m, { t: 'fp', nombre: 'Crossroads' }, 'TAXIMAP_OPENED'), 'pendiente', 'ningún nodo es el actual');
  assert.equal(res(m, { t: 'fp', nombre: 'Orgrimmar' }, 'TAXIMAP_OPENED'), 'hecho', 'el nombre sigue valiendo si coincide');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F. Eventos que el cliente no conoce
// ---------------------------------------------------------------------------------------------------

const RARO = 'PLAYER_INSIDE_QUEST_BLOB_STATE_CHANGED';

test('F: escuchar un evento que el cliente no conoce no da error, no se registra y no se vuelve a probar', () => {
  const m = nuevaMaquina(FOREVER);
  m.lua(`BANCO.eventosInvalidos[${aLua(RARO)}] = true`);
  m.lua(`local E = SnetForever.Eventos
    local function a() end
    local function b() end
    E.escuchar(${aLua(RARO)}, a); E.escuchar(${aLua(RARO)}, b); E.dejar(${aLua(RARO)}, a); E.dejar(${aLua(RARO)}, b)
    E.escuchar(${aLua(RARO)}, a)`);
  assert.equal(m.llamadas('C_EventUtils.IsEventValid').filter((a) => a[0] === RARO).length, 1, 'se pregunta una vez');
  assert.equal(m.llamadas('RegisterEvent:invalido').length, 0);
  // Los internos y los válidos siguen igual.
  m.lua('CONTADOS = 0; SnetForever.Eventos.escuchar("UPDATE_FACTION", function() CONTADOS = CONTADOS + 1 end)');
  m.disparar('UPDATE_FACTION');
  assert.equal(m.lua('CONTADOS'), 1);
  sinErrores(m);
});

test('F: sin C_EventUtils, el registro va protegido con pcall y el error no se repite', () => {
  const m = nuevaMaquina({ forever: true, sinApi: ['C_EventUtils'] });
  m.lua(`BANCO.eventosInvalidos[${aLua(RARO)}] = true`);
  m.lua(`local E = SnetForever.Eventos
    local function a() end
    for i = 1, 5 do E.escuchar(${aLua(RARO)}, a); E.dejar(${aLua(RARO)}, a) end`);
  assert.equal(m.llamadas('RegisterEvent:invalido').length, 1, 'un solo intento');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// H. Forma del minimapa sin GetMinimapShape
// ---------------------------------------------------------------------------------------------------

const forma = (m) => m.lua('SnetForever.API.formaMinimapa()');

test('H: sin GetMinimapShape, la forma sale de la máscara del minimapa (GetMaskTexture)', () => {
  const m = nuevaMaquina(FOREVER);
  assert.equal(forma(m), 'ROUND', 'sin máscara puesta: el de Blizzard');
  m.lua('Minimap:SetMaskTexture(130937)'); // la cuadrada de EllesmereUI
  assert.equal(forma(m), 'SQUARE');
  m.lua('Minimap:SetMaskTexture(186178)'); // la redonda
  assert.equal(forma(m), 'ROUND');
  m.lua('Minimap:SetMaskTexture("Interface\\\\ChatFrame\\\\ChatFrameBackground")');
  assert.equal(forma(m), 'SQUARE');
  m.lua('Minimap:SetMaskTexture("Textures\\\\MinimapMask")');
  assert.equal(forma(m), 'ROUND');
  sinErrores(m);
});

test('H: sin GetMaskTexture se apunta la última SetMaskTexture (hooksecurefunc); sin nada, EllesmereUIMinimap → cuadrado', () => {
  const m = nuevaMaquina({ forever: true, sinApi: ['Minimap.GetMaskTexture'] });
  assert.equal(forma(m), 'ROUND');
  m.lua('Minimap:SetMaskTexture(130937)');
  assert.equal(forma(m), 'SQUARE');
  assert.equal(m.lua('BANCO.originalDe(Minimap.SetMaskTexture) ~= Minimap.SetMaskTexture'), true, 'enganchada, no sustituida');
  const e = nuevaMaquina({ forever: true, sinApi: ['Minimap.GetMaskTexture'] });
  e.lua('BANCO.addonsCargados.EllesmereUIMinimap = true');
  assert.equal(forma(e), 'SQUARE');
  sinErrores(m);
  sinErrores(e);
});

test('H: con GetMinimapShape (otro addon la define) manda ella', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.minimapa.forma = "CORNER-TOPLEFT"; Minimap:SetMaskTexture(130937)');
  assert.equal(forma(m), 'CORNER-TOPLEFT');
  sinErrores(m);
});

test('H: los pines del minimapa y el botón usan esa forma: con máscara cuadrada, la diagonal se ve', () => {
  const m = nuevaMaquina({ forever: true, jugador: { mapa: 1411, x: 50, y: 25 } });
  // (0,8·r, 0,8·r) en diagonal: fuera del círculo y dentro del cuadrado (radio 200).
  m.lua(`SnetForever.Capa.poner("jugador", {{mapa = 1411, inst = 1, wx = -4500 - 160, wy = 925 + 160}})`);
  m.lua('SnetForever.PinesMinimapa.crear()');
  const visible = () => m.lua('(function() local _, _, v = SnetForever.PinesMinimapa.posicion(SnetForever.Capa.puntos("jugador")[1]) return v end)()');
  assert.equal(visible(), false);
  m.lua('Minimap:SetMaskTexture(130937)');
  assert.equal(visible(), true);
  sinErrores(m);
});
