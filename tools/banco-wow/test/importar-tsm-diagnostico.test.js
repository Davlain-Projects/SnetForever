// Plan de paridad con TSM, entrega 1: diagnóstico de precios de la importación (comercio/importar-tsm-diagnostico.lua y su
// vista previa en la ventanita de Grupos). La configuración de TSM es INVENTADA y se escribe aquí mismo: ningún grupo,
// operación, fórmula ni personaje es del jugador. «Kurgath» hace de otro jugador y nunca debe salir en lo que se enseña.
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const JUGADOR = { idioma: 'esES', nombre: 'Alba', reino: 'Mirador', faccion: 'Horde', nivel: 60 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const I = 'SnetForever.ImportarTSM';
const A = 'SnetForever.Arbol';
const O = 'SnetForever.Operaciones';
const F = 'SnetForever.Formulas';
const G = 'SnetForever.PrincipalGrupos';
const q = (t) => JSON.stringify(t);

// Seis tipos con operaciones (como el perfil auditado), fórmulas directas, por fuentes propias (anidadas y en ciclo), un
// vínculo, un vínculo en círculo, herencia desde el grupo base, un campo con su interruptor apagado y una función que no existe.
const DIAG = `TradeSkillMasterDB = {
  ["_currentProfile"] = {["Alba - Mirador"] = "Default"},
  ["g@ @userData@customPriceSources"] = {
    ["base"] = "first(dbmarket, vendorsell)",
    ["honda"] = "base * 1.1",
    ["regional"] = "dbregionsaleavg",
    ["anillo1"] = "anillo2 * 2",
    ["anillo2"] = "anillo1 + 1s",
    ["suave"] = "dbminbuyout",
  },
  ["p@Default@userData@groups"] = {
    [""] = {Auctioning = {"Directa", override = true}, Shopping = {"Compra", override = true}},
    ["Telas"] = {Auctioning = {"Vinculada", "Directa", override = true}},
    ["Telas\`Finas"] = {Auctioning = {"Vinculada"}},
    ["Metal"] = {Sniper = {"Caza", override = true}, Crafting = {"Taller", override = true}},
    ["Varios"] = {Mailing = {"Correo", override = true}, Vendoring = {"Vender", override = true},
      Warehousing = {"Almacen", override = true}},
  },
  ["p@Default@userData@items"] = {
    ["i:2589"] = "Telas", ["i:2592"] = "Telas", ["i:4306"] = "Telas\`Finas", ["i:4338"] = "Telas\`Finas",
    ["i:4338::r5"] = "Telas\`Finas", ["i:2770"] = "Metal", ["i:2771"] = "Metal", ["i:2772"] = "Varios",
  },
  ["p@Default@userData@operations"] = {
    Auctioning = {
      Directa = {minPrice = "80% dbregionmarketavg", normalPrice = "dbhistorical", maxPrice = "500g", postCap = "5",
        ignorePlayer = {["Kurgath - Horde - Mirador"] = true}, relationships = {}},
      Vinculada = {minPrice = "10g", normalPrice = "suave", maxPrice = "1000g", relationships = {minPrice = "Directa"}},
      Venta = {minPrice = "1g", normalPrice = "first(dbregionsaleavg, dbmarket)", maxPrice = "100g", relationships = {}},
      CirculoA = {undercut = "1c", relationships = {undercut = "CirculoB"}},
      CirculoB = {undercut = "2c", relationships = {undercut = "CirculoA"}},
    },
    Shopping = {Compra = {maxPrice = "smartavgbuy", restockQuantity = "20", relationships = {}}},
    Sniper = {Caza = {belowPrice = "honda", relationships = {}}},
    Crafting = {Taller = {minProfit = "", craftPriceMethod = "regional", minRestock = "anillo1", maxRestock = "5",
      relationships = {}}},
    Mailing = {Correo = {maxQtyEnabled = false, maxQty = "smartavgbuy", keepQty = "2", relationships = {}}},
    Vendoring = {Vender = {vsMarketValue = "dbmarket", vsMaxMarketValue = "convert(dbmarket)", relationships = {}}},
    Warehousing = {Almacen = {moveQuantity = "5", relationships = {}}},
  },
}`;

function maquina(previo = '') {
  return nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, previo: `${DIAG}\n${previo}` });
}

function importar(m, opciones = '{modo = "juntar"}') {
  m.lua(`${I}.importar(${opciones})`);
  for (let i = 0; i < 5000 && ['importando', 'pausado'].includes(m.lua(`${I}.estado().estado`)); i++) m.avanzar(0.05);
  return m.lua(`${I}.estado()`);
}

const buscarOp = (d, tipo, nombre) => d.operaciones.find((o) => o.tipo === tipo && o.nombre === nombre);
const buscarCampo = (op, campo) => op && op.campos.find((c) => c.campo === campo);
const buscarFuente = (d, nombre) => d.fuentes.find((f) => f.nombre === nombre);

