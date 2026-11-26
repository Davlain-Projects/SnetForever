// Andamiaje de la fase 4: versión 0.4.0 (0.4.9 al cerrar la fase 4; desde la fase 5, 0.5.1; 11-nov y 12-nov, 0.5.2 a 0.5.13; 13-nov, 0.5.14 y 0.5.15; comercio fase 1, 0.6.0; diario de objetos, 0.6.2; convivencia con TSM, 0.6.3; ventana principal de comercio, 0.7.0), .toc con los módulos de la IA, timbres vacíos, guardado «ia» y comprobador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';
import { comprobarLua51 } from '../src/comprobar-lua51.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');
const COMERCIO = join(RAIZ, 'addons', 'SnetForever_Comercio');

const NUEVOS = [
  'ia\\json.lua', 'ia\\codec.lua', 'ia\\franja.lua', 'ia\\timbres.lua', 'ia\\buzon.lua', 'ia\\contexto.lua',
  // 0.6.1: el diario de objetos va justo después del inventario.
  // Puente con TATI, tarea A1: el latido, justo después del envío.
  'ia\\inventario.lua', 'ia\\diario.lua', 'ia\\subasta.lua', 'ia\\envio.lua', 'ia\\latido.lua', 'ia\\ruta.lua', 'ia\\marcas.lua',
  // 0.7.0: el comercio (comercio\\*, ui\\tema.lua, ui\\piezas\\* y ui\\comercio*.lua) se fue al addon SnetForever_Comercio;
  // en el núcleo, tras las marcas va el chat.
  'ui\\chat.lua',
];
// Comercio, tarea 9: el módulo de comercio va primero (tarea 15: comercio\\propuesta.lua tras las reglas; tarea 10: el
// escaneo en vivo; tarea 13: comercio\\compra.lua tras el escaneo; tarea 14: comercio\\sniper.lua tras la compra; ventana
// principal: el tema va antes de toda ui que lo use; tarea 12: la ventana, la última). Desde la 0.7.0 van en el .toc de
// SnetForever_Comercio, que el cliente carga después de todo el núcleo.
const NUEVOS_COMERCIO = [
  'comercio\\comercio.lua', 'comercio\\precios.lua', 'comercio\\estado.lua', 'comercio\\merchant-prices.lua', 'comercio\\disenchant-samples.lua', 'comercio\\recipe-costs.lua', 'comercio\\formulas.lua', 'comercio\\arbol.lua', 'comercio\\grupos.lua', 'comercio\\operaciones.lua', 'comercio\\texto-grupos.lua', 'comercio\\importar-tsm.lua', 'comercio\\reglas.lua', 'comercio\\propuesta.lua',
  'comercio\\escaneo.lua', 'comercio\\inventario.lua', 'comercio\\compra.lua', 'comercio\\sniper.lua', 'comercio\\busqueda.lua', 'comercio\\vender.lua', 'comercio\\mis-subastas.lua', 'comercio\\auction-orders.lua', 'comercio\\group-shopping.lua', 'comercio\\ledger.lua',
  'ui\\tema.lua', 'ui\\piezas\\botones.lua', 'ui\\piezas\\campos.lua', 'ui\\piezas\\contenedores.lua', 'ui\\piezas\\arbol.lua', 'ui\\piezas\\tabla.lua', 'ui\\piezas\\muestrario.lua', 'ui\\comercio_tabla.lua', 'ui\\comercio_cantidad.lua', 'ui\\subasta\\ventana.lua', 'ui\\subasta\\navegar.lua', 'ui\\subasta\\resultados.lua', 'ui\\subasta\\sniper.lua', 'ui\\subasta\\auction-orders.lua', 'ui\\comercio.lua', 'ui\\tooltip.lua',
  // Task 12: la ventana principal y sus dos páginas provisionales.
  'ui\\principal.lua', 'ui\\principal\\dashboard.lua', 'ui\\principal\\contabilidad.lua', 'ui\\principal\\grupos.lua',
  // Task 21: la página Operaciones; Task 22: su editor de operaciones va antes (la página lo usa al crearse).
  // Task 23: el editor de fórmulas ⧉ va detrás del de operaciones (cambia su gancho); la página Ajustes, la última.
  'ui\\principal\\editor-operacion.lua', 'ui\\principal\\editor-formula.lua', 'ui\\principal\\operaciones.lua',
  'ui\\principal\\ajustes.lua',
];
const MODULOS = ['JSON', 'Codec', 'Franja', 'Timbres', 'Buzon', 'Contexto', 'Inventario', 'Subasta', 'Envio', 'Latido', 'Ruta', 'Marcas', 'Chat'];
const MODULOS_COMERCIO = ['Comercio', 'Precios', 'EstadoComercio', 'MerchantPrices', 'Arbol', 'Grupos', 'Operaciones', 'TextoGrupos', 'ImportarTSM', 'Reglas', 'Propuesta', 'Escaneo', 'Compra', 'Sniper', 'Busqueda', 'Vender', 'MisSubastas', 'AuctionOrders', 'GroupShopping', 'Contabilidad', 'Tema', 'Piezas', 'Muestrario', 'TablaComercio', 'CantidadComercio', 'UIComercio', 'TooltipComercio', 'Principal', 'PrincipalDashboard', 'PrincipalContabilidad', 'PrincipalGrupos', 'PrincipalOperaciones', 'SubastaVentana', 'SubastaNavegar', 'EditorOperacion'];
const TIMBRES = ['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar', 'vivo_a', 'vivo_b', 'presente'];

