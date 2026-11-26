// F7 (decidido por el jugador): la app sigue también la subasta NEUTRAL, con su propio historial, y la ranura trae su casa
// junto a la de la facción. En el addon:
//   · en la neutral, el tooltip, la IA y la lista de ofertas (Subasta.foto) usan los datos de la neutral, con su «hace»;
//   · en la de la facción, los de la facción; con la subasta cerrada, los de la facción;
//   · la línea gris «sin datos de esta subasta» solo sale si de verdad no hay datos de esa casa (y no se supone ninguna);
//   · el escaneo de cada subasta se guarda aparte (escaneos[facción del subastador]) para que la app descubra su casa;
//   · el inventario junta a los personajes del reino de las dos facciones, y las operaciones y los grupos son de la cuenta;
//   · una ranura con tres casas de ~7.000 objetos carga entera (tamaño, tiempo y memoria medidos aquí).
// Con el Enum.BagIndex de Forever (bolsas: 'forever'). Todo lo de aquí es inventado.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';
import { textosPrecios, tocPrecios, LIMITE_BYTES, ARCHIVOS_POR_RANURA } from '../../../app/src/comercio/precios-lua.mjs';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const GENERADO = H * 3600 + 1357; // la foto de esta hora (hh:22:37)
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const LANA = 2592;
const GANGA = 7000; // una buena compra en la Horda (la mitad de su valor)
const GANGA_N = 7001; // una buena compra solo en la neutral

// Las filas de cada casa: la lana en las dos con números distintos; cada ganga solo en la suya.
const FILAS = {
  114: { [LANA]: [192, 4478, 189, -3.1, 0.777, 3682.7, 0, 171, 1, 1], [GANGA]: [51000, 10, 100000, 0, 0.5, 5, 0, 10, 1, 1] },
  117: { [LANA]: [260, 900, 240, 2.5, 0.6, 410.2, 0, 35, 1, 1], [GANGA_N]: [40000, 4, 90000, 0, 0.5, 2, 0, 4, 1, 1] },
};

// La ranura de esta hora con las casas que se pidan (texto Lua escrito a mano, como lo deja la app).
function ponerRanura(dir, { casas = [114, 117], conocidas = { 'Normal|Horde': 114, 'Normal|Neutral': 117 } } = {}) {
  const i = (H % 8) + 1;
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n');
  const lua = casas.map((c) => `[${c}] = {${Object.entries(FILAS[c]).map(([item, f]) => `[${item}] = {${f.join(', ')}}`).join(', ')}}`).join(',\n    ');
  const con = Object.entries(conocidas).map(([k, v]) => `["${k}"] = ${v}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${GENERADO}, region = "us", conocidas = {${con}},
  casas = {${lua}},
  grupos = {}, nombres = {}, completo = true}
`);
}

function maquina({ ranura, jugador } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-neutral-f7-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir, ranura);
  const m = crearMaquina({ addonsDir: dir, bolsas: 'forever',
    jugador: { nombre: 'Nombre', apellido: 'Uno', reino: 'Normal', faccion: 'Horde', clase: 'MAGE', idioma: 'esES', ...jugador } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.itemInfo(LANA, { nombre: 'Paño de lana', calidad: 1, precio: 33 });
  m.itemInfo(GANGA, { nombre: 'Ganga de la Horda', calidad: 1 });
  m.itemInfo(GANGA_N, { nombre: 'Ganga neutral', calidad: 1 });
  m.bolsa(0, 1, { id: LANA, n: 3 });
  m.objeto(LANA, 3);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  return m;
}

const sinColores = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '').replace(/\|T[^|]*\|t/g, '^');
const lineas = (m, id) => { m.tooltipObjeto(id); return m.detalleTooltip().map((x) => [sinColores(x.izq), sinColores(x.der)]); };
const izquierdas = (l) => l.map(([izq]) => izq);
const fila = (l, izq) => l.find(([i]) => i === izq);
// La subasta abierta con su subastador: la unidad «npc» con la facción que da UnitFactionGroup (nil = un goblin neutral).
function abrirSubasta(m, faccion) {
  m.lua(`BANCO.ponerNpc(BANCO.guidCriatura(${faccion ? 8670 : 8661}), "Subastador")`);
  m.lua(`BANCO.unidades.npc.faccion = ${faccion ? `"${faccion}"` : 'false'}`);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.05);
}
const cerrarSubasta = (m) => {
  m.lua('SnetForever.Busqueda.vivo = function() end');
  m.disparar('AUCTION_HOUSE_CLOSED');
};
const MERCADO_SIN_DATOS = 'Valor de mercado y lo que sale: sin datos de esta subasta (neutral)';
const normalDe = (m, id) => m.lua(`local p = SnetForever.Precios.de(${id}); return p and p.normal`) ?? null;
const fotoDe = (m, id) => m.lua(`local precio, _, _, _, _, fuente = SnetForever.Subasta.foto(${id}); return {precio = precio, fuente = fuente}`);

