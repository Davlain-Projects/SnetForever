// F6 (en el juego, 20-nov): el tooltip de un objeto (Paño de lana) acababa en «Precio de venta al vendedor 33c»: sin el
// inventario, sin «Sin contar» y sin el apartado «SnetForever · Subasta». Y en la subasta NEUTRAL (otra casa, no la de la
// Horda) no decía que la app no tiene datos de esa casa. Aquí:
//   · la causa (con el núcleo de otra rama, sin API.bolsasCuenta ni API.bolsasPropias, y el comercio de la F4: lo que hay
//     instalado es una mezcla así), el inventario fallaba en comercio/inventario.lua y el pcall de Tooltip.anadir cortaba
//     todo lo que venía detrás;
//   · cada parte del tooltip compone por su cuenta: un fallo solo esconde la suya y se apunta una vez;
//   · la subasta neutral: el inventario sale igual, nada de la app de la Horda se mezcla y una línea gris lo dice.
// Con el Enum.BagIndex de Forever (bolsas: 'forever'). Todo lo de aquí es inventado.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const LANA = 2592;
const SUELTO = 5000; // un objeto suelto (no apilable), en la app y en el escaneo
const GANGA = 7000; // F6, ronda 1: una buena compra con la regla de siempre (la mitad de su valor), para la IA

// La ranura de esta hora con la casa de la Horda (114): la lana, una mercancía, y un objeto suelto.
function ponerRanura(dir) {
  const i = (H % 8) + 1;
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {[${LANA}] = {192, 4478, 189, -3.1, 0.777, 3682.7, 0, 171, 1, 1}, [${SUELTO}] = {90, 9, 100, 0, 0.42, 3, 0, 9, 1},
    [${GANGA}] = {51000, 10, 100000, 0, 0.5, 5, 0, 10, 1, 1}}},
  grupos = {}, nombres = {}, completo = true}
