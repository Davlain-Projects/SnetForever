// T1b: el inventario de la cuenta para el tooltip (addon SnetForever_Comercio, comercio/inventario.lua). Cuenta lo que
// lleva cada personaje PROPIO en las bolsas y en el banco y lo guarda en SnetForeverCuenta.comercio.inventario, para que
// el tooltip diga cuánto tienes de un objeto y quién lo tiene. Solo lee y solo apunta al personaje con el que se juega:
// nunca a otros jugadores. Todo lo de aquí es inventado.
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const INV = 'SnetForever.InventarioCuenta';
const jugador = { nombre: 'Zula', reino: 'Normal', faccion: 'Horde', clase: 'MAGE', idioma: 'esES' };
const ficha = (m, clave = 'Zula-Normal') => m.lua(`return SnetForeverCuenta.comercio.inventario.pj[${JSON.stringify(clave)}]`);

function maquina() {
  const m = nuevaMaquina({ jugador });
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 1 });
  return m;
}

test('las bolsas se cuentan al entrar y al salir del mundo (no en cada cambio); lo equipado no cuenta', () => {
  const m = maquina();
  m.bolsa(0, 1, { id: 2589, n: 12 });
  m.bolsa(0, 2, { id: 2589, n: 3 });
  m.bolsa(1, 1, { id: 4306, n: 7 });
  m.equipar(16, 4306);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const f = ficha(m);
  assert.equal(f.nombre, 'Zula');
  assert.equal(f.reino, 'Normal');
  assert.equal(f.clase, 'MAGE');
  assert.deepEqual(f.bolsas, { 2589: 15, 4306: 7 });
  assert.equal(f.banco, undefined, 'el banco aún no se ha visto');
  m.bolsa(0, 2, undefined);
  m.bolsa(1, 1, { id: 4306, n: 9 });
  const lecturas = m.llamadas('C_Container.GetContainerItemInfo').length;
  m.disparar('BAG_UPDATE_DELAYED');
  assert.equal(m.llamadas('C_Container.GetContainerItemInfo').length, lecturas, 'un cambio de bolsas no las recorre');
  assert.equal(m.lua('#(BANCO.eventos.BAG_UPDATE_DELAYED or {})'), 0, 'ese evento ni se escucha (salta mucho)');
  assert.deepEqual(ficha(m).bolsas, { 2589: 15, 4306: 7 }, 'lo guardado es lo de la última vez que se contó');
  m.disparar('PLAYER_LEAVING_WORLD');
  assert.deepEqual(ficha(m).bolsas, { 2589: 12, 4306: 9 }, 'al salir se cuenta: es lo que verán los otros personajes');
  sinErrores(m);
});

test('el banco se cuenta al abrirlo y mientras está abierto; cerrado no se toca y al cerrarlo vacío no se borra', () => {
  const m = maquina();
  m.bolsa(-1, 3, { id: 4306, n: 20 });
  m.bolsa(5, 1, { id: 2589, n: 40 });
  m.disparar('BAG_UPDATE_DELAYED');
  assert.equal(ficha(m).banco, undefined, 'con el banco cerrado no se lee');
  m.disparar('BANKFRAME_OPENED');
  assert.deepEqual(ficha(m).banco, { 4306: 20, 2589: 40 });
  m.bolsa(5, 1, { id: 2589, n: 10 });
  m.disparar('BAG_UPDATE_DELAYED');
  assert.deepEqual(ficha(m).banco, { 4306: 20, 2589: 10 });
  // Al cerrar, el cliente puede no dejar leer ya los objetos: un banco que sale vacío no borra lo apuntado.
  m.bolsa(-1, 3, undefined);
  m.bolsa(5, 1, undefined);
  assert.equal(m.lua('#(BANCO.eventos.BAG_UPDATE_DELAYED or {})'), 1, 'con el banco abierto sí se escucha');
  m.disparar('BANKFRAME_CLOSED');
  assert.deepEqual(ficha(m).banco, { 4306: 20, 2589: 10 });
  assert.equal(m.lua('#(BANCO.eventos.BAG_UPDATE_DELAYED or {})'), 0, 'y al cerrarlo se deja de escuchar');
  m.bolsa(5, 1, { id: 2589, n: 99 });
  m.disparar('BAG_UPDATE_DELAYED');
  assert.deepEqual(ficha(m).banco, { 4306: 20, 2589: 10 }, 'ya cerrado, no se vuelve a leer');
  sinErrores(m);
});

