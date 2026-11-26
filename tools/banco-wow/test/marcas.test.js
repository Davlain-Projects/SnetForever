// Fase 4, tarea 10: marcas de «vender» y «usar» que la IA pone en los objetos de las bolsas (ia/marcas.lua): línea en el
// tooltip (TooltipDataProcessor o, si no existe, OnTooltipSetItem), esquina de Baganator y lista para la ventana de chat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const MAR = 'SnetForever.Marcas';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEXTOS = join(RAIZ, 'addons', 'SnetForever', 'textos');

const LINO = { nombre: 'Linen Cloth', calidad: 1, nivel: 5, precio: 13 };
const POCION = { nombre: 'Minor Healing Potion', calidad: 1, nivel: 1, precio: 5 };

// Baganator falso: cuenta los registros y los refrescos y guarda la función de actualización.
const BAGANATOR = `
  local registros, refrescos = {}, {n = 0}
  rawset(_G, "Baganator", {API = {
    RegisterCornerWidget = function(...) registros[#registros + 1] = {n = select("#", ...), ...} end,
    RequestItemButtonsRefresh = function() refrescos.n = refrescos.n + 1 end,
  }})
  rawset(_G, "BAG_REGISTROS", registros)
  rawset(_G, "BAG_REFRESCOS", refrescos)
`;

// Máquina con lino (2589) en (0,1) × 12 y (0,2) × 3 y una poción (118) en (0,3).
function conBolsas(opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.itemInfo(2589, LINO);
  m.itemInfo(118, POCION);
  m.bolsa(0, 1, { id: 2589, n: 12 });
  m.bolsa(0, 2, { id: 2589, n: 3 });
  m.bolsa(0, 3, { id: 118, n: 1 });
  return m;
}

const marcasGuardadas = (m) => m.guardado().SnetForeverPJ.ia.marcas;

// ---------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------

test('los textos de las dos marcas están en español e inglés', () => {
  const es = readFileSync(join(TEXTOS, 'es.lua'), 'utf8');
  const en = readFileSync(join(TEXTOS, 'en.lua'), 'utf8');
  assert.match(es, /es\.MARCA_VENDER = "SnetForever: la IA recomienda venderlo"/);
  assert.match(es, /es\.MARCA_USAR = "SnetForever: la IA recomienda usarlo"/);
  assert.match(en, /en\.MARCA_VENDER = "SnetForever: the AI recommends selling it"/);
  assert.match(en, /en\.MARCA_USAR = "SnetForever: the AI recommends using it"/);
});

// ---------------------------------------------------------------------------------------------------
// poner, de y quitar
// ---------------------------------------------------------------------------------------------------

test('poner: de(2589) = vender y de(118) = usar, y siguen tras recargar()', () => {
  const m = conBolsas();
  assert.equal(m.lua(`${MAR}.de(2589)`), undefined);
  m.lua(`${MAR}.poner({vender = {2589}, usar = {118}})`);
  assert.equal(m.lua(`${MAR}.de(2589)`), 'vender');
  assert.equal(m.lua(`${MAR}.de(118)`), 'usar');
  assert.equal(m.lua(`${MAR}.de(1)`), undefined);
  assert.deepEqual(marcasGuardadas(m), { vender: [2589], usar: [118] });
  sinErrores(m);

  const r = m.recargar();
  assert.equal(r.lua(`${MAR}.de(2589)`), 'vender');
  assert.equal(r.lua(`${MAR}.de(118)`), 'usar');
  sinErrores(r);
});

test('poner emite SNF_IA_MARCAS, también quitar', () => {
  const m = conBolsas();
  m.lua(`CUENTA = 0; SnetForever.Eventos.escuchar("SNF_IA_MARCAS", function() CUENTA = CUENTA + 1 end)`);
  m.lua(`${MAR}.poner({vender = {2589}})`);
  assert.equal(m.lua('CUENTA'), 1);
  m.lua(`${MAR}.quitar()`);
  assert.equal(m.lua('CUENTA'), 2);
  sinErrores(m);
});

test('poner sustituye lo anterior: no se acumulan marcas de una respuesta a otra', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}})`);
  m.lua(`${MAR}.poner({usar = {118}})`);
  assert.equal(m.lua(`${MAR}.de(2589)`), undefined);
  assert.equal(m.lua(`${MAR}.de(118)`), 'usar');
  sinErrores(m);
});

test('quitar: de(2589) = nil y el guardado queda vacío', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}, usar = {118}})`);
  m.lua(`${MAR}.quitar()`);
  assert.equal(m.lua(`${MAR}.de(2589)`), undefined);
  assert.equal(m.lua(`${MAR}.de(118)`), undefined);
  assert.deepEqual(marcasGuardadas(m), { vender: [], usar: [] });
  sinErrores(m);
});