test('en la subasta neutral, el tooltip, la IA y la lista de ofertas usan los datos de la neutral, con su hace', () => {
  const m = maquina();
  abrirSubasta(m, null);
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 117);
  assert.equal(normalDe(m, LANA), 240, 'la fila de la neutral, no la de la Horda (189)');
  // El tooltip: la venta de la neutral, con «(app, hace …)», y su valor de mercado; sin la línea gris.
  const l = lineas(m, LANA);
  assert.match(fila(l, 'A la venta')?.[1] ?? '', /^900 unidades, 35 subastas \(app, hace /, JSON.stringify(l));
  assert.deepEqual(fila(l, 'Compra mínima'), ['Compra mínima', '2s 60c']);
  assert.match(fila(l, 'Valor de mercado')?.[1] ?? '', /2s 40c/, JSON.stringify(l));
  assert.ok(!izquierdas(l).includes(MERCADO_SIN_DATOS), JSON.stringify(l));
  // La lista de ofertas (Subasta.foto, la misma para la lista, el tooltip y las reglas): lo de la neutral, nada de la Horda.
  assert.deepEqual(fotoDe(m, GANGA_N), { precio: 40000, fuente: 'app' });
  assert.equal(fotoDe(m, GANGA).fuente ?? null, null, 'la ganga de la Horda no es de esta subasta');
  assert.equal(m.lua('SnetForever.SubastaNavegar.hayPrecios()'), true);
  // La IA: la casa neutral, que es la neutral, la edad de su foto y sus oportunidades.
  const c = m.lua('SnetForever.Contexto.comercio()');
  assert.equal(c.casa, 117);
  assert.equal(c.faccion, 'Neutral', JSON.stringify(c));
  assert.equal(typeof c.edadPrecios, 'number');
  assert.ok(c.oportunidades.some((o) => o.id === GANGA_N && o.fuente === 'app'), JSON.stringify(c.oportunidades));
  assert.ok(!c.oportunidades.some((o) => o.id === GANGA), 'nada de la Horda');
  sinErrores(m);
});

test('en la de la facción, los de la facción; cerrada, los de la facción', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 114);
  assert.equal(normalDe(m, LANA), 189);
  let l = lineas(m, LANA);
  assert.match(fila(l, 'A la venta')?.[1] ?? '', /^4478 unidades, 171 subastas \(app, hace /, JSON.stringify(l));
  assert.deepEqual(fotoDe(m, GANGA), { precio: 51000, fuente: 'app' });
  assert.equal(fotoDe(m, GANGA_N).fuente ?? null, null, 'la ganga de la neutral no es de esta subasta');
  const c = m.lua('SnetForever.Contexto.comercio()');
  assert.equal(c.casa, 114);
  assert.equal(c.faccion, 'Horde');
  assert.ok(c.oportunidades.some((o) => o.id === GANGA), JSON.stringify(c.oportunidades));
  assert.ok(!c.oportunidades.some((o) => o.id === GANGA_N));
  // Tras la neutral, al cerrar: otra vez la de la facción.
  cerrarSubasta(m);
  abrirSubasta(m, null);
  assert.equal(normalDe(m, LANA), 240);
  cerrarSubasta(m);
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 114);
  assert.equal(normalDe(m, LANA), 189);
  l = lineas(m, LANA);
  assert.match(fila(l, 'Valor de mercado')?.[1] ?? '', /1s 89c/, JSON.stringify(l));
  assert.equal(m.lua(`return (SnetForever.Subasta.precio(${GANGA}))`), 51000);
  sinErrores(m);
});

