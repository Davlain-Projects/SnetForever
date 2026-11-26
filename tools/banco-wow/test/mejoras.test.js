// Lote «Cadenas de mejoras»: en el menú de guías, el grupo «Mejoras» / «Upgrades» al lado de las cadenas de clase (y
// aunque el personaje no tenga ninguna), la guía lateral de mejora (flecha al primer objeto, accept y turnin sobre
// objetos con el nombre del objeto, «Volver»), su descripción con el beneficio y sus avisos por nivel con el ajuste
// avisos.mejoras. Fixture: fixtures/mejoras-mini.lua; al final, con los datos reales si están.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGuideDetails as nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, '..', 'fixtures');
const DATOS = ['rutas-mini.lua', 'misiones-mini.lua', 'laterales-mini.lua', 'mejoras-mini.lua'].map((f) => join(FIXTURES, f));
const RAIZ = join(AQUI, '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);

const MEJORA = 'Mejoras (H)\\mejora-prueba';
const INICIO = 'Prueba (H)\\01-02 Inicio';
// Ronda 1: la descripción es el beneficio (del jugador) y, detrás, lo que dan por el camino las misiones de antes (de la base).
const BENEFICIO = 'Te acuestas y ganas experiencia extra (según el jugador en el juego) '
  + 'Por el camino, "Tu lugar en el mundo" te da también una bolsa (Old Toolbox).';
// Un guerrero orco no tiene cadenas de clase en los fixtures (solo la del druida).
const GUERRERO = { clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 14 };
const EN = { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } };

const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;

function conVentana(jugador = GUERRERO, extra = {}) {
  const m = nuevaMaquina({ datos: DATOS, jugador, ...extra });
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  m.lua(`${V}.crear()`);
  return m;
}
const abrirGuias = (m) => m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');
const filasMenu = (m) => m.lua(`(function() local t = {}
  for _, f in ipairs(${M}.menu.filas) do if f:IsVisible() then t[#t + 1] = f.texto:GetText() end end
  return t end)()`) || [];
const filaMenu = (m, buscado) => `(function()
  for _, fila in ipairs(${M}.menu.filas) do
    if fila:IsVisible() and fila.texto:GetText() == ${aLua(buscado)} then return fila end
  end
end)()`;
function pulsarMenu(m, buscado) {
  assert.ok(m.lua(`${filaMenu(m, buscado)} ~= nil`), `no hay en el menú una fila «${buscado}»: ${filasMenu(m).join(' | ')}`);
  m.lua(`${filaMenu(m, buscado)}:Click()`);
}
const texto = (m, expr) => m.lua(`${expr}:GetText()`);
const visible = (m, expr) => m.lua(`${expr}:IsVisible()`);
const textos = (m) => m.lua(`(function()
  local salida = {}
  local function recorrer(o)
    if o:IsObjectType("FontString") then
      if o:IsVisible() and o:GetText() and o:GetText() ~= "" then salida[#salida + 1] = o:GetText() end
    elseif o:IsObjectType("Frame") then
      for _, r in ipairs({o:GetRegions()}) do recorrer(r) end
      for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
    end
  end
  recorrer(SnetForeverVentana)
  return salida
end)()`) || [];
const actualN = (m) => m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n');
const cola = (m) => (m.lua('SnetForever.Avisos.cola()') || []).map((a) => a.id);

test('menú: el grupo «Mejoras» sale aunque el personaje no tenga cadenas de clase, con el mismo estilo', () => {
  const m = conVentana();
  abrirGuias(m);
  const filas = filasMenu(m);
  assert.ok(filas.includes('Mejoras'), filas.join(' | '));
  assert.ok(!filas.includes('Cadenas de clase'), 'el guerrero no tiene cadenas de clase');
  assert.ok(filas.indexOf('Mejoras') < filas.indexOf('Profesiones'), 'va al lado de las de clase, antes de profesiones');
  assert.ok(!filas.includes('Mejora: Saco de dormir acogedor'), 'empieza cerrado, como los demás grupos');
  pulsarMenu(m, 'Mejoras');
  assert.ok(filasMenu(m).includes('Mejora: Saco de dormir acogedor'), filasMenu(m).join(' | '));
  // La fila de la guía lleva el beneficio como pista.
  assert.equal(m.lua(`${filaMenu(m, 'Mejora: Saco de dormir acogedor')}.pista`), BENEFICIO);
  sinErrores(m);
});