test('poner acota lo guardado: como mucho 50 ids por tipo, solo enteros válidos y sin repetir', () => {
  const m = conBolsas();
  const muchos = Array.from({ length: 80 }, (_, i) => 1000 + i);
  m.lua(`${MAR}.poner({vender = {${muchos.join(',')}}, usar = {118, 118, 0, -5, 1.5, "7", true, 2147483648, 0/0, 1/0, 99}})`);
  const g = marcasGuardadas(m);
  assert.equal(g.vender.length, 50);
  assert.deepEqual(g.vender, muchos.slice(0, 50));
  assert.deepEqual(g.usar, [118, 99]);
  assert.equal(m.lua(`${MAR}.de(1049)`), 'vender');
  assert.equal(m.lua(`${MAR}.de(1050)`), undefined);
  sinErrores(m);
});

test('poner: un id que viene en las dos listas se queda solo en vender; sin tablas o con basura no falla', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}, usar = {2589, 118}})`);
  assert.equal(m.lua(`${MAR}.de(2589)`), 'vender');
  assert.equal(m.lua(`${MAR}.de(118)`), 'usar');
  m.lua(`${MAR}.poner({vender = "no", usar = 7})`);
  assert.deepEqual(marcasGuardadas(m), { vender: [], usar: [] });
  m.lua(`${MAR}.poner(nil)`);
  m.lua(`${MAR}.poner("x")`);
  assert.deepEqual(marcasGuardadas(m), { vender: [], usar: [] });
  sinErrores(m);
});

test('de: un valor secreto no se compara y da nil', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}})`);
  assert.equal(m.lua(`${MAR}.de(BANCO.secreto("number"))`), undefined);
  sinErrores(m);
});

test('de: lo guardado a mano se limpia al cargar (50 por tipo, enteros válidos) y un guardado dañado no rompe', () => {
  const m = conBolsas();
  const muchos = Array.from({ length: 80 }, (_, i) => 1000 + i);
  m.lua(`SnetForeverPJ.ia.marcas = {vender = {"x", {}, 2589, ${muchos.join(',')}}, usar = {118, 2589, 1.5, -1}}`);
  const r = m.recargar();
  assert.equal(r.lua(`${MAR}.de(2589)`), 'vender');
  assert.equal(r.lua(`${MAR}.de(118)`), 'usar');
  assert.equal(r.lua(`${MAR}.de(1048)`), 'vender'); // el 50.º de los válidos (2589 es el 1.º)
  assert.equal(r.lua(`${MAR}.de(1049)`), undefined);
  assert.equal(r.lua(`${MAR}.de(1)`), undefined);
  r.lua(`SnetForeverPJ.ia.marcas = {vender = 5, usar = "x"}`);
  assert.equal(r.lua(`${MAR}.de(2589)`), undefined);
  r.lua(`SnetForeverPJ.ia.marcas = "roto"`);
  assert.equal(r.lua(`${MAR}.de(2589)`), undefined);
  r.lua(`SnetForeverPJ.ia = nil`);
  assert.equal(r.lua(`${MAR}.de(2589)`), undefined);
  sinErrores(r);
});

test('poner crea SnetForeverPJ.ia si no existe', () => {
  const m = conBolsas();
  m.lua('SnetForeverPJ.ia = nil');
  assert.equal(m.lua(`${MAR}.poner({vender = {2589}})`), true);
  assert.equal(m.lua(`${MAR}.de(2589)`), 'vender');
  assert.deepEqual(marcasGuardadas(m), { vender: [2589], usar: [] });
  sinErrores(m);
});

test('de es una sola indexación: no recorre las listas guardadas en cada llamada', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}})`);
  // Si de() recorriera la lista guardada, un cambio en ella (sin cambiar la tabla marcas) se vería; con el índice no.
  m.lua('SnetForeverPJ.ia.marcas.vender[1] = 777');
  assert.equal(m.lua(`${MAR}.de(2589)`), 'vender');
  assert.equal(m.lua(`${MAR}.de(777)`), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// lista
// ---------------------------------------------------------------------------------------------------

test('lista: 2589 × 15 en (0,1) y (0,2) da n = 15, el nombre y las dos posiciones', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}})`);
  assert.deepEqual(m.lua(`${MAR}.lista()`), [
    { id: 2589, tipo: 'vender', nombre: 'Linen Cloth', n: 15, posiciones: [[0, 1], [0, 2]] },
  ]);
  sinErrores(m);
});