`);
}

// Nombre Uno (Horda) con 47 de lana en la primera pestaña del banco y 0 en las bolsas; otro personaje propio con 77 en
// las bolsas; el banco de cuenta sin comprar (sus pestañas con 0 huecos) y una pestaña del banco con 0 huecos.
function maquina({ antes } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-tooltip-f6-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir);
  const m = crearMaquina({ addonsDir: dir, bolsas: 'forever',
    jugador: { nombre: 'Nombre', apellido: 'Uno', reino: 'Normal', faccion: 'Horde', clase: 'MAGE', idioma: 'esES' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  if (antes) antes(m);
  m.itemInfo(LANA, { nombre: 'Paño de lana', calidad: 1, precio: 33 });
  m.itemInfo(SUELTO, { nombre: 'Rodela suelta', calidad: 2 });
  m.bolsa(0, 1, { id: 6948, n: 1 });
  m.objeto(6948, 1);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua(`local pj = SnetForeverCuenta.comercio.inventario.pj
    pj["Otro Dos-Normal"] = {nombre = "Otro Dos", reino = "Normal", clase = "PRIEST", bolsas = {[${LANA}] = 77}}
    SnetForever.InventarioCuenta.olvidarOrden()`);
  m.huecos(6, 28);
  m.bolsa(6, 3, { id: LANA, n: 20 });
  m.bolsa(6, 4, { id: LANA, n: 27 });
  m.huecos(7, 0);
  for (let b = 15; b <= 23; b++) m.huecos(b, 0);
  m.disparar('BANKFRAME_OPENED');
  return m;
}

const sinColores = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '').replace(/\|T[^|]*\|t/g, '^');
const lineas = (m, id) => { m.tooltipObjeto(id); return m.detalleTooltip().map((x) => [sinColores(x.izq), sinColores(x.der)]); };
const izquierdas = (l) => l.map(([izq]) => izq);
const fila = (l, izq) => l.find(([i]) => i === izq);
const fallosTooltip = (m) => (m.lua('return SnetForeverCuenta.fallos') || []).filter((f) => /^tooltip/.test(f.texto));
// La subasta abierta con su subastador: la unidad «npc» con la facción que da UnitFactionGroup (nil = un goblin neutral).
function abrirSubasta(m, faccion) {
  m.lua(`BANCO.ponerNpc(BANCO.guidCriatura(${faccion ? 8670 : 8661}), "Subastador")`);
  m.lua(`BANCO.unidades.npc.faccion = ${faccion ? `"${faccion}"` : "false"}`);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.05);
}
const MERCADO_SIN_DATOS = 'Valor de mercado y lo que sale: sin datos de esta subasta (neutral)';

test('F6, la causa: con un núcleo sin API.bolsasCuenta ni API.bolsasPropias, el tooltip sigue con el inventario, «Sin contar» y la Subasta', () => {
  // Lo instalado el 20-nov era una mezcla: el núcleo de otra rama (sin esas dos, que llegaron con la F2b) y el comercio de
  // la F4. Antes, Inv.de daba «attempt to call field 'bolsasCuenta' (a nil value)» y el tooltip acababa en el precio de
  // venta.
  const m = maquina({ antes: (mq) => mq.lua('SnetForever.API.bolsasCuenta = nil; SnetForever.API.bolsasPropias = nil') });
  m.lua('SnetForever.Precios.alAbrir()');
  const l = lineas(m, LANA);
  assert.deepEqual(fila(l, 'Inventario'), ['Inventario', '77 en bolsas y banco'], JSON.stringify(l));
  assert.deepEqual(fila(l, '  Otro Dos'), ['  Otro Dos', '77 (77 Bolsas, banco sin ver)']);
  assert.ok(izquierdas(l).some((x) => x.startsWith('Sin contar: ')), JSON.stringify(l));
  assert.ok(izquierdas(l).includes('SnetForever · Subasta'), JSON.stringify(l));
  assert.ok(fila(l, 'Valor de mercado'), JSON.stringify(l));
  assert.deepEqual(fallosTooltip(m), [], 'sin fallos que apuntar');
});

test('F6: con el núcleo de verdad, el banco abierto y el objeto solo en una pestaña del banco, salen el inventario, «Sin contar» y la Subasta', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.alAbrir()');
  const l = lineas(m, LANA);
  assert.deepEqual(fila(l, 'Inventario'), ['Inventario', '124 en bolsas y banco'], JSON.stringify(l));
  assert.deepEqual(fila(l, '  Nombre Uno'), ['  Nombre Uno', '47 (0 Bolsas, 47 Banco)']);
  assert.deepEqual(fila(l, '  Otro Dos'), ['  Otro Dos', '77 (77 Bolsas, banco sin ver)']);
  assert.ok(izquierdas(l).includes('Sin contar: 1 banco, 2 buzones, el banco de cuenta y los personajes sin entrar'), JSON.stringify(l));
  for (const x of ['SnetForever · Subasta', 'A la venta', 'Compra mínima', 'Valor de mercado', 'Salidas locales/día (ventas y retiradas, aprox.)']) {
    assert.ok(izquierdas(l).includes(x), `${x}: ${JSON.stringify(l)}`);
  }
  sinErrores(m);
});

test('F6: un fallo en la línea del inventario no corta el bloque de Subasta (y se apunta una sola vez)', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.alAbrir()');
  m.lua('SnetForever.InventarioCuenta.de = function() error("inventario roto") end');
  const l = lineas(m, LANA);
  assert.ok(fila(l, 'Precio de venta al vendedor'), 'lo de antes del inventario sale');
  assert.equal(fila(l, 'Inventario'), undefined, 'la línea rota no sale');
  for (const x of ['SnetForever · Subasta', 'A la venta', 'Compra mínima', 'Valor de mercado']) {
    assert.ok(izquierdas(l).includes(x), `${x}: ${JSON.stringify(l)}`);
  }
  lineas(m, LANA);
  lineas(m, SUELTO);
  const f = fallosTooltip(m);
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.match(f[0].texto, /inventario/);
  assert.match(f[0].texto, /inventario roto/);
});

test('F6: un fallo en la Subasta no se lleva las Operaciones ni los ids, y uno en el grupo no se lleva el inventario', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.alAbrir()');
  m.lua(`local T = SnetForever.TooltipComercio
    T.ponerLinea("ids", true)
    SnetForever.Subasta.foto = function() error("subasta rota") end
    SnetForever.Arbol.objeto = function() error("árbol roto") end`);
  const l = lineas(m, LANA);
  assert.ok(fila(l, 'Inventario'), JSON.stringify(l));
  assert.ok(fila(l, 'ItemID'), JSON.stringify(l));
  assert.ok(!izquierdas(l).includes('SnetForever · Subasta'), 'sin línea de la subasta, sin su título');
  assert.equal(fallosTooltip(m).length, 2, JSON.stringify(fallosTooltip(m)));
});

test('el inventario sale igual en una casa neutral con fichas de la Horda (subasta abierta y banco abierto)', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.alAbrir()');
  const cerrada = lineas(m, LANA);
  abrirSubasta(m, null);
  const neutral = lineas(m, LANA);
  const inventario = (l) => {
    const i = l.findIndex(([x]) => x === 'Inventario');
    return i < 0 ? [] : l.slice(i, l.findIndex(([x]) => x.startsWith('Sin contar: ')) + 1);
  };
  assert.ok(inventario(cerrada).length >= 4, JSON.stringify(cerrada));
  assert.deepEqual(inventario(neutral), inventario(cerrada));
  sinErrores(m);
});

test('F6: en la subasta neutral nada de la app de la Horda: ni valor de mercado ni lo que sale, y una línea gris lo dice', () => {
  const m = maquina();
  abrirSubasta(m, null);
  // Sin lista de Navegar ni escaneo: ningún dato de esta casa.
  let l = lineas(m, LANA);
  assert.ok(izquierdas(l).includes(MERCADO_SIN_DATOS), JSON.stringify(l));
  for (const x of ['A la venta', 'Compra mínima', 'Valor de mercado', 'Salidas locales/día (ventas y retiradas, aprox.)', 'Parte que sale (vendida o retirada, aprox.)']) {
    assert.ok(!izquierdas(l).includes(x), `${x} no sale: ${JSON.stringify(l)}`);
  }
  // Con la lista de Navegar de esta casa: la venta y la mínima de ella, y lo de la app sigue sin salir.
  m.lua(`SnetForever.Busqueda.vivo = function(i)
    if i == ${LANA} then return {precio = 150, cantidad = 1477, hora = GetServerTime(), origen = "lista"} end
  end`);
  l = lineas(m, LANA);
  assert.deepEqual(fila(l, 'A la venta'), ['A la venta', '1477 unidades (subasta, ahora mismo)'], JSON.stringify(l));
  assert.deepEqual(fila(l, 'Compra mínima'), ['Compra mínima', '1s 50c']);
  assert.ok(izquierdas(l).includes(MERCADO_SIN_DATOS));
  assert.ok(!izquierdas(l).includes('Valor de mercado'));
  // La IA tampoco recibe el precio de la Horda con la neutral abierta.
  assert.equal(m.lua(`return SnetForever.Precios.de(${LANA})`) ?? null, null);
  // Al cerrarla, otra vez lo de la casa propia.
  m.lua('SnetForever.Busqueda.vivo = function() end');
  m.disparar('AUCTION_HOUSE_CLOSED');
  l = lineas(m, LANA);
  assert.ok(fila(l, 'Valor de mercado'), JSON.stringify(l));
  assert.ok(!izquierdas(l).includes(MERCADO_SIN_DATOS));
  sinErrores(m);
});

test('F6: en la subasta de la Horda (su subastador es de la Horda) todo sigue como antes', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  const l = lineas(m, LANA);
  assert.ok(fila(l, 'Valor de mercado'), JSON.stringify(l));
  assert.ok(!izquierdas(l).includes(MERCADO_SIN_DATOS));
  sinErrores(m);
});

test('F6: un objeto suelto con escaneo y foto de la app: la mínima es de la app y el valor de mercado sale', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  m.lua(`SnetForever.Escaneo = {estado = function() return "parado" end, enCamino = function() return false end,
    datos = function() return {[${SUELTO}] = {precio = 90, cantidad = 9, hora = GetServerTime() - 20}} end}`);
  const l = lineas(m, SUELTO);
  assert.match(fila(l, 'A la venta')[1], /\(app, hace /, JSON.stringify(l));
  assert.deepEqual(fila(l, 'Valor de mercado'), ['Valor de mercado', '[0%] 1s 00c']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F6, ronda 1 (revisión): la IA, las bolsas que fallan, el escaneo de otra casa y alAbrir.
// ---------------------------------------------------------------------------------------------------

test('F6, ronda 1: la IA en la subasta neutral no recibe las oportunidades de la app de la Horda ni su casa', () => {
  const m = maquina();
  m.itemInfo(GANGA, { nombre: 'Ganga de prueba', calidad: 1 });
  abrirSubasta(m, 'Horde');
  const horda = m.lua('SnetForever.Contexto.comercio()');
  assert.equal(horda.casa, 114);
  assert.ok(horda.oportunidades.some((o) => o.id === GANGA && o.fuente === 'app'), JSON.stringify(horda));
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrirSubasta(m, null);
  const neutral = m.lua('SnetForever.Contexto.comercio()');
  // F7: ya no hay casa supuesta: la neutral no está descubierta en esta ranura, así que ninguna casa (y nunca la 114).
  assert.equal(neutral.casa ?? null, null, 'ninguna casa para la neutral sin descubrir, y nunca la 114');
  assert.equal(neutral.faccion, 'Neutral');
  assert.deepEqual(neutral.oportunidades, [], 'nada de la app de la Horda');
  // Navegar y la ventana tampoco dicen que hay precios en la neutral.
  assert.equal(m.lua('SnetForever.SubastaNavegar.hayPrecios()'), false);
  assert.equal(m.lua('SnetForever.Precios.casaActual()') ?? null, null, 'ninguna (la neutral sin descubrir), no la 114');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 114, 'cerrada, la propia');
  sinErrores(m);
});

test('F6, ronda 1: una función de bolsas que falta se apunta como instalación mezclada, una vez', () => {
  const m = maquina({ antes: (mq) => mq.lua('SnetForever.API.bolsasCuenta = nil') });
  lineas(m, LANA);
  lineas(m, LANA);
  m.disparar('BANKFRAME_OPENED');
  const f = (m.lua('return SnetForeverCuenta.fallos') || []).filter((x) => /^inventario/.test(x.texto)).map((x) => x.texto);
  assert.deepEqual(f, ['inventario: falta API.bolsasCuenta en el núcleo (instalación mezclada)']);
});

test('F6, ronda 1: una función de bolsas que FALLA no apunta unas bolsas a medias, se apunta una vez y no deja el banco de cuenta por visto', () => {
  const m = maquina();
  const ficha = () => m.lua('return SnetForeverCuenta.comercio.inventario.pj["Nombre Uno-Normal"]');
  assert.deepEqual(ficha().bolsas, { 6948: 1 }, 'lo contado al entrar');
  m.lua('ORIGINAL_CUENTA, ORIGINAL_PROPIAS = SnetForever.API.bolsasCuenta, SnetForever.API.bolsasPropias');
  m.lua('SnetForever.API.bolsasPropias = function() error("bolsas rotas\\nsegunda línea") end');
  m.lua('SnetForever.API.bolsasCuenta = function() error("cuenta rota") end');
  m.bolsa(0, 2, { id: LANA, n: 3 });
  m.disparar('PLAYER_LEAVING_WORLD');
  m.disparar('PLAYER_LOGOUT');
  assert.deepEqual(ficha().bolsas, { 6948: 1 }, 'no se pisa con nada');
  // El banco de cuenta: sin poder saber si el cliente lo tiene, la frase no lo nombra… y no se guarda para la sesión.
  const falta = () => m.lua(`return select(3, SnetForever.InventarioCuenta.de(${LANA}))`);
  assert.equal(falta().bancoCuenta ?? null, null);
  m.lua('SnetForever.API.bolsasCuenta, SnetForever.API.bolsasPropias = ORIGINAL_CUENTA, ORIGINAL_PROPIAS'); // las del núcleo, otra vez
  assert.equal(falta().bancoCuenta, true, 'al volver a funcionar, se mira otra vez');
  const f = (m.lua('return SnetForeverCuenta.fallos') || []).filter((x) => /^inventario/.test(x.texto)).map((x) => x.texto);
  assert.equal(f.length, 2, JSON.stringify(f));
  assert.match(f[0], /^inventario: API\.bolsasPropias ha fallado: .*bolsas rotas$/);
  assert.match(f[1], /^inventario: API\.bolsasCuenta ha fallado: .*cuenta rota$/);
});

test('F6, ronda 1: el escaneo lleva la casa en la que se leyó: el de la Horda no sale en la neutral, y la réplica de la neutral no se guarda para la app', () => {
  const m = maquina();
  // Un escaneo leído en la Horda (lo que deja el escaneo de verdad: con su facción).
  m.lua(`SnetForever.Escaneo = {estado = function() return "parado" end, enCamino = function() return false end,
    datos = function() return {[${LANA}] = {precio = 180, cantidad = 50, hora = GetServerTime() - 30, origen = "replica", faccion = "Horde"}} end}`);
  m.lua('SnetForever.Busqueda.vivo = function() end');
  abrirSubasta(m, null);
  const l = lineas(m, LANA);
  assert.equal(fila(l, 'A la venta'), undefined, `el escaneo de la Horda no es de esta casa: ${JSON.stringify(l)}`);
  assert.ok(izquierdas(l).includes(MERCADO_SIN_DATOS));
  sinErrores(m);
});

test('F6, ronda 1: el escaneo de verdad apunta la facción de la subasta y, en la neutral, no deja ultimoEscaneo', () => {
  for (const faccion of ['Horde', null]) {
    const m = crearMaquina({ jugador: { reino: 'Normal', faccion: 'Horde' } });
    m.lua(`local r = {}
      for i = 1, 5 do
        r[#r + 1] = {name = "M", itemID = 20000 + i, count = 5, buyoutPrice = 500}
        r[#r + 1] = {name = "M", itemID = 20000 + i, count = 2, buyoutPrice = 260}
      end
      BANCO.ponerSubasta({replica = r})`);
    abrirSubasta(m, faccion);
    m.avanzar(4);
    assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo');
    assert.equal(m.lua('SnetForever.Escaneo.datos()[20001].faccion'), faccion ?? 'Neutral');
    const u = m.lua('SnetForeverCuenta.comercio.ultimoEscaneo') ?? null;
    if (faccion) assert.ok(u && u.identidad.faccion === 'Horde', 'en la Horda, para la app');
    else assert.equal(u, null, 'en la neutral no: la app la tomaría por la casa de la Horda');
    sinErrores(m);
  }
});

test('F6, ronda 1: si alAbrir falla a medias, la subasta abierta no se queda con la casa de la Horda', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.cargar = function() error("carga rota") end');
  abrirSubasta(m, null);
  assert.equal(m.lua('SnetForever.Precios.casaAbierta()'), false);
  assert.equal(m.lua(`return SnetForever.Precios.de(${LANA})`) ?? null, null);
});

// ---------------------------------------------------------------------------------------------------
// F6, ronda 2: la edad de los precios para la IA, el fallo de alCerrar y la ventana de comercio en la neutral.
// ---------------------------------------------------------------------------------------------------

test('F6, ronda 2: en la subasta neutral la IA no recibe la edad de la foto de la Horda (edadPrecios nil); en la Horda, sí', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  const horda = m.lua('SnetForever.Contexto.comercio()');
  assert.equal(typeof horda.edadPrecios, 'number', JSON.stringify(horda));
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrirSubasta(m, null);
  const neutral = m.lua('SnetForever.Contexto.comercio()');
  assert.equal(neutral.edadPrecios ?? null, null, JSON.stringify(neutral));
  sinErrores(m);
});

test('F6, ronda 2: un fallo de Precios.alCerrar se apunta una sola vez por sesión y solo su primera línea', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.alCerrar = function() error("cierre roto" .. string.char(10) .. "segunda línea") end');
  for (let i = 0; i < 2; i++) {
    abrirSubasta(m, 'Horde');
    m.disparar('AUCTION_HOUSE_CLOSED');
  }
  const f = (m.lua('return SnetForeverCuenta.fallos') || []).map((x) => x.texto).filter((t) => /^precios/.test(t));
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.match(f[0], /^precios: .*cierre roto$/);
});

test('F6, ronda 2: la ventana de comercio dice «sin precios de la app» en la subasta neutral (preciosDeCasa con la casa abierta) y no en la de la Horda', () => {
  const sinPrecios = (m) => {
    const t = m.lua('SnetForever.UIComercio.marco() and SnetForever.UIComercio.marco().avisos:GetText()') || '';
    return t.includes(m.lua('SnetForever.L.t("COMERCIO_SIN_PRECIOS")'));
  };
  const m = maquina();
  abrirSubasta(m, 'Horde');
  m.avanzar(1);
  assert.equal(sinPrecios(m), false, 'en la Horda hay precios de la app');
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrirSubasta(m, null);
  m.avanzar(1);
  assert.equal(sinPrecios(m), true, 'en la neutral, no');
  sinErrores(m);
});