test('un druida tauren ve las cadenas de clase y las mejoras; un orco de la Alianza (no hay) no ve «Mejoras»', () => {
  const druida = conVentana({ clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 14 });
  abrirGuias(druida);
  const filas = filasMenu(druida);
  assert.ok(filas.includes('Cadenas de clase') && filas.includes('Mejoras'), filas.join(' | '));
  assert.ok(filas.indexOf('Cadenas de clase') < filas.indexOf('Mejoras'));
  sinErrores(druida);
  const humano = conVentana({ clase: 'WARRIOR', raza: 'Human', faccion: 'Alliance', nivel: 14 });
  abrirGuias(humano);
  assert.ok(!filasMenu(humano).includes('Mejoras'), filasMenu(humano).join(' | '));
  sinErrores(humano);
});

test('la guía se abre como lateral: título, descripción con el beneficio, «sin verificar» y «Volver a 1-2 Inicio»', () => {
  const m = conVentana();
  abrirGuias(m);
  pulsarMenu(m, 'Mejoras');
  pulsarMenu(m, 'Mejora: Saco de dormir acogedor');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), MEJORA);
  assert.equal(m.lua('SnetForeverPJ.volverA'), INICIO);
  assert.equal(texto(m, `${M}.titulo`), 'Mejora: Saco de dormir acogedor');
  assert.equal(texto(m, `${M}.tramo`), 'Nivel 14-14 · |cFFFFD040sin verificar|r');
  assert.equal(visible(m, `${M}.descripcion`), true);
  assert.equal(texto(m, `${M}.descripcion`), BENEFICIO);
  assert.equal(m.lua(`SnetForever.Guias.descripcion(${aLua(MEJORA)})`), BENEFICIO);
  assert.equal(texto(m, `${M}.estado.volver.texto`), 'Volver a 1-2 Inicio (paso 1)');
  // La descripción solo está en las guías que la traen: al volver a la principal, se oculta.
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  assert.equal(visible(m, `${M}.descripcion`), false);
  assert.equal(m.lua(`SnetForever.Guias.descripcion(${aLua(INICIO)})`), undefined);
  sinErrores(m);
});

test('en inglés, el grupo es «Upgrades» y la descripción va en inglés', () => {
  const m = conVentana(GUERRERO, EN);
  abrirGuias(m);
  pulsarMenu(m, 'Upgrades');
  pulsarMenu(m, 'Upgrade: Cozy Sleeping Bag');
  assert.equal(texto(m, `${M}.descripcion`), 'You lie down and gain extra experience (according to the player, in game) '
    + 'Along the way, "Tu lugar en el mundo" also gives you a bag (Old Toolbox).');
  sinErrores(m);
});

test('la flecha apunta al primer objeto y los pasos dicen en qué objeto se acepta y se entrega', () => {
  const m = conVentana();
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(MEJORA)})`);
  m.avanzar(0.3);
  const punto = m.lua('SnetForever.Navegacion.destino().punto');
  assert.deepEqual([punto.mapa, punto.x, punto.y], [1411, 50, 50]);
  assert.ok(textos(m).some((t) => t.includes('Acepta Tu lugar en el mundo en Burned-Out Remains')), textos(m).join(' | '));
  // El objeto con nombre español en los datos sale en español.
  m.lua('SnetForever.Motor.irA(2)');
  m.avanzar(0.3);
  assert.ok(textos(m).some((t) => t.includes('Entrega Tu lugar en el mundo en Bolsillo de basura')), textos(m).join(' | '));
  sinErrores(m);
});

test('accept sobre un objeto funciona: al aceptar la misión del objeto el paso avanza; turnin, igual', () => {
  const m = conVentana();
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(MEJORA)})`);
  assert.equal(actualN(m), 1);
  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 4641);
  m.avanzar(0.3);
  assert.equal(actualN(m), 2, 'aceptada en el objeto');
  m.estadoMision(4641, { entregada: true });
  m.estadoMision(788, { enDiario: true });
  m.disparar('QUEST_TURNED_IN', 4641, 0, 0);
  m.disparar('QUEST_ACCEPTED', 788);
  m.avanzar(0.3);
  assert.equal(actualN(m), 3, 'entregada y aceptada la siguiente en el otro objeto');
  sinErrores(m);
});

test('accept y turnin admiten `objeto` (opcional) en su definición', () => {
  const m = conVentana();
  assert.ok(m.lua('SnetForever.Elementos.def("accept").opcionales').includes('objeto'));
  assert.ok(m.lua('SnetForever.Elementos.def("turnin").opcionales').includes('objeto'));
  assert.equal(m.lua('SnetForever.Datos.nombreObjeto(900002)'), 'Bolsillo de basura');
  assert.equal(m.lua('SnetForever.Datos.nombreObjeto(900001)'), 'Burned-Out Remains');
  assert.equal(m.lua('SnetForever.Datos.nombreObjeto(123456)'), '#123456');
  sinErrores(m);
});

