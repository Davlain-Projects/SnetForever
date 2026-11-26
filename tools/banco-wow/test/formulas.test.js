// Comercio, ventana principal, tarea 14: el evaluador de fórmulas de precio (la gramática de TSM con nuestras fuentes).
import assert from 'node:assert/strict';
import { testConComercio as test, nuevaMaquina, sinErrores } from './ayuda.js';

const F = 'SnetForever.Formulas';
const q = (t) => JSON.stringify(t);

// Una máquina con precios de prueba: la app (snfmercado), el escaneo (snfminimo) y el juego (vendorsell).
function maquina() {
  const m = nuevaMaquina();
  m.lua(`PRE = {[100] = {precio = 9000, normal = 10000}, [200] = {normal = 60000}}
    ESC = {[100] = {precio = 8000}}
    REG = {}
    SnetForever.Precios.de = function(i) return PRE[i] end
    SnetForever.Precios.regional = function(i) return REG[i] end
    SnetForever.Escaneo.datos = function() return ESC end`);
  m.itemInfo(100, { nombre: 'Uno', precio: 500 });
  m.itemInfo(200, { nombre: 'Dos', precio: 0 });
  return m;
}

// valor(texto, item) -> {v, e}: v el número (o undefined), e el mensaje en español (o undefined).
function valor(m, texto, item = 100) {
  const r = m.lua(`(function() local v, e = ${F}.valor(${q(texto)}, ${item}); return {v = v, e = e and ${F}.mensaje(e)} end)()`);
  return r || {};
}
const v = (m, texto, item) => valor(m, texto, item).v;

function traducir(m, texto) {
  return m.lua(`(function() local texto, cambios, desc = ${F}.traducir(${q(texto)}); return {texto = texto, cambios = cambios, desc = desc} end)()`);
}

test('importes: 1g 50s 20c = 15020 y 1o 50p 20c = 15020', () => {
  const m = maquina();
  assert.equal(v(m, '1g 50s 20c'), 15020 * 1);
  assert.equal(v(m, '1o 50p 20c'), 15020 * 1);
  assert.equal(v(m, '1g50s20c'), 15020 * 1);
  assert.equal(v(m, '50s'), 5000);
  assert.equal(v(m, '7c'), 7);
  assert.equal(v(m, '2g'), 20000);
  assert.equal(v(m, '1.5g'), 15000);
  assert.equal(v(m, '-(1g)'), -10000);
  assert.equal(v(m, '2 * 3 + 4 / 2 - 1'), 7);
  assert.equal(v(m, '(1 + 2) * 3'), 9);
  assert.equal(v(m, '--2'), 2);
  sinErrores(m);
});

test('120% dbmarket traducida usa snfmercado × 1,2', () => {
  const m = maquina();
  const t = traducir(m, '120% dbmarket');
  assert.equal(t.texto, '120% snfmercado');
  assert.equal(t.cambios, 1);
  assert.deepEqual(t.desc, []);
  assert.equal(v(m, '120% snfmercado'), 12000);
  assert.equal(v(m, '120% SnfMercado'), 12000, 'sin distinguir mayúsculas');
  assert.equal(v(m, '50%'), 0.5);
  assert.equal(v(m, '120%*2g'), 24000);
  sinErrores(m);
});

test('max(1.5 * vendorsell, 0.25 * first(snfmercado, snfhistorico)) con valores de prueba', () => {
  const m = maquina();
  const f = 'max(1.5 * vendorsell, 0.25 * first(snfmercado, snfhistorico))';
  assert.equal(v(m, f, 100), 2500, 'el 25 % de 10000 gana a 1,5 × 500');
  // Objeto 200: vendorsell 0 (no se vende) es sin valor; max ignora lo que no tiene valor.
  assert.equal(v(m, f, 200), 15000);
  // Objeto 300: nada de nada.
  assert.equal(v(m, f, 300), undefined);
  assert.equal(v(m, 'vendorsell', 100), 500);
  // F1 (ronda 2): snfminimo es la compra mínima de la foto elegida: la de la app (9000); la réplica de 8000 no gana.
  assert.equal(v(m, 'snfminimo', 100), 9000);
  assert.equal(v(m, 'snfminimo', 200), undefined, 'una fila de la app sin compra mínima: sin valor');
  assert.equal(v(m, 'snfhistorico', 100), 10000);
  sinErrores(m);
});

