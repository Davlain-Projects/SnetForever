// F6b (en el juego, 20-nov): en WoW Forever, en Cima del Trueno, `/dump GetRealmName()` dio [1]="": el nombre del reino
// llega vacío. Las fichas del inventario están guardadas con el reino «CAMWOW US1 Realm 5 PvE» (con espacios) y, con el
// reino vacío, el addon no encontraba a nadie: el tooltip con la subasta abierta salía sin la línea del inventario ni el
// bloque de la Subasta, sin ningún error de Lua. Aquí, un juego falso con GetRealmName() vacío (jugador.nombreReino = ""),
// y lo mismo con GetNormalizedRealmName y el reino del GUID (reinoNormalizado y reinoGuid). Todo lo de aquí es inventado.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, necesitaComercio } from './ayuda.js';

const REINO = 'CAMWOW US1 Realm 5 PvE';
const NORMALIZADO = 'CAMWOWUS1Realm5PvE';
const VACIO = { nombreReino: '', reinoNormalizado: '', reinoGuid: '' }; // las tres funciones del reino, vacías
const JUGADOR = { nombre: 'Nombre', apellido: 'Uno', reino: REINO, faccion: 'Horde', clase: 'MAGE', idioma: 'esES' };
const LINO = 2589;
const SEDA = 4306;
const reino = (m) => m.lua('return SnetForever.Personaje.reino()');
const pj = (m) => m.lua('return SnetForeverCuenta.comercio.inventario.pj') || {};

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

// Lo guardado como lo deja una versión de antes de la F6b: sin el último reino bueno que guarda Personaje.reino().
const comoAntes = (m) => m.lua('SnetForeverCuenta.reino = nil');

// Una primera sesión con el reino bueno (como cuando se guardaron las fichas del jugador): Nombre Uno con 5 de lino en las
// bolsas y otro personaje propio del mismo reino con 7 de lino.
function primeraSesion(opciones = {}) {
  const m = crearMaquina({ jugador: JUGADOR, ...opciones });
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.itemInfo(LINO, { nombre: 'Paño de lino', calidad: 1, precio: 13 });
  m.itemInfo(SEDA, { nombre: 'Paño de seda', calidad: 1 });
  m.bolsa(0, 1, { id: LINO, n: 5 });
  m.objeto(LINO, 5);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua(`SnetForeverCuenta.comercio.inventario.pj["Otro Dos-${REINO}"] =
    {nombre = "Otro Dos", reino = "${REINO}", clase = "PRIEST", bolsas = {[${LINO}] = 7}}`);
  return m;
}

