// Fase 2 del plan de paridad con TSM: el histórico propio de la app en el addon. La ranura la escribe el puente de la app
// (textosPrecios de app/src/comercio/precios-lua.mjs), como en el juego, y el addon la carga con su ruta normal
// (Precios.alAbrir). Se comprueba:
//   · Precios.historico da el histórico de la misma casa que Precios.de, con su cobertura y edad, o la razón;
//   · snfhistoricodiario() lo lee en una fórmula; snfhistorico y snfmercado (y las traducciones de TSM) no cambian;
//   · una variante, otra casa, una ranura de una app de antes, un histórico quitado por tamaño o vencido no dan valor;
//   · el tooltip, con la línea encendida, lo enseña con su cobertura o con la razón.
// Todo lo de aquí es inventado.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';
import { textosPrecios, ARCHIVOS_POR_RANURA } from '../../../app/src/comercio/precios-lua.mjs';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const GENERADO = H * 3600 + 1357;
const DIA = 86400;
const HOY = Math.floor(GENERADO / DIA);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const LANA = 2592;
const RARO = 7002; // sin días que cuenten
const NUEVO = 7003; // sin histórico (sin campo h)
const UMBRALES = { ventana: 30, minDias: 5, minMuestras: 3, maxDiasSinDato: 3 };

const FILAS = {
  114: {
    [LANA]: [192, 4478, 189, -3.1, 0.777, 3682.7, 0, 171, 1, 1],
    [RARO]: [5000, 1, 5200, 0, -1, -1, 1, 1, 0],
    [NUEVO]: [900, 2, 950, 0, -1, -1, 1, 2, 0],
  },
  117: { [LANA]: [260, 900, 240, 2.5, 0.6, 410.2, 0, 35, 1, 1] },
};
const HISTORICO = {
  114: {
    [LANA]: { valor: 175, razon: null, dias: 12, muestras: 288, desde: (HOY - 11) * DIA, hasta: HOY * DIA },
    [RARO]: { valor: null, razon: 'pocos-dias', dias: 2, muestras: 30, desde: (HOY - 1) * DIA, hasta: HOY * DIA },
  },
  117: { [LANA]: { valor: 251, razon: null, dias: 6, muestras: 120, desde: (HOY - 5) * DIA, hasta: HOY * DIA } },
};