test('vendorsell lee el precio con la API moderna o la antigua', () => {
  for (const apiAusente of ['GetItemInfo', 'C_Item.GetItemInfo']) {
    const m = nuevaMaquina({ sinApi: [apiAusente] });
    try {
      m.itemInfo(100, { nombre: 'Uno', precio: 500 });
      m.itemInfo(200, { nombre: 'Dos', precio: 0 });
      assert.equal(v(m, 'max(1.5 * vendorsell, 1s)', 100), 750, apiAusente);
      assert.equal(v(m, 'vendorsell', 200), undefined, apiAusente);
      assert.equal(v(m, 'vendorsell', 300), undefined, apiAusente);
      sinErrores(m);
    } finally {
      m.cerrar();
    }
  }
});

test('first salta sin valor; min y max ignoran sin valor; crafting no tiene valor', () => {
  const m = maquina();
  assert.equal(v(m, 'first(crafting, snfmercado)', 100), 10000);
  assert.equal(v(m, 'first(crafting, vendorbuy)', 100), undefined);
  assert.equal(v(m, 'min(crafting, 5g, 7g)'), 50000);
  assert.equal(v(m, 'max(crafting, 5g, 7g)'), 70000);
  assert.equal(v(m, 'min(crafting)'), undefined);
  assert.equal(v(m, 'crafting'), undefined);
  assert.equal(v(m, 'crafting + 1g'), undefined, 'cualquier otra operación con sin valor da sin valor');
  assert.equal(v(m, '2g * crafting'), undefined);
  assert.equal(v(m, 'avg(1g, 3g)'), 20000);
  assert.equal(v(m, 'avg(1g, crafting)'), 10000, 'avg ignora sin valor, como TSM');
  assert.equal(v(m, 'avg(crafting, 1g, 3g)'), 20000);
  assert.equal(v(m, 'avg(crafting)'), undefined, 'avg sin ningún valor da sin valor');
  assert.equal(v(m, 'check(first(crafting, snfmercado, snfmercado), max(0.25 * avg(crafting, snfmercado, snfmercado), 1s))', 100), 2500,
    'la fórmula importada de TSM para la operación Forever da precio sin receta');
  assert.equal(v(m, 'round(1234, 100)'), 1200);
  assert.equal(v(m, 'round(1250)'), 1250);
  assert.equal(v(m, 'roundup(1201, 100)'), 1300);
  assert.equal(v(m, 'rounddown(1299, 100)'), 1200);
  assert.equal(v(m, 'check(snfmercado, 1g, 2g)', 100), 10000);
  assert.equal(v(m, 'check(crafting, 1g, 2g)', 100), undefined);
  assert.equal(v(m, 'check(0 - 5, 1g, 2g)', 100), 20000, 'check usa la salida «si no» cuando no es mayor que cero');
  assert.equal(v(m, 'ifeq(snfmercado, 1g, 7, 8)', 100), 7);
  assert.equal(v(m, 'iflt(snfmercado, 2g, 7, 8)', 100), 7);
  assert.equal(v(m, 'ifgte(snfmercado, 1g, 7, 8)', 100), 7);
  assert.equal(v(m, 'iflte(snfmercado, 0.5g, 7, 8)', 100), 8);
  assert.equal(v(m, 'ifgt(snfmercado, 99g, 7)', 100), undefined, 'sin la salida «si no» no hay valor');
  sinErrores(m);
});

