// Fase 2 del plan de paridad con TSM: el coste medio de lo que tienes según tus compras (Contabilidad.costeMedio y la fuente
// snfcostemedio()). Se comprueba:
//   · toma las compras más recientes de ese id hasta cubrir lo que cuenta el inventario de los personajes del reino, y un
//     lote que sobra cuenta solo por las unidades que cubre;
//   · nunca empareja por nombre, ni suma otro reino, ni una compra marcada como variante; dos recibos iguales son dos compras;
//   · sin unidades, con bancos o buzones sin ver, sin compras o con compras que no cubren lo que tienes, no hay valor y dice
//     por qué; una variante, una mascota o un objeto que no se apila tampoco;
//   · smartavgbuy, snfmercado y las traducciones de TSM no cambian, y una fuente propia ya guardada con ese nombre sigue;
//   · el resultado se guarda y solo se rehace si cambia la contabilidad o lo que tienes, y es el mismo con otro orden;
//   · el recibo apunta si el objeto comprado lleva variante, sin tocar lo que ya había;
//   · el tooltip, con la línea encendida, lo enseña con su cobertura o con la razón.
// Todo lo de aquí es inventado.
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const HILO = 2589; // se apila
const ESPADA = 2000; // no se apila
const LANA = 2592; // otro objeto que se apila
const jugador = { nombre: 'Zula', reino: 'Normal', faccion: 'Horde', clase: 'MAGE', idioma: 'esES' };

// Una compra tal como la guarda la contabilidad (un recibo por carta), con la evidencia de una carta de un adjunto que
// lo prueba todo. `antigua` es un recibo de antes de guardar evidencia.
const pruebas = (item, quantity, { variante = false, factura = quantity, tarde = false } = {}) =>
  `evidence = {v = 1, attachments = 1, invoiceUnits = ${factura ?? 'nil'}, slots = {{slot = 1, id = ${item}, ` +
  `linkId = ${item}, count = ${quantity}, variant = ${variante}}}${tarde ? ', late = true' : ''}}`;
const antigua = (item, quantity, gross, expires, extra = '') =>
  `{kind = "purchase", name = "Paño de lino", item = ${item}, quantity = ${quantity}, gross = ${gross}, expires = ${expires}, seen = 1${extra}}`;
const compra = (item, quantity, gross, expires, opciones = {}) =>
  antigua(item, quantity, gross, expires, `${opciones.variante ? ', variant = true' : ''}, ${pruebas(item, quantity, opciones)}`);

const BASE = {
  'Zula-Normal': [
    compra(HILO, 10, 1000, 1000), // la más vieja: 100 c cada una
    compra(HILO, 5, 1000, 3000), // la más nueva: 200 c cada una
    '{kind = "sale", name = "Paño de lino", item = 2589, quantity = 4, gross = 900, deposit = 0, fee = 45, net = 855, expires = 3500, seen = 1}',
    `{kind = "purchase", name = "Paño de lino", quantity = 3, gross = 30, expires = 3600, seen = 1}`, // sin id: no cuenta
    compra(HILO, 7, 7, 3700, { variante: true }), // otra variante (probada): no cuenta
  ],
  'Alt-Normal': [compra(HILO, 5, 750, 2000)], // 150 c cada una
  'Zula-Lejano': [compra(HILO, 50, 50, 9000)], // otro reino: no cuenta
};

function luaLedger(ledger) {
  return `{${Object.entries(ledger).map(([k, rows]) => `[${JSON.stringify(k)}] = {${rows.join(', ')}}`).join(', ')}}`;
}

