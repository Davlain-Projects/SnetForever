// 13-nov (petición del autor): la IA sabe los talentos del personaje («¿están bien mis puntos de talento?») y los precios
// de la casa de subastas que guarda Auctionator («que extraiga esa información cuando abra la casa de subasta»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

// Talentos de Classic: dos árboles; en el primero, 3/5 en un talento y 2/2 en otro.
const TALENTOS_CLASSIC = `
  function GetNumTalentTabs() return 3 end
  function GetTalentTabInfo(t) return ({"Equilibrio", "Combate feral", "Restauración"})[t], "icono", ({5, 0, 0})[t], "fondo" end
  function GetNumTalents(t) return t == 1 and 3 or 2 end
  function GetTalentInfo(t, i)
    if t == 1 and i == 1 then return "Ira mejorada", "i", 1, 2, 3, 5 end
    if t == 1 and i == 3 then return "Agarre de la naturaleza", "i", 1, 3, 2, 2 end
    return "Otro", "i", 2, 1, 0, 5
  end
  function UnitCharacterPoints() return 16 end
`;

test('13-nov: Contexto.construir trae los talentos: árbol, puntos y solo los talentos con puntos; y los libres', () => {
  const m = nuevaMaquina();
  m.lua(TALENTOS_CLASSIC);
  const t = m.lua('SnetForever.Contexto.construir().talentos');
  assert.equal(t.libres, 16);
  assert.equal(t.arboles.length, 3);
  assert.deepEqual(t.arboles[0], { a: 'Equilibrio', p: 5, t: [{ n: 'Ira mejorada', f: 1, c: 2, r: 3, m: 5 }, { n: 'Agarre de la naturaleza', f: 1, c: 3, r: 2, m: 2 }] });
  assert.deepEqual(t.arboles[1], { a: 'Combate feral', p: 0, t: [] });
  sinErrores(m);
});

test('13-nov: con la forma nueva de GetTalentTabInfo (id, nombre, descripción, icono, puntos) también', () => {
  const m = nuevaMaquina();
  m.lua(TALENTOS_CLASSIC + `
    function GetTalentTabInfo(t) return 280 + t, ({"Equilibrio", "Combate feral", "Restauración"})[t], "desc", "icono", ({5, 0, 0})[t] end
    UnitCharacterPoints = nil
    function GetUnspentTalentPoints() return 2 end`);
  const t = m.lua('SnetForever.Contexto.construir().talentos');
  assert.equal(t.arboles[0].a, 'Equilibrio');
  assert.equal(t.arboles[0].p, 5);
  assert.equal(t.libres, 2);
  sinErrores(m);
});

// 17-nov (TATI decía «no puedo ver tus talentos»): el cliente Forever (motor moderno, tipo de juego «camelot») no tiene
// GetNumTalentTabs ni GetTalentTabInfo; sus talentos están en el sistema de rasgos (C_Traits, C_ClassTalents,
// C_SpecializationInfo). Sin ninguna de las dos API, no hay talentos y ctx.talentosFalta lo dice (antes salía nil sin más).
test('17-nov: sin ninguna API de talentos (o con una que falla), no hay talentos, talentosFalta = true y no hay error', () => {
  const m = nuevaMaquina({ forever: true, sinApi: ['C_Traits', 'C_ClassTalents', 'C_SpecializationInfo'] });
  const ctx = m.lua('SnetForever.Contexto.construir()');
  assert.equal(ctx.talentos, undefined);
  assert.equal(ctx.talentosFalta, true);
  m.lua('function GetNumTalentTabs() error("no") end');
  const roto = m.lua('SnetForever.Contexto.construir()');
  assert.equal(roto.talentos, undefined);
  assert.equal(roto.talentosFalta, true);
  sinErrores(m);
});