test('ifgt(snfmercado, 5000g, 0.3, 0.05) * snfmercado', () => {
  const m = maquina();
  m.lua('PRE[300] = {normal = 60000000}'); // 6000g
  const f = 'ifgt(snfmercado, 5000g, 0.3, 0.05) * snfmercado';
  assert.equal(v(m, f, 100), 500, '1g no pasa de 5000g: 0,05 × 10000');
  assert.equal(v(m, f, 300), 18000000, '6000g pasa de 5000g: 0,3 × 60000000');
  sinErrores(m);
});

test('snfregional() es el precio regional de la app; DBRegionMarketAvg se traduce a ella', () => {
  const m = maquina();
  m.lua('REG[100] = 12000');
  assert.equal(v(m, 'snfregional()', 100), 12000);
  assert.equal(v(m, 'snfregional()', 200), undefined, 'sin precio regional, sin valor');
  assert.equal(v(m, 'snfregional(item:100)', 200), 12000, 'con referencia a otro objeto');
  assert.equal(v(m, '80% snfregional()', 100), 9600);
  assert.equal(m.lua(`(function() return ${F}.valor("snfregional()", "i:100::1:3") end)()`), undefined, 'una variante no es el objeto base');
  assert.equal(traducir(m, '80% DBRegionMarketAvg').texto, '80% snfregional()');
  assert.equal(traducir(m, 'dbregionmarketavg(item:100) + dbmarket').texto, 'snfregional(item:100) + snfmercado');
  assert.equal(traducir(m, '80% snfregional()').cambios, 0, 'lo ya traducido no se toca');
  const antes = m.lua(`(function() local t, n = ${F}.traducir("first(dbmarket, dbregionmarketavg)", true) return {t = t, n = n} end)()`);
  assert.deepEqual(antes, { t: 'first(snfmercado, snfmercado)', n: 2 }, 'con «antes», como se importaba antes');
  sinErrores(m);
});

test('la fórmula larga de op-07 (sniper) compila y calcula', () => {
  const m = maquina();
  // Termina como la captura (…egionMarketAvg, 5000g, 0.3, ifgt(…2000g…, ifgt(…1000g…, 0.05)))))))) * DBRegionMarketAvg)):
  // 8 «ifgt» abiertos (cinco antes de 5000g) más el «max(» de fuera.
  const op07 = 'max(vendorsell, ifgt(DBRegionMarketAvg, 300000g, 0.8, ifgt(DBRegionMarketAvg, 150000g, 0.7, '
    + 'ifgt(DBRegionMarketAvg, 75000g, 0.6, ifgt(dbregionmarketAvg, 30000g, 0.5, ifgt(DBRegionMarketAvg, 10000g, 0.4, '
    + 'ifgt(DBRegionMarketAvg, 5000g, 0.3, ifgt(DBRegionMarketAvg, 2000g, 0.2, ifgt(DBRegionMarketAvg, 1000g, 0.1, 0.05)))))))) * DBRegionMarketAvg)';
  assert.equal(op07.split('(').length, op07.split(')').length, 'paréntesis equilibrados');
  const t = traducir(m, op07);
  assert.equal(t.cambios, 9, 'nueve fuentes DBRegionMarketAvg');
  assert.deepEqual(t.desc, []);
  assert.ok(!/dbregion/i.test(t.texto));
  assert.ok(t.texto.endsWith('0.05)))))))) * snfregional())'));
  // Sin traducir, esas fuentes no existen en SnetForever; traducida, compila.
  assert.match(valor(m, op07).e, /no existe en SnetForever/);
  const tr = t.texto;
  // Objeto 100: 1g de precio regional no pasa de 1000g: 0,05 × 10000 = 500, y vendorsell vale 500.
  m.lua('REG[100] = 10000');
  assert.equal(v(m, tr, 100), 500);
  m.lua('REG[400] = 60000000; REG[500] = 200000000; REG[600] = 30000000');
  assert.equal(v(m, tr, 400), 0.3 * 60000000, '6000g: pasa de 5000g');
  assert.equal(v(m, tr, 500), 0.4 * 200000000, '20000g: pasa de 10000g');
  assert.equal(v(m, tr, 600), 0.2 * 30000000, '3000g: pasa de 2000g');
  sinErrores(m);
});