test('el diagnóstico separa equivalentes, estimaciones locales y fuentes que faltan', () => {
  const m = maquina();
  const r = m.lua(`${I}.analizar()`);
  const d = r.diagnostico;
  assert.ok(d, 'analizar trae el diagnóstico');
  assert.deepEqual(Object.keys(r.operaciones).filter((t) => r.operaciones[t] > 0).length, 7);
  // Las fuentes de TSM, con su clase y lo que pone SnetForever en su lugar (las traducciones no cambian).
  const esperadas = {
    vendorsell: ['equivalente', undefined], dbminbuyout: ['aproximada', 'snfminimo'],
    dbmarket: ['aproximada', 'snfmercado'], dbregionmarketavg: ['aproximada', 'snfregional()'],
    dbhistorical: ['aproximada', 'snfhistorico'], dbregionsaleavg: ['faltante', undefined],
    smartavgbuy: ['faltante', undefined],
  };
  for (const [nombre, [clase, traduce]] of Object.entries(esperadas)) {
    const f = buscarFuente(d, nombre);
    assert.ok(f, `${nombre} sale en la lista`);
    assert.equal(f.clase, clase, nombre);
    assert.equal(f.traduce, traduce, nombre);
  }
  assert.equal(buscarFuente(d, 'base'), undefined, 'las fuentes propias van en su propia lista');
  assert.equal(buscarFuente(d, 'convert'), undefined, 'una función no es una fuente');
  // Fuentes propias: el ciclo, la que depende de algo que falta y las que usan estimaciones locales (también anidadas).
  const propias = Object.fromEntries(d.propias.map((p) => [p.nombre, p]));
  assert.equal(propias.anillo1.motivo, 'ciclo');
  assert.equal(propias.anillo2.clase, 'faltante');
  assert.equal(propias.regional.motivo, 'depende');
  assert.equal(propias.base.clase, 'aproximada');
  assert.equal(propias.honda.clase, 'aproximada');
  assert.equal(propias.suave.clase, 'aproximada', 'el mínimo puede venir de una foto distinta');
  // Operaciones: las que no calcularán, primero; con sus campos y cuántos grupos las usan.
  assert.equal(buscarOp(d, 'subasta', 'Venta').estado, 'faltante');
  assert.equal(buscarOp(d, 'subasta', 'Venta').grupos, 0, 'no la usa ningún grupo');
  const compra = buscarOp(d, 'compras', 'Compra');
  assert.equal(compra.estado, 'faltante');
  assert.equal(compra.conBase, true, 'la hereda todo desde el grupo base');
  assert.equal(compra.grupos, 5, 'el grupo base y los 4 grupos');
  assert.equal(compra.objetos, 8);
  assert.deepEqual(buscarCampo(compra, 'precioMaximo').fuentes.map((f) => [f.nombre, f.clase]), [['smartavgbuy', 'faltante']]);
  const taller = buscarOp(d, 'artesania', 'Taller');
  assert.equal(taller.estado, 'faltante');
  assert.deepEqual(buscarCampo(taller, 'valorFabricado').fuentes, [{ nombre: 'regional', clase: 'faltante', via: 'regional' }]);
  assert.equal(buscarCampo(taller, 'reponerMinimo').estado, 'faltante', 'el ciclo de fuentes propias');
  assert.equal(buscarCampo(taller, 'beneficioMinimo'), undefined, 'con el interruptor apagado no se juzga');
  const vender = buscarOp(d, 'vendedor', 'Vender');
  assert.equal(buscarCampo(vender, 'valorMercadoMaximo').error, 'funcion', 'una función que no existe no calcula');
  assert.equal(buscarCampo(vender, 'valorMercado').estado, 'aproximada');
  // Lo que actúa con estimaciones locales: directo, por un vínculo y por una fuente propia anidada.
  const directa = buscarOp(d, 'subasta', 'Directa');
  assert.equal(directa.estado, 'aproximada');
  assert.equal(directa.conBase, true);
  assert.equal(directa.grupos, 5, 'Telas`Finas no tiene lista propia: hereda la de Telas, como en TSM');
  assert.equal(directa.objetos, 8);
  const vin = buscarOp(d, 'subasta', 'Vinculada');
  assert.deepEqual([vin.grupos, vin.objetos, vin.conBase], [2, 5, false]);
  assert.equal(buscarCampo(directa, 'precioMaximo'), undefined, 'un importe es equivalente');
  const vinculada = buscarOp(d, 'subasta', 'Vinculada');
  assert.equal(vinculada.estado, 'aproximada');
  assert.equal(buscarCampo(vinculada, 'precioMinimo').vinculo, 'Directa');
  assert.deepEqual(buscarCampo(vinculada, 'precioMinimo').fuentes.map((f) => f.nombre), ['dbregionmarketavg']);
  assert.equal(buscarCampo(vinculada, 'precioNormal').estado, 'aproximada', 'suave usa el mínimo de otra foto');
  const caza = buscarOp(d, 'sniper', 'Caza');
  assert.deepEqual(buscarCampo(caza, 'precioMaximo').fuentes, [{ nombre: 'honda', clase: 'aproximada', via: 'honda' }]);
  assert.equal(buscarFuente(d, 'dbmarket').campos >= 3, true, 'cuenta también los usos a través de fuentes propias');
  // Lo que queda «bien»: el interruptor apagado (Correo) y las cantidades (Almacen) no salen.
  assert.equal(buscarOp(d, 'correo', 'Correo'), undefined);
  assert.equal(buscarOp(d, 'almacen', 'Almacen'), undefined);
  assert.equal(d.cuentas.vinculosCortados, 1, 'el círculo CirculoA <-> CirculoB pierde un vínculo, como al escribir');
  assert.deepEqual(d.cuentas.operaciones, { bien: 4, aproximada: 3, faltante: 4 });
  assert.deepEqual(d.cuentas.activas, { bien: 2, aproximada: 3, faltante: 3 });
  // El orden: primero lo que no calculará y, dentro, lo más usado.
  assert.deepEqual(d.operaciones.slice(0, 2).map((o) => o.nombre), ['Compra', 'Taller']);
  assert.ok(!JSON.stringify(r).includes('Kurgath'), 'nada de otros jugadores en el resumen');
  sinErrores(m);
});