test('de(objeto): la suma y los personajes propios del mismo reino que lo tienen, primero el de ahora', () => {
  const m = maquina();
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.objeto(2589, 5); // lo que el juego dice que lleva encima (GetItemCount)
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.bolsa(-1, 1, { id: 2589, n: 12 });
  m.disparar('BANKFRAME_OPENED');
  m.lua(`local pj = SnetForeverCuenta.comercio.inventario.pj
    pj["Brok-Normal"] = {nombre = "Brok", reino = "Normal", clase = "WARRIOR", bolsas = {[2589] = 3}}
    pj["Ana-Normal"] = {nombre = "Ana", reino = "Normal", clase = "PRIEST", bolsas = {[4306] = 2}, banco = {}}
    pj["Lejana-Otro"] = {nombre = "Lejana", reino = "Otro", clase = "PRIEST", bolsas = {[2589] = 40}}
    ${INV}.olvidarOrden()`);
  const [total, lista] = m.lua(`return {${INV}.de(2589)}`);
  assert.equal(total, 20);
  assert.deepEqual(lista, [
    { nombre: 'Zula', clase: 'MAGE', bolsas: 5, banco: 12, total: 17 },
    { nombre: 'Brok', clase: 'WARRIOR', bolsas: 3, total: 3 },
  ]);
  // F2: el tercer valor dice lo que no se cuenta (aquí, los bancos y los buzones sin abrir de las fichas del reino).
  assert.deepEqual(m.lua(`return {${INV}.de(4306)}`), [2, [{ nombre: 'Ana', clase: 'PRIEST', bolsas: 2, banco: 0, total: 2 }],
    { bancos: 1, correos: 3, sinEntrar: true }]);
  const nada = m.lua(`local t, l, f = ${INV}.de(999); return {t, l == nil, f}`);
  assert.deepEqual(nada, [0, true, { bancos: 1, correos: 3, sinEntrar: true }], 'sin nada: 0 y ninguna lista');
  // El personaje de ahora: lo que lleva encima se pregunta al juego en el momento, no sale de lo guardado.
  m.objeto(2589, 8);
  assert.deepEqual(m.lua(`return {${INV}.de(2589)}`)[1][0], { nombre: 'Zula', clase: 'MAGE', bolsas: 8, banco: 12, total: 20 });
  m.objeto(2589, 5);
  // Los personajes guardados (para la pantalla de ajustes) y cómo olvidar uno que ya no existe.
  assert.deepEqual(m.lua(`${INV}.personajes()`).map((p) => p.clave), ['Zula-Normal', 'Ana-Normal', 'Brok-Normal', 'Lejana-Otro']);
  assert.equal(m.lua(`${INV}.olvidar("Brok-Normal")`), true);
  assert.equal(m.lua(`${INV}.olvidar("Brok-Normal")`), false);
  assert.deepEqual(m.lua(`return {${INV}.de(2589)}`)[0], 17);
  sinErrores(m);
});

test('lo guardado sobrevive a recargar y otro personaje de la cuenta lo ve', () => {
  const m = maquina();
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const r = m.recargar();
  assert.deepEqual(ficha(r).bolsas, { 2589: 5 });
  r.jugador({ nombre: 'Brok', clase: 'WARRIOR' });
  r.bolsa(0, 1, { id: 2589, n: 2 });
  r.objeto(2589, 2);
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  const [total, lista] = r.lua(`return {${INV}.de(2589)}`);
  assert.equal(total, 7);
  assert.deepEqual(lista.map((p) => [p.nombre, p.clase, p.total]), [['Brok', 'WARRIOR', 2], ['Zula', 'MAGE', 5]]);
  sinErrores(r);
});

test('de(objeto) no recorre las bolsas: solo mira lo ya contado y una pregunta directa al juego', () => {
  const m = maquina();
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.objeto(2589, 5);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const antes = m.llamadas('C_Container.GetContainerItemInfo').length;
  for (let i = 0; i < 20; i++) m.lua(`${INV}.de(2589)`);
  assert.equal(m.llamadas('C_Container.GetContainerItemInfo').length, antes);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F2 (fallo en el juego): en Forever UnitName("player") da nombre y apellido. La ficha va por la clave entera
// (SNF.Personaje.clave(), «Nombre Apellido»); la vieja, con solo el nombre, se aparta sin borrarla. Y el correo se cuenta
// con el buzón abierto. Todos los nombres son inventados.
// ---------------------------------------------------------------------------------------------------

const conApellido = (nombre, apellido, cambios = {}) => ({ ...jugador, nombre, apellido, ...cambios });
const inventario = (m) => m.lua('return SnetForeverCuenta.comercio.inventario');
function maquinaDe(j) {
  const m = nuevaMaquina({ jugador: j });
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 1 });
  return m;
}

test('la clave del personaje es Nombre Apellido-Reino (UnitName da nombre y apellido)', () => {
  const m = maquinaDe(conApellido('Nombre', 'Apellido'));
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.objeto(2589, 5);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const f = ficha(m, 'Nombre Apellido-Normal');
  assert.ok(f, JSON.stringify(inventario(m)));
  assert.equal(f.nombre, 'Nombre Apellido');
  assert.deepEqual(f.bolsas, { 2589: 5 });
  assert.equal(ficha(m, 'Nombre-Normal') ?? null, null, 'nada con el nombre cortado');
  assert.equal(inventario(m).v, 2);
  assert.deepEqual(m.lua(`${INV}.personajes()`).map((p) => [p.clave, p.nombre]), [['Nombre Apellido-Normal', 'Nombre Apellido']]);
  assert.equal(m.lua(`return {${INV}.de(2589)}`)[1][0].nombre, 'Nombre Apellido');
  sinErrores(m);
});

// Lo que guardaba la 0.6.x: la clave y el nombre con solo la primera palabra (forma de inventario.v = 1).
const V1 = (fichas) => `SnetForever.Guardado.preparar()
  SnetForeverCuenta.comercio.inventario = {v = 1, pj = {${fichas}}}
  ${INV}.olvidarOrden()`;