test('fuente propia minprice = max(min(snfhistorico, snfmercado), vendorsell)', () => {
  const m = maquina();
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = {MinPrice = "max(min(snfhistorico, snfmercado), vendorsell)", doble = "2 * minprice"}');
  assert.deepEqual(m.lua(`${F}.fuentes()`), { minprice: 'max(min(snfhistorico, snfmercado), vendorsell)', doble: '2 * minprice' });
  assert.equal(v(m, 'minprice', 100), 10000);
  assert.equal(v(m, 'MinPrice * 2', 100), 20000);
  assert.equal(v(m, 'doble', 100), 20000, 'una fuente propia puede usar otra');
  assert.equal(v(m, 'minprice', 200), 60000);
  assert.equal(v(m, 'minprice', 999), undefined);
  // Cambiar la fuente se nota enseguida (aunque la fórmula esté en la caché).
  m.lua('SnetForeverCuenta.comercio.v2.fuentes.MinPrice = "3g"');
  assert.equal(v(m, 'minprice', 100), 30000);
  // Valores estropeados en los datos guardados no rompen nada.
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = {malo = 5, [3] = "x", ok = "1g"}');
  assert.deepEqual(m.lua(`${F}.fuentes()`), { ok: '1g' });
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = "roto"');
  assert.equal(m.lua(`next(${F}.fuentes()) == nil`), true);
  assert.match(valor(m, 'minprice').e, /minprice/);
  sinErrores(m);
});

test('traducir: cambia db* y deja dbregionsaleavg en desconocidas', () => {
  const m = maquina();
  const t = traducir(m, 'DBMarket + dbminbuyout + DBHistorical + dbregionhistorical + DBRegionSaleAvg + max(1g, DBRegionSaleAvg)');
  assert.equal(t.texto, 'snfmercado + snfminimo + snfhistorico + snfhistorico + DBRegionSaleAvg + max(1g, DBRegionSaleAvg)');
  assert.equal(t.cambios, 4);
  assert.deepEqual(t.desc, ['DBRegionSaleAvg']);
  // Los importes y las funciones no se tocan; las fuentes propias y las nuestras no son desconocidas.
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = {mia = "1g"}');
  const u = traducir(m, '5000g * mia + snfmercado + vendorsell + ifgt(1c, 2c, 3c)');
  assert.equal(u.texto, '5000g * mia + snfmercado + vendorsell + ifgt(1c, 2c, 3c)');
  assert.equal(u.cambios, 0);
  assert.deepEqual(u.desc, []);
  sinErrores(m);
});

test('paréntesis sin cerrar, fuente inexistente, ciclo entre fuentes, división por cero y números enormes: mensaje claro y ningún error de Lua', () => {
  const m = maquina();
  assert.match(valor(m, 'max(1g, 2g').e, /cerrar un paréntesis/);
  assert.match(valor(m, '1g)').e, /paréntesis/);
  assert.match(valor(m, 'dbregionsaleavg * 2').e, /fuente dbregionsaleavg no existe en SnetForever/i);
  assert.match(valor(m, '').e, /vacía/);
  assert.match(valor(m, '2 +').e, /falta/);
  assert.match(valor(m, '2 $ 3').e, /\$/);
  assert.match(valor(m, 'min()').e, /min/);
  assert.match(valor(m, 'ifgt(1, 2)').e, /ifgt/);
  assert.match(valor(m, 'foo(1)').e, /función foo/);
  assert.match(valor(m, '5x').e, /5x/);
  // Ciclos: una fuente que se usa a sí misma y dos que se usan entre sí.
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = {a = "b + 1g", b = "a + 1g", yo = "yo * 2"}');
  assert.match(valor(m, 'a').e, /se usa a sí misma/);
  assert.match(valor(m, 'yo').e, /se usa a sí misma/);
  // División por cero: sin valor, y sin mensaje de error.
  const d = valor(m, '1g / 0');
  assert.equal(d.v, undefined);
  assert.equal(d.e, undefined);
  assert.equal(v(m, '1g / (snfmercado - snfmercado)'), undefined);
  assert.equal(v(m, 'max(1g / 0, 2g)'), 20000);
  // Números enormes.
  assert.match(valor(m, '9'.repeat(400)).e, /grande/);
  assert.match(valor(m, '99999999999999999999999g').e, /grande/);
  const grande = valor(m, '99999999999g * 99999999999g');
  assert.equal(grande.v, undefined);
  assert.match(grande.e, /grande/);
  // Anidamiento absurdo.
  assert.match(valor(m, '('.repeat(5000) + '1' + ')'.repeat(5000)).e, /anidad/);
  // Tipos raros.
  assert.equal(m.lua(`(function() local f, e = ${F}.compilar(nil); return f == nil and e ~= nil and ${F}.mensaje(e) ~= nil end)()`), true);
  assert.equal(m.lua(`type(${F}.mensaje(nil)) == "string" and type(${F}.mensaje("x")) == "string"`), true);
  assert.equal(m.lua(`(function() local f = ${F}.compilar("1g + 1g"); return f(100) end)()`), 20000);
  sinErrores(m);
});