test('avisos: la mejora avisa al llegar a su nivel, con su texto, para cualquier clase de la facción y la raza', () => {
  const m = nuevaMaquina({ datos: DATOS, jugador: GUERRERO });
  m.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(cola(m).includes('mejora-prueba-H'), cola(m).join(', '));
  // Ronda 1 (M4): el aviso dice dónde empieza (el nombre del mapa de su primer punto).
  assert.equal(m.lua('SnetForever.Avisos.texto(SnetForever.Avisos.cola()[1])'), 'Puedes conseguir: Saco de dormir acogedor (empieza en Durotar)');
  assert.equal(m.lua('SnetForever.Avisos.tieneGuia("mejora-prueba-H")'), true);
  // «Ahora» abre la guía como lateral.
  assert.equal(m.lua('SnetForever.Avisos.ahora("mejora-prueba-H")'), true);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), MEJORA);
  sinErrores(m);
  const bajo = nuevaMaquina({ datos: DATOS, jugador: { ...GUERRERO, nivel: 13 } });
  bajo.lua('SnetForever.Avisos.revisar(13)');
  assert.ok(!cola(bajo).includes('mejora-prueba-H'), 'antes de su nivel, no');
  const alianza = nuevaMaquina({ datos: DATOS, jugador: { clase: 'WARRIOR', raza: 'Human', faccion: 'Alliance', nivel: 14 } });
  alianza.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(!cola(alianza).includes('mejora-prueba-H'), 'la otra facción, no');
  const druida = nuevaMaquina({ datos: DATOS, jugador: { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 14 } });
  druida.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(cola(druida).includes('mejora-prueba-H'), 'cualquier clase');
});

test('avisos: su propio ajuste avisos.mejoras (encendido por defecto) y se apaga con la última misión entregada', () => {
  const m = nuevaMaquina({ datos: DATOS, jugador: GUERRERO });
  assert.equal(m.lua('SnetForever.Ajustes.get("avisos.mejoras")'), true);
  m.lua('SnetForever.Ajustes.set("avisos.mejoras", false)');
  m.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(!cola(m).includes('mejora-prueba-H'));
  // Apagar las de clase no apaga las de mejora.
  const otra = nuevaMaquina({ datos: DATOS, jugador: GUERRERO });
  otra.lua('SnetForever.Ajustes.set("avisos.cadenas", false)');
  otra.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(cola(otra).includes('mejora-prueba-H'));
  otra.estadoMision(788, { entregada: true });
  assert.ok(!cola(otra).includes('mejora-prueba-H'), 'hecha: fuera de la cola');
  sinErrores(otra);
});

test('panel: la casilla de los avisos de mejoras guarda avisos.mejoras', () => {
  const m = conVentana();
  m.lua('SlashCmdList.SNET("")');
  const C = 'SnetForever.Panel.controles';
  assert.equal(m.lua(`${C}["avisos.mejoras"].marca:IsShown()`), true);
  m.lua(`${C}["avisos.mejoras"]:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("avisos.mejoras")'), false);
  sinErrores(m);
});

test('datos reales: la guía del saco para un orco de 14, su aviso y su primer paso en el objeto', { skip: !hayDatos && 'faltan los datos reales' }, () => {
  const SACO = 'Mejoras (H)\\mejora-saco-dormir';
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: GUERRERO });
  assert.ok(m.lua('SnetForever.Guias.laterales("mejora")').includes(SACO));
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(SACO)})`), 'Mejora: Saco de dormir acogedor');
  assert.match(m.lua(`SnetForever.Guias.descripcion(${aLua(SACO)})`), /hasta un 3 % de experiencia extra durante 2 horas/);
  // Ronda 1: la bolsa del camino detrás del beneficio, y la cadena verificada (VERIFICADAS): sin «sin verificar».
  // Lote C (mejoras-rereview, Minor 1): en español, con los nombres en español de la base (79192 y 221498).
  // Datos 2026.11.13.1: la QuestieDB 1.1.0 traduce la 79192 como «Peldaños» (antes, «Tesoros rocosos»).
  assert.match(m.lua(`SnetForever.Guias.descripcion(${aLua(SACO)})`),
    /\(comprobado en el juego\) Por el camino, "Peldaños" te da también una bolsa \(Caja de comida recia\)\.$/);
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(SACO)}).sinVerificar`), false);
  // Ronda 2: la cadena del saco no tiene combate, así que el aviso salta al requiredLevel más alto (14), no al 30 de la
  // ronda 1; a nivel 13 todavía no.
  m.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(cola(m).includes('mejora-saco-dormir-H'), cola(m).join(', '));
  const trece = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: { ...GUERRERO, nivel: 13 } });
  trece.lua('SnetForever.Avisos.revisar(13)');
  assert.ok(!cola(trece).includes('mejora-saco-dormir-H'), cola(trece).join(', '));
  sinErrores(trece);
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(SACO)})`);
  const primero = m.lua('SnetForever.Motor.paso(1).elementos[2].datos');
  assert.equal(primero.t, 'accept');
  assert.equal(primero.q, 79007);
  // El objeto sí trae nombre español en la base (el cliente del banco va en español).
  // Datos 2026.11.13.1: la QuestieDB 1.1.0 lo traduce como «Restos carbonizados» (antes, «Restos quemados»).
  assert.equal(m.lua(`SnetForever.Datos.nombreObjeto(${primero.objeto})`), 'Restos carbonizados');
  assert.equal(m.lua(`SNF_MISIONES.object[${primero.objeto}].name`), 'Burned-Out Remains');
  // Un humano no la ve (es la de la Horda) pero sí la suya y las cuatro bolsas de la Alianza, por nivel.
  const humano = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: { clase: 'MAGE', raza: 'Human', faccion: 'Alliance', nivel: 14 } });
  const suyas = humano.lua('SnetForever.Guias.laterales("mejora")');
  assert.deepEqual(suyas, ['Mejoras (A)\\mejora-bolsa-buzzbox', 'Mejoras (A)\\mejora-bolsa-cazador',
    'Mejoras (A)\\mejora-bolsa-astillero', 'Mejoras (A)\\mejora-saco-dormir', 'Mejoras (A)\\mejora-bolsa-guardia-nocturna']);
  // Las bolsas no traen beneficio del jugador: su descripción sale de la base.
  assert.match(humano.lua('SnetForever.Guias.descripcion("Mejoras (A)\\\\mejora-bolsa-buzzbox")'), /^Recompensa: .+ \(bolsa\)$/);
  sinErrores(m);
  sinErrores(humano);
});