// Zula lleva `bolsas` hilos y la Alt (del mismo reino) `alt` en el banco. Todos los bancos y buzones ya se han visto.
function maquina({ bolsas = 12, alt = 0, ledger = BASE, altSinBanco = false } = {}) {
  const m = nuevaMaquina({ jugador });
  m.itemInfo(HILO, { nombre: 'Paño de lino', calidad: 1, apilado: 20 });
  m.itemInfo(ESPADA, { nombre: 'Espada', calidad: 2, apilado: 1 });
  if (bolsas > 0) { m.bolsa(0, 1, { id: HILO, n: bolsas }); m.objeto(HILO, bolsas); }
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua(`SnetForever.Guardado.preparar()
    local inv = SnetForeverCuenta.comercio.inventario
    inv.pj["Zula-Normal"].banco, inv.pj["Zula-Normal"].correo = {}, {}
    inv.pj["Alt-Normal"] = {nombre = "Alt", reino = "Normal", bolsas = {}, banco = ${altSinBanco ? 'nil' : `{[${HILO}] = ${alt}}`}, correo = {}}
    SnetForever.InventarioCuenta.olvidarOrden()
    SnetForeverCuenta.comercio.ledger = ${luaLedger(ledger)}`);
  return m;
}

const coste = (m, item) => m.lua(`return SnetForever.Contabilidad.costeMedio(${JSON.stringify(item)})`);
const valor = (m, texto, item) => m.lua(`local v, e = SnetForever.Formulas.valor(${JSON.stringify(texto)}, ${JSON.stringify(item)})
  return {v = v, e = e and SnetForever.Formulas.mensaje(e)}`) || {};
const sinColores = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '').replace(/\|T[^|]*\|t/g, '^');
const lineas = (m, id) => { m.tooltipObjeto(id); return m.detalleTooltip().map((x) => [sinColores(x.izq), sinColores(x.der)]); };
const fila = (l, izq) => l.find(([i]) => i === izq);

test('las compras más recientes cubren lo que tienes, con el lote viejo solo en parte', () => {
  const m = maquina();
  const r = coste(m, HILO);
  // 5 a 200 (la más nueva), 5 a 150 (la Alt) y 2 de las 10 a 100: 1950 / 12.
  assert.equal(r.razon, undefined);
  assert.equal(r.valor, 1950 / 12);
  assert.equal(r.existencias, 12);
  assert.equal(r.cubiertas, 12);
  assert.deepEqual(r.partidas, [
    { unidades: 5, lote: 5, unitario: 200, caduca: 3000 },
    { unidades: 5, lote: 5, unitario: 150, caduca: 2000 },
    { unidades: 2, lote: 10, unitario: 100, caduca: 1000 },
  ]);
  assert.deepEqual(r.compras, { partidas: 3, unidades: 20 }, 'solo las de este reino, este id y sin variante');
  assert.deepEqual(r.excluidas, { variante: 1, rotas: 0 });
  assert.deepEqual(r.sinPruebas, { partidas: 0, antes: 0, motivos: [] }, 'motivos es una tabla vacía');
  assert.deepEqual(r.sinObjeto, { partidas: 1, unidades: 3 }, 'el recibo sin id se cuenta aparte, nunca en el coste');
  assert.equal(r.falta, undefined);
  assert.equal(valor(m, 'snfcostemedio()', HILO).v, 1950 / 12);
  assert.equal(valor(m, 'snfcostemedio()', `i:${HILO}`).v, 1950 / 12, 'la clave base vale');
  assert.equal(m.lua(`SnetForever.Formulas.cobre(SnetForever.Formulas.valor("snfcostemedio()", ${HILO}))`), 162);
  sinErrores(m);
});

test('lo del banco de otro personaje del reino cuenta como existencias', () => {
  const m = maquina({ bolsas: 5, alt: 10 });
  const r = coste(m, HILO);
  assert.equal(r.existencias, 15);
  assert.equal(r.valor, (1000 + 750 + 500) / 15);
  sinErrores(m);
});