// Druida de nivel 32 con 23 puntos gastados (nombres inventados, al estilo de los del cliente en español). Solo cuentan
// los talentos con algún punto; los de rango 0 están en el árbol, como en el juego.
const DRUIDA_32 = {
  libres: 0,
  arboles: [
    { nombre: 'Equilibrio', talentos: [
      { nombre: 'Ira mejorada', fila: 1, columna: 1, rango: 5, maximo: 5 },
      { nombre: 'Agarre de la naturaleza', fila: 1, columna: 2, rango: 0, maximo: 4 },
      { nombre: 'Enredar raíces mejorado', fila: 2, columna: 1, rango: 0, maximo: 3 },
      { nombre: 'Alcance de la naturaleza', fila: 3, columna: 3, rango: 0, maximo: 2 },
    ] },
    { nombre: 'Combate feral', talentos: [
      { nombre: 'Ferocidad', fila: 1, columna: 2, rango: 5, maximo: 5 },
      { nombre: 'Agresión feral', fila: 1, columna: 3, rango: 0, maximo: 5 },
      { nombre: 'Instinto feral', fila: 2, columna: 1, rango: 3, maximo: 5 },
      { nombre: 'Pelaje grueso', fila: 2, columna: 3, rango: 5, maximo: 5 },
      { nombre: 'Carga feral', fila: 3, columna: 2, rango: 1, maximo: 1 },
      { nombre: 'Ataques afilados', fila: 3, columna: 3, rango: 3, maximo: 3 },
      // Sin nadie en la fila 4: la fila 5 sigue siendo la 5 (las filas salen de la posición, no del orden).
      { nombre: 'Instinto del depredador', fila: 5, columna: 3, rango: 1, maximo: 5 },
    ] },
    { nombre: 'Restauración', talentos: [
      { nombre: 'Toque de sanación mejorado', fila: 1, columna: 2, rango: 0, maximo: 5 },
      { nombre: 'Concentración de la naturaleza', fila: 2, columna: 1, rango: 0, maximo: 5 },
    ] },
  ],
};

const ESPERADO_DRUIDA = {
  libres: 0,
  arboles: [
    { a: 'Equilibrio', p: 5, t: [{ n: 'Ira mejorada', f: 1, c: 1, r: 5, m: 5 }] },
    { a: 'Combate feral', p: 18, t: [
      { n: 'Ferocidad', f: 1, c: 2, r: 5, m: 5 }, { n: 'Instinto feral', f: 2, c: 1, r: 3, m: 5 },
      { n: 'Pelaje grueso', f: 2, c: 3, r: 5, m: 5 }, { n: 'Carga feral', f: 3, c: 2, r: 1, m: 1 },
      { n: 'Ataques afilados', f: 3, c: 3, r: 3, m: 3 }, { n: 'Instinto del depredador', f: 5, c: 3, r: 1, m: 5 }] },
    { a: 'Restauración', p: 0, t: [] },
  ],
};

// Los talentos en el orden del árbol: fila y después columna.
const ordenar = (t) => ({ ...t, arboles: t.arboles.map((a) => ({ ...a, t: [...a.t].sort((x, y) => x.f - y.f || x.c - y.c) })) });

test('17-nov: con talentos que se leen, no hay talentosFalta', () => {
  const m = nuevaMaquina({ forever: true });
  m.lua(`BANCO.ponerTalentos(${aLua(DRUIDA_32)})`);
  assert.equal(m.lua('SnetForever.Contexto.construir().talentosFalta'), undefined);
  sinErrores(m);
});

test('17-nov: el banco en modo Forever no tiene la API de talentos de Classic y sí la de rasgos', () => {
  const m = nuevaMaquina({ forever: true });
  for (const api of ['GetNumTalentTabs', 'GetTalentTabInfo', 'GetNumTalents', 'GetTalentInfo', 'UnitCharacterPoints']) {
    assert.equal(m.lua(`rawget(_G, ${aLua(api)})`), undefined, api);
  }
  for (const api of ['C_ClassTalents.GetActiveConfigID', 'C_SpecializationInfo.GetActiveSpecGroup',
    'C_SpecializationInfo.GetCombatConfigIDForSpecGroup', 'C_Traits.GetConfigInfo', 'C_Traits.GetGroupDisplayInfoByTreeID',
    'C_Traits.GetGroupCurrencyInfo', 'C_Traits.GetTreeCurrencyInfo', 'C_Traits.GetTreeNodes', 'C_Traits.GetNodeInfo',
    'C_Traits.GetEntryInfo', 'C_Traits.GetDefinitionInfo']) {
    assert.equal(m.lua(`type(${api})`), 'function', api);
  }
  sinErrores(m);
});

test('17-nov: Forever con C_Traits: 3 árboles con sus puntos, los talentos con punto (nombre, fila, columna, rango) y los libres', () => {
  const m = nuevaMaquina({ forever: true });
  m.lua(`BANCO.ponerTalentos(${aLua({ ...DRUIDA_32, libres: 9 })})`);
  const t = m.lua('SnetForever.Contexto.construir().talentos');
  assert.deepEqual(ordenar(t), { ...ESPERADO_DRUIDA, libres: 9 });
  sinErrores(m);
});