test('importes seguidos: solo se suman si cada unidad sale una vez y en orden (oro, plata, cobre); lo demás es un error claro', () => {
  const m = maquina();
  assert.equal(v(m, '1g 50s 20c'), 15020 * 1);
  assert.equal(v(m, '1g 20c'), 10020);
  assert.equal(v(m, '50s 20c'), 5020);
  assert.equal(v(m, '1o 20c'), 10020);
  assert.equal(v(m, '1o 50p'), 15000);
  for (const malo of ['max(1g 2g)', '50s 1g', '1g 1g', '1g 50s 2s', '20c 50s', 'min(1000g 500g)', '1g 20c 5c', '1s 1p']) {
    const r = valor(m, malo);
    assert.equal(r.v, undefined, malo);
    assert.match(r.e, /importes? seguidos|oro, plata|en orden/, malo);
  }
  // Con un operador en medio sí son dos valores.
  assert.equal(v(m, '1g + 2g'), 30000);
  sinErrores(m);
});

test('coste por objeto: una lectura de cada fuente base por evaluación, fuentes() una vez y valor no recompila', () => {
  const m = maquina();
  const op07 = 'max(vendorsell, ifgt(snfmercado, 300000g, 0.8, ifgt(snfmercado, 150000g, 0.7, ifgt(snfmercado, 75000g, 0.6, '
    + 'ifgt(snfmercado, 30000g, 0.5, ifgt(snfmercado, 10000g, 0.4, ifgt(snfmercado, 5000g, 0.3, ifgt(snfmercado, 2000g, 0.2, '
    + 'ifgt(snfmercado, 1000g, 0.1, 0.05)))))))) * snfmercado)';
  m.lua(`LLAMADAS = 0
    local original = SnetForever.Precios.de
    SnetForever.Precios.de = function(i) LLAMADAS = LLAMADAS + 1; return original(i) end`);
  assert.equal(v(m, op07, 100), 500);
  assert.equal(m.lua('LLAMADAS'), 1, 'op-07 lee snfmercado una sola vez por objeto');
  // Las fuentes propias se leen una vez por evaluación, aunque se usen varias veces; y valor no vuelve a validar.
  m.lua(`LECTURAS = 0
    SnetForeverCuenta.comercio.v2.fuentes = setmetatable({mp = "snfmercado"}, {__pairs = function(t) LECTURAS = LECTURAS + 1; return next, t end})`);
  const f = 'mp + mp + mp';
  assert.equal(v(m, f, 100), 30000); // la primera vez compila y valida
  m.lua('LECTURAS = 0');
  for (let i = 0; i < 3; i++) assert.equal(v(m, f, 100), 30000);
  assert.equal(m.lua('LECTURAS'), 3, 'una lectura por evaluación, sin validar de nuevo');
  // Un cambio en las fuentes propias se sigue viendo.
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = {mp = "1g"}');
  assert.equal(v(m, f, 100), 30000);
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = {mp = "2g"}');
  assert.equal(v(m, f, 100), 60000);
  m.lua('SnetForeverCuenta.comercio.v2.fuentes = {}');
  assert.match(valor(m, f, 100).e, /mp/);
  sinErrores(m);
});