test('sin cobertura no hay valor y dice por qué', () => {
  const pocas = maquina({ bolsas: 30 });
  const r = coste(pocas, HILO);
  assert.equal(r.valor, undefined);
  assert.equal(r.razon, 'compras-insuficientes');
  assert.equal(r.cubiertas, 20);
  assert.equal(r.existencias, 30);
  assert.equal(valor(pocas, 'snfcostemedio()', HILO).v, undefined);
  assert.equal(valor(pocas, 'snfcostemedio()', HILO).e, undefined, 'es «sin valor», no un error');
  assert.equal(valor(pocas, 'first(snfcostemedio(), 5s)', HILO).v, 500);
  sinErrores(pocas);

  const sinVer = maquina({ altSinBanco: true });
  const s = coste(sinVer, HILO);
  assert.equal(s.razon, 'existencias-incompletas');
  assert.deepEqual(s.falta, { bancos: 1, correos: 0, bancoCuenta: false });
  sinErrores(sinVer);

  const nada = maquina({ bolsas: 0 });
  assert.equal(coste(nada, HILO).razon, 'sin-existencias');
  sinErrores(nada);

  const sinCompras = maquina({ ledger: { 'Zula-Normal': [antigua(HILO, 3, 30, 10, ', variant = true')] } });
  assert.equal(coste(sinCompras, HILO).razon, 'sin-compras', 'una compra de otra variante no es una compra de esto');
  sinErrores(sinCompras);
});

test('variantes, mascotas y objetos que no se apilan no tienen coste', () => {
  const m = maquina();
  assert.equal(coste(m, `i:${HILO}::1:3`).razon, 'variante');
  assert.equal(coste(m, 'p:1124:10:3').razon, 'variante');
  assert.equal(coste(m, ESPADA).razon, 'no-apilable');
  assert.equal(coste(m, 7777).razon, 'sin-info', 'el cliente aún no tiene el objeto');
  assert.equal(valor(m, 'snfcostemedio()', `i:${HILO}::1:3`).v, undefined);
  assert.equal(valor(m, `snfcostemedio(item:${HILO})`, `i:${HILO}::1:3`).v, 1950 / 12, 'item:N es el objeto base');
  sinErrores(m);
});

test('smartavgbuy, snfmercado y las traducciones no cambian; una fuente propia con ese nombre se conserva', () => {
  const m = maquina();
  const t = m.lua('local t, n, d = SnetForever.Formulas.traducir("SmartAvgBuy + DBMarket") return {t = t, n = n, d = d}');
  assert.deepEqual(t, { t: 'SmartAvgBuy + snfmercado', n: 1, d: ['SmartAvgBuy'] }, 'SmartAvgBuy no pasa solo al coste nuevo');
  assert.match(valor(m, 'smartavgbuy', HILO).e ?? '', /smartavgbuy/i, 'sigue sin fuente');
  m.lua('SnetForeverCuenta.comercio.v2.fuentes.snfcostemedio = "2s"');
  assert.equal(valor(m, 'snfcostemedio', HILO).v, 200);
  assert.equal(valor(m, 'snfcostemedio()', HILO).v, 1950 / 12);
  assert.deepEqual(m.lua('return SnetForever.Formulas.palabras("snfcostemedio() + snfcostemedio")'), ['snfcostemedio'],
    'con paréntesis es la fuente de la app; sin ellos, la propia');
  sinErrores(m);
});

test('el resultado se guarda y solo se rehace si cambia la contabilidad o lo que tienes', () => {
  const m = maquina();
  assert.equal(m.lua(`local C = SnetForever.Contabilidad return rawequal(C.costeMedio(${HILO}), C.costeMedio(${HILO}))`), true,
    'el mismo resultado, sin recorrer la contabilidad otra vez');
  m.lua(`table.insert(SnetForeverCuenta.comercio.ledger["Zula-Normal"], ${compra(HILO, 12, 12000, 5000)})`);
  assert.equal(coste(m, HILO).valor, 1000, 'una compra nueva lo rehace');
  m.objeto(HILO, 6);
  assert.equal(coste(m, HILO).valor, 1000);
  assert.equal(coste(m, HILO).existencias, 6, 'lo que tienes cambia el resultado');
  sinErrores(m);
});

test('el mismo resultado con otro orden, y dos recibos iguales son dos compras', () => {
  const al = maquina({ ledger: { 'Alt-Normal': BASE['Alt-Normal'], 'Zula-Normal': [...BASE['Zula-Normal']].reverse() } });
  const r = coste(al, HILO);
  assert.equal(r.valor, 1950 / 12);
  assert.deepEqual(r.partidas.map((p) => p.caduca), [3000, 2000, 1000]);
  sinErrores(al);

  const dos = maquina({ bolsas: 4, ledger: { 'Zula-Normal': [compra(HILO, 2, 200, 50), compra(HILO, 2, 200, 50)] } });
  const d = coste(dos, HILO);
  assert.equal(d.valor, 100);
  assert.equal(d.partidas.length, 2);
  sinErrores(dos);
});