test('la importación conserva las traducciones y una operación sin fuente indispensable no actúa', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.de = function(id) if id == 2589 then return {normal = 10000, precio = 9000, cantidad = 2} end end');
  m.lua('SnetForever.Precios.regional = function(id) if id == 2589 then return 11000 end end');
  const inf = importar(m, '{modo = "reemplazar"}');
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.comprobacion.bien, true, JSON.stringify(inf.comprobacion));
  // Compatibilidad: lo mismo que antes de esta entrega.
  assert.equal(m.lua(`${O}.valor("subasta", "Directa", "precioMinimo")`), '80% snfregional()');
  assert.equal(m.lua(`${O}.valor("subasta", "Directa", "precioNormal")`), 'snfhistorico');
  assert.equal(m.lua(`${F}.valor("snfhistorico", 2589)`), m.lua(`${F}.valor("snfmercado", 2589)`),
    'snfhistorico sigue leyendo lo mismo que snfmercado');
  // Directa calcula (con el precio regional de la app); Venta y Compra, no: sin propuesta.
  assert.equal(m.lua(`SnetForever.Vender.precios(2589, "Directa") ~= nil`), true);
  m.lua('SnetForever.Precios.regional = function() return nil, "sin-datos" end');
  assert.equal(m.lua(`SnetForever.Vender.precios(2589, "Directa") == nil`), true, 'sin precio regional, Directa no propone');
  assert.deepEqual(m.lua(`{SnetForever.Vender.precios(2589, "Venta") == nil, select(2, SnetForever.Vender.precios(2589, "Venta"))}`),
    [true, 'precioNormal', { c: 'fuente', a: 'dbregionsaleavg' }]);
  assert.equal(m.lua(`(${F}.compilar(${O}.valor("compras", "Compra", "precioMaximo")))`), undefined);
  assert.equal(m.lua(`(${F}.compilar(${O}.valor("sniper", "Caza", "precioMaximo"))) ~= nil`), true);
  // Lo que usa una fuente propia en círculo tampoco calcula.
  assert.equal(m.lua(`(${F}.compilar(${O}.valor("artesania", "Taller", "reponerMinimo")))`), undefined);
  sinErrores(m);
});

test('la vista previa enseña el diagnóstico entero y sin datos de otros jugadores', () => {
  const m = maquina();
  m.lua(`SnetForever.Principal.abrir("grupos")`);
  m.lua(`${G}.importarTSM()`);
  for (let i = 0; i < 500 && m.lua(`${I}.lectura().estado`) === 'leyendo'; i++) m.avanzar(0.05);
  const caja = m.lua(`${G}.texto.caja:GetText()`);
  const lineas = caja.split('\n');
  assert.equal(lineas[0], 'Diagnóstico de precios');
  assert.ok(lineas.includes('Operaciones: 4 sin diferencias, 3 actúan con estimaciones locales y 4 no calcularán (no actúan).'), caja);
  assert.match(caja, /• DBRegionMarketAvg → snfregional\(\), estimación local, en \d+ campos\. En TSM es la media de mercado de toda la región/);
  assert.match(caja, /• DBRegionSaleAvg, sin fuente, en \d+ campos\. En TSM es el precio medio de las ventas completadas/);
  assert.match(caja, /• SmartAvgBuy, sin fuente, en 1 campos\. En TSM es lo que te costó de media/);
  assert.match(caja, /• DBHistorical → snfhistorico, estimación local, en 1 campos\. .*snfhistorico, que sigue leyendo lo mismo que snfmercado .*snfhistoricodiario\(\): elígelo a mano/);
  assert.match(caja, /• «anillo1»: se usa a sí misma \(un círculo\): no calculará/);
  assert.match(caja, /• Compras › Compra \(5 grupos, 8 objetos, con el Grupo Base\): no calculará/);
  assert.match(caja, /– Valor de mercado máximo: dbmarket \(estimación local\), la fórmula no se puede calcular/);
  assert.match(caja, /– Precio mínimo: vinculado a «Directa»: dbregionmarketavg \(estimación local\)/);
  assert.match(caja, /– Precio máximo: honda \(estimación local\) \(por la fuente propia «honda»\)/);
  assert.match(caja, /Vínculos entre operaciones que harían un círculo y no se copian: 1/);
  assert.ok(!caja.includes('Kurgath'));
  // La parte de antes sigue debajo.
  assert.match(caja, /Operaciones: Subasta 5/);
  // Importar y mirar el informe final.
  m.lua(`${G}.texto.botonImportar:Click("LeftButton")`);
  for (let i = 0; i < 2000 && m.lua(`${I}.estado().estado`) !== 'hecho'; i++) m.avanzar(0.05);
  assert.equal(m.lua(`${I}.estado().estado`), 'hecho');
  assert.match(m.lua(`${G}.texto.caja:GetText()`), /Diagnóstico de precios \(Juntar\): 3 operaciones actúan con estimaciones locales y 4 no calcularán\./);
  sinErrores(m);
});