test('sin datos de la neutral, la línea gris dice que no hay datos', () => {
  // (a) La app aún no ha descubierto la neutral: la ranura no la nombra. No se supone ninguna casa.
  const a = maquina({ ranura: { casas: [114], conocidas: { 'Normal|Horde': 114 } } });
  abrirSubasta(a, null);
  assert.equal(a.lua('SnetForever.Precios.casaActual()') ?? null, null, 'ninguna casa supuesta para la neutral');
  assert.equal(normalDe(a, LANA), null);
  let l = lineas(a, LANA);
  assert.ok(izquierdas(l).includes(MERCADO_SIN_DATOS), JSON.stringify(l));
  assert.ok(!izquierdas(l).includes('Valor de mercado'));
  const c = a.lua('SnetForever.Contexto.comercio()');
  assert.equal(c.casa ?? null, null);
  assert.equal(c.faccion, 'Neutral', 'la app sabe que es la neutral, aunque no tenga su casa');
  sinErrores(a);
  // (b) La neutral es conocida pero esta ranura no trae sus filas: lo mismo.
  const b = maquina({ ranura: { casas: [114] } });
  abrirSubasta(b, null);
  assert.equal(b.lua('SnetForever.Precios.casaActual()'), 117);
  l = lineas(b, LANA);
  assert.ok(izquierdas(l).includes(MERCADO_SIN_DATOS), JSON.stringify(l));
  // (c) Con datos de la neutral, la línea gris no sale (la prueba de arriba) y en la Horda tampoco.
  const c2 = maquina();
  abrirSubasta(c2, 'Horde');
  assert.ok(!izquierdas(lineas(c2, LANA)).includes(MERCADO_SIN_DATOS));
  sinErrores(b);
  sinErrores(c2);
});

test('el escaneo de cada subasta se guarda aparte, con la facción de su subastador, para que la app descubra su casa', () => {
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
    const casa = faccion ?? 'Neutral';
    const e = m.lua(`SnetForeverCuenta.comercio.escaneos and SnetForeverCuenta.comercio.escaneos["${casa}"]`) ?? null;
    assert.ok(e, `escaneos.${casa}`);
    assert.equal(e.identidad.faccion, casa, 'la facción de la subasta (la de su subastador)');
    assert.equal(e.identidad.reino, 'Normal');
    assert.equal(e.jugador, 'Horde', 'y la del personaje que la leyó');
    assert.ok(e.muestras[20001], JSON.stringify(e.muestras));
    const otras = Object.keys(m.lua('SnetForeverCuenta.comercio.escaneos') ?? {});
    assert.deepEqual(otras, [casa], 'una subasta no pisa la otra');
    // ultimoEscaneo (el de la app de antes) sigue solo con la casa de su facción.
    const u = m.lua('SnetForeverCuenta.comercio.ultimoEscaneo') ?? null;
    if (faccion) assert.equal(u?.identidad?.faccion, 'Horde');
    else assert.equal(u, null);
    sinErrores(m);
  }
});

test('el inventario junta a los personajes del reino de la Horda y de la Alianza, como TSM', () => {
  for (const faccion of ['Horde', 'Alliance']) {
    const m = maquina({ jugador: { faccion } });
    // Otro personaje propio del mismo reino (de la otra facción) y uno de otro reino, que no cuenta.
    m.lua(`local pj = SnetForeverCuenta.comercio.inventario.pj
      pj["Otro Dos-Normal"] = {nombre = "Otro Dos", reino = "Normal", clase = "PRIEST", bolsas = {[${LANA}] = 77}}
      pj["Lejos Tres-Otro"] = {nombre = "Lejos Tres", reino = "Otro", clase = "ROGUE", bolsas = {[${LANA}] = 500}}
      SnetForever.InventarioCuenta.olvidarOrden()`);
    const l = lineas(m, LANA);
    assert.deepEqual(fila(l, 'Inventario'), ['Inventario', '80 en bolsas y banco'], `${faccion}: ${JSON.stringify(l)}`);
    assert.ok(fila(l, '  Nombre Uno'), JSON.stringify(l));
    assert.ok(fila(l, '  Otro Dos'), JSON.stringify(l));
    assert.equal(fila(l, '  Lejos Tres'), undefined, 'otro reino no cuenta');
    sinErrores(m);
  }
});