// La ranura de esta hora tal como la deja la app. `sinHistorico`: la de una app de antes de la fase 2.
function ponerRanura(dir, { sinHistorico = false, omitido = false, historico = HISTORICO, generado = GENERADO, casas = FILAS } = {}) {
  const i = (Math.floor(generado / 3600) % 8) + 1;
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\n${
    Array.from({ length: ARCHIVOS_POR_RANURA }, (_, k) => `p${k + 1}.lua`).join('\n')}\n`);
  const entrada = {
    seq: 1, generado, region: 'us', conocidas: { 'Normal|Horde': 114, 'Normal|Neutral': 117 }, casas,
    ...(sinHistorico || omitido ? {} : { historico, umbralesHistorico: UMBRALES }),
    ...(omitido ? { historicoOmitido: true } : {}), // lo que deja el puente cuando el histórico no cabe
  };
  textosPrecios(entrada).forEach((t, k) => writeFileSync(join(carpeta, `p${k + 1}.lua`), t));
}

function maquina(ranura = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-historico-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir, ranura);
  const m = crearMaquina({ addonsDir: dir, bolsas: 'forever',
    jugador: { nombre: 'Nombre', apellido: 'Uno', reino: 'Normal', faccion: 'Horde', clase: 'MAGE', idioma: 'esES' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.itemInfo(LANA, { nombre: 'Paño de lana', calidad: 1, precio: 33 });
  m.itemInfo(RARO, { nombre: 'Objeto raro', calidad: 1 });
  m.itemInfo(NUEVO, { nombre: 'Objeto nuevo', calidad: 1 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  return m;
}

function abrirSubasta(m, faccion) {
  m.lua(`BANCO.ponerNpc(BANCO.guidCriatura(${faccion ? 8670 : 8661}), "Subastador")`);
  m.lua(`BANCO.unidades.npc.faccion = ${faccion ? `"${faccion}"` : 'false'}`);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.05);
}

const historico = (m, item, casa = 'nil') => m.lua(`local d, razon, c = SnetForever.Precios.historico(${item}, ${casa})
  return {d = d, razon = razon, c = c}`);
const valor = (m, texto, item) => m.lua(`local v, e = SnetForever.Formulas.valor(${JSON.stringify(texto)}, ${JSON.stringify(item)})
  return {v = v, e = e and SnetForever.Formulas.mensaje(e)}`) || {};
const sinColores = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '').replace(/\|T[^|]*\|t/g, '^');
const lineas = (m, id) => { m.tooltipObjeto(id); return m.detalleTooltip().map((x) => [sinColores(x.izq), sinColores(x.der)]); };
const fila = (l, izq) => l.find(([i]) => i === izq);

test('Precios.historico da el histórico de la casa de la subasta abierta con su cobertura; lo normal no cambia', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  const r = historico(m, LANA);
  assert.equal(r.razon, undefined);
  assert.deepEqual({ ...r.d, edad: undefined }, {
    valor: 175, dias: 12, muestras: 288, desde: (HOY - 11) * DIA, hasta: HOY * DIA, ventana: 30, minDias: 5,
    maxDiasSinDato: 3, casa: 114, edad: undefined,
  });
  assert.equal(typeof r.d.edad, 'number', 'la edad de la foto');
  assert.equal(m.lua(`SnetForever.Precios.de(${LANA}).normal`), 189, 'el valor de mercado es otro número');
  // La neutral: sus propios días.
  abrirSubasta(m, null);
  assert.equal(historico(m, LANA).d.valor, 251);
  assert.equal(historico(m, LANA).d.casa, 117);
  sinErrores(m);
});

test('snfhistoricodiario() se elige a mano; snfhistorico, snfmercado y la traducción de DBHistorical siguen igual', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  assert.equal(valor(m, 'snfhistoricodiario()', LANA).v, 175);
  assert.equal(valor(m, 'snfhistorico', LANA).v, 189, 'el alias de siempre lee lo normal');
  assert.equal(valor(m, 'snfmercado', LANA).v, 189);
  assert.equal(valor(m, 'first(snfhistoricodiario(), snfmercado)', NUEVO).v, 950, 'sin histórico, first pasa a la siguiente');
  assert.equal(valor(m, '2 * snfhistoricodiario()', RARO).v, undefined, 'con pocos días no calcula');
  assert.equal(valor(m, '2 * snfhistoricodiario()', RARO).e, undefined, 'y no es un error: es «sin valor»');
  const t = m.lua('local t, n = SnetForever.Formulas.traducir("DBHistorical + DBRegionHistorical") return {t = t, n = n}');
  assert.deepEqual(t, { t: 'snfhistorico + snfhistorico', n: 2 }, 'las importaciones no pasan solas al histórico nuevo');
  sinErrores(m);
});

test('variantes y referencias: la app solo tiene el objeto base', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  assert.equal(valor(m, 'snfhistoricodiario()', `i:${LANA}`).v, 175, 'la clave base vale');
  assert.equal(valor(m, 'snfhistoricodiario()', `i:${LANA}::1:3`).v, undefined, 'una variante no tiene histórico');
  assert.equal(valor(m, 'snfmercado', `i:${LANA}::1:3`).v, 189, 'snfmercado sigue como antes con una variante');
  assert.equal(valor(m, `snfhistoricodiario(item:${LANA})`, `i:${LANA}::1:3`).v, 175, 'item:N es el objeto base');
  assert.equal(valor(m, `snfhistoricodiario() + snfhistoricodiario(item:${LANA})`, `i:${LANA}::1:3`).v, undefined);
  assert.equal(valor(m, `first(snfhistoricodiario(), 0) + snfhistoricodiario(item:${LANA})`, `i:${LANA}::1:3`).v, 175,
    'la referencia no hereda el «sin valor» de la variante');
  sinErrores(m);
});

test('una fuente propia anterior con ese nombre conserva su valor y el histórico se pide con paréntesis', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.v2.fuentes.snfhistoricodiario = "2s"');
  assert.equal(valor(m, 'snfhistoricodiario', LANA).v, 200);
  assert.equal(valor(m, '2 * snfhistoricodiario', LANA).v, 400);
  assert.equal(valor(m, 'snfhistoricodiario()', LANA).v, 175);
  assert.equal(valor(m, `snfhistoricodiario(item:${LANA})`, LANA).v, 175);
  sinErrores(m);
});

test('las razones: pocos días, sin días, casa sin datos, app de antes, no cabía y vencido', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  const raro = historico(m, RARO);
  assert.equal(raro.d, undefined);
  assert.equal(raro.razon, 'pocos-dias');
  assert.equal(raro.c.dias, 2);
  assert.equal(raro.c.minDias, 5);
  assert.equal(historico(m, NUEVO).razon, 'sin-datos');
  assert.equal(historico(m, LANA, 999).razon, 'casa-sin-datos', 'una casa que la ranura no trae');
  sinErrores(m);

  const antes = maquina({ sinHistorico: true });
  abrirSubasta(antes, 'Horde');
  assert.equal(historico(antes, LANA).razon, 'formato-anterior');
  assert.equal(valor(antes, 'snfhistoricodiario()', LANA).v, undefined);
  assert.equal(valor(antes, 'snfhistorico', LANA).v, 189, 'el alias sigue igual con una ranura de antes');
  sinErrores(antes);

  // El puente quita el histórico cuando no cabe (precios-lua.mjs); p1 lleva historico = {omitido = true}.
  const omitido = maquina({ omitido: true });
  abrirSubasta(omitido, 'Horde');
  assert.deepEqual(omitido.lua('SNF_PRECIOS.historico'), { omitido: true });
  assert.equal(historico(omitido, LANA).razon, 'no-cabe');
  sinErrores(omitido);

  // Una ranura cargada hace días (sesión sin /reload): el addon lo mira contra la hora del servidor.
  const viejo = maquina({ historico: { 114: { [LANA]: { ...HISTORICO[114][LANA], hasta: (HOY - 2) * DIA } } } });
  abrirSubasta(viejo, 'Horde');
  assert.equal(historico(viejo, LANA).d.valor, 175, 'con 2 días de margen aún vale');
  viejo.lua(`BANCO.tick = BANCO.tick + ${2 * DIA * 20}`); // dos días después, sin recargar
  const r = historico(viejo, LANA);
  assert.equal(r.razon, 'vencido');
  assert.equal(r.c.hasta, (HOY - 2) * DIA);
  sinErrores(viejo);
});

test('tooltip: «Precio histórico» sale apagado por defecto y, encendido, con su cobertura o la razón', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  assert.equal(fila(lineas(m, LANA), 'Precio histórico'), undefined, 'apagado por defecto: el tooltip no cambia');
  assert.equal(m.lua('SnetForever.TooltipComercio.ponerLinea("historico", true)'), true);
  assert.match(fila(lineas(m, LANA), 'Precio histórico')?.[1] ?? '', /^1s 75c 12 días, 288 lecturas/);
  assert.deepEqual(fila(lineas(m, RARO), 'Precio histórico'), ['Precio histórico', 'no disponible: 2 de 5 días']);
  for (const suffix of ['::::::42', '::::::::::::1:3524']) {
    m.lua(`GameTooltip.GetItem = function() return "Test", "|Hitem:${LANA}${suffix}|h[Test]|h" end`);
    assert.match(fila(lineas(m, LANA), 'Precio histórico')[1], /la app no distingue variantes/);
  }
  m.lua('GameTooltip.GetItem = nil');
  assert.deepEqual(fila(lineas(m, NUEVO), 'Precio histórico'), ['Precio histórico', 'no disponible: sin días observados']);
  sinErrores(m);
});

// Fase 2, cobertura: «Estado del comercio» dice, por casa, cuántos objetos tienen histórico diario y que solo hay datos
// de esa casa. Lo cuenta Precios.cobertura con Precios.historico y las filas; nada regional ni ventas confirmadas.
const cobertura = (m, casa) => m.lua(`local d, razon = SnetForever.Precios.cobertura(${casa}) return {d = d, razon = razon}`);
const estado = (m) => { m.avanzar(1.1); return m.lua('return SnetForever.EstadoComercio.current().lines') ?? []; };

test('cobertura por casa: objetos, salidas locales e histórico diario con sus razones', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  assert.deepEqual(cobertura(m, 114).d, {
    objetos: 3, salen: 1, historico: { conValor: 1, pocosDias: 1, vencido: 0, sinDatos: 1, minDias: 5 },
  });
  assert.deepEqual(cobertura(m, 117).d, {
    objetos: 1, salen: 1, historico: { conValor: 1, pocosDias: 0, vencido: 0, sinDatos: 0, minDias: 5 },
  });
  assert.equal(cobertura(m, 999).razon, 'casa-sin-datos');
  assert.equal(cobertura(m, 'nil').razon, 'sin-casa');
  const l = estado(m);
  assert.ok(l.includes('Histórico diario: 1 de 3 objetos con valor (hacen falta 5 días)'), l.join(' | '));
  assert.ok(l.includes('Solo datos de esta casa: sin precios regionales ni ventas confirmadas'), l.join(' | '));
  assert.equal(l.filter((x) => /regional/i.test(x)).length, 1, 'una sola línea sobre lo regional');
  abrirSubasta(m, null);
  assert.ok(estado(m).includes('Histórico diario: 1 de 1 objetos con valor (hacen falta 5 días)'), 'la neutral cuenta lo suyo');
  sinErrores(m);
});

test('cobertura: ranura de antes, histórico quitado por tamaño y vencido sin recargar', () => {
  const antes = maquina({ sinHistorico: true });
  abrirSubasta(antes, 'Horde');
  assert.deepEqual(cobertura(antes, 114).d, { objetos: 3, salen: 1, historicoRazon: 'formato-anterior' });
  assert.ok(estado(antes).includes('Histórico diario no disponible: actualiza la app'));
  sinErrores(antes);

  const omitido = maquina({ omitido: true });
  abrirSubasta(omitido, 'Horde');
  assert.equal(cobertura(omitido, 114).d.historicoRazon, 'no-cabe');
  assert.ok(estado(omitido).includes('Histórico diario no disponible: no cabía en la ranura de precios'));
  sinErrores(omitido);

  const viejo = maquina({ historico: { 114: { [LANA]: { ...HISTORICO[114][LANA], hasta: (HOY - 2) * DIA } } } });
  abrirSubasta(viejo, 'Horde');
  assert.equal(cobertura(viejo, 114).d.historico.conValor, 1);
  viejo.lua(`BANCO.tick = BANCO.tick + ${2 * DIA * 20}`); // dos días después, sin recargar: cambia el día del servidor
  assert.deepEqual(cobertura(viejo, 114).d.historico, { conValor: 0, pocosDias: 0, vencido: 1, sinDatos: 2, minDias: 5 });
  sinErrores(viejo);
});

test('cobertura: una casa grande publica el recuento solo después de recorrer varios fotogramas', () => {
  const filas = Object.fromEntries(Array.from({ length: 512 }, (_, i) => [10000 + i, FILAS[114][NUEVO]]));
  const m = maquina({ casas: { ...FILAS, 114: { ...FILAS[114], ...filas } } });
  abrirSubasta(m, 'Horde');
  assert.equal(cobertura(m, 114).razon, 'calculando');
  m.avanzar(0.05);
  assert.equal(cobertura(m, 114).razon, 'calculando');
  assert.equal(cobertura(m, 117).d.historico.conValor, 1, 'otra casa puede consultarse mientras esta sigue pendiente');
  assert.ok(estado(m).includes('Histórico diario: 1 de 515 objetos con valor (hacen falta 5 días)'));
  assert.equal(cobertura(m, 114).d.historico.sinDatos, 513);
  sinErrores(m);
});

test('cobertura: medirla no cambia precios ni traducciones regionales', () => {
  const m = maquina();
  abrirSubasta(m, 'Horde');
  const antes = [valor(m, 'snfmercado', LANA).v, valor(m, 'snfhistorico', LANA).v, valor(m, 'snfhistoricodiario()', LANA).v];
  cobertura(m, 114);
  estado(m);
  assert.deepEqual([valor(m, 'snfmercado', LANA).v, valor(m, 'snfhistorico', LANA).v, valor(m, 'snfhistoricodiario()', LANA).v], antes);
  assert.deepEqual(antes, [189, 189, 175]);
  const t = m.lua('local t, n = SnetForever.Formulas.traducir("DBRegionMarketAvg + DBRegionSaleAvg") return {t = t, n = n}');
  assert.equal(t.t.split(' + ')[0], 'snfregional()', 'DBRegionMarketAvg pasa al precio regional de la app, no al histórico');
  assert.notEqual(t.t.split(' + ')[1], 'snfmercado', 'DBRegionSaleAvg no pasa a ser un dato local');
  sinErrores(m);
});