test('si TSM cambia entre la vista previa y la importación, no se escribe nada', () => {
  const m = maquina();
  const r = m.lua(`${I}.analizar()`);
  assert.equal(typeof r.huella, 'number');
  assert.equal(m.lua(`${I}.analizar().huella`), r.huella, 'leer otra vez sin cambios da la misma huella');
  // Una fórmula de TSM cambia mientras el jugador mira la vista previa.
  m.lua('TradeSkillMasterDB["p@Default@userData@operations"].Auctioning.Directa.minPrice = "80% dbmarket"');
  const inf = importar(m, `{modo = "juntar", huella = ${r.huella}}`);
  assert.equal(inf.estado, 'fallo');
  assert.match(inf.mensaje, /cambiaron desde la vista previa/);
  assert.equal(m.lua(`${A}.existe("Telas")`), false, 'ni grupos');
  assert.equal(m.lua(`${O}.existe("subasta", "Directa")`), false, 'ni operaciones');
  assert.equal(m.lua(`next(SnetForeverCuenta.comercio.v2.fuentes) == nil`), true, 'ni fuentes');
  // Una fuente propia tuya también cuenta: cambia cómo se traduce y se calcula.
  const r2 = m.lua(`${I}.analizar()`);
  m.lua(`${F}.ponerFuente("mia", "2 * vendorsell")`);
  assert.equal(importar(m, `{modo = "juntar", huella = ${r2.huella}}`).estado, 'fallo');
  // Con la huella de ahora, sí.
  const r3 = m.lua(`${I}.analizar()`);
  assert.equal(importar(m, `{modo = "juntar", huella = ${r3.huella}}`).estado, 'hecho');
  assert.equal(m.lua(`${O}.valor("subasta", "Directa", "precioMinimo")`), '80% snfmercado');
  sinErrores(m);
});

test('migración repetida: juntar dos veces no duplica ni reescribe lo guardado', () => {
  const m = maquina();
  // Lo del jugador antes de importar: una operación con el mismo nombre y otra fórmula, y una fuente propia que choca.
  m.lua(`${O}.crear("subasta", "Directa"); ${O}.poner("subasta", "Directa", "precioMinimo", "3 * vendorsell")`);
  m.lua(`${F}.ponerFuente("base", "vendorsell")`);
  const r = m.lua(`${I}.analizar()`);
  const base = r.diagnostico.propias.find((p) => p.nombre === 'base');
  assert.equal(base.choca, true, 'al juntar se usaría la fuente del jugador, con otra fórmula');
  assert.equal(base.motivo, 'choca');
  const primera = importar(m, `{modo = "juntar", huella = ${r.huella}}`);
  assert.equal(primera.estado, 'hecho');
  assert.equal(m.lua(`${O}.valor("subasta", "Directa", "precioMinimo")`), '3 * vendorsell', 'la del jugador no se toca');
  assert.equal(m.lua(`${O}.valor("subasta", "Directa 2", "precioMinimo")`), '80% snfregional()');
  assert.equal(m.lua(`${F}.fuentes().base`), 'vendorsell', 'su fuente propia tampoco');
  const operaciones = () => m.lua(`(function() local n = 0; for _, tipo in ipairs(${O}.ORDEN) do n = n + #${O}.lista(tipo) end; return n end)()`);
  const fuentes = () => m.lua(`(function() local n = 0; for _ in pairs(${F}.fuentes()) do n = n + 1 end; return n end)()`);
  const antes = { ops: operaciones(), fuentes: fuentes(), grupos: m.lua(`${A}.contar()`) };
  // Segunda vez: todo lo importado se reconoce y se reutiliza.
  const r2 = m.lua(`${I}.analizar()`);
  const segunda = importar(m, `{modo = "juntar", huella = ${r2.huella}}`);
  assert.equal(segunda.estado, 'hecho');
  assert.equal(segunda.comprobacion.bien, true, JSON.stringify(segunda.comprobacion));
  assert.deepEqual({ ops: operaciones(), fuentes: fuentes(), grupos: m.lua(`${A}.contar()`) }, antes);
  assert.equal(m.lua(`${O}.existe("subasta", "Directa 3")`), false);
  assert.equal(m.lua(`${O}.valor("subasta", "Directa", "precioMinimo")`), '3 * vendorsell');
  assert.deepEqual(r2.diagnostico.cuentas, { ...r.diagnostico.cuentas, vinculosCortados: 0 },
    'reusing the saved operations cuts no additional links');
  sinErrores(m);
});

test('Formulas: palabras, traduccion, reservado y probar no cambian nada guardado', () => {
  const m = nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA });
  assert.deepEqual(m.lua(`${F}.palabras("max(80% DBMarket, dbmarket(item:123), item:55, 1g 50s, first(Otra, vendorsell))")`),
    ['dbmarket', 'otra', 'vendorsell']);
  assert.equal(m.lua(`${F}.traduccion("DBRegionMarketAvg")`), 'snfregional()');
  assert.equal(m.lua(`${F}.traduccion("dbregionsaleavg")`), undefined);
  assert.deepEqual(m.lua('{SnetForever.DiagnosticoTSM.CATALOGO.itemquality[1], SnetForever.DiagnosticoTSM.CATALOGO.dbregionsaleavg[1], SnetForever.DiagnosticoTSM.CATALOGO.dbregionmarketavg[1]}'), ['faltante', 'faltante', 'aproximada']);
  assert.deepEqual(m.lua(`{${F}.reservado("first"), ${F}.reservado("snfmercado"), ${F}.reservado("minprecio")}`), [true, true, false]);
  assert.deepEqual(m.lua(`{${F}.probar("a + 1", {a = "b", b = "a"})}`), [false, { c: 'ciclo', a: 'a' }]);
  assert.deepEqual(m.lua(`{${F}.probar("a + 1", {a = "2 * vendorsell"})}`), [true]);
  assert.equal(m.lua(`next(SnetForeverCuenta.comercio and SnetForeverCuenta.comercio.v2 and SnetForeverCuenta.comercio.v2.fuentes or {}) == nil`), true);
  sinErrores(m);
});