// Un buzón falso como el del cliente. Cada carta: {factura (unidades de la factura, null si no las da), oro,
// adjuntos (lo que dice la cabecera, null si no lo da), huecos = [{id, n, enlace (id del enlace, null sin enlace),
// variante}] en orden de hueco (null = hueco vacío), nombre}. El vendedor nunca se guarda.
const LINK_BASE = (id) => `|cffffffff|Hitem:${id}::::::::70:::::|h[x]|h|r`;
const LINK_VARIANTE = (id) => `|cffffffff|Hitem:${id}::::::::70::::1:3524|h[x]|h|r`;
function luaCarta(c) {
  const huecos = (c.huecos ?? []).map((h) => (h ? `{id = ${h.id ?? 'nil'}, n = ${h.n ?? 'nil'}, ` +
    `enlace = ${h.enlace === null ? 'nil' : JSON.stringify((h.variante ? LINK_VARIANTE : LINK_BASE)(h.enlace ?? h.id))}}` : 'false'));
  return `{factura = ${c.factura ?? 'nil'}, oro = ${c.oro}, adjuntos = ${c.adjuntos === undefined ? (c.huecos ?? []).filter(Boolean).length : (c.adjuntos ?? 'nil')}, ` +
    `nombre = ${JSON.stringify(c.nombre ?? 'Paño de lino')}, dias = ${c.dias ?? 29}, huecos = {${huecos.join(', ')}}}`;
}
function buzonFalso(m, cartas) {
  m.lua(`
    local CARTAS = {${cartas.map(luaCarta).join(', ')}}
    BUZON_CARTAS = CARTAS
    local function hueco(i, s) local c = CARTAS[i] local h = c and c.huecos[s] return h or nil end
    rawset(_G, "GetInboxNumItems", function() return #BUZON_CARTAS end)
    rawset(_G, "GetInboxHeaderInfo", function(i)
      local c = BUZON_CARTAS[i]
      return nil, nil, "NeverPersistThisSeller", "Won", 0, 0, c.dias, c.adjuntos
    end)
    rawset(_G, "GetInboxInvoiceInfo", function(i)
      local c = BUZON_CARTAS[i]
      return "buyer", c.nombre, "NeverPersistThisSeller", c.oro, 0, 0, 0, 0, 0, 0, c.factura
    end)
    rawset(_G, "GetInboxItem", function(i, s)
      local c = BUZON_CARTAS[i] local h = c and c.huecos[s or 1]
      if h then return c.nombre, h.id, 1, h.n, 1, true end
    end)
    rawset(_G, "GetInboxItemLink", function(i, s)
      local c = BUZON_CARTAS[i] local h = c and c.huecos[s or 1]
      if h then return h.enlace end
    end)`);
}
const abrirBuzon = (m) => { m.disparar('MAIL_SHOW'); m.disparar('MAIL_INBOX_UPDATE'); m.disparar('MAIL_CLOSED'); };
const filasDe = (m) => m.lua('return SnetForeverCuenta.comercio.ledger["Zula-Normal"]') ?? [];
function maquinaBuzon(cartas, { bolsas = 0 } = {}) {
  const m = nuevaMaquina({ jugador });
  m.itemInfo(HILO, { nombre: 'Paño de lino', calidad: 1, apilado: 20 });
  m.itemInfo(LANA, { nombre: 'Paño de lana', calidad: 1, apilado: 20 });
  if (bolsas > 0) { m.bolsa(0, 1, { id: HILO, n: bolsas }); m.objeto(HILO, bolsas); }
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua(`SnetForever.Guardado.preparar()
    local inv = SnetForeverCuenta.comercio.inventario
    inv.pj["Zula-Normal"].banco, inv.pj["Zula-Normal"].correo = {}, {}
    SnetForever.InventarioCuenta.olvidarOrden()`);
  buzonFalso(m, cartas);
  return m;
}
// Lo que tiene Zula: n hilos en las bolsas (el buzón ya está vacío cuando se pregunta).
function tener(m, n) {
  m.lua(`rawset(_G, "GetInboxNumItems", function() return 0 end)`);
  m.disparar('MAIL_SHOW'); m.disparar('MAIL_INBOX_UPDATE'); m.disparar('MAIL_CLOSED');
  m.bolsa(0, 1, { id: HILO, n }); m.objeto(HILO, n);
}