test('Personaje.reino nunca da "": prueba GetRealmName, el normalizado, el del GUID y el último bueno; si no sabe, nil', () => {
  // 1. GetRealmName, tal cual (con espacios: es el nombre canónico, el de lo guardado y el de la app).
  let m = crearMaquina({ jugador: JUGADOR, sinComercio: true });
  assert.equal(reino(m), REINO);
  assert.deepEqual(m.lua('return SnetForeverCuenta.reino'), { ultimo: REINO, pj: { 'Nombre Uno': REINO } },
    'guarda el último reino bueno, en la cuenta y solo de personajes propios');
  // 2. GetRealmName vacío: el normalizado. Se reconoce el mismo reino escrito sin espacios y se da con los espacios.
  m.jugador({ nombreReino: '' });
  assert.equal(reino(m), REINO, 'el normalizado, pasado al nombre con espacios que ya se conoce');
  // 3. Vacíos los dos: el del GUID del jugador.
  m.jugador({ reinoNormalizado: '', reinoGuid: REINO });
  assert.equal(reino(m), REINO);
  // 4. Los tres vacíos (o con error, o secretos): el último bueno.
  m.jugador(VACIO);
  assert.equal(reino(m), REINO, 'en la misma sesión');
  let r = m.recargar();
  assert.equal(reino(r), REINO, 'tras recargar, el guardado en la cuenta');
  r.lua(`GetRealmName = function() error("roto") end
    GetNormalizedRealmName = function() return BANCO.secreto() end
    GetPlayerInfoByGUID = function() error("roto") end`);
  assert.equal(reino(r), REINO, 'con errores y secretos, también');
  sinErrores(r);
  r.cerrar();
  // 5. Sin nada guardado y sin saberlo: nil, nunca "".
  m = crearMaquina({ jugador: { ...JUGADOR, ...VACIO }, sinComercio: true });
  assert.equal(m.lua('return SnetForever.Personaje.reino() == nil'), true, 'nil');
  assert.equal(m.lua('return SnetForeverCuenta.reino == nil'), true, 'y no guarda nada');
  // 6. Solo el normalizado, sin ningún nombre conocido con el que casarlo: el normalizado (es el reino, escrito de otra forma).
  m.jugador({ reinoNormalizado: NORMALIZADO });
  assert.equal(reino(m), NORMALIZADO);
  // y en cuanto GetRealmName da el bueno, manda él.
  m.jugador({ nombreReino: false });
  assert.equal(reino(m), REINO);
  m.jugador(VACIO);
  assert.equal(reino(m), REINO, 'el último bueno es el de los espacios');
  // 7. Sin GetNormalizedRealmName ni GetPlayerInfoByGUID en el cliente.
  m = crearMaquina({ jugador: JUGADOR, sinComercio: true, sinApi: ['GetNormalizedRealmName', 'GetPlayerInfoByGUID'] });
  assert.equal(reino(m), REINO);
  m.jugador({ nombreReino: '' });
  assert.equal(reino(m), REINO);
  // mismoReino: el mismo reino escrito de dos formas (sin espacios y en minúsculas).
  assert.equal(m.lua(`return SnetForever.Personaje.mismoReino("${REINO}", "camwowus1realm5pve")`), true);
  assert.equal(m.lua(`return SnetForever.Personaje.mismoReino("${REINO}", "Otro")`), false);
  assert.equal(m.lua(`return SnetForever.Personaje.mismoReino("", "")`), false, 'el vacío no es ningún reino');
  sinErrores(m);
});

test('con GetRealmName vacío el inventario encuentra las fichas guardadas con el reino bueno y no guarda nada con el reino vacío', necesitaComercio, () => {
  const m = primeraSesion();
  comoAntes(m);
  m.jugador(VACIO);
  const r = m.recargar();
  // Ahora lleva también 4 de seda: al salir se cuenta en su ficha de siempre.
  r.bolsa(0, 2, { id: SEDA, n: 4 });
  r.objeto(SEDA, 4);
  r.disparar('PLAYER_LEAVING_WORLD');
  const fichas = pj(r);
  assert.deepEqual(Object.keys(fichas).sort(), [`Nombre Uno-${REINO}`, `Otro Dos-${REINO}`], JSON.stringify(Object.keys(fichas)));
  for (const [clave, f] of Object.entries(fichas)) {
    assert.equal(f.reino, REINO, `${clave}: con el reino bueno`);
    assert.ok(!clave.endsWith('-'), `${clave}: ninguna clave con el reino vacío`);
  }
  assert.deepEqual(fichas[`Nombre Uno-${REINO}`].bolsas, { [LINO]: 5, [SEDA]: 4 });
  const [total, lista] = r.lua(`return {SnetForever.InventarioCuenta.de(${LINO})}`);
  assert.equal(total, 12);
  assert.deepEqual(lista.map((p) => [p.nombre, p.total]), [['Nombre Uno', 5], ['Otro Dos', 7]]);
  assert.deepEqual(r.lua('SnetForever.InventarioCuenta.personajes()').map((p) => p.reino), [REINO, REINO]);
  assert.equal(r.lua('return SnetForeverCuenta.comercio.inventario.apartadas == nil'), true, 'nada apartado');
  sinErrores(r);
});