test('una ficha guardada con el nombre cortado se aparta sin borrarla al entrar ese personaje (no se mueve) y su ficha entera se rehace con las bolsas y el banco que enseña el juego', () => {
  const m = maquinaDe(conApellido('Nombre', 'Apellido'));
  m.lua(V1('["Nombre-Normal"] = {nombre = "Nombre", reino = "Normal", clase = "MAGE", bolsas = {[2589] = 40}, banco = {[4306] = 9}}'));
  const vieja = m.lua('return SnetForeverCuenta.comercio.inventario.pj["Nombre-Normal"]');
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.objeto(2589, 5);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  // F2, punto 0: la ficha entera se rehace con lo que el juego enseña (las bolsas al entrar y el banco al abrirlo); la
  // cortada pudo mezclar a dos personajes, así que no se le da a ciegas a ninguno.
  const f = ficha(m, 'Nombre Apellido-Normal');
  assert.equal(f.nombre, 'Nombre Apellido');
  assert.deepEqual(f.bolsas, { 2589: 5 });
  assert.equal(f.banco, undefined, 'su banco, sin abrir todavía: no se toma el de la ficha cortada');
  m.bolsa(-1, 1, { id: 4306, n: 7 });
  m.disparar('BANKFRAME_OPENED');
  assert.deepEqual(ficha(m, 'Nombre Apellido-Normal').banco, { 4306: 7 });
  // La cortada, apartada tal cual (nada se borra), y ya no cuenta.
  const inv = inventario(m);
  assert.equal(inv.pj['Nombre-Normal'] ?? null, null);
  assert.deepEqual(inv.apartadas['Nombre-Normal'].ficha, vieja);
  assert.equal(typeof inv.apartadas['Nombre-Normal'].hora, 'number');
  assert.equal(inv.v, 2);
  assert.deepEqual(m.lua(`${INV}.personajes()`).map((p) => p.clave), ['Nombre Apellido-Normal']);
  assert.equal(m.lua(`return {${INV}.de(2589)}`)[0], 5, 'lo de la cortada no se suma');
  sinErrores(m);
});

test('dos personajes con la misma primera palabra («Nombre Uno» y «Nombre Dos») en el mismo reino: la ficha cortada se aparta sin borrarla, cada uno rehace la suya al entrar y no se pisan', () => {
  const m = maquinaDe(conApellido('Nombre', 'Uno'));
  // La cortada pudo mezclar a los dos; «Otro» es un tercero, con su ficha cortada sin tocar hasta que entre.
  m.lua(V1(`["Nombre-Normal"] = {nombre = "Nombre", reino = "Normal", clase = "PRIEST", bolsas = {[2589] = 40}, banco = {[2589] = 3}},
    ["Otro-Normal"] = {nombre = "Otro", reino = "Normal", clase = "WARRIOR", bolsas = {[4306] = 2}}`));
  const vieja = m.lua('return SnetForeverCuenta.comercio.inventario.pj["Nombre-Normal"]');
  const otro = m.lua('return SnetForeverCuenta.comercio.inventario.pj["Otro-Normal"]');
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.objeto(2589, 5);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  // Ronda 1: con apellido, todas las de la v1 se apartan a la vez (también la de «Otro», que aún no ha entrado).
  assert.deepEqual(inventario(m).apartadas['Nombre-Normal'].ficha, vieja);
  assert.deepEqual(inventario(m).apartadas['Otro-Normal'].ficha, otro);
  assert.deepEqual(m.lua(`${INV}.personajes()`).map((p) => p.clave), ['Nombre Uno-Normal']);
  const r = m.recargar();
  r.jugador({ apellido: 'Dos', clase: 'PRIEST' });
  r.bolsa(0, 1, { id: 2589, n: 2 });
  r.objeto(2589, 2);
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  const inv = inventario(r);
  assert.equal(inv.pj['Nombre Uno-Normal'].clase, 'MAGE');
  assert.deepEqual(inv.pj['Nombre Uno-Normal'].bolsas, { 2589: 5 });
  assert.equal(inv.pj['Nombre Dos-Normal'].clase, 'PRIEST');
  assert.deepEqual(inv.pj['Nombre Dos-Normal'].bolsas, { 2589: 2 });
  assert.equal(inv.pj['Nombre Dos-Normal'].banco, undefined, 'su banco no se ha visto: no hereda el de la cortada');
  assert.deepEqual(Object.keys(inv.apartadas).sort(), ['Nombre-Normal', 'Otro-Normal'], 'las apartadas siguen una sola vez y tal cual');
  assert.deepEqual(inv.apartadas['Nombre-Normal'].ficha, vieja);
  assert.equal(inv.pj['Otro-Normal'] ?? null, null);
  const [total, lista] = r.lua(`return {${INV}.de(2589)}`);
  assert.equal(total, 7);
  assert.deepEqual(lista.map((p) => [p.nombre, p.total]), [['Nombre Dos', 2], ['Nombre Uno', 5]]);
  sinErrores(r);
});

test('ronda 1: dos personajes con la misma primera palabra que aún no han entrado: su fila mezclada deja de salir ya, sin borrarla', () => {
  // Juega un tercero (con apellido); «Nombre-Normal» pudo mezclar a «Nombre Uno» y «Nombre Dos», que no han entrado.
  const m = maquinaDe(conApellido('Tercero', 'Inventado'));
  m.lua(V1('["Nombre-Normal"] = {nombre = "Nombre", reino = "Normal", clase = "PRIEST", bolsas = {[2589] = 40}, banco = {[2589] = 3}}'));
  const vieja = m.lua('return SnetForeverCuenta.comercio.inventario.pj["Nombre-Normal"]');
  m.objeto(2589, 1);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const [total, lista] = m.lua(`return {${INV}.de(2589)}`);
  assert.equal(total, 1, 'lo de la fila mezclada ya no se suma');
  assert.deepEqual(lista.map((p) => p.nombre), ['Tercero Inventado']);
  assert.ok(!m.lua(`${INV}.personajes()`).some((p) => p.clave === 'Nombre-Normal'), 'ni sale en Ajustes');
  assert.deepEqual(inventario(m).apartadas['Nombre-Normal'].ficha, vieja, 'apartada tal cual');
  sinErrores(m);
});