test('ronda 1 (M4): una mejora que empieza en otro continente no avisa hasta que el personaje está en ese continente', () => {
  const m = nuevaMaquina({ datos: DATOS, jugador: GUERRERO });
  m.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(cola(m).includes('mejora-prueba-H'), 'la de Durotar, sí');
  assert.ok(!cola(m).includes('mejora-lejos-H'), 'la de Ventormenta, desde Durotar, no');
  m.jugador({ mapa: 1453, x: 50, y: 50 });
  m.lua('SnetForever.Avisos.revisar(14)');
  assert.ok(cola(m).includes('mejora-lejos-H'), cola(m).join(', '));
  assert.equal(m.lua('SnetForever.Avisos.texto({texto = {es = "Puedes conseguir: Bolsa lejana"}, inicio = {mapa = 1453, x = 50, y = 50}})'),
    'Puedes conseguir: Bolsa lejana (empieza en Stormwind City)');
  // Sin saber el continente del punto (un mapa que el juego no mide) se avisa igual: no se esconde por no saber.
  assert.equal(m.lua('SnetForever.Avisos.texto({texto = {es = "X"}, inicio = {mapa = 99999, x = 1, y = 1}})'), 'X');
  sinErrores(m);
});

test('ronda 1 (M3): «x:mejora» lo entiende este addon; un término «x:» que no conoce no se cumple', () => {
  const m = nuevaMaquina({ datos: DATOS, jugador: GUERRERO });
  const pj = '{clase = "WARRIOR", raza = "Orc", faccion = "Horde", nivel = 14}';
  assert.equal(m.lua(`SnetForever.Filtros.evaluar({{"r:Orc", "x:mejora"}}, ${pj})`), true);
  assert.equal(m.lua(`SnetForever.Filtros.evaluar({{"r:Orc", "x:otra"}}, ${pj})`), false);
  assert.equal(m.lua(`SnetForever.Filtros.evaluar({{"r:Orc", "!x:mejora"}}, ${pj})`), false);
  sinErrores(m);
});

test('ronda 1 (M3): un addon que no conoce las mejoras no las saca como guías normales del selector', () => {
  // Así se ve un addon anterior: sin «mejora» en LATERALES y sin entender «x:mejora» (un término desconocido no se cumple).
  const m = nuevaMaquina({ datos: DATOS, jugador: GUERRERO });
  m.lua('SnetForever.Guias.LATERALES.mejora = nil; SnetForever.Filtros.CAPACIDADES.mejora = nil');
  const grupos = m.lua('SnetForever.Guias.disponibles()').map((g) => g.grupo);
  assert.ok(!grupos.includes('Mejoras (H)'), grupos.join(' | '));
  // Sin la marca, ese mismo addon sí la sacaría como un grupo normal (es lo que evita «x:mejora»).
  m.lua(`SNF_MISIONES.guias[${aLua(MEJORA)}].filtro = {{"r:Orc"}}`);
  assert.ok(m.lua('SnetForever.Guias.disponibles()').map((g) => g.grupo).includes('Mejoras (H)'));
  sinErrores(m);
});