test('17-nov: Forever sin C_ClassTalents.GetActiveConfigID: la configuración sale de C_SpecializationInfo', () => {
  const m = nuevaMaquina({ forever: true, sinApi: ['C_ClassTalents.GetActiveConfigID'] });
  m.lua(`BANCO.ponerTalentos(${aLua(DRUIDA_32)})`);
  assert.deepEqual(ordenar(m.lua('SnetForever.Contexto.construir().talentos')), ESPERADO_DRUIDA);
  sinErrores(m);
});

test('17-nov: el nombre del talento sale de overrideName si lo trae y, si no, del hechizo', () => {
  const m = nuevaMaquina({ forever: true });
  const datos = structuredClone(DRUIDA_32);
  datos.arboles[0].talentos[0].sobrenombre = 'Cólera mejorada';
  m.lua(`BANCO.ponerTalentos(${aLua(datos)})`);
  const t = m.lua('SnetForever.Contexto.construir().talentos');
  assert.equal(t.arboles[0].t[0].n, 'Cólera mejorada');
  assert.equal(ordenar(t).arboles[1].t[0].n, 'Ferocidad');
  sinErrores(m);
});

test('17-nov: sin GetGroupCurrencyInfo, los puntos del árbol son la suma de los rangos; sin GetTreeCurrencyInfo, no hay libres', () => {
  const m = nuevaMaquina({ forever: true, sinApi: ['C_Traits.GetGroupCurrencyInfo', 'C_Traits.GetTreeCurrencyInfo'] });
  m.lua(`BANCO.ponerTalentos(${aLua({ ...DRUIDA_32, libres: 4 })})`);
  const t = m.lua('SnetForever.Contexto.construir().talentos');
  assert.deepEqual(t.arboles.map((a) => a.p), [5, 18, 0]);
  assert.equal(t.libres, undefined);
  sinErrores(m);
});

test('17-nov: si C_Traits falla, se prueba la API de Classic; si las dos fallan, talentosFalta; nunca hay error', () => {
  const m = nuevaMaquina({ forever: true });
  m.lua(`BANCO.ponerTalentos(${aLua(DRUIDA_32)})`);
  m.lua('rawset(C_Traits, "GetConfigInfo", function() error("roto") end)');
  const ctx = m.lua('SnetForever.Contexto.construir()');
  assert.equal(ctx.talentos, undefined);
  assert.equal(ctx.talentosFalta, true);
  m.lua(TALENTOS_CLASSIC);
  const classic = m.lua('SnetForever.Contexto.construir()');
  assert.equal(classic.talentos.arboles[0].a, 'Equilibrio');
  assert.equal(classic.talentosFalta, undefined);
  // Un nodo que falla o un rasgo sin definición no tumba el resto.
  const n = nuevaMaquina({ forever: true });
  n.lua(`BANCO.ponerTalentos(${aLua(DRUIDA_32)})`);
  n.lua('local viejo = C_Traits.GetNodeInfo; rawset(C_Traits, "GetNodeInfo", function(c, id) if id == 101 then error("x") end return viejo(c, id) end)');
  n.lua('rawset(C_Traits, "GetDefinitionInfo", function() error("x") end)');
  const t = n.lua('SnetForever.Contexto.construir().talentos');
  assert.equal(t.arboles[0].t.length, 0, 'el nodo roto no sale');
  assert.equal(t.arboles[1].t.length, 6);
  assert.ok(t.arboles[1].t.every((x) => x.n === undefined && x.r > 0), 'sin definición, sin nombre');
  sinErrores(m);
  sinErrores(n);
});

test('17-nov: el banco por defecto tiene las dos API; sin C_Traits, la de Classic da lo mismo', () => {
  const m = nuevaMaquina({ sinApi: ['C_Traits'] });
  m.lua(`BANCO.ponerTalentos(${aLua({ ...DRUIDA_32, libres: 3 })})`);
  const t = m.lua('SnetForever.Contexto.construir().talentos');
  assert.deepEqual(t, { ...ESPERADO_DRUIDA, libres: 3 });
  sinErrores(m);
});