// Task 22 (pendiente de la Task 14): las fórmulas calculan sin redondear (un porcentaje suelto vale 0,5), y lo que se usa como
// precio pasa por Formulas.cobre: cobre entero y SIEMPRE hacia abajo (un precio máximo de compra nunca sube). Lo que el cálculo
// con decimales deja a una milésima por debajo de un entero (0,7 * 100 = 69,99999…) cuenta como ese entero.
test('Formulas.cobre: cobre entero hacia abajo, nunca hacia arriba; sin valor sigue sin valor', () => {
  const m = maquina();
  const c = (x) => m.lua(`${F}.cobre(${x})`);
  assert.equal(c('1234.99'), 1234, 'hacia abajo aunque falte poco');
  assert.equal(c('1234.5'), 1234);
  assert.equal(c('1234'), 1234);
  assert.equal(c('0.7 * 100'), 70, 'el error de los decimales no quita un cobre');
  assert.equal(c('-5'), 0, 'un precio no baja de 0');
  assert.equal(c('nil'), undefined);
  assert.equal(c('0/0'), undefined);
  assert.equal(c('1/0'), undefined);
  // Con un precio de verdad: el 33 % de 10000 cobre (snfmercado del objeto 100) son 3300; el de 1g 1c, 3333,33 -> 3333.
  assert.equal(m.lua(`${F}.cobre((${F}.valor("33% snfmercado", 100)))`), 3300);
  assert.equal(m.lua(`${F}.cobre((${F}.valor("1g 1c / 3", 100)))`), 3333);
  assert.equal(v(m, '50%'), 0.5, 'valor sigue sin redondear');
  sinErrores(m);
});

// Ronda 1, punto 2: hacia abajo de verdad. El margen solo tapa el error de la coma flotante (relativo al tamaño del número);
// un valor real a una fracción de cobre del siguiente entero no sube.
test('Formulas.cobre: 99,9995 baja a 99; lo que es 100 por error de coma flotante se queda en 100; también con mucho oro', () => {
  const m = maquina();
  const c = (x) => m.lua(`${F}.cobre(${x})`);
  assert.equal(c('99.9995'), 99, 'un precio real de 99,9995 no sube');
  assert.equal(c('99.9999999'), 99);
  assert.equal(c('100'), 100);
  assert.equal(c('(1 - 0.9) * 1000'), 100, '(1 - 0,9) * 1000 = 99,99999999999997 por la coma flotante: es 100');
  assert.equal(c('1.15 * 100'), 115, '1,15 * 100 = 114,99999999999999: es 115');
  assert.equal(m.lua(`${F}.cobre((${F}.valor("(1 - 0.9) * 1000", 100)))`), 100, 'lo mismo saliendo de una fórmula');
  // Mucho oro: 10 millones de oro y medio cobre no suben; un importe exacto se queda.
  assert.equal(c('99999999999.5'), 99999999999);
  assert.equal(c('99999999999.999'), 99999999999);
  assert.equal(c('1000000000.9995'), 1000000000, '100.000 de oro y 0,9995 cobre no suben');
  assert.equal(c('12345678.9 * 10000'), 123456789000);
  assert.equal(c('1234567890123'), 1234567890123);
  sinErrores(m);
});