test('ronda 1: sin apellido (fuera de Forever), las fichas de la v1 ya eran las enteras y se quedan', () => {
  const m = maquinaDe({ ...jugador });
  m.lua(V1('["Zula-Normal"] = {nombre = "Zula", reino = "Normal", clase = "MAGE", bolsas = {[2589] = 3}, banco = {[2589] = 9}}'));
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const inv = inventario(m);
  assert.equal(inv.v, 2);
  assert.deepEqual(inv.pj['Zula-Normal'].banco, { 2589: 9 }, 'es suya: su banco se queda');
  assert.equal(inv.apartadas ?? null, null);
  sinErrores(m);
});

test('dos personajes con el mismo nombre y distinto apellido no comparten ficha', () => {
  const m = maquinaDe(conApellido('Nombre', 'Uno'));
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const r = m.recargar();
  r.jugador({ apellido: 'Segundo', clase: 'PRIEST' });
  r.bolsa(0, 1, { id: 2589, n: 1 });
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  const inv = inventario(r);
  assert.deepEqual(Object.keys(inv.pj).sort(), ['Nombre Segundo-Normal', 'Nombre Uno-Normal']);
  assert.equal(inv.pj['Nombre Uno-Normal'].clase, 'MAGE');
  assert.deepEqual(inv.pj['Nombre Uno-Normal'].bolsas, { 2589: 5 });
  assert.equal(inv.pj['Nombre Segundo-Normal'].clase, 'PRIEST');
  assert.equal(inv.apartadas ?? null, null, 'sin ficha cortada no se aparta nada');
  sinErrores(r);
});

// ---------------------------------------------------------------------------------------------------
// F2b (fallo en el juego, tras la F2 y la F3): con «Nombre Uno» el tooltip decía «Nombre Uno 77 (77 Bolsas, banco sin
// ver)»; al salir y entrar con «Nombre Dos», «Nombre Uno» ya no salía. Forever tiene la bolsa de componentes
// (Enum.BagIndex.ReagentBag = 5, como el cliente moderno: TSM y Syndicator la cuentan con IsForever) y GetItemCount cuenta lo
// que lleva dentro. El tooltip del de ahora pregunta al juego (GetItemCount), pero lo que ven los DEMÁS es lo guardado al
// contar sus bolsas. Todos los nombres son inventados.
// ---------------------------------------------------------------------------------------------------

// Lo que TSM tiene de la cuenta (Forever: su «reino» es el tipo de reino, «Normal»): los dos «Nombre» y dos alters.
const TSM_DE_LA_CUENTA = `rawset(_G, "C_GameRules", {IsGameRuleActive = function(regla) return regla == "pvp-no" end})
  rawset(Enum, "GameRule", {HardcoreRuleset = "hc", RPRuleset = "rp", PvPRuleset = "pvp"})
  TradeSkillMasterDB = {_syncAccountKey = {["Horde - Normal"] = "Horde - Normal - 111"}, _syncOwner = {
    ["Nombre Uno - Horde - Normal"] = "Horde - Normal - 111", ["Nombre Dos - Horde - Normal"] = "Horde - Normal - 111",
    ["Alter Tres - Horde - Normal"] = "Horde - Normal - 111", ["Alter Cuatro - Horde - Normal"] = "Horde - Normal - 111"}}
  local function pj(nombre, clase, bolsas, banco)
    local s = "s@" .. nombre .. " - Horde - Normal@internalData@"
    TradeSkillMasterDB[s .. "classKey"] = clase
    TradeSkillMasterDB[s .. "bagQuantity"], TradeSkillMasterDB[s .. "bankQuantity"] = bolsas, banco
    TradeSkillMasterDB[s .. "mailQuantity"] = {}
  end
  pj("Nombre Uno", "MAGE", {["i:4306"] = 70}, {})
  pj("Nombre Dos", "PRIEST", {["i:4306"] = 3}, {["i:4306"] = 44})
  pj("Alter Tres", "WARRIOR", {["i:2589"] = 1}, {})
  pj("Alter Cuatro", "HUNTER", {["i:2589"] = 2}, {})`;

// Las filas del inventario en el tooltip de verdad: {«Nombre»: «77 (…)»}.
function filasDelTooltip(m, id) {
  m.tooltipObjeto(id);
  const d = m.detalleTooltip();
  const i = d.findIndex((x) => x.izq === 'Inventario');
  const filas = {};
  for (const x of i < 0 ? [] : d.slice(i + 1)) {
    if (!String(x.izq).startsWith('  ')) break;
    filas[String(x.izq).trim()] = String(x.der).replace(/\|c\w{8}|\|r/g, '');
  }
  return filas;
}