// ---- Corrección de la entrega 1: el diagnóstico es el del modo elegido, y la huella ve cada objeto con su grupo ----

// Una operación de TSM cuyo mínimo nombra «localprecio», una fuente que solo existe en SnetForever (la del jugador), otra que
// la usa a través de una fuente propia de TSM y otra a través de una fuente tuya.
const CON_LOCAL = `
TradeSkillMasterDB["g@ @userData@customPriceSources"].indirecta = "localprecio * 2"
local ops = TradeSkillMasterDB["p@Default@userData@operations"].Auctioning
ops.Local = {minPrice = "localprecio", normalPrice = "10g", maxPrice = "20g", relationships = {}}
ops.Indirecta = {minPrice = "indirecta", normalPrice = "10g", maxPrice = "20g", relationships = {}}
ops.Mia = {minPrice = "mia", normalPrice = "10g", maxPrice = "20g", relationships = {}}
`;

function leerEnVentana(m) {
  m.lua(`SnetForever.Principal.abrir("grupos")`);
  m.lua(`${G}.importarTSM()`);
  for (let i = 0; i < 500 && m.lua(`${I}.lectura().estado`) === 'leyendo'; i++) m.avanzar(0.05);
  assert.equal(m.lua(`${I}.lectura().estado`), 'leido');
}

const ventana = (m) => m.lua(`(function()
  local t = ${G}.texto
  return {caja = t.caja:GetText(), apagado = t.botonImportar.snfApagado == true, aviso = t.aviso:GetText()}
end)()`);

function importarEnVentana(m) {
  m.lua(`${G}.texto.botonImportar:Click("LeftButton")`);
  for (let i = 0; i < 2000 && ['importando', 'pausado'].includes(m.lua(`${I}.estado().estado`)); i++) m.avanzar(0.05);
  return m.lua(`${I}.estado()`);
}