// Ronda 1, punto 1: los mensajes de error de las fórmulas salen del idioma del cliente (textos/es.lua y textos/en.lua).
test('Formulas.mensaje: en español con el cliente en español y en inglés con el cliente en inglés', () => {
  const es = maquina();
  const en = nuevaMaquina({ jugador: { idioma: 'enUS' } });
  const msg = (mq, texto) => mq.lua(`(function() local _, e = ${F}.valor(${q(texto)}, 100); return ${F}.mensaje(e) end)()`);
  assert.equal(msg(es, 'noexiste * 2'), 'la fuente noexiste no existe en SnetForever');
  assert.equal(msg(en, 'noexiste * 2'), 'the source noexiste does not exist in SnetForever');
  assert.equal(msg(en, 'max(1g, 2g'), 'a closing bracket is missing');
  assert.equal(msg(en, '5x'), 'cannot understand "5x": after a number only g, s or c (gold, silver and copper) or % are allowed');
  assert.equal(msg(es, '5x'), 'no se entiende «5x»: después de un número solo valen g, s o c (oro, plata y cobre) o %');
  assert.equal(msg(en, 'min()'), 'the function min needs at least 1 values inside its brackets');
  assert.equal(msg(es, 'min()'), 'la función min necesita al menos 1 valores entre sus paréntesis');
  assert.equal(msg(en, 'ifgt(1, 2)'), 'the function ifgt needs 3 or 4 values inside its brackets');
  assert.equal(msg(es, 'ifgt(1, 2)'), 'la función ifgt necesita 3 o 4 valores entre sus paréntesis');
  assert.equal(en.lua(`${F}.mensaje(nil)`), 'the formula cannot be worked out');
  en.lua('SnetForeverCuenta.comercio.v2.fuentes = {rota = "max(1"}');
  assert.equal(msg(en, 'rota'), 'the source rota has an error: a closing bracket is missing');
  sinErrores(es);
  sinErrores(en);
});