test('17-nov: medida: los talentos de un druida de nivel 32 ocupan poco y aguantan los recortes hasta el final', () => {
  const m = nuevaMaquina({ forever: true });
  m.lua(`BANCO.ponerTalentos(${aLua(DRUIDA_32)})`);
  const r = m.lua(`(function()
    local C, J = SnetForever.Contexto, SnetForever.JSON
    local ctx = C.construir()
    local bytes = #J.codificar(ctx.talentos)
    -- Un mensaje que no cabe ni sin inventario: un registro con títulos largos y un inventario enorme.
    ctx.registro = {}
    for k = 1, 40 do ctx.registro[k] = {q = 9000 + k, c = 0, o = {{0, 1}}, t = string.rep("t", 80)} end
    local bolsas = {}
    for k = 1, 400 do bolsas[k] = {id = k, n = string.rep("o", 40), l = 0, b = {{0, 1}}} end
    ctx.inv = {bolsas = bolsas, equipo = {}}
    local msg = {v = 1, id = "a-1", idioma = "es", texto = "x", ctx = ctx}
    local _, cabe = C.recortar(msg, 2500)
    return {bytes = bytes, cabe = cabe, recorte = ctx.recorte, quedan = ctx.talentos ~= nil}
  end)()`);
  console.log(`# talentos de un druida de nivel 32 (23 puntos): ${r.bytes} bytes; recortes: ${r.recorte.join(', ')}`);
  assert.ok(r.bytes < 1000, `mide ${r.bytes}`);
  assert.equal(r.cabe, true);
  assert.equal(r.quedan, true, 'los talentos siguen');
  assert.ok(r.recorte.includes('inv') && r.recorte.includes('registro.t'), JSON.stringify(r.recorte));
  assert.ok(!r.recorte.includes('talentos'));
  // Y son lo último que se quita.
  const ultimo = m.lua(`(function()
    local ctx = SnetForever.Contexto.construir()
    local msg = {v = 1, ctx = ctx}
    SnetForever.Contexto.recortar(msg, 50)
    return ctx.recorte
  end)()`);
  assert.equal(ultimo[ultimo.length - 1], 'talentos');
  sinErrores(m);
});

// Auctionator de mentira con su API v1: el lino (2589) a 120 de cobre visto hace 2 días.
const AUCTIONATOR = `
  Auctionator = {API = {v1 = {
    GetAuctionPriceByItemID = function(quien, id) assert(quien == "SnetForever") if id == 2589 then return 120 end return nil end,
    GetAuctionAgeByItemID = function(quien, id) if id == 2589 then return 2 end return nil end,
  }}}`;

test('13-nov: con Auctionator, el contexto dice que hay precios y cuándo se abrió la subasta; anotar pone pa y pd', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Contexto.construir().subasta'), undefined, 'sin Auctionator no va');
  m.lua(AUCTIONATOR);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(30);
  const s = m.lua('SnetForever.Contexto.construir().subasta');
  assert.equal(s.fuente, 'SnetForever');
  assert.ok(s.vista >= 0 && s.vista <= 60, JSON.stringify(s));
  m.bolsa(0, 1, { id: 2589, n: 12 });
  m.bolsa(0, 2, { id: 118, n: 1 });
  const objetos = m.lua(`(function() local b = SnetForever.Inventario.bolsas().objetos
    local n = SnetForever.Subasta.anotar(b) return {n = n, b = b} end)()`);
  assert.equal(objetos.n, 1);
  const lino = objetos.b.find((o) => o.id === 2589);
  assert.equal(lino.pa, 120);
  assert.equal(lino.pd, 2);
  assert.equal(objetos.b.find((o) => o.id === 118).pa, undefined);
  sinErrores(m);
});

test('13-nov: si Auctionator falla, no hay precio y no hay error', () => {
  const m = nuevaMaquina();
  m.lua('Auctionator = {API = {v1 = {GetAuctionPriceByItemID = function() error("roto") end}}}');
  assert.equal(m.lua('SnetForever.Subasta.precio(2589)'), undefined);
  sinErrores(m);
});

// Task 12 (14-nov): los precios salen del escaneo propio (en vivo) y de los de la app; Auctionator solo es el último recurso.
const ESCANEO_VIVO = `
  SnetForever.Escaneo = {datos = function() return {[2589] = {precio = 150, cantidad = 4, hora = 1}} end}`;