// La ranura de precios de esta hora con la casa de la Horda (114), conocida por la app con el reino con espacios.
const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const ranura = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
function conRanura(conocidas = `["${REINO}|Horde"] = 114`) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-reino-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  const i = (H % 8) + 1;
  const carpeta = join(dir, ranura(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${ranura(i)}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us",
  conocidas = {${conocidas}},
  casas = {[114] = {[${LINO}] = {192, 4478, 189, -3.1, 0.777, 3682.7, 0, 171, 1, 1}}},
  grupos = {}, nombres = {}, completo = true}
`);
  return dir;
}
const sinColores = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '').replace(/\|T[^|]*\|t/g, '^');
function abrirSubasta(m) {
  m.lua('BANCO.ponerNpc(BANCO.guidCriatura(8670), "Subastador")');
  m.lua('BANCO.unidades.npc.faccion = "Horde"');
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.05);
}

test('el tooltip con GetRealmName vacío y la subasta abierta enseña el inventario y la Subasta', necesitaComercio, () => {
  const m = primeraSesion({ addonsDir: conRanura() });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  comoAntes(m);
  m.jugador(VACIO);
  const r = m.recargar();
  abrirSubasta(r);
  r.tooltipObjeto(LINO);
  const l = r.detalleTooltip().map((x) => [sinColores(x.izq), sinColores(x.der)]);
  const izq = l.map(([x]) => x);
  assert.deepEqual(l.find(([x]) => x === 'Inventario'), ['Inventario', '12 en bolsas y banco'], JSON.stringify(l));
  assert.ok(izq.includes('  Nombre Uno') && izq.includes('  Otro Dos'), JSON.stringify(l));
  for (const x of ['SnetForever · Subasta', 'Valor de mercado']) assert.ok(izq.includes(x), `${x}: ${JSON.stringify(l)}`);
  assert.ok(!izq.some((x) => /sin datos de esta subasta/.test(x)), JSON.stringify(l));
  assert.equal(r.lua('SnetForever.Precios.casaActual()'), 114);
  assert.equal(r.lua('return SnetForeverCuenta.comercio.identidad.reino'), REINO, 'la identidad que lee la app, con el reino bueno');
  sinErrores(r);
});

test('lo guardado con el reino vacío pasa al reino bueno sin borrar nada; si choca, se aparta', necesitaComercio, () => {
  const m = primeraSesion();
  m.lua('SnetForever.Operaciones.crear("subasta", "Op")');
  m.lua(`local c = SnetForeverCuenta.comercio
    local pj = c.inventario.pj
    -- La ficha de Nombre Uno con el reino vacío choca con la buena: se aparta tal cual.
    pj["Nombre Uno-"] = {nombre = "Nombre Uno", reino = "", clase = "MAGE", bolsas = {[${LINO}] = 3}}
    -- La de Tres Cuatro, sin la buena: pasa.
    pj["Tres Cuatro-"] = {nombre = "Tres Cuatro", reino = "", clase = "ROGUE", bolsas = {[${SEDA}] = 2}}
    -- La de Cinco Seis, con el reino sin espacios: es el mismo reino, pasa.
    pj["Cinco Seis-${NORMALIZADO}"] = {nombre = "Cinco Seis", reino = "${NORMALIZADO}", clase = "DRUID", bolsas = {[${SEDA}] = 1}}
    -- Ronda 1: la clave ya es la buena y solo el reino de dentro está vacío: no es un choque.
    pj["Ocho Nueve-${REINO}"] = {nombre = "Ocho Nueve", reino = "", clase = "MAGE", bolsas = {[${LINO}] = 1}}
    c.inventario.bancoCuenta = {objetos = {[${SEDA}] = 9}, hora = 1, reino = ""}
    c.v2.propios = c.v2.propios or {}
    local propios = c.v2.propios
    propios.personajes = propios.personajes or {}
    propios.casas = propios.casas or {}
    propios.personajes["Otro Dos - "] = true
    propios.casas["|Horde"] = true
    local op = c.v2.operaciones.subasta.Op
    op.ignorarPersonajes = {["Otro Dos - "] = true}
    op.ignorarReinos = {["|Horde"] = true, ["${NORMALIZADO}|Alliance"] = true}
    c.conocidas["|Horde"] = 114
    c.conocidas["|Alliance"] = 110
    c.conocidas["${REINO}|Alliance"] = 111`);
  comoAntes(m);
  m.jugador(VACIO);
  const r = m.recargar();
  r.lua('SnetForever.Operaciones.propios(); SnetForever.Precios.casa()');
  const inv = r.lua('return SnetForeverCuenta.comercio.inventario');
  assert.deepEqual(Object.keys(inv.pj).sort(),
    [`Cinco Seis-${REINO}`, `Nombre Uno-${REINO}`, `Ocho Nueve-${REINO}`, `Otro Dos-${REINO}`, `Tres Cuatro-${REINO}`]);
  assert.equal(inv.pj[`Ocho Nueve-${REINO}`].reino, REINO, 'la que ya tenía la clave buena se queda, con su reino');
  assert.deepEqual(Object.keys(inv.apartadas), ['Nombre Uno-'], 'solo se aparta la que choca');
  assert.deepEqual(inv.pj[`Tres Cuatro-${REINO}`], { nombre: 'Tres Cuatro', reino: REINO, clase: 'ROGUE', bolsas: { [SEDA]: 2 } });
  assert.equal(inv.pj[`Cinco Seis-${REINO}`].reino, REINO);
  assert.deepEqual(inv.pj[`Nombre Uno-${REINO}`].bolsas, { [LINO]: 5 }, 'la buena se queda');
  assert.deepEqual(inv.apartadas['Nombre Uno-'].ficha, { nombre: 'Nombre Uno', reino: '', clase: 'MAGE', bolsas: { [LINO]: 3 } },
    'la que choca, apartada tal cual');
  assert.equal(inv.bancoCuenta.reino, REINO);
  assert.deepEqual(inv.bancoCuenta.objetos, { [SEDA]: 9 });
  const v2 = r.lua('return SnetForeverCuenta.comercio.v2');
  assert.equal(v2.propios.personajes['Otro Dos - '], undefined);
  assert.equal(v2.propios.personajes[`Otro Dos - ${REINO}`], true);
  assert.equal(v2.propios.personajes[`Nombre Uno - ${REINO}`], true);
  assert.equal(v2.propios.casas['|Horde'], undefined);
  assert.equal(v2.propios.casas[`${REINO}|Horde`], true);
  assert.deepEqual(v2.operaciones.subasta.Op.ignorarPersonajes, { [`Otro Dos - ${REINO}`]: true });
  assert.deepEqual(v2.operaciones.subasta.Op.ignorarReinos, { [`${REINO}|Horde`]: true, [`${REINO}|Alliance`]: true });
  const c = r.lua('return SnetForeverCuenta.comercio');
  assert.equal(c.conocidas['|Horde'], undefined);
  assert.equal(c.conocidas[`${REINO}|Horde`], 114, 'pasa');
  assert.equal(c.conocidas[`${REINO}|Alliance`], 111, 'la buena se queda');
  assert.equal(c.conocidasApartadas['|Alliance'].casa, 110, 'la que choca, apartada');
  // Y con lo pasado, el tooltip cuenta las fichas que han pasado.
  assert.equal(r.lua(`return (SnetForever.InventarioCuenta.de(${SEDA}))`), 2 + 1 + 9);
  sinErrores(r);
});

test('las operaciones, la importación de TSM y la casa de la subasta usan el mismo reino', necesitaComercio, () => {
  const tsm = `rawset(_G, "C_GameRules", {IsGameRuleActive = function() return false end})
    rawset(Enum, "GameRule", {HardcoreRuleset = "hc", RPRuleset = "rp", PvPRuleset = "pvp"})
    TradeSkillMasterDB = {_syncAccountKey = {["Horde - Normal"] = "Horde - Normal - 111"},
      _syncOwner = {["Siete Ocho - Horde - Normal"] = "Horde - Normal - 111"},
      ["s@Siete Ocho - Horde - Normal@internalData@classKey"] = "HUNTER",
      ["s@Siete Ocho - Horde - Normal@internalData@bagQuantity"] = {["i:${LINO}"] = 6}}`;
  const m = primeraSesion({ addonsDir: conRanura(), previo: tsm });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  comoAntes(m);
  m.jugador(VACIO);
  const r = m.recargar();
  const propios = r.lua('SnetForever.Operaciones.propios()');
  assert.deepEqual(propios.personajes, [`Nombre Uno - ${REINO}`]);
  assert.deepEqual(propios.casas, [`${REINO}|Horde`]);
  assert.deepEqual(r.lua('SnetForever.Precios.identidad()'), { region: 'US', reino: REINO, faccion: 'Horde' });
  const [hecho] = r.lua('return {SnetForever.ImportarTSM.inventario()}');
  assert.deepEqual(hecho, { personajes: 1, objetos: 6 });
  assert.deepEqual(pj(r)[`Siete Ocho-${REINO}`].bolsas, { [LINO]: 6 });
  abrirSubasta(r);
  assert.equal(r.lua('SnetForever.Precios.casaActual()'), 114);
  assert.equal(r.lua('SnetForever.Precios.casa()'), 114);
  assert.equal(r.lua('return SnetForeverCuenta.comercio.identidad.reino'), REINO);
  sinErrores(r);
});

// Ronda 1 (revisión): en Forever el reino del GUID propio es "" y GetNormalizedRealmName sí da el nombre sin espacios. Antes,
// el normalizado no se casaba con el reino con espacios y las fichas iban y venían entre las dos claves.
test('ronda 1: con GetRealmName y el GUID vacíos y el normalizado bien, sale el reino con espacios y no se mueve ninguna ficha', necesitaComercio, () => {
  for (const antes of [false, true]) {
    const m = primeraSesion();
    if (antes) comoAntes(m);
    const claves = Object.keys(pj(m)).sort();
    m.jugador({ nombreReino: '', reinoGuid: '' });
    const r = m.recargar();
    assert.equal(reino(r), REINO, antes ? 'con lo guardado por una versión de antes' : 'con el último bueno guardado');
    assert.deepEqual(Object.keys(pj(r)).sort(), claves, 'ninguna ficha cambia de clave');
    for (const f of Object.values(pj(r))) assert.equal(f.reino, REINO);
    assert.equal(r.lua('return SnetForeverCuenta.comercio.inventario.apartadas == nil'), true, 'nada apartado');
    assert.deepEqual(r.lua('SnetForever.Operaciones.propios()').personajes, [`Nombre Uno - ${REINO}`]);
    // Y al volver GetRealmName, todo sigue igual: nada va y viene.
    r.jugador({ nombreReino: false, reinoGuid: false });
    const r2 = r.recargar();
    assert.deepEqual(Object.keys(pj(r2)).sort(), claves);
    assert.equal(r2.lua('return SnetForeverCuenta.comercio.inventario.apartadas == nil'), true);
    sinErrores(r2);
    r2.cerrar();
  }
});

test('ronda 1: un normalizado que no casa con ningún reino conocido no es destino de la migración', necesitaComercio, () => {
  const m = primeraSesion();
  m.lua(`SnetForeverCuenta.comercio.inventario.pj["Tres Cuatro-"] = {nombre = "Tres Cuatro", reino = "", bolsas = {[${SEDA}] = 2}}`);
  comoAntes(m);
  // Otro personaje nuevo, en un reino que la cuenta no conoce, solo con el normalizado.
  const r = m.cambiarDePersonaje({ nombre: 'Cinco', apellido: 'Seis', reino: 'Otro Reino', nombreReino: '', reinoGuid: '' });
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  assert.equal(reino(r), 'OtroReino', 'el normalizado, tal cual');
  const claves = Object.keys(pj(r)).sort();
  assert.ok(claves.includes('Tres Cuatro-'), `lo del reino vacío no pasa a un reino sin espacios: ${claves}`);
  assert.ok(claves.includes(`Nombre Uno-${REINO}`) && claves.includes(`Otro Dos-${REINO}`), `${claves}`);
  assert.equal(r.lua('return SnetForeverCuenta.reino == nil'), true, 'no se guarda como el último bueno');
  assert.equal(r.lua('return SnetForever.Precios.identidad().reino == nil'), true, 'ni va a la app');
  // La ficha que se apunte con él pasa al bueno en cuanto el juego da el nombre con espacios.
  r.jugador({ nombreReino: false });
  const r2 = r.recargar();
  assert.equal(reino(r2), 'Otro Reino');
  const despues = Object.keys(pj(r2));
  assert.ok(!despues.some((c) => c.endsWith('-OtroReino')), `${despues}`);
  sinErrores(r2);
});

test('ronda 1: dos personajes en dos reinos; con todo vacío, el segundo usa su reino (el suyo guardado o sus fichas), no el último de la cuenta', necesitaComercio, () => {
  const OTRO = 'Otro Reino 2';
  for (const caso of ['suyo', 'fichas', 'identidad']) {
    let m = primeraSesion(); // Nombre Uno en REINO
    m = m.cambiarDePersonaje({ nombre: 'Siete', apellido: 'Ocho', reino: OTRO });
    m.disparar('PLAYER_ENTERING_WORLD', true, false);
    m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.identidad = SnetForever.Precios.identidad()');
    assert.equal(m.lua('return SnetForeverCuenta.reino.ultimo'), OTRO);
    if (caso === 'fichas') m.lua('SnetForeverCuenta.reino.pj = {}'); // sin el suyo guardado: sus fichas antes que el último
    if (caso === 'identidad') m.lua('SnetForeverCuenta.reino = nil'); // como antes: sus fichas antes que la identidad
    const r = m.cambiarDePersonaje({ nombre: 'Nombre', apellido: 'Uno', reino: REINO, ...VACIO });
    r.disparar('PLAYER_ENTERING_WORLD', true, false);
    assert.equal(reino(r), REINO, caso);
    assert.deepEqual(Object.keys(pj(r)).sort(), [`Nombre Uno-${REINO}`, `Otro Dos-${REINO}`, `Siete Ocho-${OTRO}`], caso);
    sinErrores(r);
    r.cerrar();
  }
});

test('ronda 1: con el reino ya sabido, Personaje.reino no recorre lo guardado en cada llamada (el tooltip la llama mucho)', () => {
  const m = crearMaquina({ jugador: JUGADOR, sinComercio: true });
  assert.equal(reino(m), REINO);
  for (const cambios of [{ nombreReino: '' }, { nombreReino: '', reinoGuid: '' }, VACIO]) {
    m.jugador(cambios);
    assert.equal(reino(m), REINO);
    const antes = m.llamadas('UnitName').length;
    m.lua('for i = 1, 50 do SnetForever.Personaje.reino() end');
    assert.equal(m.llamadas('UnitName').length - antes, 0, `ni Personaje.clave() por llamada: ${JSON.stringify(cambios)}`);
  }
  sinErrores(m);
  // Sin saberlo (nada guardado) o solo con el normalizado, tampoco se recorre todo en cada llamada.
  for (const cambios of [VACIO, { ...VACIO, reinoNormalizado: NORMALIZADO }]) {
    const n = crearMaquina({ jugador: { ...JUGADOR, ...cambios }, sinComercio: true });
    n.lua('SnetForever.Personaje.reino()');
    const antes = n.llamadas('UnitName').length;
    n.lua('for i = 1, 50 do SnetForever.Personaje.reino() end');
    assert.equal(n.llamadas('UnitName').length - antes, 0, `sin saberlo: ${JSON.stringify(cambios)}`);
    n.cerrar();
  }
});

// Ronda 2 (revisión): una ficha apuntada con un reino provisional no lo vuelve bueno en la sesión siguiente.
test('ronda 2: con solo el normalizado, el reino sigue provisional sesión tras sesión: ni se guarda, ni va a la app, ni es destino; con GetRealmName todo pasa al bueno', necesitaComercio, () => {
  const m = primeraSesion();
  m.lua(`SnetForeverCuenta.comercio.inventario.pj["Tres Cuatro-"] = {nombre = "Tres Cuatro", reino = "", bolsas = {[${SEDA}] = 2}}`);
  comoAntes(m);
  let r = m.cambiarDePersonaje({ nombre: 'Cinco', apellido: 'Seis', reino: 'Otro Reino', nombreReino: '', reinoGuid: '' });
  r.bolsa(0, 1, { id: LINO, n: 3 });
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  for (let sesion = 1; sesion <= 3; sesion++) {
    assert.deepEqual(r.lua('return {SnetForever.Personaje.reino()}'), ['OtroReino', true], `sesión ${sesion}: provisional`);
    assert.equal(r.lua('return SnetForeverCuenta.reino == nil'), true, `sesión ${sesion}: no se guarda como el último bueno`);
    r.lua('SnetForever.Precios.alAbrir()');
    assert.equal(r.lua('return SnetForever.Precios.identidad().reino == nil'), true, `sesión ${sesion}: ni va a la app`);
    assert.equal(r.lua('return SnetForeverCuenta.comercio.identidad.reino == nil'), true, `sesión ${sesion}`);
    const claves = Object.keys(pj(r));
    assert.ok(claves.includes('Tres Cuatro-'), `sesión ${sesion}: nada pasa a él: ${claves}`);
    assert.ok(claves.includes('Cinco Seis-OtroReino'), `sesión ${sesion}: ${claves}`);
    sinErrores(r);
    if (sesion < 3) r = r.recargar();
  }
  // GetRealmName da el bueno una vez: todo pasa a la forma con espacios.
  r.jugador({ nombreReino: false });
  r = r.recargar();
  assert.deepEqual(r.lua('return {SnetForever.Personaje.reino()}'), ['Otro Reino']);
  const claves = Object.keys(pj(r)).sort();
  assert.ok(claves.includes('Cinco Seis-Otro Reino') && claves.includes('Tres Cuatro-Otro Reino'), `${claves}`);
  assert.ok(!claves.some((c) => c.endsWith('-OtroReino') || c.endsWith('-')), `${claves}`);
  assert.deepEqual(pj(r)['Cinco Seis-Otro Reino'].bolsas, { [LINO]: 3 });
  assert.equal(r.lua('return SnetForeverCuenta.reino.pj["Cinco Seis"]'), 'Otro Reino');
  sinErrores(r);
});

test('ronda 2: las claves de la foto de la app (SNF_PRECIOS.conocidas) son formas conocidas del reino', necesitaComercio, () => {
  const m = crearMaquina({ jugador: { ...JUGADOR, nombreReino: '', reinoGuid: '' }, addonsDir: conRanura() });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  abrirSubasta(m); // carga la foto, que conoce «CAMWOW US1 Realm 5 PvE|Horde»
  assert.deepEqual(m.lua('return {SnetForever.Personaje.reino()}'), [REINO]);
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 114);
  sinErrores(m);
});

test('ronda 2: con un reino provisional la casa de la subasta se busca en las conocidas del mismo reino, pero no va a la identidad', necesitaComercio, () => {
  const m = crearMaquina({ jugador: { ...JUGADOR, reino: 'Mirador', nombreReino: '', reinoGuid: '' } });
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.conocidas["mirador|Horde"] = 113');
  assert.deepEqual(m.lua('return {SnetForever.Personaje.reino()}'), ['Mirador', true]);
  assert.equal(m.lua('SnetForever.Precios.casa()'), 113);
  assert.equal(m.lua('return SnetForever.Precios.identidad().reino == nil'), true);
  abrirSubasta(m);
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 113);
  assert.equal(m.lua('return SnetForeverCuenta.comercio.identidad.reino == nil'), true, 'la identidad, sin el provisional');
  sinErrores(m);
});

test('ronda 2: si la clave del personaje aún no está la primera vez, el último bueno se guarda en cuanto está', () => {
  const m = crearMaquina({ jugador: { ...JUGADOR, nombreReino: '', reinoNormalizado: '', reinoGuid: REINO }, sinComercio: true });
  m.lua('BANCO.jugador.nombre = nil');
  assert.equal(reino(m), REINO);
  assert.equal(m.lua('return SnetForeverCuenta.reino.pj == nil or SnetForeverCuenta.reino.pj["Nombre Uno"] == nil'), true);
  m.lua('BANCO.jugador.nombre = "Nombre"');
  assert.equal(reino(m), REINO);
  assert.equal(m.lua('return SnetForeverCuenta.reino.pj["Nombre Uno"]'), REINO);
  sinErrores(m);
});

// Ronda 3 (revisión): con el GUID, una forma sin espacios de las fichas no se guarda como la buena: se guarda la del GUID.
test('ronda 3: normalizado solo en la sesión 1, GUID con espacios en la 2: se guarda «Otro Reino», nunca «OtroReino», y las fichas pasan a él', necesitaComercio, () => {
  const m = primeraSesion();
  comoAntes(m);
  let r = m.cambiarDePersonaje({ nombre: 'Cinco', apellido: 'Seis', reino: 'Otro Reino', nombreReino: '', reinoGuid: '' });
  r.bolsa(0, 1, { id: LINO, n: 3 });
  r.disparar('PLAYER_ENTERING_WORLD', true, false);
  assert.deepEqual(r.lua('return {SnetForever.Personaje.reino()}'), ['OtroReino', true]);
  assert.ok(Object.keys(pj(r)).includes('Cinco Seis-OtroReino'));
  r.jugador({ reinoGuid: 'Otro Reino' });
  r = r.recargar();
  assert.deepEqual(r.lua('return {SnetForever.Personaje.reino()}'), ['Otro Reino']);
  const g = r.lua('return SnetForeverCuenta.reino');
  assert.equal(g.ultimo, 'Otro Reino');
  assert.equal(g.pj['Cinco Seis'], 'Otro Reino');
  const claves = Object.keys(pj(r));
  assert.ok(claves.includes('Cinco Seis-Otro Reino'), `${claves}`);
  assert.ok(!claves.some((c) => c.endsWith('-OtroReino')), `${claves}`);
  assert.deepEqual(pj(r)['Cinco Seis-Otro Reino'].bolsas, { [LINO]: 3 });
  sinErrores(r);
});

test('ronda 3: con dos formas del mismo reino con casas distintas, la casa provisional es la de la foto y, si aparece, la de la forma con espacios', necesitaComercio, () => {
  const m = crearMaquina({ jugador: { ...JUGADOR, reino: 'Mirador', nombreReino: '', reinoGuid: '' },
    addonsDir: conRanura('["miraDor|Horde"] = 124') });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.conocidas["mirador|Horde"] = 113');
  m.lua('SnetForever.Precios.alAbrir()'); // carga la foto (y copia sus conocidas a las guardadas)
  assert.deepEqual(m.lua('return {SnetForever.Personaje.reino()}'), ['Mirador', true]);
  assert.equal(m.lua('SnetForever.Precios.casa()'), 124, 'la de la foto antes que la guardada');
  // Una forma con espacios (o guiones) que aparece a media sesión manda sobre las otras (el reino recordado sigue igual
  // mientras el cliente dé lo mismo).
  m.lua('SnetForeverCuenta.comercio.conocidas["m-irador|Horde"] = 120');
  assert.equal(m.lua('SnetForever.Precios.casa()'), 120, 'la de la forma con espacios o guiones');
  sinErrores(m);
});