for (const conTSM of [false, true]) {
  test(`dos personajes con la misma primera palabra en sesiones seguidas: el primero cuenta y sale; entra el segundo; el primero sigue saliendo en el tooltip y en Ajustes${conTSM ? ' (con la importación de TSM en la primera sesión)' : ''}`, () => {
    // Ronda 1: con el Enum.BagIndex de Forever (bolsas: 'forever'), el que dio /dump Enum.BagIndex en el juego.
    const m = nuevaMaquina({ jugador: conApellido('Nombre', 'Uno'), bolsas: 'forever', previo: conTSM ? TSM_DE_LA_CUENTA : null });
    m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
    m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 1 });
    // Sesión 1, con «Nombre Uno»: el paño de seda, en la bolsa de componentes; la piedra de hogar (6948), en la mochila.
    m.bolsa(0, 1, { id: 6948, n: 1 });
    m.bolsa(5, 1, { id: 4306, n: 77 });
    m.objeto(6948, 1);
    m.objeto(4306, 77);
    m.disparar('PLAYER_ENTERING_WORLD', true, false);
    if (conTSM) assert.ok(m.lua('return SnetForever.ImportarTSM.inventario()'), 'la importación entra');
    const antes = filasDelTooltip(m, 4306);
    assert.equal(antes['Nombre Uno'], '77 (77 Bolsas, banco sin ver)', JSON.stringify(antes));
    if (conTSM) assert.match(antes['Nombre Dos'], /^47 \(3 Bolsas, 44 Banco; de TSM, a /);
    const claves = conTSM
      ? ['Nombre Uno-Normal', 'Alter Cuatro-Normal', 'Alter Tres-Normal', 'Nombre Dos-Normal']
      : ['Nombre Uno-Normal'];
    assert.deepEqual(m.lua(`${INV}.personajes()`).map((p) => p.clave), claves);
    // Sesión 2: sale al menú de personajes y entra con «Nombre Dos», que lleva 3 en la mochila.
    const r = m.cambiarDePersonaje({ apellido: 'Dos', clase: 'PRIEST' });
    r.bolsa(0, 1, { id: 6948, n: 1 });
    r.bolsa(0, 2, { id: 4306, n: 3 });
    r.objeto(6948, 1);
    r.objeto(4306, 3);
    r.disparar('PLAYER_ENTERING_WORLD', true, false);
    const filas = filasDelTooltip(r, 4306);
    assert.equal(filas['Nombre Uno'], '77 (77 Bolsas, banco sin ver)', JSON.stringify(filas));
    if (conTSM) assert.match(filas['Nombre Dos'], /^47 \(3 Bolsas, 44 Banco; banco de TSM, a /);
    else assert.equal(filas['Nombre Dos'], '3 (3 Bolsas, banco sin ver)');
    assert.deepEqual(Object.keys(filas), ['Nombre Dos', 'Nombre Uno'], 'primero el de ahora');
    assert.deepEqual(inventario(r).pj['Nombre Uno-Normal'].bolsas, { 6948: 1, 4306: 77 }, 'lo que llevaba al salir, también en la bolsa de componentes');
    const [total] = r.lua(`return {${INV}.de(4306)}`);
    assert.equal(total, conTSM ? 77 + 47 : 77 + 3);
    assert.deepEqual(r.lua(`${INV}.personajes()`).map((p) => p.clave), conTSM
      ? ['Nombre Dos-Normal', 'Alter Cuatro-Normal', 'Alter Tres-Normal', 'Nombre Uno-Normal']
      : ['Nombre Dos-Normal', 'Nombre Uno-Normal'], 'en Ajustes salen todos, el de ahora primero');
    assert.equal(inventario(r).apartadas ?? null, null, 'nada apartado');
    sinErrores(r);
  });
}

// F2b, ronda 1 ------------------------------------------------------------------------------------