test('el recibo guarda la evidencia y la variante; al reabrir no duplica y lo que ya había no cambia', () => {
  const cartas = [
    { factura: 4, oro: 400, huecos: [{ id: HILO, n: 4 }] },
    { factura: 3, oro: 900, huecos: [{ id: HILO, n: 3, variante: true }] },
  ];
  const m = maquinaBuzon(cartas);
  abrirBuzon(m);
  abrirBuzon(m);
  const filas = filasDe(m);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas.map((f) => [f.quantity, f.gross, f.variant]), [[4, 400, false], [3, 900, true]]);
  assert.deepEqual(filas[0].evidence, { v: 1, attachments: 1, invoiceUnits: 4,
    slots: [{ slot: 1, id: HILO, linkId: HILO, count: 4, variant: false }] });
  assert.doesNotMatch(JSON.stringify(filas), /NeverPersistThisSeller/);
  sinErrores(m);

  // Un recibo de antes (sin `variant` ni evidencia): se reconoce, se le añade y nada más cambia.
  const antes = maquinaBuzon([cartas[0]]);
  abrirBuzon(antes);
  antes.lua(`for _, f in ipairs(SnetForeverCuenta.comercio.ledger["Zula-Normal"]) do f.variant, f.evidence = nil, nil end`);
  const guardadas = filasDe(antes);
  abrirBuzon(antes);
  const despues = filasDe(antes);
  assert.deepEqual(despues, guardadas.map((f) => ({ ...f, variant: false,
    evidence: { ...filas[0].evidence, late: true } })));
  sinErrores(antes);
});

test('una compra antigua sin evidencia no da coste, se cuenta y el libro no cambia', () => {
  // La reproducción de la revisión: id, 2 unidades, 500 c y variant = nil daba 250 c/ud.
  const m = maquina({ bolsas: 2, ledger: { 'Zula-Normal': [antigua(HILO, 2, 500, 100)] } });
  const r = coste(m, HILO);
  assert.equal(r.valor, undefined);
  assert.equal(r.razon, 'faltan-datos');
  assert.deepEqual(r.sinPruebas, { partidas: 1, antes: 1, motivos: { 'sin-pruebas': 1 } });
  assert.equal(r.cubiertas, 0);
  assert.equal(valor(m, 'snfcostemedio()', HILO).v, undefined);
  const t = m.lua('return SnetForever.Contabilidad.totales()');
  assert.equal(t.bought, 2, 'las cifras del libro no cambian');
  assert.equal(t.purchases, 500);
  assert.equal(m.lua('return #SnetForever.Contabilidad.lista()'), 1, 'el recibo se conserva');
  sinErrores(m);
});