const guardarFuente = (m, nombre, texto) => m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.v2.fuentes[${q(nombre)}] = ${q(texto)}`);

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('reproducción: con una fuente que solo existe en SnetForever, Reemplazar enseña que el mínimo no calculará', () => {
  const m = maquina(CON_LOCAL);
  m.lua(`${F}.ponerFuente("localprecio", "2 * vendorsell"); ${F}.ponerFuente("mia", "localprecio + 1s")`);
  m.lua(`${A}.crear("", "Viejo")`); // ya hay grupos: se pregunta juntar o reemplazar
  const r = m.lua(`${I}.analizar()`);
  // Juntar: tus fuentes se quedan, el mínimo calcula igual que hoy.
  const dj = r.diagnosticos.juntar;
  assert.equal(dj.modo, 'juntar');
  assert.equal(buscarOp(dj, 'subasta', 'Local'), undefined, 'al juntar, «localprecio» es tuya y calcula');
  assert.equal(buscarOp(dj, 'subasta', 'Mia'), undefined, 'también a través de otra tuya');
  // Reemplazar: se parte sin fuentes tuyas. El mínimo de Local, el de Indirecta (por una fuente de TSM) y el de Mia no calculan.
  const dr = r.diagnosticos.reemplazar;
  assert.equal(dr.modo, 'reemplazar');
  for (const nombre of ['Local', 'Indirecta', 'Mia']) {
    const op = buscarOp(dr, 'subasta', nombre);
    assert.equal(op && op.estado, 'faltante', nombre);
    assert.equal(buscarCampo(op, 'precioMinimo').estado, 'faltante', nombre);
  }
  assert.equal(buscarCampo(buscarOp(dr, 'subasta', 'Local'), 'precioMinimo').error, 'fuente');
  assert.deepEqual(buscarCampo(buscarOp(dr, 'subasta', 'Indirecta'), 'precioMinimo').fuentes,
    [{ nombre: 'indirecta', clase: 'faltante', via: 'indirecta' }]);
  assert.equal(buscarFuente(dr, 'localprecio').motivo, 'apartada');
  assert.equal(buscarFuente(dr, 'mia').motivo, 'apartada');
  assert.equal(r.diagnostico.modo, 'juntar', 'diagnostico (sin modo) es el de Juntar, el que sale primero');
  assert.equal(dr.cuentas.operaciones.faltante, dj.cuentas.operaciones.faltante + 3, 'Local, Indirecta y Mia no calculan al reemplazar');

  // El flujo visible: primero Juntar; al pulsar Reemplazar, la misma caja enseña el diagnóstico de Reemplazar.
  leerEnVentana(m);
  let v = ventana(m);
  assert.match(v.caja, /^Diagnóstico de precios\nSi eliges Juntar:/);
  assert.doesNotMatch(v.caja, /Subasta › Local /);
  assert.equal(v.apagado, false);
  m.lua(`${G}.texto.radioModo.no:Click("LeftButton")`);
  v = ventana(m);
  assert.match(v.caja, /^Diagnóstico de precios\nSi eliges Reemplazar:/);
  assert.match(v.caja, /• Subasta › Local \(0 grupos, 0 objetos\): no calculará/);
  assert.match(v.caja, /– Precio mínimo: localprecio \(sin fuente\), la fórmula no se puede calcular/);
  assert.match(v.caja, /• localprecio, sin fuente, en \d+ campos\. Es una fuente propia tuya: al reemplazar pasa a la copia de antes/);
  assert.equal(v.apagado, false, 'lo que se ve es el diagnóstico de Reemplazar: se puede importar');
  // Y volver a Juntar lo devuelve.
  m.lua(`${G}.texto.radioModo.si:Click("LeftButton")`);
  assert.match(ventana(m).caja, /^Diagnóstico de precios\nSi eliges Juntar:/);
  m.lua(`${G}.texto.radioModo.no:Click("LeftButton")`);
  const inf = importarEnVentana(m);
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.modo, 'reemplazar');
  assert.equal(inf.esperado.diagnostico.modo, 'reemplazar');
  assert.deepEqual(inf.esperado.diagnostico.cuentas, dr.cuentas, 'el informe usa el diagnóstico revisado');
  const linea = `Diagnóstico de precios (Reemplazar): ${dr.cuentas.operaciones.aproximada} operaciones actúan con estimaciones `
    + `locales y ${dr.cuentas.operaciones.faltante} no calcularán.`;
  assert.match(ventana(m).caja, new RegExp(escapar(linea)));
  // Lo que dijo la vista previa es lo que pasa: «localprecio» ya no está y el mínimo no compila.
  assert.equal(m.lua(`${F}.fuentes().localprecio`), undefined);
  assert.equal(m.lua(`(${F}.compilar(${O}.valor("subasta", "Local", "precioMinimo")))`), undefined);
  sinErrores(m);
});

test('Juntar: el mínimo que usa tu fuente sigue calculando y el informe es el de Juntar', () => {
  const m = maquina(CON_LOCAL);
  m.lua(`${F}.ponerFuente("localprecio", "2 * vendorsell"); ${F}.ponerFuente("mia", "localprecio + 1s")`);
  m.lua(`${A}.crear("", "Viejo")`);
  leerEnVentana(m);
  const dj = m.lua(`${I}.lectura().resumen.diagnosticos.juntar`);
  const inf = importarEnVentana(m);
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.modo, 'juntar');
  assert.deepEqual(inf.esperado.diagnostico.cuentas, dj.cuentas);
  assert.match(ventana(m).caja, /Diagnóstico de precios \(Juntar\):/);
  assert.equal(m.lua(`${F}.fuentes().localprecio`), '2 * vendorsell');
  for (const nombre of ['Local', 'Indirecta', 'Mia']) {
    assert.equal(m.lua(`(${F}.compilar(${O}.valor("subasta", ${q(nombre)}, "precioMinimo"))) ~= nil`), true, nombre);
  }
  // Compatibilidad: las fórmulas traducidas son las de siempre.
  assert.equal(m.lua(`${O}.valor("subasta", "Directa", "precioMinimo")`), '80% snfregional()');
  assert.equal(m.lua(`${O}.valor("subasta", "Directa", "precioNormal")`), 'snfhistorico');
  sinErrores(m);
});

test('Juntar juzga tus fuentes de verdad: inválida, en círculo, que choca y a través de otras', () => {
  const m = maquina(CON_LOCAL);
  // Guardadas tal cual (de una versión anterior o tocadas a mano): ponerFuente no deja guardar una que no se entiende.
  guardarFuente(m, "localprecio", "first(("); // una fórmula que no se entiende
  guardarFuente(m, "mia", "localprecio + 1s"); // la usa
  m.lua(`${F}.ponerFuente("base", "vendorsell")`); // choca con «base» de TSM
  const r = m.lua(`${I}.analizar()`);
  const dj = r.diagnosticos.juntar;
  const propias = Object.fromEntries(dj.propias.map((p) => [p.nombre, p]));
  assert.deepEqual([propias.localprecio.motivo, propias.localprecio.tuya, propias.localprecio.clase], ['invalida', true, 'faltante']);
  assert.deepEqual([propias.mia.motivo, propias.mia.tuya], ['invalida', true], 'usa una tuya rota: tampoco se puede calcular');
  assert.deepEqual([propias.base.motivo, propias.base.choca, propias.base.tuya, propias.base.clase], ['choca', true, true, 'aproximada']);
  for (const nombre of ['Local', 'Indirecta', 'Mia']) {
    const campo = buscarCampo(buscarOp(dj, 'subasta', nombre), 'precioMinimo');
    assert.equal(campo.estado, 'faltante', nombre);
    assert.equal(campo.error, 'fuente_rota', nombre);
  }
  assert.deepEqual(buscarCampo(buscarOp(dj, 'subasta', 'Mia'), 'precioMinimo').fuentes,
    [{ nombre: 'mia', clase: 'faltante', via: 'mia' }]);
  assert.deepEqual(buscarCampo(buscarOp(dj, 'subasta', 'Indirecta'), 'precioMinimo').fuentes,
    [{ nombre: 'indirecta', clase: 'faltante', via: 'indirecta' }]);
  // Las tuyas no salen como fuentes sueltas: se cuentan sus hojas.
  assert.equal(buscarFuente(dj, 'localprecio'), undefined);
  assert.equal(buscarFuente(dj, 'base'), undefined);
  // Reemplazar no tiene nada tuyo: «base» es la de TSM (estimación local, sin choque) y las tuyas faltan.
  const dr = r.diagnosticos.reemplazar;
  const pr = Object.fromEntries(dr.propias.map((p) => [p.nombre, p]));
  assert.deepEqual([pr.base.choca, pr.base.tuya, pr.base.clase], [false, false, 'aproximada']);
  assert.equal(pr.localprecio, undefined);
  assert.equal(buscarFuente(dr, 'localprecio').motivo, 'apartada');
  // Un círculo entre fuentes tuyas.
  const m2 = maquina(CON_LOCAL);
  guardarFuente(m2, "localprecio", "mia * 2");
  guardarFuente(m2, "mia", "localprecio + 1s");
  const d2 = m2.lua(`${I}.analizar()`).diagnosticos.juntar;
  assert.equal(d2.propias.find((p) => p.nombre === 'localprecio').motivo, 'ciclo');
  assert.equal(buscarCampo(buscarOp(d2, 'subasta', 'Local'), 'precioMinimo').estado, 'faltante');
  // La vista previa lo dice con «(tuya)».
  leerEnVentana(m);
  const caja = ventana(m).caja;
  assert.match(caja, /• «localprecio» \(tuya\): su fórmula no se puede calcular/);
  assert.match(caja, /• «base» \(tuya\): ya tienes una con ese nombre y otra fórmula: al juntar se usa la tuya/);
  sinErrores(m);
  sinErrores(m2);
});

test('Juntar distingue el uso en el perfil de TSM del que queda con tus listas de operaciones', () => {
  const m = maquina();
  // Telas ya existe con su lista de Subasta (una operación tuya): al juntar se queda, y Telas`Finas la hereda.
  m.lua(`${O}.crear("subasta", "Propia"); ${A}.crear("", "Telas"); ${O}.ponerDeGrupo("Telas", "subasta", {"Propia"})`);
  const r = m.lua(`${I}.analizar()`);
  const vj = buscarOp(r.diagnosticos.juntar, 'subasta', 'Vinculada');
  assert.deepEqual([vj.grupos, vj.objetos, vj.conBase], [2, 5, false], 'en el perfil de TSM: Telas y Telas`Finas');
  assert.deepEqual(vj.efectivo, { grupos: 0, objetos: 0, conBase: false }, 'al juntar se queda tu lista en los dos');
  assert.equal(vj.conservan, 2);
  const dirj = buscarOp(r.diagnosticos.juntar, 'subasta', 'Directa');
  assert.deepEqual([dirj.grupos, dirj.efectivo.grupos, dirj.conservan], [5, 3, 2]);
  assert.equal(r.diagnosticos.juntar.cuentas.conservan, 4);
  // Reemplazar: el uso efectivo es el del perfil.
  const vr = buscarOp(r.diagnosticos.reemplazar, 'subasta', 'Vinculada');
  assert.deepEqual(vr.efectivo, { grupos: vr.grupos, objetos: vr.objetos, conBase: vr.conBase });
  assert.equal(vr.conservan, 0);
  // La vista previa de Juntar lo dice debajo de la operación.
  leerEnVentana(m);
  const caja = ventana(m).caja;
  assert.match(caja, /• Subasta › Vinculada \(2 grupos, 5 objetos\): actúa con estimaciones locales\n {3}al juntar, en 2 de esos grupos se queda tu lista: actuará en 0 grupos y 0 objetos/);
  assert.match(caja, /Usadas al juntar en los grupos del perfil de TSM:/);
  // Y es lo que pasa al juntar: Operaciones.usos cuenta lo mismo que el uso efectivo.
  const inf = importarEnVentana(m);
  assert.equal(inf.estado, 'hecho');
  assert.deepEqual(m.lua(`{${O}.usos("subasta", "Vinculada")}`), [0, 0, false]);
  assert.deepEqual(m.lua(`{${O}.usos("subasta", "Directa")}`), [dirj.efectivo.grupos, dirj.efectivo.objetos, dirj.efectivo.conBase]);
  assert.deepEqual(m.lua(`(${O}.deGrupo("Telas", "subasta"))`), ['Propia']);
  sinErrores(m);
});