test('F2b: al salir, unas bolsas que el juego no deja leer (0 huecos) no pisan lo contado al entrar', () => {
  const m = nuevaMaquina({ jugador: conApellido('Nombre', 'Uno'), bolsas: 'forever' });
  m.bolsa(0, 1, { id: 6948, n: 1 });
  m.bolsa(5, 1, { id: 4306, n: 77 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  assert.deepEqual(ficha(m, 'Nombre Uno-Normal').bolsas, { 6948: 1, 4306: 77 });
  // El juego da 0 huecos en todas las bolsas (la mochila y la de componentes; las otras no están puestas).
  m.huecos(0, 0);
  m.huecos(5, 0);
  m.disparar('PLAYER_LEAVING_WORLD');
  m.disparar('PLAYER_LOGOUT');
  assert.deepEqual(ficha(m, 'Nombre Uno-Normal').bolsas, { 6948: 1, 4306: 77 }, 'lo de al entrar se queda');
  sinErrores(m);
});

test('F2b: en Forever el banco son las pestañas 6 a 14; el llavero (-1) no cuenta ni como banco ni en las bolsas', () => {
  const m = nuevaMaquina({ jugador: conApellido('Nombre', 'Uno'), bolsas: 'forever' });
  m.bolsa(0, 1, { id: 6948, n: 1 });
  m.huecos(-1, 4);
  m.bolsa(-1, 1, { id: 7146, n: 1 }); // una llave, en el llavero
  m.bolsa(6, 1, { id: 2589, n: 20 });
  m.bolsa(14, 2, { id: 2589, n: 5 });
  m.bolsa(15, 1, { id: 4306, n: 9 }); // el banco de cuenta: no es del personaje
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.disparar('BANKFRAME_OPENED');
  const f = ficha(m, 'Nombre Uno-Normal');
  assert.deepEqual(f.bolsas, { 6948: 1 }, 'el llavero no va en las bolsas');
  assert.deepEqual(f.banco, { 2589: 25 }, 'las pestañas 6 y 14, sin la llave ni el banco de cuenta');
  assert.deepEqual(inventario(m).bancoCuenta.objetos, { 4306: 9 });
  m.disparar('BANKFRAME_CLOSED');
  sinErrores(m);
});

test('F2b: con el Enum.BagIndex clásico (Bank -1 y BankBag_n) el banco sigue siendo el -1 y sus bolsas, y no hay banco de cuenta', () => {
  const m = maquinaDe(conApellido('Nombre', 'Uno'));
  m.bolsa(-1, 1, { id: 2589, n: 3 });
  m.bolsa(5, 1, { id: 2589, n: 4 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.disparar('BANKFRAME_OPENED');
  assert.deepEqual(ficha(m, 'Nombre Uno-Normal').banco, { 2589: 7 });
  assert.equal(inventario(m).bancoCuenta ?? null, null);
  const [, , falta, deCuenta] = m.lua(`return {${INV}.de(2589)}`);
  assert.equal(falta.bancoCuenta ?? null, null, 'sin banco de cuenta en el cliente, la frase no lo nombra');
  assert.equal(deCuenta ?? null, null);
  sinErrores(m);
});

test('F2b: el banco de cuenta se cuenta UNA vez con dos personajes en sesiones seguidas: fila propia en el tooltip y en el total', () => {
  const m = nuevaMaquina({ jugador: conApellido('Nombre', 'Uno'), bolsas: 'forever' });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 1 });
  m.bolsa(0, 1, { id: 4306, n: 2 });
  m.objeto(4306, 2);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  // Sin haberlo visto, la frase lo dice.
  m.tooltipObjeto(4306);
  assert.ok(m.detalleTooltip().some((x) => x.izq === 'Sin contar: 1 banco, 1 buzón, el banco de cuenta y los personajes sin entrar'),
    JSON.stringify(m.detalleTooltip()));
  m.huecos(6, 28); // la primera pestaña del banco del personaje, vacía
  m.bolsa(15, 1, { id: 4306, n: 10 });
  m.bolsa(23, 3, { id: 4306, n: 1 });
  m.disparar('BANKFRAME_OPENED');
  m.disparar('BANKFRAME_CLOSED');
  const filas1 = filasDelTooltip(m, 4306);
  assert.deepEqual(filas1, { 'Nombre Uno': '2 (2 Bolsas, 0 Banco)', 'Banco de cuenta': '11' });
  assert.equal(m.lua(`return {${INV}.de(4306)}`)[0], 13);
  // Sesión 2, con «Nombre Dos»: abre el banco y el de cuenta sigue con lo mismo (es de toda la cuenta).
  const r = m.cambiarDePersonaje({ apellido: 'Dos', clase: 'PRIEST' });
  r.bolsa(0, 1, { id: 4306, n: 3 });
  r.objeto(4306, 3);
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  assert.deepEqual(filasDelTooltip(r, 4306), { 'Nombre Dos': '3 (3 Bolsas, banco sin ver)', 'Nombre Uno': '2 (2 Bolsas, 0 Banco)', 'Banco de cuenta': '11' },
    'antes de abrirlo, lo que se vio con el otro');
  r.huecos(6, 28);
  r.bolsa(15, 1, { id: 4306, n: 10 });
  r.bolsa(23, 3, { id: 4306, n: 1 });
  r.disparar('BANKFRAME_OPENED');
  r.disparar('BANKFRAME_CLOSED');
  const inv = inventario(r);
  assert.deepEqual(inv.bancoCuenta.objetos, { 4306: 11 });
  assert.equal(Object.keys(inv.pj['Nombre Dos-Normal'].banco).length, 0, 'ni en la ficha de quien lo abre (su banco, visto y vacío)');
  assert.equal(inv.pj['Nombre Uno-Normal'].bancoCuenta ?? null, null);
  assert.deepEqual(filasDelTooltip(r, 4306), { 'Nombre Dos': '3 (3 Bolsas, 0 Banco)', 'Nombre Uno': '2 (2 Bolsas, 0 Banco)', 'Banco de cuenta': '11' });
  const [total, lista, , deCuenta] = r.lua(`return {${INV}.de(4306)}`);
  assert.equal(total, 3 + 2 + 11, 'el banco de cuenta, una sola vez');
  assert.equal(deCuenta, 11);
  assert.deepEqual(lista.map((p) => p.nombre), ['Nombre Dos', 'Nombre Uno'], 'no es un personaje');
  assert.ok(!r.lua(`${INV}.personajes()`).some((p) => /cuenta/i.test(String(p.nombre))), 'ni sale en Ajustes como personaje');
  // Sin poder leerlo (0 huecos) no se pisa; al cerrar, vacío, tampoco; abierto y vacío de verdad, sí.
  r.huecos(15, 0);
  r.huecos(23, 0);
  r.disparar('BANKFRAME_OPENED');
  assert.deepEqual(inventario(r).bancoCuenta.objetos, { 4306: 11 }, 'sin huecos que leer, se queda');
  r.huecos(15, 12);
  r.huecos(23, 12);
  r.bolsa(15, 1, undefined);
  r.bolsa(23, 3, undefined);
  r.disparar('BANKFRAME_CLOSED');
  assert.deepEqual(inventario(r).bancoCuenta.objetos, { 4306: 11 }, 'al cerrar, vacío, se queda');
  r.disparar('BANKFRAME_OPENED');
  assert.equal(Object.keys(inventario(r).bancoCuenta.objetos).length, 0, 'con el banco abierto se ve vacío de verdad');
  r.disparar('BANKFRAME_CLOSED');
  sinErrores(r);
});

// F2b (detalles que llegaron con la F4): un bancoCuenta guardado que es una tabla mal formada (sus objetos no son una
// tabla) no se tira al sustituirlo: se guarda entero en _roto. Y el banco de cuenta lleva el reino en el que se vio, para
// poder filtrar por reino más adelante sin migrar nada.
test('F2b: un bancoCuenta mal formado (objetos que no son una tabla) se guarda en _roto antes de sustituirlo', () => {
  const m = nuevaMaquina({ jugador: conApellido('Nombre', 'Uno'), bolsas: 'forever' });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua('SnetForeverCuenta.comercio.inventario.bancoCuenta = {objetos = 7, hora = 1, otra = "cosa"}');
  m.huecos(6, 28);
  m.bolsa(15, 1, { id: 4306, n: 10 });
  m.disparar('BANKFRAME_OPENED');
  const bc = inventario(m).bancoCuenta;
  assert.deepEqual(bc.objetos, { 4306: 10 }, 'lo de ahora');
  assert.deepEqual(bc._roto, { objetos: 7, hora: 1, otra: 'cosa' }, 'lo de antes, entero');
  // Al volver a apuntarlo, lo roto se queda (no se pierde la segunda vez).
  m.bolsa(15, 1, { id: 4306, n: 12 });
  m.disparar('BAG_UPDATE_DELAYED');
  m.disparar('BANKFRAME_CLOSED');
  const otra = inventario(m).bancoCuenta;
  assert.deepEqual(otra.objetos, { 4306: 12 });
  assert.deepEqual(otra._roto, { objetos: 7, hora: 1, otra: 'cosa' });
  // Uno bien formado no deja nada en _roto.
  m.lua('SnetForeverCuenta.comercio.inventario.bancoCuenta = {objetos = {[4306] = 1}, hora = 1}');
  m.disparar('BANKFRAME_OPENED');
  assert.equal(inventario(m).bancoCuenta._roto ?? null, null);
  m.disparar('BANKFRAME_CLOSED');
  sinErrores(m);
});

test('F2b: el banco de cuenta guarda el reino en el que se vio', () => {
  const m = nuevaMaquina({ jugador: conApellido('Nombre', 'Uno'), bolsas: 'forever' });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.huecos(6, 28);
  m.bolsa(15, 1, { id: 4306, n: 10 });
  m.disparar('BANKFRAME_OPENED');
  m.disparar('BANKFRAME_CLOSED');
  const bc = inventario(m).bancoCuenta;
  assert.deepEqual(bc.objetos, { 4306: 10 });
  assert.equal(bc.reino, 'Normal', 'el reino del personaje que lo abrió');
  sinErrores(m);
});

test('con el buzón abierto se cuenta el correo; sin abrirlo, correo sin ver; nunca se guarda quién lo envió', () => {
  const m = maquinaDe(conApellido('Nombre', 'Apellido'));
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.objeto(2589, 5);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  assert.equal(ficha(m, 'Nombre Apellido-Normal').correo, undefined, 'sin abrir el buzón: correo sin ver');
  // Antes de abrir el buzón el juego no enseña nada: no se lee.
  m.lua(`BANCO.ponerCorreo({
    {indice = 1, adjunto = 1, id = 2589, cantidad = 3, factura = {tipo = "seller", jugador = "Remitente Inventado", puja = 100}},
    {indice = 1, adjunto = 2, id = 2589, cantidad = 2},
    {indice = 2, adjunto = 1, id = 4306, cantidad = 1},
  })`);
  m.disparar('MAIL_INBOX_UPDATE');
  assert.equal(ficha(m, 'Nombre Apellido-Normal').correo, undefined, 'con el buzón cerrado no se lee');
  m.disparar('MAIL_SHOW');
  m.disparar('MAIL_INBOX_UPDATE');
  assert.deepEqual(ficha(m, 'Nombre Apellido-Normal').correo, { 2589: 5, 4306: 1 });
  // Coge algo del buzón (lo hace el jugador): con el buzón abierto se vuelve a contar.
  m.lua('BANCO.ponerCorreo({{indice = 1, adjunto = 1, id = 2589, cantidad = 3}})');
  m.disparar('MAIL_INBOX_UPDATE');
  assert.deepEqual(ficha(m, 'Nombre Apellido-Normal').correo, { 2589: 3 });
  // Al cerrar puede salir vacío sin estarlo: lo apuntado se queda. Ya cerrado, no se lee.
  m.lua('BANCO.ponerCorreo({})');
  m.disparar('MAIL_CLOSED');
  assert.deepEqual(ficha(m, 'Nombre Apellido-Normal').correo, { 2589: 3 });
  m.lua('BANCO.ponerCorreo({{indice = 1, adjunto = 1, id = 4306, cantidad = 50}})');
  m.disparar('MAIL_INBOX_UPDATE');
  assert.deepEqual(ficha(m, 'Nombre Apellido-Normal').correo, { 2589: 3 });
  // El correo entra en el total y en la fila del personaje.
  const [total, lista] = m.lua(`return {${INV}.de(2589)}`);
  assert.equal(total, 8);
  assert.deepEqual([lista[0].bolsas, lista[0].correo, lista[0].total], [5, 3, 8]);
  // Nunca se abre, se coge ni se mira quién lo envió.
  for (const api of ['TakeInboxItem', 'AutoLootMailItem', 'GetInboxInvoiceInfo', 'GetInboxText', 'GetInboxHeaderInfo']) {
    assert.equal(m.llamadas(api).length, 0, api);
  }
  assert.ok(!JSON.stringify(inventario(m)).includes('Remitente'), 'nunca el nombre de quien lo envió');
  sinErrores(m);
});

test('ronda 1: un buzón con 0 cartas es un correo visto y vacío', () => {
  const m = maquinaDe(conApellido('Nombre', 'Apellido'));
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua('BANCO.ponerCorreo({})');
  m.disparar('MAIL_SHOW');
  assert.equal(ficha(m, 'Nombre Apellido-Normal').correo, undefined, 'al abrir aún sin cargar se espera');
  m.disparar('MAIL_INBOX_UPDATE');
  assert.equal(m.lua('return next(SnetForeverCuenta.comercio.inventario.pj["Nombre Apellido-Normal"].correo) == nil'), true, 'visto y vacío');
  m.disparar('MAIL_CLOSED');
  assert.equal(m.lua('return next(SnetForeverCuenta.comercio.inventario.pj["Nombre Apellido-Normal"].correo) == nil'), true, 'y se queda así al cerrar');
  assert.equal(m.lua(`local _, _, f = ${INV}.de(2589); return f.correos`), 0, 'ya no sale como buzón sin abrir');
  sinErrores(m);
});

// F3 (antes lo daba por visto y vacío): si en una apertura nunca llega MAIL_INBOX_UPDATE, el buzón no se ha cargado y al
// cerrarlo el correo se queda como estaba. «Nombre Uno» y «Nombre Dos» son inventados, del mismo reino.
test('cerrar el buzón antes de que cargue no da el correo por visto', () => {
  const m = maquinaDe(conApellido('Nombre', 'Uno'));
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua('BANCO.ponerCorreo({})');
  m.disparar('MAIL_SHOW');
  m.disparar('MAIL_CLOSED');
  assert.equal(ficha(m, 'Nombre Uno-Normal').correo, undefined, 'nunca visto: sigue sin ver');
  assert.equal(m.lua(`local _, _, f = ${INV}.de(2589); return f.correos`), 1, 'y sale como buzón sin abrir');
  // Con cartas ya al abrir, se cuentan.
  m.lua('BANCO.ponerCorreo({{indice = 1, adjunto = 1, id = 2589, cantidad = 3}})');
  m.disparar('MAIL_SHOW');
  m.disparar('MAIL_CLOSED');
  assert.deepEqual(ficha(m, 'Nombre Uno-Normal').correo, { 2589: 3 }, 'con cartas ya al abrir, se cuenta');
  // Ya visto con algo: abrir y cerrar sin cargar no lo vacía.
  m.lua('BANCO.ponerCorreo({})');
  m.disparar('MAIL_SHOW');
  m.disparar('MAIL_CLOSED');
  assert.deepEqual(ficha(m, 'Nombre Uno-Normal').correo, { 2589: 3 }, 'abrir y cerrar sin cargar no lo vacía');
  // Otra apertura que sí carga (0 cartas): ahora sí, visto y vacío; y se queda así al cerrar.
  m.disparar('MAIL_SHOW');
  m.disparar('MAIL_INBOX_UPDATE');
  m.disparar('MAIL_CLOSED');
  assert.equal(m.lua('return next(SnetForeverCuenta.comercio.inventario.pj["Nombre Uno-Normal"].correo) == nil'), true);
  // El otro personaje, con la misma primera palabra: su correo es suyo y sigue sin ver.
  const r = m.recargar();
  r.jugador({ apellido: 'Dos' });
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  r.lua('BANCO.ponerCorreo({})');
  r.disparar('MAIL_SHOW');
  r.disparar('MAIL_CLOSED');
  assert.equal(ficha(r, 'Nombre Dos-Normal').correo, undefined);
  assert.equal(r.lua('return next(SnetForeverCuenta.comercio.inventario.pj["Nombre Uno-Normal"].correo) == nil'), true, 'el del otro, sin tocar');
  assert.equal(ficha(r, 'Nombre-Normal') ?? null, null);
  sinErrores(r);
});

test('olvidar un personaje lo aparta sin borrarlo', () => {
  const m = maquinaDe(conApellido('Nombre', 'Uno'));
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const r = m.recargar();
  r.jugador({ apellido: 'Dos', clase: 'PRIEST' });
  r.bolsa(0, 1, { id: 2589, n: 2 });
  r.objeto(2589, 2);
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  const uno = r.lua('return SnetForeverCuenta.comercio.inventario.pj["Nombre Uno-Normal"]');
  const dos = r.lua('return SnetForeverCuenta.comercio.inventario.pj["Nombre Dos-Normal"]');
  assert.equal(r.lua(`${INV}.olvidar("Nombre Uno-Normal")`), true);
  const inv = inventario(r);
  assert.equal(inv.pj['Nombre Uno-Normal'] ?? null, null, 'ya no cuenta');
  assert.deepEqual(inv.apartadas['Nombre Uno-Normal'].ficha, uno, 'apartada tal cual');
  assert.equal(typeof inv.apartadas['Nombre Uno-Normal'].hora, 'number');
  assert.deepEqual(inv.pj['Nombre Dos-Normal'], dos, 'el otro, con la misma primera palabra, sin tocar');
  assert.deepEqual(r.lua(`${INV}.personajes()`).map((p) => p.clave), ['Nombre Dos-Normal'], 'ni sale en Ajustes');
  assert.equal(r.lua(`return {${INV}.de(2589)}`)[0], 2);
  assert.equal(r.lua(`${INV}.olvidar("Nombre Uno-Normal")`), false, 'ya no está');
  // Si vuelve a entrar se apunta otra vez; olvidarlo otra vez no pisa lo apartado antes.
  const s = r.recargar();
  s.jugador({ apellido: 'Uno', clase: 'MAGE' });
  s.bolsa(0, 1, { id: 2589, n: 1 });
  s.disparar('PLAYER_ENTERING_WORLD', true, false);
  const nueva = s.lua('return SnetForeverCuenta.comercio.inventario.pj["Nombre Uno-Normal"]');
  assert.equal(s.lua(`${INV}.olvidar("Nombre Uno-Normal")`), true);
  const ap = inventario(s).apartadas;
  assert.deepEqual(ap['Nombre Uno-Normal'].ficha, uno);
  assert.deepEqual(ap['Nombre Uno-Normal (2)'].ficha, nueva);
  sinErrores(s);
});

test('con un apellido secreto no se apunta a nadie con el nombre cortado (ni el inventario ni los personajes propios)', () => {
  const m = maquinaDe(conApellido('Nombre', 'Uno'));
  m.lua('BANCO.jugador.apellido = BANCO.secreto("string")');
  m.bolsa(0, 1, { id: 2589, n: 5 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const inv = inventario(m);
  const pj = (inv && inv.pj) || {};
  assert.equal(pj['Nombre-Normal'] ?? null, null, JSON.stringify(Object.keys(pj)));
  const propios = m.lua('return SnetForever.Operaciones.propios().personajes') || [];
  assert.ok(!propios.includes('Nombre - Normal'), JSON.stringify(propios));
  sinErrores(m);
});