// F1 (ronda 2): snfminimo es la compra mínima de la misma foto que el tooltip (SNF.Subasta.foto): la lista de Navegar, si no
// la foto de la app y, solo sin ella, el escaneo. Antes leía solo el escaneo (una réplica vieja pasaba por de ahora).
test('F1 ronda 2: snfminimo sale de la lista de Navegar, si no de la app, y del escaneo solo sin la app', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Precios = {de = function(id) if id == 100 then return {precio = 9000, cantidad = 3, normal = 10000} end end, edad = function() return 600 end, consultar = function() end}
    SnetForever.Escaneo = {datos = function() return {[100] = {precio = 8000, cantidad = 2, hora = GetServerTime() - 60}, [200] = {precio = 700, cantidad = 1, hora = GetServerTime() - 60}} end}
    SnetForever.Busqueda = {vivo = function(id) if id == 100 and LISTA then return {precio = 8500, cantidad = 4, hora = GetServerTime() - 5, origen = "lista"} end end}
    LISTA = true`);
  const valor = (id) => m.lua(`(SnetForever.Formulas.valor("snfminimo", ${id}))`);
  assert.equal(valor(100), 8500, 'la lista de Navegar');
  m.lua('LISTA = false');
  assert.equal(valor(100), 9000, 'la app; la réplica de 8000 no gana');
  assert.equal(valor(200), 700, 'sin la app, el escaneo');
  assert.equal(valor(300), undefined, 'sin ninguna foto, sin valor');
  sinErrores(m);
});

test('powers bind more tightly than multiplication and unary minus, from right to left', () => {
  const m = maquina();
  try {
    assert.equal(v(m, '2 * 3^2 + 1'), 19);
    assert.equal(v(m, '2^3^2'), 512);
    assert.equal(v(m, '-2^2'), -4);
    assert.equal(v(m, '(-2)^2'), 4);
    assert.equal(v(m, '2^-2'), 0.25);
    assert.equal(v(m, '50% 8^(1 / 3)'), 1);
    assert.equal(v(m, 'first((-1)^.5, 1g)'), 10000);
    assert.equal(v(m, 'first(0^-1, 2g)'), 20000);
    assert.equal(v(m, '2^crafting'), undefined);
    assert.match(valor(m, '10^16').e, /grande/);
    assert.match(valor(m, '2^'.repeat(100) + '1').e, /anidad/);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('item references read the requested ID and memoize each source and ID separately', () => {
  const m = maquina();
  try {
    m.lua(`READS = {};
      local original = SnetForever.Precios.de;
      SnetForever.Precios.de = function(id)
        READS[id] = (READS[id] or 0) + 1;
        return original(id)
      end`);
    const expression = 'snfmercado + snfmercado(item:100) + snfhistorico(i:100) + snfmercado(ITEM:200)';
    assert.equal(v(m, expression, 200), 140000);
    assert.deepEqual(m.lua('{READS[100], READS[200]}'), [1, 1]);
    assert.equal(v(m, 'vendorsell(item:100)', 200), 500);
    assert.equal(v(m, 'first(vendorbuy(item:100), snfminimo(i:100))', 200), 9000);
    const missing = valor(m, 'snfmercado(item:12345)');
    assert.equal(missing.v, undefined);
    assert.equal(missing.e, undefined);
    assert.equal(v(m, 'first(snfmercado(item:12345), vendorsell(item:100))'), 500);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('explicit item references reject malformed IDs and alternate expressions', () => {
  const m = maquina();
  try {
    for (const expression of [
      'vendorsell()', 'vendorsell(100)', 'vendorsell(item:0)', 'vendorsell(item:-3)',
      'vendorsell(item:2147483648)', 'vendorsell(item:12345678901)', 'vendorsell(item:1.5)',
      'vendorsell(item:1e3)', 'vendorsell(item:100 + 2)', 'vendorsell(item:100, i:200)',
      'vendorsell(item:100:2)', 'vendorsell([Unknown Item])', 'item:100',
    ]) {
      const result = valor(m, expression);
      assert.equal(result.v, undefined, expression);
      assert.equal(typeof result.e, 'string', expression);
    }
    const maxId = valor(m, 'vendorsell(item:2147483647)');
    assert.equal(maxId.v, undefined);
    assert.equal(maxId.e, undefined);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('TSM conversion rewrites existing aliases around numeric item references', () => {
  const m = maquina();
  try {
    const result = traducir(m, 'max(DBMinBuyout(item:100), vendorsell(i:100) ^ 1)');
    assert.deepEqual(result, { texto: 'max(snfminimo(item:100), vendorsell(i:100) ^ 1)', cambios: 1, desc: [] });
    assert.equal(v(m, result.texto, 200), 9000);
    const unavailable = traducir(m, 'first(DBRegionSaleAvg(item:100), vendorsell(i:100))');
    assert.equal(unavailable.texto, 'first(DBRegionSaleAvg(item:100), vendorsell(i:100))');
    assert.deepEqual(unavailable.desc, ['DBRegionSaleAvg']);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('renaming a custom source does not rewrite a saved item reference with the same prefix', () => {
  const m = maquina();
  try {
    m.lua('SnetForeverCuenta.comercio.v2.fuentes = { item = "1g", quotedprice = "item + vendorsell(item:100)" }');
    assert.equal(m.lua(`(${F}.ponerFuente("fixedprice", "1g", "item"))`), true);
    assert.equal(m.lua(`${F}.fuentes().quotedprice`), 'fixedprice + vendorsell(item:100)');
    assert.equal(v(m, 'quotedprice'), 10500);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('crafting values learned fixed-output recipes with all required materials priced', () => {
  const m = maquina();
  m.lua(`rawset(_G,"C_TradeSkillUI", {
    GetAllRecipeIDs=function() return {1} end,
    GetRecipeInfo=function() return {learned=true} end,
    GetRecipeSchematic=function() return {outputItemID=300,quantityMin=2,quantityMax=2,
      reagentSlotSchematics={{required=true,quantityRequired=3,reagents={{itemID=100}}}}} end
  })`);
  m.disparar('TRADE_SKILL_LIST_UPDATE');
  assert.equal(valor(m, 'crafting', 300).v, 15000);
  assert.deepEqual(m.lua('({SnetForever.RecipeCosts.materials(300,5)})[3]'), [{id:100, needed:9, missing:9}]);
  m.lua('PRE[100]=nil');
  assert.equal(valor(m, 'crafting', 300).v, undefined);
  sinErrores(m);
});