test('un recibo reciente sin pruebas del mismo id no deja usar compras viejas; uno más viejo que el corte sí', () => {
  const reciente = maquina({ bolsas: 5, ledger: { 'Zula-Normal': [compra(HILO, 10, 1000, 1000), antigua(HILO, 5, 5000, 3000)] } });
  const r = coste(reciente, HILO);
  assert.equal(r.razon, 'faltan-datos', 'las 10 viejas cubrirían las 5, pero la compra nueva sin datos va antes');
  assert.equal(r.valor, undefined);
  assert.deepEqual(r.sinPruebas, { partidas: 1, antes: 1, motivos: { 'sin-pruebas': 1 } });
  assert.deepEqual(r.compras, { partidas: 1, unidades: 10 });
  sinErrores(reciente);

  const vieja = maquina({ bolsas: 5, ledger: { 'Zula-Normal': [antigua(HILO, 5, 5000, 1000), compra(HILO, 10, 1000, 3000)] } });
  const v = coste(vieja, HILO);
  assert.equal(v.valor, 100, 'la nueva cubre lo que tienes antes de llegar a la vieja');
  assert.deepEqual(v.sinPruebas, { partidas: 1, antes: 0, motivos: { 'sin-pruebas': 1 } });
  sinErrores(vieja);

  // Una variante probada es otro objeto: no tapa ni bloquea.
  const variante = maquina({ bolsas: 5, ledger: { 'Zula-Normal': [compra(HILO, 10, 1000, 1000), compra(HILO, 5, 5000, 3000, { variante: true })] } });
  assert.equal(coste(variante, HILO).valor, 100);
  sinErrores(variante);
});

test('una carta con varios adjuntos usa el lote entero cuando coincide con la factura', () => {
  // Tres montones de 20 por 6000 c: 100 c cada uno, no 300 (que daría tomar solo el primer adjunto).
  const tres = (factura) => ({ factura, oro: 6000, huecos: [{ id: HILO, n: 20 }, { id: HILO, n: 20 }, { id: HILO, n: 20 }] });
  for (const factura of [60, null]) {
    const m = maquinaBuzon([tres(factura)]);
    abrirBuzon(m);
    const [f] = filasDe(m);
    assert.equal(f.quantity, factura ?? 20, 'quantity sigue como antes: la factura o el primer adjunto');
    tener(m, 45);
    const r = coste(m, HILO);
    if (factura) {
      assert.equal(r.valor, 100);
      assert.deepEqual(r.partidas, [{ unidades: 45, lote: 60, unitario: 100, caduca: f.expires }]);
    } else {
      assert.equal(r.valor, undefined);
      assert.deepEqual(r.sinPruebas.motivos, { 'sin-unidades-factura': 1 });
    }
    sinErrores(m);
  }
});

test('faltan datos: factura discordante, sin número de adjuntos, sin enlace, secretos, huecos, mezcla o tarde', () => {
  const casos = {
    discordante: { factura: 50, oro: 6000, huecos: [{ id: HILO, n: 20 }, { id: HILO, n: 20 }, { id: HILO, n: 20 }] },
    'sin-adjuntos': { factura: 20, oro: 2000, adjuntos: null, huecos: [{ id: HILO, n: 20 }] },
    'adjuntos-incompletos': { factura: 20, oro: 2000, adjuntos: 2, huecos: [{ id: HILO, n: 20 }] },
    'sin-enlace': { factura: 20, oro: 2000, huecos: [{ id: HILO, n: 20, enlace: null }] },
    'sin-unidades': { factura: null, oro: 2000, huecos: [{ id: HILO, n: null }] },
    huecos: { factura: 40, oro: 4000, adjuntos: 2, huecos: [{ id: HILO, n: 20 }, null, { id: HILO, n: 20 }] },
    mezcla: { factura: 40, oro: 4000, huecos: [{ id: HILO, n: 20 }, { id: HILO, n: 20, variante: true }] },
    'otro-id': { factura: 40, oro: 4000, huecos: [{ id: HILO, n: 20 }, { id: HILO, n: 20, enlace: LANA }] },
  };
  const motivo = { huecos: 'adjuntos-incompletos', mezcla: 'discordante', 'otro-id': 'discordante' };
  for (const [nombre, carta] of Object.entries(casos)) {
    const m = maquinaBuzon([carta]);
    abrirBuzon(m);
    tener(m, 10);
    const r = coste(m, HILO);
    assert.equal(r.razon, 'faltan-datos', nombre);
    assert.deepEqual(r.sinPruebas.motivos, { [motivo[nombre] ?? nombre]: 1 }, nombre);
    sinErrores(m);
  }

  // Un número secreto (motor moderno) es un dato que falta, no un error.
  const secreto = maquinaBuzon([{ factura: 20, oro: 2000, huecos: [{ id: HILO, n: 20 }] }]);
  secreto.lua(`local base = GetInboxHeaderInfo
    rawset(_G, "GetInboxHeaderInfo", function(i) local a, b, c, d, e, f, g = base(i) return a, b, c, d, e, f, g, BANCO.secreto("number") end)`);
  abrirBuzon(secreto);
  tener(secreto, 10);
  assert.deepEqual(coste(secreto, HILO).sinPruebas.motivos, { 'sin-adjuntos': 1 });
  sinErrores(secreto);

  // Evidencia leída tarde (al enriquecer un recibo de antes) sin unidades en la factura: pudo faltar un adjunto ya cogido.
  const tarde = maquina({ bolsas: 5, ledger: { 'Zula-Normal': [compra(HILO, 10, 1000, 1000, { factura: null, tarde: true })] } });
  assert.deepEqual(coste(tarde, HILO).sinPruebas.motivos, { 'sin-unidades-factura': 1 });
  const aTiempo = maquinaBuzon([{ factura: null, oro: 2000, huecos: [{ id: HILO, n: 10 }] }]);
  abrirBuzon(aTiempo);
  tener(aTiempo, 5);
  const incompleto = coste(aTiempo, HILO);
  assert.equal(incompleto.valor, undefined, 'en la primera lectura también se pudieron retirar adjuntos');
  assert.deepEqual(incompleto.sinPruebas.motivos, { 'sin-unidades-factura': 1 });
  sinErrores(tarde);
  sinErrores(aTiempo);
});