test('las operaciones y los grupos son de la cuenta: con un personaje de la Alianza salen los mismos', () => {
  const m = maquina();
  const ruta = m.lua('return SnetForever.Arbol.crear("", "Mis telas")');
  assert.ok(ruta);
  assert.equal(m.lua(`return SnetForever.Arbol.poner("i:${LANA}", "${ruta}")`), true);
  m.lua('SnetForever.Operaciones.crear("subasta", "Vender telas")');
  m.lua(`SnetForever.Operaciones.ponerDeGrupo("${ruta}", "subasta", {"Vender telas"})`);
  const ver = () => ({
    grupo: m.lua(`return SnetForever.Arbol.objeto("i:${LANA}")`) ?? null,
    ops: m.lua('return SnetForever.Operaciones.lista("subasta")'),
    deGrupo: m.lua(`return SnetForever.Operaciones.deGrupo("${ruta}", "subasta")`) ?? null,
  });
  const horda = ver();
  assert.equal(horda.grupo, ruta);
  assert.ok(horda.ops.includes('Vender telas'), JSON.stringify(horda));
  // Todo vive en la cuenta (SnetForeverCuenta.comercio.v2), no en el personaje ni con su facción.
  assert.ok(m.lua('return SnetForeverCuenta.comercio.v2 ~= nil'));
  assert.ok(!JSON.stringify(m.lua('return SnetForeverPJ') ?? {}).includes('Vender telas'));
  m.lua('BANCO.jugador.faccion = "Alliance"');
  assert.equal(m.lua('return (UnitFactionGroup("player"))'), 'Alliance');
  assert.deepEqual(ver(), horda, 'con la Alianza, los mismos grupos y operaciones');
  sinErrores(m);
});

// Ronda 1: al actualizar, la ranura que hay es aún la de la app de antes (conocidas vacías: la 114 era supuesta). Hasta que
// la app nueva escriba la siguiente (con "<reino>|Horde" = 114), la Horda no se queda sin datos.
test('ronda 1: una ranura de la app de antes (conocidas vacías) sigue dando la 114 a la Horda mientras llega la nueva', () => {
  const m = maquina({ ranura: { casas: [114], conocidas: {} } });
  abrirSubasta(m, 'Horde');
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 114);
  assert.equal(normalDe(m, LANA), 189);
  assert.match(fila(lineas(m, LANA), 'A la venta')?.[1] ?? '', /\(app, hace /);
  cerrarSubasta(m);
  assert.equal(m.lua('SnetForever.Precios.casaActual()'), 114, 'cerrada, también');
  // La neutral no: nunca se supone.
  abrirSubasta(m, null);
  assert.equal(m.lua('SnetForever.Precios.casaActual()') ?? null, null);
  assert.ok(izquierdas(lineas(m, LANA)).includes(MERCADO_SIN_DATOS));
  sinErrores(m);
  // Un personaje de la Alianza con esa ranura: nada (la 114 es de la Horda).
  const a = maquina({ ranura: { casas: [114], conocidas: {} }, jugador: { faccion: 'Alliance' } });
  abrirSubasta(a, 'Alliance');
  assert.equal(a.lua('SnetForever.Precios.casaActual()') ?? null, null);
  sinErrores(a);
  // Una ranura de la app nueva (con conocidas) manda: si no nombra la Horda, no hay casa de la Horda.
  const n = maquina({ ranura: { casas: [114, 117], conocidas: { 'Normal|Neutral': 117 } } });
  abrirSubasta(n, 'Horde');
  assert.equal(n.lua('SnetForever.Precios.casaActual()') ?? null, null);
  sinErrores(n);
});

// Ronda 2: la app de antes solo suponía la 114 en un reino «Normal» (su CASA_SUPUESTA era {Normal = {Horde = 114, …}}).
// La ventana de la ranura vieja vale solo en ese reino; en otro, o con el reino sin saber (el vacío de Forever sin nada
// guardado), nada.
test('ronda 2: la ventana de la ranura de antes solo vale en el reino que suponía la app de antes', () => {
  const vieja = { casas: [114], conocidas: {} };
  const casa = (jugador) => {
    const m = maquina({ ranura: vieja, jugador });
    abrirSubasta(m, 'Horde');
    const c = m.lua('SnetForever.Precios.casaActual()') ?? null;
    sinErrores(m);
    return c;
  };
  assert.equal(casa({ reino: 'Normal' }), 114);
  assert.equal(casa({ reino: 'CAMWOW US1 Realm 5 PvE' }), null, 'en otro reino la app de antes no suponía nada');
  assert.equal(casa({ reino: 'Normal', nombreReino: '', reinoNormalizado: '', reinoGuid: '' }), null, 'con el reino sin saber, nada');
});