// F1 (ronda 1): el escaneo es una foto del servidor de cuándo no se sabe: sin pd (nunca «0 = de ahora»), con pf = "escaneo"
// y pe = los segundos desde que se LEYÓ.
test('sin Auctionator, con escaneo en vivo, el objeto lleva pa del escaneo, sin pd, con pf «escaneo» y pe desde que se leyó', () => {
  const m = nuevaMaquina();
  m.lua(ESCANEO_VIVO);
  assert.equal(m.lua('SnetForever.Subasta.disponible()'), true);
  m.bolsa(0, 1, { id: 2589, n: 12 });
  const lino = m.lua(`(function() local b = SnetForever.Inventario.bolsas().objetos
    SnetForever.Subasta.anotar(b) return b end)()`).find((o) => o.id === 2589);
  assert.equal(lino.pa, 150);
  assert.equal(lino.pd, undefined, 'no se sabe de cuándo es la foto del escaneo');
  assert.equal(lino.pf, 'escaneo');
  assert.equal(lino.pe, m.lua('GetServerTime()') - 1);
  sinErrores(m);
});

test('con Auctionator y escaneo, gana el escaneo', () => {
  const m = nuevaMaquina();
  m.lua(AUCTIONATOR);
  m.lua(ESCANEO_VIVO);
  m.bolsa(0, 1, { id: 2589, n: 12 });
  const lino = m.lua(`(function() local b = SnetForever.Inventario.bolsas().objetos
    SnetForever.Subasta.anotar(b) return b end)()`).find((o) => o.id === 2589);
  assert.equal(lino.pa, 150);
  assert.equal(lino.pf, 'escaneo');
  sinErrores(m);
});

test('sin escaneo, el precio es el de la app con los días desde la foto; y Auctionator va el último', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Precios = {de = function(id) if id == 2589 then return {precio = 200} end end, edad = function() return 2 * 86400 + 50 end}`);
  assert.equal(m.lua('SnetForever.Subasta.disponible()'), true);
  assert.deepEqual(m.lua('{SnetForever.Subasta.precio(2589)}'), [200, 2, 'app', 2 * 86400 + 50]);
  m.lua(AUCTIONATOR);
  assert.deepEqual(m.lua('{SnetForever.Subasta.precio(2589)}'), [200, 2, 'app', 2 * 86400 + 50], 'la app gana a Auctionator');
  m.lua('SnetForever.Precios = nil');
  assert.deepEqual(m.lua('{SnetForever.Subasta.precio(2589)}'), [120, 2, 'auctionator', 2 * 86400], 'solo Auctionator');
  sinErrores(m);
});

test('ctx.subasta.fuente es «SnetForever», nunca «Auctionator»', () => {
  const m = nuevaMaquina();
  m.lua(ESCANEO_VIVO);
  assert.equal(m.lua('SnetForever.Contexto.construir().subasta.fuente'), 'SnetForever');
  m.lua(AUCTIONATOR);
  assert.equal(m.lua('SnetForever.Contexto.construir().subasta.fuente'), 'SnetForever');
  sinErrores(m);
});

test('con la foto de la app cargada y la subasta cerrada, el objeto lleva pa (se usa la casa propia)', () => {
  const m = nuevaMaquina();
  // Precios.de solo da precio si le pasan la casa (la subasta está cerrada: no hay casa abierta).
  m.lua(`SnetForever.Precios = {
    de = function(id, casa) if casa == 7 and id == 2589 then return {precio = 200} end end,
    casa = function() return 7 end,
    edad = function() return 3600 end}`);
  assert.equal(m.lua('SnetForever.Subasta.disponible()'), true);
  assert.deepEqual(m.lua('{SnetForever.Subasta.precio(2589)}'), [200, 0, 'app', 3600]);
  assert.equal(m.lua('SnetForever.Contexto.construir().subasta.fuente'), 'SnetForever');
  sinErrores(m);
});

test('con foto de la app pero sin saber la casa y sin otra fuente, no hay disponible ni ctx.subasta', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Precios = {de = function() return nil end, casa = function() return nil end, edad = function() return 60 end}`);
  assert.equal(m.lua('SnetForever.Subasta.disponible()'), false);
  assert.equal(m.lua('SnetForever.Contexto.construir().subasta'), undefined);
  sinErrores(m);
});