test('lista: solo lo que está en las bolsas, en su orden, y el mismo objeto ligado y sin ligar suma', () => {
  const m = conBolsas();
  m.bolsa(0, 4, { id: 2589, n: 2, ligado: true });
  m.lua(`${MAR}.poner({vender = {2589, 5555}, usar = {118}})`); // 5555 no está en las bolsas
  const l = m.lua(`${MAR}.lista()`);
  assert.deepEqual(l.map((o) => [o.id, o.tipo, o.n, o.posiciones.length]), [[2589, 'vender', 17, 3], [118, 'usar', 1, 1]]);
  m.lua(`${MAR}.quitar()`);
  assert.deepEqual(m.lua(`${MAR}.lista()`), []);
  sinErrores(m);
});

test('lista: un objeto que el cliente aún no tiene en caché lleva su id como nombre', () => {
  const m = nuevaMaquina();
  m.bolsa(0, 1, { id: 777, n: 4 });
  m.lua(`${MAR}.poner({usar = {777}})`);
  const l = m.lua(`${MAR}.lista()`);
  assert.equal(l.length, 1);
  assert.equal(l[0].nombre, '[777]');
  assert.equal(l[0].n, 4);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------------------------------

// Task 20d: estas pruebas son de las marcas del núcleo; el tooltip del comercio (SnetForever_Comercio) añade sus propias líneas al mismo
// tooltip, así que aquí se prueba el núcleo solo (sinComercio). Lo del comercio se prueba en comercio-tooltip.test.js.
test('tooltip: con TooltipDataProcessor, 2589 lleva la línea de vender y uno sin marca no lleva nada', () => {
  const m = conBolsas({ sinComercio: true });
  m.lua(`${MAR}.poner({vender = {2589}, usar = {118}})`);
  const vender = m.lua('SnetForever.L.t("MARCA_VENDER")');
  const usar = m.lua('SnetForever.L.t("MARCA_USAR")');
  assert.deepEqual(m.tooltipObjeto(2589), ['Linen Cloth', `|cFFFFD040${vender}|r`]);
  assert.deepEqual(m.tooltipObjeto(118), ['Minor Healing Potion', `|cFFFFD040${usar}|r`]);
  assert.deepEqual(m.tooltipObjeto(25), ['Objeto 25']);
  m.lua(`${MAR}.quitar()`);
  assert.deepEqual(m.tooltipObjeto(2589), ['Linen Cloth']);
  assert.equal(m.llamadas('TooltipDataProcessor.AddTooltipPostCall').length, 1);
  assert.equal(m.lua('GameTooltip:GetScript("OnTooltipSetItem")'), undefined); // el camino moderno no engancha el script
  // Pedir el mismo objeto dos veces seguidas no repite la línea.
  m.lua(`${MAR}.poner({vender = {2589}})`);
  m.tooltipObjeto(2589);
  assert.equal(m.tooltipObjeto(2589).filter((l) => l.includes('|cFFFFD040')).length, 1);
  sinErrores(m);
});

test('tooltip: sin TooltipDataProcessor funciona por HookScript(OnTooltipSetItem)', () => {
  const m = conBolsas({ sinApi: ['TooltipDataProcessor'], sinComercio: true });
  m.lua(`${MAR}.poner({vender = {2589}})`);
  const vender = m.lua('SnetForever.L.t("MARCA_VENDER")');
  assert.deepEqual(m.tooltipObjeto(2589), ['Linen Cloth', `|cFFFFD040${vender}|r`]);
  assert.deepEqual(m.tooltipObjeto(118), ['Minor Healing Potion']);
  assert.equal(m.lua('GameTooltip:GetScript("OnTooltipSetItem") ~= nil'), true);
  sinErrores(m);
});

test('tooltip: un tooltip prohibido no se toca', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}})`);
  m.lua('BANCO.tooltipProhibido = true');
  assert.deepEqual(m.tooltipObjeto(2589), ['Linen Cloth']);
  sinErrores(m);
});

test('tooltip: un id secreto no se compara', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}})`);
  m.lua(`local f = BANCO.postLlamadasTooltip[0][1]; f(GameTooltip, {id = BANCO.secreto("number")})`);
  assert.deepEqual(m.lua('BANCO.lineasTooltip()'), []);
  sinErrores(m);
});