test('Importar se apaga si lo que se ve no es el diagnóstico del modo elegido', () => {
  const m = maquina(CON_LOCAL);
  m.lua(`${A}.crear("", "Viejo")`);
  leerEnVentana(m);
  // Sin el diagnóstico de Reemplazar (una lectura que no lo trae), elegir Reemplazar no deja importar.
  m.lua(`${I}.lectura().resumen.diagnosticos.reemplazar = nil`);
  m.lua(`${G}.texto.radioModo.no:Click("LeftButton")`);
  const v = ventana(m);
  assert.equal(v.apagado, true);
  assert.doesNotMatch(v.caja, /Si eliges Juntar/, 'no se enseña el de otro modo');
  m.lua(`${G}.texto.botonImportar:Click("LeftButton")`);
  assert.equal(m.lua(`${I}.estado()`), undefined, 'no empezó');
  m.lua(`${G}.texto.radioModo.si:Click("LeftButton")`);
  assert.equal(ventana(m).apagado, false);
  sinErrores(m);
});

test('huella: cambiar de grupo dos objetos con las mismas cuentas por grupo (nombres del mismo largo) se nota', () => {
  const m = maquina();
  const r = m.lua(`${I}.analizar()`);
  // Telas y Metal tienen 5 letras y 2 objetos cada uno: se cambian i:2589 y i:2770 y las cuentas siguen iguales.
  m.lua('local o = TradeSkillMasterDB["p@Default@userData@items"]; o["i:2589"], o["i:2770"] = "Metal", "Telas"');
  const r2 = m.lua(`${I}.analizar()`);
  assert.equal(r2.objetos, r.objetos);
  assert.notEqual(r2.huella, r.huella);
  const inf = importar(m, `{modo = "reemplazar", huella = ${r.huella}}`);
  assert.equal(inf.estado, 'fallo');
  assert.match(inf.mensaje, /cambiaron desde la vista previa/);
  assert.equal(m.lua(`${A}.existe("Telas")`), false, 'no se escribió nada');
  assert.equal(m.lua(`${A}.contar()`), 0);
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2._antes == nil'), true, 'ni siquiera se apartó lo anterior');
  // Deshacer el cambio devuelve la misma huella (no depende del orden de lectura).
  m.lua('local o = TradeSkillMasterDB["p@Default@userData@items"]; o["i:2589"], o["i:2770"] = "Telas", "Metal"');
  assert.equal(m.lua(`${I}.analizar()`).huella, r.huella);
  // Una lista de operaciones tuya también cuenta: decide el uso efectivo al juntar.
  m.lua(`${O}.crear("subasta", "Propia"); ${A}.crear("", "Telas")`);
  const r3 = m.lua(`${I}.analizar()`);
  m.lua(`${O}.ponerDeGrupo("Telas", "subasta", {"Propia"})`);
  assert.notEqual(m.lua(`${I}.analizar()`).huella, r3.huella);
  // Los campos locales cambian qué operaciones se podrán reutilizar, aunque sus listas sigan iguales.
  const r4 = m.lua(`${I}.analizar()`);
  m.lua(`${O}.poner("subasta", "Propia", "precioMinimo", "19g")`);
  assert.equal(importar(m, `{modo = "juntar", huella = ${r4.huella}}`).estado, 'fallo');
  sinErrores(m);
});
const luaLista = (pares) => `{${pares.map(([a, b]) => `{${q(a)}, ${q(b)}}`).join(", ")}}`;