test('al releer, cada carta enriquece su recibo aunque cambie de orden, y nunca si es ambiguo', () => {
  const a = { factura: 4, oro: 400, huecos: [{ id: HILO, n: 4 }] };
  const b = { factura: 3, oro: 900, huecos: [{ id: HILO, n: 3 }] };
  const m = maquinaBuzon([a, b]);
  abrirBuzon(m);
  const primeras = filasDe(m);
  m.lua(`for _, f in ipairs(SnetForeverCuenta.comercio.ledger["Zula-Normal"]) do f.variant, f.evidence = nil, nil end`);
  m.lua('BUZON_CARTAS[1], BUZON_CARTAS[2] = BUZON_CARTAS[2], BUZON_CARTAS[1]');
  abrirBuzon(m);
  const filas = filasDe(m);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas.map((f) => [f.quantity, f.evidence?.slots?.[0]?.count, f.evidence?.late]),
    [[4, 4, true], [3, 3, true]], 'la de 4 sigue siendo la de 4');
  assert.deepEqual(filas.map((f) => f.expires), primeras.map((f) => f.expires));
  sinErrores(m);

  // Dos cartas iguales y dos recibos iguales de antes: siguen siendo dos, pero ninguna sabe cuál es la suya.
  const dos = maquinaBuzon([a, { ...a }]);
  abrirBuzon(dos);
  dos.lua(`for _, f in ipairs(SnetForeverCuenta.comercio.ledger["Zula-Normal"]) do f.variant, f.evidence = nil, nil end`);
  abrirBuzon(dos);
  const iguales = filasDe(dos);
  assert.equal(iguales.length, 2, 'dos recibos iguales son dos compras');
  assert.deepEqual(iguales.map((f) => [f.variant, f.evidence]), [[undefined, undefined], [undefined, undefined]]);
  sinErrores(dos);

  // Con el id conocido en las dos filas, un id distinto es otra carta.
  const otro = maquinaBuzon([a]);
  abrirBuzon(otro);
  otro.lua(`BUZON_CARTAS[1].huecos[1].id = ${LANA}`);
  otro.lua(`rawset(_G, "GetInboxItemLink", function() return nil end)`);
  abrirBuzon(otro);
  assert.deepEqual(filasDe(otro).map((f) => f.item), [HILO, LANA]);
  sinErrores(otro);
});