test('versión 0.7.0 en espacio.lua y en el .toc', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.VERSION'), '0.7.0');
  assert.match(readFileSync(join(ADDON, 'SnetForever.toc'), 'utf8'), /^## Version: 0.7.0\r?$/m);
  sinErrores(m);
});

test('el .toc trae los archivos de la IA (13-nov: con ia\\subasta.lua), seguidos y antes de ui\\panel.lua', () => {
  const lineas = readFileSync(join(ADDON, 'SnetForever.toc'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  const desde = lineas.indexOf(NUEVOS[0]);
  assert.ok(desde >= 0, 'falta ia\\json.lua');
  assert.deepEqual(lineas.slice(desde, desde + NUEVOS.length), NUEVOS);
  assert.ok(lineas.indexOf('ui\\panel.lua') > desde + NUEVOS.length - 1, 'ui\\panel.lua va después');
  assert.ok(lineas.indexOf('ui\\objetivos.lua') >= 0 && lineas.indexOf('mapa\\cercanos.lua') >= 0, 'lo de la fase 3 sigue');
});

test('0.7.0: el .toc de SnetForever_Comercio trae los archivos del comercio, seguidos y en su orden, y el del núcleo ninguno', () => {
  const comercio = readFileSync(join(COMERCIO, 'SnetForever_Comercio.toc'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.deepEqual(comercio.filter((l) => l && !l.startsWith('#')), NUEVOS_COMERCIO);
  const nucleo = readFileSync(join(ADDON, 'SnetForever.toc'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  for (const a of NUEVOS_COMERCIO) assert.equal(nucleo.includes(a), false, a);
});

test('cada módulo nuevo del núcleo crea su tabla en SnetForever, también con solo el núcleo', () => {
  const sin = nuevaMaquina({ sinComercio: true });
  for (const nombre of MODULOS) assert.equal(sin.lua(`type(SnetForever.${nombre})`), 'table', nombre);
  for (const nombre of MODULOS_COMERCIO) assert.equal(sin.lua(`type(SnetForever.${nombre})`), 'nil', nombre);
  sinErrores(sin);
});

test('cada módulo del addon de comercio crea su tabla en SnetForever (con los dos addons)', necesitaComercio, () => {
  const m = nuevaMaquina();
  for (const nombre of [...MODULOS, ...MODULOS_COMERCIO]) assert.equal(m.lua(`type(SnetForever.${nombre})`), 'table', nombre);
  sinErrores(m);
});

test('existen los 7 timbres .wav y miden 0 bytes', () => {
  for (const t of TIMBRES) {
    const ruta = join(ADDON, 'senales', `${t}.wav`);
    assert.ok(existsSync(ruta), t);
    assert.equal(statSync(ruta).size, 0, t);
  }
});

test('guardado: un SnetForeverPJ sin «ia» la recibe con sus valores por defecto', () => {
  const m = nuevaMaquina({ guardado: { SnetForeverPJ: { esquema: 1 } }, entrar: false });
  m.lua('SnetForever.Guardado.preparar()');
  assert.equal(m.lua('SnetForeverPJ.ia.cursor'), 0);
  assert.equal(m.lua('SnetForeverPJ.ia.n'), 0);
  assert.deepEqual(m.lua('SnetForeverPJ.ia.marcas.vender'), []);
  assert.deepEqual(m.lua('SnetForeverPJ.ia.marcas.usar'), []);
  assert.deepEqual(m.lua('SnetForeverPJ.ia.chat'), []);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta'), undefined);
  assert.equal(m.lua('SnetForeverPJ.ia.banco'), undefined);
  sinErrores(m);
});

test('guardado: lo que ya había en «ia» se conserva', () => {
  const m = nuevaMaquina({ guardado: { SnetForeverPJ: { esquema: 1, ia: { cursor: 7, marcas: { vender: [2589] } } } }, entrar: false });
  m.lua('SnetForever.Guardado.preparar()');
  assert.equal(m.lua('SnetForeverPJ.ia.cursor'), 7);
  assert.deepEqual(m.lua('SnetForeverPJ.ia.marcas.vender'), [2589]);
  assert.deepEqual(m.lua('SnetForeverPJ.ia.marcas.usar'), []);
  sinErrores(m);
});

test('ajustes: «chat.pos» es una clave conocida', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Ajustes.set("chat.pos", {x = 1})');
  assert.equal(m.lua('SnetForever.Ajustes.get("chat.pos").x'), 1);
  sinErrores(m);
});

const enLinea3 = (texto) => `-- cabecera\nlocal a = 1\n${texto}\nlocal z = 2\n`;

test('comprobador: rechaza UseInventoryItem y C_Container.PickupContainerItem', () => {
  assert.equal(comprobarLua51(enLinea3('UseInventoryItem(16)'), 'p.lua').length, 1);
  assert.equal(comprobarLua51(enLinea3('C_Container.PickupContainerItem(0, 1)'), 'p.lua').length, 1);
});