// ---------------------------------------------------------------------------------------------------
// La ranura con tres casas: lo que pesa (lo que escribe la app de verdad, textosPrecios).
// ---------------------------------------------------------------------------------------------------

test('una ranura con tres casas de 7.050 objetos cabe y carga entera: tamaño, tiempo y memoria', () => {
  const OBJETOS = 7050; // lo que trae la casa 114 en las ranuras instaladas (F6)
  const casas = {};
  for (const [k, casa] of [114, 117, 111].entries()) {
    const filas = {};
    for (let i = 0; i < OBJETOS; i++) {
      const precio = 1000 + ((i * 7919 + k * 31) % 9000000);
      filas[2000 + i * 3 + k] = [precio, 1 + (i % 500), Math.round(precio * 1.07), ((i % 41) - 20) / 2, (i % 100) / 100, (i % 300) / 2, i % 2, 1 + (i % 40), 1, i % 3 === 0 ? 1 : 0];
    }
    casas[casa] = filas;
  }
  const nombres = {};
  for (const filas of Object.values(casas)) for (const id of Object.keys(filas)) nombres[id] ??= `Objeto de prueba número ${id}`;
  const textos = textosPrecios({
    seq: 9, generado: GENERADO, region: 'us', conocidas: { 'Normal|Horde': 114, 'Normal|Neutral': 117, 'Normal|Alliance': 111 },
    casas, grupos: [], nombres,
  });
  const bytes = textos.map((t) => Buffer.byteLength(t, 'utf8'));
  const total = bytes.reduce((a, b) => a + b, 0);
  assert.equal(textos.length, ARCHIVOS_POR_RANURA);
  assert.ok(bytes.every((b) => b <= LIMITE_BYTES), JSON.stringify(bytes));
  assert.ok(textos.at(-1).includes('completo = true'));

  const dir = mkdtempSync(join(tmpdir(), 'snf-neutral-f7-ranura-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  const i = (H % 8) + 1;
  mkdirSync(join(dir, nombre(i)));
  writeFileSync(join(dir, nombre(i), `${nombre(i)}.toc`), tocPrecios(i));
  textos.forEach((t, k) => writeFileSync(join(dir, nombre(i), `p${k + 1}.lua`), t));
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  // fengari no tiene collectgarbage("count"): la memoria se mira en el montón de Node (una cota muy por encima de la del
  // juego, que guarda los números de Lua sin objetos de JavaScript).
  global.gc?.();
  const heapAntes = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  assert.equal(m.lua('return SnetForever.Precios.cargar()'), true);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  global.gc?.();
  const heapDespues = process.memoryUsage().heapUsed;
  const cuenta = m.lua(`local n = {} for casa, t in pairs(SNF_PRECIOS.casas) do local k = 0 for _ in pairs(t) do k = k + 1 end n[tostring(casa)] = k end return n`);
  assert.deepEqual(cuenta, { 111: OBJETOS, 114: OBJETOS, 117: OBJETOS });
  // Lo medido, para el informe (fallo-F7-report.md). La memoria del banco (fengari, sobre JavaScript) no es la del juego:
  // en el cliente (Lua 5.1) una fila de 10 números son ~200 bytes, unos 4-5 MB las tres casas.
  console.log(`F7 ranura de 3 casas: ${bytes.map((b) => Math.round(b / 1024)).join(' + ')} KB = ${(total / 1024 / 1024).toFixed(2)} MB; ` +
    `carga en el banco ${Math.round(ms)} ms; ` +
    `montón de Node +${((heapDespues - heapAntes) / 1024 / 1024).toFixed(1)} MB`);
  assert.ok(total < ARCHIVOS_POR_RANURA * LIMITE_BYTES);
  sinErrores(m);
});