test('tooltip: el addon cambia de idioma con el cliente (inglés)', () => {
  const m = conBolsas({ jugador: { idioma: 'enUS' }, sinComercio: true });
  m.lua(`${MAR}.poner({usar = {118}})`);
  assert.deepEqual(m.tooltipObjeto(118), ['Minor Healing Potion', '|cFFFFD040SnetForever: the AI recommends using it|r']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Baganator
// ---------------------------------------------------------------------------------------------------

test('Baganator: RegisterCornerWidget una vez con los argumentos del brief; onUpdate sigue a Marcas.de', () => {
  const m = conBolsas({ previo: BAGANATOR });
  assert.equal(m.lua('#BAG_REGISTROS'), 1);
  assert.equal(m.lua('BAG_REGISTROS[1].n'), 5);
  assert.equal(m.lua('BAG_REGISTROS[1][1]'), 'SnetForever');
  assert.equal(m.lua('BAG_REGISTROS[1][2]'), 'snetforever_ia');
  assert.deepEqual(m.lua('BAG_REGISTROS[1][5]'), { corner: 'top_left', priority: 1 });
  m.lua(`${MAR}.poner({vender = {2589}})`);
  assert.equal(m.lua('BAG_REGISTROS[1][3](nil, {itemID = 2589})'), true);
  assert.equal(m.lua('BAG_REGISTROS[1][3](nil, {itemID = 1})'), false);
  assert.equal(m.lua('BAG_REGISTROS[1][3](nil, {})'), false);
  assert.equal(m.lua('BAG_REGISTROS[1][3](nil, nil)'), false);
  assert.equal(m.lua('BAG_REGISTROS[1][3](nil, {itemID = BANCO.secreto("number")})'), false);
  m.lua(`${MAR}.quitar()`);
  assert.equal(m.lua('BAG_REGISTROS[1][3](nil, {itemID = 2589})'), false);
  assert.equal(m.lua('#BAG_REGISTROS'), 1);
  sinErrores(m);
});

test('Baganator: poner y quitar piden refrescar los botones', () => {
  const m = conBolsas({ previo: BAGANATOR });
  assert.equal(m.lua('BAG_REFRESCOS.n'), 0);
  m.lua(`${MAR}.poner({vender = {2589}})`);
  assert.equal(m.lua('BAG_REFRESCOS.n'), 1);
  m.lua(`${MAR}.quitar()`);
  assert.equal(m.lua('BAG_REFRESCOS.n'), 2);
  sinErrores(m);
});

test('Baganator: onInit crea la esquina en el botón y onUpdate la colorea según el tipo', () => {
  const m = conBolsas({ previo: BAGANATOR });
  m.lua(`${MAR}.poner({vender = {2589}, usar = {118}})`);
  m.lua('BOTON = CreateFrame("Button", nil, UIParent); ESQUINA = BAG_REGISTROS[1][4](BOTON)');
  assert.equal(m.lua('ESQUINA ~= nil and ESQUINA:GetParent() == BOTON'), true);
  // 11-nov: los aros de los pines también usan SetColorTexture; se cuentan solo las de la esquina.
  const antes = m.llamadas('Texture:SetColorTexture').length;
  assert.equal(m.lua('BAG_REGISTROS[1][3](ESQUINA, {itemID = 2589})'), true);
  assert.equal(m.lua('BAG_REGISTROS[1][3](ESQUINA, {itemID = 118})'), true);
  assert.equal(m.llamadas('Texture:SetColorTexture').length - antes, 2);
  sinErrores(m);
});

test('Baganator: si aparece después, se registra en PLAYER_LOGIN y no se repite', () => {
  const m = conBolsas();
  m.lua(BAGANATOR);
  assert.equal(m.lua('#BAG_REGISTROS'), 0);
  m.disparar('PLAYER_LOGIN');
  m.disparar('PLAYER_LOGIN');
  assert.equal(m.lua('#BAG_REGISTROS'), 1);
  sinErrores(m);
});

test('sin Baganator: poner y quitar no fallan', () => {
  const m = conBolsas();
  m.lua(`${MAR}.poner({vender = {2589}})`);
  m.lua(`${MAR}.quitar()`);
  sinErrores(m);
});

test('Baganator sin RegisterCornerWidget: no se registra y no falla', () => {
  const m = conBolsas({ previo: 'rawset(_G, "Baganator", {API = {}})' });
  m.lua(`${MAR}.poner({vender = {2589}})`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Límites del addon
// ---------------------------------------------------------------------------------------------------

test('el módulo no vende, usa, equipa ni mueve nada: no llama a ninguna API de acción', () => {
  const m = conBolsas({ previo: BAGANATOR });
  m.lua(`${MAR}.poner({vender = {2589}, usar = {118}})`);
  m.tooltipObjeto(2589);
  m.lua(`${MAR}.lista()`);
  m.lua(`${MAR}.quitar()`);
  const codigo = readFileSync(join(RAIZ, 'addons', 'SnetForever', 'ia', 'marcas.lua'), 'utf8');
  for (const prohibido of ['UseContainerItem', 'PickupContainerItem', 'EquipItem', 'UseItemByName', 'SellCursorItem', 'DeleteCursorItem', 'SetScript']) {
    assert.ok(!codigo.includes(prohibido), prohibido);
  }
  sinErrores(m);
});