// F1 (ronda 1): el precio que ve la IA sale de la misma foto que el tooltip (SNF.Subasta.foto): la lista de Navegar, si no
// la foto de la app y, solo si la app no trae el objeto, el escaneo. Datos inventados.
test('F1: la IA ve el precio de la lista de Navegar, si no el de la app, y el del escaneo solo sin la app; con su fuente y su edad', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Precios = {de = function(id) if id == 2589 then return {precio = 200, cantidad = 5} end end, edad = function() return 600 end}
    SnetForever.Escaneo = {datos = function() return {[2589] = {precio = 150, cantidad = 4, hora = GetServerTime() - 60}, [118] = {precio = 90, cantidad = 1, hora = GetServerTime() - 300}} end}
    SnetForever.Busqueda = {vivo = function(id) if id == 2589 and LISTA then return {precio = 180, cantidad = 7, hora = GetServerTime() - 30, origen = "lista"} end end}
    LISTA = true`);
  assert.deepEqual(m.lua('{SnetForever.Subasta.precio(2589)}'), [180, 0, 'lista', 30], 'la lista de Navegar, de ahora');
  m.lua('LISTA = false');
  assert.deepEqual(m.lua('{SnetForever.Subasta.precio(2589)}'), [200, 0, 'app', 600], 'la réplica más barata no gana a la app');
  const otro = m.lua('local p, d, f, s = SnetForever.Subasta.precio(118) return {p = p, d = d, f = f, s = s}');
  assert.deepEqual([otro.p, otro.d, otro.f, otro.s], [90, undefined, 'escaneo', 300], 'sin la app, el escaneo, sin días');
  m.bolsa(0, 1, { id: 2589, n: 12 });
  m.bolsa(0, 2, { id: 118, n: 1 });
  const b = m.lua(`(function() local b = SnetForever.Inventario.bolsas().objetos
    SnetForever.Subasta.anotar(b) return b end)()`);
  const lino = b.find((o) => o.id === 2589);
  const suelto = b.find((o) => o.id === 118);
  assert.deepEqual([lino.pa, lino.pd, lino.pf, lino.pe], [200, 0, 'app', 600]);
  assert.deepEqual([suelto.pa, suelto.pd, suelto.pf, suelto.pe], [90, undefined, 'escaneo', 300]);
  m.lua('SnetForever.Busqueda = nil SnetForever.Escaneo = nil SnetForever.Precios = nil');
  sinErrores(m);
});

// F1 (ronda 2): una foto sin ninguna que se pueda comprar es lo de ahora de ese objeto: sin precio y sin Auctionator.
test('F1 ronda 2: una lista entera sin ninguna comprable, o una fila de la app sin precio, no da precio ni va a Auctionator', () => {
  const m = nuevaMaquina();
  m.lua(AUCTIONATOR);
  m.lua(`SnetForever.Precios = {de = function(id) if id == 2589 then return {cantidad = 0} end end, edad = function() return 600 end}
    SnetForever.Busqueda = {vivo = function(id) if id == 2589 and LISTA then return {cantidad = 4, hora = GetServerTime() - 30, origen = "lista"} end end}
    LISTA = true`);
  const precio = () => m.lua('local p, d, f, s = SnetForever.Subasta.precio(2589) return {p = p, d = d, f = f, s = s}');
  assert.deepEqual(precio(), { f: 'lista', s: 30 }, 'la lista sin comprable: sin precio (Auctionator diría 120)');
  m.lua('LISTA = false');
  assert.deepEqual(precio(), { f: 'app', s: 600 }, 'la fila de la app sin precio: tampoco');
  m.bolsa(0, 1, { id: 2589, n: 12 });
  const lino = m.lua(`(function() local b = SnetForever.Inventario.bolsas().objetos
    SnetForever.Subasta.anotar(b) return b end)()`).find((o) => o.id === 2589);
  assert.equal(lino.pa, undefined, 'sin precio, nada que anotar');
  // Sin ninguna foto del objeto, Auctionator sigue siendo el último recurso.
  m.lua('SnetForever.Precios = nil SnetForever.Busqueda = nil');
  assert.equal(precio().p, 120);
  sinErrores(m);
});

// F1 (ronda 2): con la subasta abierta, la casa de la fila de la app es la de la subasta (como el tooltip y la lista de
// ofertas); con ella cerrada, la casa propia.
test('F1 ronda 2: con la subasta abierta el precio de la app es el de su casa; cerrada, el de la casa propia', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Precios = {
      de = function(id, casa) if id ~= 2589 then return nil end if casa == nil then return {precio = 300} elseif casa == 7 then return {precio = 200} end end,
      casa = function() return 7 end, edad = function() return 60 end}
    SnetForever.Comercio = {abierta = function() return ABIERTA == true end}`);
  assert.equal(m.lua('(SnetForever.Subasta.precio(2589))'), 200, 'cerrada: la casa propia');
  m.lua('ABIERTA = true');
  assert.equal(m.lua('(SnetForever.Subasta.precio(2589))'), 300, 'abierta: la casa de la subasta, la misma del tooltip');
  m.lua('SnetForever.Precios = nil SnetForever.Comercio = nil');
  sinErrores(m);
});