test('huella: la mezcla no se cancela al permutar destinos', () => {
  const m = nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA });
  const D = 'SnetForever.DiagnosticoTSM';
  const suma = (pares) => m.lua(`(function() local h, memo = 0, {}; for _, p in ipairs(${luaLista(pares)}) do
    h = ${D}.sumar(h, ${D}.par(p[1], p[2], memo)) end; return h end)()`);
  const a = suma([['i:1', 'Ab'], ['i:2', 'Cd'], ['i:3', 'Ab']]);
  assert.equal(suma([['i:3', 'Ab'], ['i:2', 'Cd'], ['i:1', 'Ab']]), a, 'el orden no importa');
  assert.notEqual(suma([['i:2', 'Ab'], ['i:1', 'Cd'], ['i:3', 'Ab']]), a, 'cambiar los destinos sí');
  assert.notEqual(suma([['i:1', 'Ab'], ['i:3', 'Cd'], ['i:2', 'Ab']]), a);
  sinErrores(m);
});

test('preview flags invalid unused sources and respects retained links in a cycle', () => {
  const m = maquina();
  m.lua(`local sources = TradeSkillMasterDB["g@ @userData@customPriceSources"]
    sources.broken = "convert(dbmarket)"
    sources.syntax = "1 +"
    local ops = TradeSkillMasterDB["p@Default@userData@operations"].Auctioning
    ops.CirculoA = {minPrice="dbregionsaleavg",relationships={minPrice="CirculoB"}}
    ops.CirculoB = {minPrice="2g",relationships={minPrice="CirculoA"}}`);
  const first = importar(m);
  assert.equal(first.estado, 'hecho');
  const localOps = 'SnetForeverCuenta.comercio.v2.operaciones.subasta';
  m.lua(`${localOps}.CirculoA.vinculos = nil
    ${localOps}.CirculoB.vinculos = {precioMinimo="CirculoA"}`);
  const report = m.lua(`${I}.analizar()`).diagnosticos.juntar;
  for (const source of ['broken','syntax']) {
    assert.equal(report.propias.find(row => row.nombre === source).clase, 'faltante');
  }
  for (const name of ['CirculoA','CirculoB']) {
    assert.equal(buscarCampo(buscarOp(report,'subasta',name),'precioMinimo').estado, 'faltante');
  }
  sinErrores(m);
});

test('renamed cyclic imports follow the retained local minimum price', () => {
  const m = maquina();
  m.lua(`local ops = TradeSkillMasterDB["p@Default@userData@operations"].Auctioning
    ops.CirculoA = {minPrice="1g",relationships={minPrice="CirculoB"}}
    ops.CirculoB = {minPrice="2g",relationships={minPrice="CirculoA"}}
    assert(${O}.crear("subasta", "CirculoA"))
    local saved = SnetForeverCuenta.comercio.v2.operaciones.subasta.CirculoA
    saved.vinculos = {precioMinimo="Deleted"}
    saved.valores = {precioMinimo="missingprice"}`);
  const report = m.lua(`${I}.analizar()`).diagnosticos.juntar;
  for (const name of ['CirculoA','CirculoB']) {
    assert.equal(buscarCampo(buscarOp(report,'subasta',name),'precioMinimo').estado, 'faltante');
  }
  sinErrores(m);
});