test('compras simultáneas a distinto precio: sin valor si el corte las parte; el nombre del personaje no decide', () => {
  const ledger = (orden) => ({ [orden[0]]: [compra(HILO, 10, 1000, 2000)], [orden[1]]: [compra(HILO, 10, 3000, 2002)] });
  for (const orden of [['Zula-Normal', 'Alt-Normal'], ['Alt-Normal', 'Zula-Normal']]) {
    const parte = maquina({ bolsas: 15, ledger: ledger(orden) });
    const r = coste(parte, HILO);
    assert.equal(r.razon, 'empate', orden.join());
    assert.equal(r.valor, undefined);
    sinErrores(parte);
    const entero = maquina({ bolsas: 20, ledger: ledger(orden) });
    assert.equal(coste(entero, HILO).valor, 200, 'si el grupo entero entra, el orden da igual');
    sinErrores(entero);
  }
  const mismoPrecio = maquina({ bolsas: 15, ledger: { 'Zula-Normal': [compra(HILO, 10, 1000, 2000)], 'Alt-Normal': [compra(HILO, 5, 500, 2000)] } });
  assert.equal(coste(mismoPrecio, HILO).valor, 100, 'al mismo precio cualquier reparto da lo mismo');
  sinErrores(mismoPrecio);
  const separadas = maquina({ bolsas: 15, ledger: { 'Zula-Normal': [compra(HILO, 10, 1000, 2000)], 'Alt-Normal': [compra(HILO, 10, 3000, 2010)] } });
  assert.equal(coste(separadas, HILO).valor, (3000 + 500) / 15, 'separadas por más de la tolerancia, el orden es fiable');
  sinErrores(separadas);
});

test('tooltip: sin pruebas o con empate dice que faltan datos, sin cifra', () => {
  const m = maquina({ bolsas: 2, ledger: { 'Zula-Normal': [antigua(HILO, 2, 500, 100)] } });
  m.lua('SnetForever.TooltipComercio.ponerLinea("contaCompras", true)');
  assert.deepEqual(fila(lineas(m, HILO), 'Coste medio de compra'),
    ['Coste medio de compra', 'no disponible: faltan datos de 1 compras recientes']);
  sinErrores(m);
  const e = maquina({ bolsas: 15, ledger: { 'Zula-Normal': [compra(HILO, 10, 1000, 2000)], 'Alt-Normal': [compra(HILO, 10, 3000, 2000)] } });
  e.lua('SnetForever.TooltipComercio.ponerLinea("contaCompras", true)');
  assert.deepEqual(fila(lineas(e, HILO), 'Coste medio de compra'),
    ['Coste medio de compra', 'no disponible: compras simultáneas a distinto precio']);
  sinErrores(e);
});

test('tooltip: «Coste medio de compra» sale apagado por defecto y, encendido, con su cobertura o la razón', () => {
  const m = maquina();
  assert.equal(fila(lineas(m, HILO), 'Coste medio de compra'), undefined, 'apagado por defecto: el tooltip no cambia');
  assert.equal(m.lua('SnetForever.TooltipComercio.ponerLinea("contaCompras", true)'), true);
  assert.match(fila(lineas(m, HILO), 'Coste medio de compra')?.[1] ?? '', /^1s 62c 12 uds\. en 3 partidas$/);
  m.objeto(HILO, 30);
  assert.deepEqual(fila(lineas(m, HILO), 'Coste medio de compra'),
    ['Coste medio de compra', 'no disponible: tus compras cubren 20 de 30 uds.']);
  assert.equal(fila(lineas(m, ESPADA), 'Coste medio de compra'), undefined, 'un objeto que no se apila no la enseña');
  sinErrores(m);
});

test('a complete reread upgrades one incomplete purchase without duplicating it', () => {
  const m = maquinaBuzon([{ factura: 20, oro: 2000, huecos: [{ id: HILO, n: 20 }] }]);
  m.lua('originalLink = GetInboxItemLink; GetInboxItemLink = function() return nil end');
  abrirBuzon(m);
  assert.equal(filasDe(m)[0].evidence.slots[0].linkId, undefined);
  m.lua('GetInboxItemLink = originalLink');
  abrirBuzon(m);
  assert.equal(filasDe(m).length, 1);
  tener(m, 10);
  assert.equal(coste(m, HILO).valor, 100);
  sinErrores(m);
});
