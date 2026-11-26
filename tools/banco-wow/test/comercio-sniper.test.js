// Comercio, tarea 14: el sniper (comercio/sniper.lua y la pestaña Sniper; desde la tarea S2 del bloque B, la pestaña es
// ui/subasta/sniper.lua, SnetForever.SubastaSniper, con sus pruebas de distribución en subasta-sniper.test.js). Repite la búsqueda
// general de la subasta (SendBrowseQuery vacío y las páginas que falten, como el escaneo al navegar) cada
// comercioSniperCada segundos, compara con lo que ya había visto y apunta como hallazgo lo nuevo o más barato que la
// regla de sniper del grupo del objeto da por bueno. Nunca compra: elegir un hallazgo lo pausa y prepara la compra con
// SNF.Compra; tras «hecho» o descartar, sigue. No busca a la vez que el escaneo ni encima de otro addon o del jugador.
// Las pruebas con testSiempre no necesitan el comercio: corren también en la pasada de solo núcleo.
import { after, test as testSiempre } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
// 0.7.0: las pruebas de este archivo (salvo las de testSiempre) necesitan el addon SnetForever_Comercio; en la pasada
// de solo núcleo (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357;
const CALMA = 5;
const SONIDO = 8959; // SOUNDKIT.RAID_WARNING

// Lo normal de todos es 10 de oro (100000 de cobre). Ritmo 0,6, salvo el paño de lana (0,2: se vende poco).
const RITMOS = { 2589: 0.6, 2592: 0.2, 4306: 0.6, 4338: 0.6, 14047: 0.6 };
function ponerRanura(dir, extra = [], mercancias = []) {
  const i = ranuraDeHora(H);
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n`);
  const ritmos = { ...RITMOS };
  for (const item of extra) ritmos[item] = 0.6;
  const filas = Object.entries(ritmos).map(([item, r]) => `[${item}] = {98000, 400, 100000, 0, ${r}, 85, 0${mercancias.includes(Number(item)) ? ', 37, 1, 1' : ''}}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${foto(H)}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

// Máquina Horda del reino Normal con 1000 de oro y precios de la app; el escaneo es el de verdad.
function maquina({ extra = [], mercancias = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-sniper-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir, extra, mercancias);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('BANCO.jugador.dinero = 10000000');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2 });
  // SV apunta cada SNF_COMERCIO_SNIPER(n) con n > 0.
  m.lua(`rawset(_G, "SV", {})
    SnetForever.escuchar("SNF_COMERCIO_SNIPER", function(n) if n and n > 0 then SV[#SV + 1] = n end end)`);
  return m;
}

// Lo que da la búsqueda general: {item: precio} (cantidad 10 de cada uno).
function publicar(m, filas, porPagina = 50) {
  const lua = Object.entries(filas).map(([item, p]) => `{itemID = ${item}, totalQuantity = 10, minPrice = ${p}}`);
  m.lua(`BANCO.ponerSubasta({navegar = {${lua.join(', ')}}, porPagina = ${porPagina}})`);
}

const S = 'SnetForever.Sniper';
const P = 'SnetForever.SubastaSniper.marcos'; // la pestaña Sniper (tarea S2)
const T = `${P}.tabla`;
const abrir = (m) => m.disparar('AUCTION_HOUSE_SHOW');
const cerrar = (m) => m.disparar('AUCTION_HOUSE_CLOSED');
const estado = (m) => m.lua(`${S}.estado()`);
const motivo = (m) => m.lua(`${S}.motivo()`);
const hallazgos = (m) => m.lua(`${S}.hallazgos()`) || [];
const navegaciones = (m) => m.llamadas('C_AuctionHouse.SendBrowseQuery').length;
const masPaginas = (m) => m.llamadas('C_AuctionHouse.RequestMoreBrowseResults').length;
const escaneo = (m) => m.lua('SnetForever.Escaneo.estado()');
const sonidos = (m) => m.llamadas('PlaySound').filter((a) => a[0] === SONIDO).length;
const COMPRAS = ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase'];
// Arreglo de la compra suelta (2026-11-19): un objeto suelto pide siempre dos clics en Comprar de la barra (el primero no
// compra: pasa a «confirmar»); el segundo, pasado el medio segundo sin clics, compra.
function comprarObjeto(m) {
  m.lua('SnetForever.UIComercio.marco().pie.comprar:Click()');
  m.avanzar(0.6);
  m.lua('SnetForever.UIComercio.marco().pie.comprar:Click()');
}
const compras = (m) => COMPRAS.reduce((n, api) => n + m.llamadas(`C_AuctionHouse.${api}`).length, 0);
const ajena = (m, texto = '') => m.lua(`C_AuctionHouse.SendBrowseQuery({searchString = "${texto}", sorts = {}})`);

// Abre la subasta y deja acabar el escaneo de la apertura.
function abrirYEscanear(m) {
  abrir(m);
  for (let i = 0; i < 400 && escaneo(m) !== 'completo'; i++) m.avanzar(0.05);
  assert.equal(escaneo(m), 'completo', 'el escaneo de la apertura acaba');
}

test('dormido: antes de abrir la subasta no escucha nada y empezar no hace nada', () => {
  const m = maquina();
  assert.equal(m.lua(`type(${S})`), 'table');
  assert.equal(estado(m), 'parado');
  m.lua(`${S}.empezar()`);
  m.avanzar(10);
  assert.equal(estado(m), 'parado');
  assert.equal(navegaciones(m), 0);
  for (const e of ['AUCTION_HOUSE_BROWSE_RESULTS_UPDATED', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED', 'AUCTION_HOUSE_THROTTLED_SYSTEM_READY']) {
    assert.equal(m.lua(`#(BANCO.eventos.${e} or {})`), 0, `${e} sin registrar`);
  }
  sinErrores(m);
});

test('dos vueltas: un objeto que baja al 70 % con ritmo 0,6 aparece una vez; al mismo precio no se repite; con ritmo 0,2 no aparece', () => {
  const m = maquina();
  publicar(m, { 2589: 100000, 2592: 100000, 4306: 60000 });
  abrirYEscanear(m);
  const antes = navegaciones(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(navegaciones(m), antes + 1, 'la primera vuelta empieza ya');
  assert.deepEqual(m.llamadas('C_AuctionHouse.SendBrowseQuery')[antes][0], { searchString: '', sorts: [], filters: [], itemClassFilters: [] },
    'con filters e itemClassFilters: sin ellos WoW Forever no devuelve nada');
  assert.equal(estado(m), 'buscando');
  // Primera vuelta: la seda ya estaba al 60 % (buena con la regla de sniper ≤ 90 %).
  let h = hallazgos(m);
  assert.equal(h.length, 1);
  assert.equal(h[0].item, 4306);
  assert.equal(h[0].precio, 60000);
  assert.equal(Math.round(h[0].pct), 60);
  assert.equal(h[0].cantidad, 10);
  assert.ok(Math.abs(h[0].hora - m.lua('GetServerTime()')) <= 2, 'hora en segundos del servidor');
  assert.deepEqual(m.lua('SV'), [1]);
  assert.equal(sonidos(m), 1, 'suena con un hallazgo');
  // Baja el lino al 70 % y la lana también (pero la lana se vende poco).
  publicar(m, { 2589: 70000, 2592: 70000, 4306: 60000 });
  m.avanzar(4);
  assert.equal(navegaciones(m), antes + 1, 'espera comercioSniperCada (5 s) entre vueltas');
  m.avanzar(1.2);
  assert.equal(navegaciones(m), antes + 2, 'segunda vuelta');
  h = hallazgos(m);
  assert.deepEqual(h.map((x) => x.item), [2589, 4306], 'el nuevo arriba; la lana (ritmo 0,2) no');
  assert.equal(h[0].precio, 70000);
  assert.deepEqual(m.lua('SV'), [1, 1]);
  // Tercera vuelta, todo igual: nada nuevo.
  m.avanzar(5.2);
  assert.equal(navegaciones(m), antes + 3);
  assert.equal(hallazgos(m).length, 2, 'al mismo precio no se repite');
  assert.deepEqual(m.lua('SV'), [1, 1]);
  assert.equal(sonidos(m), 2);
  // Más barato todavía: sale otra vez arriba (sin dejar el de antes repetido).
  publicar(m, { 2589: 65000, 2592: 70000, 4306: 60000 });
  m.avanzar(5.2);
  h = hallazgos(m);
  assert.deepEqual(h.map((x) => [x.item, x.precio]), [[2589, 65000], [4306, 60000]]);
  assert.equal(compras(m), 0, 'el sniper nunca compra');
  sinErrores(m);
});

test('sin sonido si el jugador lo apaga; cada comercioSniperCada segundos', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("comercioSniperSonido", false)');
  m.lua('SnetForever.Ajustes.set("comercioSniperCada", 10)');
  publicar(m, { 4306: 60000 });
  abrirYEscanear(m);
  const antes = navegaciones(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(hallazgos(m).length, 1);
  assert.equal(sonidos(m), 0);
  m.avanzar(9);
  assert.equal(navegaciones(m), antes + 1);
  m.avanzar(1.2);
  assert.equal(navegaciones(m), antes + 2);
  sinErrores(m);
});

test('como mucho 50 hallazgos, los más nuevos arriba; la regla del grupo propio manda', () => {
  const extra = Array.from({ length: 60 }, (_, i) => 30001 + i);
  const m = maquina({ extra });
  const filas = {};
  for (const item of extra) filas[item] = 50000;
  publicar(m, filas);
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(hallazgos(m).length, 50);
  // Un grupo propio con la lana y sniperPct 50: ritmoMin 0,1 la deja pasar, pero solo por debajo de 5 de oro.
  m.lua(`local c = SnetForever.Grupos.crear("Lanas"); SnetForever.Grupos.anadir(c, 2592)
    assert(SnetForever.Reglas.poner(c, {sniperPct = 50, ritmoMin = 0.1}))`);
  publicar(m, { ...filas, 2592: 60000 });
  m.avanzar(5.2);
  assert.notEqual(hallazgos(m)[0].item, 2592, 'al 60 % no pasa su regla (≤ 50 %)');
  publicar(m, { ...filas, 2592: 45000 });
  m.avanzar(5.2);
  const h = hallazgos(m);
  assert.equal(h.length, 50);
  assert.equal(h[0].item, 2592, 'el más nuevo arriba');
  sinErrores(m);
});

test('con el sistema limitado espera sin buscar ni dar errores, y sigue al quedar libre', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  abrirYEscanear(m);
  const antes = navegaciones(m);
  m.lua('BANCO.ponerSubasta({lista = false})');
  m.lua(`${S}.empezar()`);
  m.avanzar(5);
  assert.equal(estado(m), 'esperando');
  assert.equal(motivo(m), 'limitado');
  assert.equal(navegaciones(m), antes, 'no lanza búsquedas que se perderían');
  assert.equal(m.llamadas('C_AuctionHouse:limitada').length, 0);
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(0.1);
  assert.equal(navegaciones(m), antes + 1);
  assert.equal(hallazgos(m).length, 1);
  sinErrores(m);
});

test('choque con el escaneo: el sniper espera a que acabe, nunca buscan a la vez, y el escaneo no relanza mientras corre', () => {
  const m = maquina();
  // Muchas páginas: el escaneo de la apertura tarda varios fotogramas en navegar.
  const filas = {};
  for (let i = 0; i < 10; i++) filas[2000 + i] = 100000;
  filas[4306] = 60000;
  publicar(m, filas, 2);
  m.lua(`rawset(_G, "PROPIAS", 0)
    local original = SnetForever.Escaneo.propia
    SnetForever.Escaneo.propia = function(...) PROPIAS = PROPIAS + 1; return original(...) end`);
  // De cada búsqueda: quién la hace (dentro de Escaneo.propia = el sniper) y cómo está el escaneo en ese momento.
  m.lua(`rawset(_G, "BUSQUEDAS", {})
    for _, f in ipairs({"SendBrowseQuery", "RequestMoreBrowseResults"}) do
      local original = C_AuctionHouse[f]
      C_AuctionHouse[f] = function(...)
        BUSQUEDAS[#BUSQUEDAS + 1] = {f = f, escaneo = SnetForever.Escaneo.estado(), sniper = PROPIAS}
        return original(...)
      end
    end`);
  abrir(m);
  m.lua(`${S}.empezar()`); // el jugador pulsa Empezar nada más abrir
  assert.equal(estado(m), 'esperando');
  assert.equal(motivo(m), 'escaneo');
  for (let i = 0; i < 400 && escaneo(m) !== 'completo'; i++) {
    m.avanzar(0.05);
    if (escaneo(m) !== 'completo') assert.equal(estado(m), 'esperando', 'mientras escanea, el sniper no busca');
  }
  assert.equal(escaneo(m), 'completo', 'el escaneo acaba sin repetir vueltas');
  m.avanzar(0.1);
  const b = m.lua('BUSQUEDAS');
  const delEscaneo = b.filter((x) => x.sniper === 0);
  assert.deepEqual(delEscaneo.map((x) => x.f), ['SendBrowseQuery', ...Array(5).fill('RequestMoreBrowseResults')],
    'el escaneo navega una sola vuelta (6 páginas)');
  const delSniper = b.filter((x) => x.sniper > 0);
  assert.ok(delSniper.length >= 1, 'en cuanto acaba el escaneo, empieza el sniper');
  assert.equal(delSniper[0].f, 'SendBrowseQuery');
  for (const x of delSniper) assert.equal(x.escaneo, 'completo', 'el sniper solo busca con el escaneo acabado');
  assert.equal(b.indexOf(delSniper[0]), delEscaneo.length, 'todas las del escaneo van antes');
  assert.ok(m.lua('PROPIAS') >= 1, 'las búsquedas del sniper pasan por Escaneo.propia');
  for (let i = 0; i < 40; i++) m.avanzar(0.05);
  assert.equal(escaneo(m), 'completo', 'las búsquedas del sniper no estropean el escaneo');
  assert.deepEqual(hallazgos(m).map((x) => x.item), [4306]);
  // Mientras corre el sniper, el escaneo no relanza.
  const n = navegaciones(m);
  m.lua('SnetForever.Escaneo.iniciar()');
  assert.equal(escaneo(m), 'completo');
  m.avanzar(0.05);
  assert.equal(navegaciones(m), n, 'iniciar() no hace nada con el sniper en marcha');
  assert.equal(m.llamadas('C_AuctionHouse.ReplicateItems').length, 1, 'solo la de la apertura');
  // Parado el sniper, el escaneo sí puede volver.
  m.lua(`${S}.parar()`);
  m.lua('SnetForever.Escaneo.iniciar()');
  assert.notEqual(escaneo(m), 'completo');
  sinErrores(m);
});

test('búsqueda ajena: deja la vuelta y espera la calma; con texto (el jugador buscando) espera 60 s', () => {
  const m = maquina();
  const filas = {};
  for (let i = 0; i < 10; i++) filas[2000 + i] = 100000;
  publicar(m, filas, 2);
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.12); // la primera página de la vuelta
  assert.equal(estado(m), 'buscando');
  ajena(m);
  const tras = navegaciones(m);
  const mas = masPaginas(m);
  m.avanzar(0.05);
  assert.equal(estado(m), 'esperando');
  assert.equal(motivo(m), 'ajena');
  m.avanzar(CALMA - 0.5);
  assert.equal(navegaciones(m), tras, 'nada durante la calma');
  assert.equal(masPaginas(m), mas, 'ni páginas de la vuelta estropeada');
  m.avanzar(1.5);
  assert.equal(navegaciones(m), tras + 1, 'pasada la calma, vuelta nueva desde el principio');
  // El jugador busca algo con texto en la subasta de Blizzard: 60 s sin tocar su lista.
  for (let i = 0; i < 40; i++) m.avanzar(0.05);
  ajena(m, 'lino');
  const n = navegaciones(m);
  m.avanzar(50);
  assert.equal(navegaciones(m), n);
  assert.equal(motivo(m), 'ajena');
  m.avanzar(12);
  assert.ok(navegaciones(m) > n);
  sinErrores(m);
});

test('no pasa del máximo de búsquedas por minuto del cliente', () => {
  const m = maquina();
  const filas = {};
  for (let i = 0; i < 200; i++) filas[2000 + i] = 100000;
  publicar(m, filas, 1); // 200 páginas por vuelta
  m.lua('SnetForever.Ajustes.set("comercioSniperCada", 1)');
  abrirYEscanear(m);
  m.lua(`rawset(_G, "TIEMPOS", {})
    for _, f in ipairs({"SendBrowseQuery", "RequestMoreBrowseResults"}) do
      hooksecurefunc(C_AuctionHouse, f, function() TIEMPOS[#TIEMPOS + 1] = GetTime() end)
    end`);
  m.lua(`${S}.empezar()`);
  let visto = false;
  for (let i = 0; i < 150 * 20; i++) {
    m.avanzar(0.05);
    if (motivo(m) === 'ritmo') visto = true;
  }
  const t = m.lua('TIEMPOS');
  assert.ok(t.length > 150, `sigue buscando (${t.length})`);
  for (let i = 0; i < t.length; i++) {
    const enUnMinuto = t.filter((x) => x >= t[i] && x < t[i] + 60).length;
    assert.ok(enUnMinuto <= 90, `${enUnMinuto} búsquedas en 60 s desde ${t[i]}`);
  }
  assert.ok(visto, 'dice que espera por el límite');
  sinErrores(m);
});

test('elegir un hallazgo pausa el sniper solo mientras busca la subasta; con la compra «lista» sigue buscando (sin comprar); al descartar, sigue', () => {
  const m = maquina();
  publicar(m, { 2589: 70000 });
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 70000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(hallazgos(m).length, 1);
  m.lua(`${S}.elegir(1)`);
  assert.equal(estado(m), 'pausado', 'mientras la compra busca la subasta, el sniper no busca');
  m.avanzar(0.05);
  const e = m.lua('SnetForever.Compra.estado()');
  assert.equal(e.fase, 'lista');
  assert.equal(e.item, 2589);
  assert.equal(e.cantidad, 1, 'una mercancía elegida empieza en 1 unidad');
  assert.equal(e.total, 70000);
  const n = navegaciones(m);
  m.avanzar(20);
  assert.ok(navegaciones(m) > n, 'una compra «lista» que el jugador no toca no para el sniper');
  assert.notEqual(estado(m), 'pausado');
  assert.equal(compras(m), 0, 'y el sniper no compra');
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista', 'la compra sigue preparada');
  assert.equal(hallazgos(m).length, 1, 'el hallazgo elegido sigue en la lista');
  m.lua('SnetForever.UIComercio.marco().pie.descartar:Click()');
  assert.notEqual(estado(m), 'pausado');
  const n2 = navegaciones(m);
  m.avanzar(6);
  assert.ok(navegaciones(m) > n2, 'tras descartar, sigue');
  sinErrores(m);
});

test('con una mercancía por confirmar el sniper espera; al confirmar o descartar, sigue', () => {
  const m = maquina();
  publicar(m, { 2589: 70000 });
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 70000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  m.lua(`${S}.elegir(1)`);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  // B2r, punto 1: con una mercancía Comprar abre el cuadro de cantidad y lo dice, sin unidades ni importe.
  assert.equal(m.lua('SnetForever.UIComercio.marco().pie.comprar.texto:GetText()'), m.lua('SnetForever.L.t("COMERCIO_ELEGIR_CANTIDAD")'));
  m.lua('SnetForever.UIComercio.marco().pie.comprar:Click()'); // una mercancía: abre el cuadro de cantidad
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()'); // pide el precio real
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'confirmar');
  m.avanzar(0.1); // una página que estuviera en camino ya ha llegado
  const n = navegaciones(m) + masPaginas(m);
  m.avanzar(20);
  assert.equal(navegaciones(m) + masPaginas(m), n, 'con la compra por confirmar no busca');
  assert.equal(estado(m), 'pausado');
  m.lua('SnetForever.UIComercio.marco().pie.descartar:Click()');
  m.avanzar(6);
  assert.ok(navegaciones(m) + masPaginas(m) > n, 'tras descartar, sigue');
  assert.equal(compras(m), 1, 'solo el clic del jugador (pedir el precio)');
  sinErrores(m);
});

test('con el sniper en marcha, tras comprar de la lista normal y elegirse sola la fila siguiente, el sniper no se queda parado', () => {
  const m = maquina();
  publicar(m, { 4306: 60000, 2589: 70000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}, [2589] = {{quantity = 1, buyoutAmount = 70000}}}})');
  abrirYEscanear(m);
  // F1 (ronda 1): la lista de ofertas sale de la foto elegida; con la lista de cada objeto leída, de ella (60000 y 70000).
  for (const id of [4306, 2589]) {
    assert.equal(m.lua(`SnetForever.Busqueda.pedirSubastas(${id})`), true);
    m.avanzar(0.1);
  }
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 2)');
  const V = 'SnetForever.UIComercio.marco()';
  m.lua(`${S}.empezar()`);
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.UIComercio.fila(1).item'), 4306);
  m.lua(`${V}.filas[1]:Click()`);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  comprarObjeto(m);
  m.avanzar(0.05); // hecho: se elige sola la siguiente fila buena
  m.avanzar(0.05);
  const e = m.lua('SnetForever.Compra.estado()');
  assert.equal(e.fase, 'lista');
  assert.equal(e.item, 2589, 'la fila siguiente queda preparada, sin comprarse');
  const n = navegaciones(m);
  m.avanzar(12);
  assert.ok(navegaciones(m) > n, 'el sniper sigue buscando con esa fila «lista»');
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 1, 'solo el clic del jugador compra');
  sinErrores(m);
});

test('comprar un hallazgo con el botón: queda «hecho», sale de la lista y el sniper sigue (sin elegir otra fila solo)', () => {
  const m = maquina();
  publicar(m, { 4306: 60000, 2589: 70000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  const i = hallazgos(m).findIndex((x) => x.item === 4306) + 1;
  m.lua(`${S}.elegir(${i})`);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  assert.equal(compras(m), 0);
  comprarObjeto(m);
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 1, 'solo el clic del jugador compra');
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'hecho');
  m.avanzar(0.1);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'hecho', 'no prepara solo otra compra');
  assert.deepEqual(hallazgos(m).map((x) => x.item), [2589], 'lo comprado sale de la lista');
  assert.notEqual(estado(m), 'pausado');
  const n = navegaciones(m);
  m.avanzar(6);
  assert.ok(navegaciones(m) > n, 'el sniper sigue');
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 1);
  sinErrores(m);
});

// Ronda 1 de B5 (regla del coordinador): se compra EXACTAMENTE el hallazgo marcado, nunca otra subasta más barata.
test('regla nueva, sniper: con dos subastas del mismo objeto y el hallazgo más caro por unidad, se compra el marcado', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  // El hallazgo es la de 6 de oro (id 4306001); al elegirlo hay otra de 5,5 (id 4306002) que no se ha marcado.
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}, {quantity = 1, buyoutAmount = 55000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  const i = hallazgos(m).findIndex((x) => x.item === 4306) + 1;
  assert.ok(i > 0, 'sale el hallazgo');
  m.lua(`${S}.elegir(${i})`);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().total'), 60000, 'la del hallazgo, no la más barata');
  m.avanzar(0.6);
  comprarObjeto(m);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[4306 * 1000 + 1, 60000]]);
  sinErrores(m);
});

test('regla nueva, sniper: el hallazgo marcado ya no está → «ya no está» y nada comprado', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  const i = hallazgos(m).findIndex((x) => x.item === 4306) + 1;
  m.lua('BANCO.subasta.objetos[4306] = {}'); // alguien se la lleva antes de elegirla
  m.lua(`${S}.elegir(${i})`);
  m.avanzar(0.05);
  const e = m.lua('SnetForever.Compra.estado()');
  assert.deepEqual([e.fase, e.motivo], ['error', 'ya_no_esta']);
  comprarObjeto(m);
  assert.equal(compras(m), 0, 'nada comprado');
  sinErrores(m);
});

test('al cerrar la subasta se para: sin búsquedas, sin temporizadores vivos y sin eventos', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  cerrar(m);
  assert.equal(estado(m), 'parado');
  const n = navegaciones(m);
  m.avanzar(30);
  assert.equal(navegaciones(m), n);
  assert.equal(m.llamadas('C_AuctionHouse:ignorada').length, 0, 'ni intenta buscar con la subasta cerrada');
  for (const e of ['AUCTION_HOUSE_BROWSE_RESULTS_UPDATED', 'AUCTION_HOUSE_BROWSE_RESULTS_ADDED', 'AUCTION_HOUSE_THROTTLED_SYSTEM_READY']) {
    assert.equal(m.lua(`#(BANCO.eventos.${e} or {})`), 0, `${e} sin registrar`);
  }
  // Al volver a abrir no empieza solo, y los hallazgos de antes ya no valen.
  abrirYEscanear(m);
  assert.equal(estado(m), 'parado');
  assert.equal(hallazgos(m).length, 0);
  sinErrores(m);
});

test('un fallo dentro del sniper va al cortafuegos del comercio', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  abrirYEscanear(m);
  m.lua('SnetForever.Reglas.evaluar = function() error("roto") end');
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false, 'el comercio se apaga');
  assert.equal(estado(m), 'parado');
  assert.match(m.lua('SnetForeverCuenta.fallos[#SnetForeverCuenta.fallos].texto'), /roto/);
  sinErrores(m);
});

test('parado: solo el botón Empezar en el centro; al pulsarlo arranca y sale la tabla; la pausa de abajo lo para', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  const V = 'SnetForever.UIComercio.marco()';
  const t = (clave) => m.lua(`SnetForever.L.t("${clave}")`);
  // Bloque B, Task B2: Sniper es una pestaña de la cabecera y su página es la de ui/subasta/sniper.lua (tarea S2).
  assert.equal(m.lua(`${V}.pestanas.sniper.texto:GetText()`), t('COMERCIO_PESTANA_SNIPER'));
  assert.equal(m.lua(`${P}.pagina:IsVisible()`), false);
  m.lua(`${V}.pestanas.sniper:Click()`);
  assert.equal(m.lua(`${P}.pagina:IsVisible()`), true);
  assert.equal(m.lua(`${V}.cuerpo:IsVisible()`), false);
  // Parado (no arranca solo): el botón grande de 240 × 32 en el centro, y ni tabla ni barras.
  assert.equal(estado(m), 'parado');
  assert.equal(m.lua(`${P}.grande:IsShown()`), true);
  assert.equal(m.lua(`${P}.grande.texto:GetText()`), t('COMERCIO_SNIPER_EMPEZAR'));
  assert.equal(m.lua(`${P}.grande:GetWidth()`), 240);
  assert.equal(m.lua(`${P}.grande:GetHeight()`), 32);
  assert.equal(m.lua(`${P}.vista:IsShown()`), false);
  const medio = (marco) => m.lua(`(${marco}:GetLeft() + ${marco}:GetRight()) / 2`);
  assert.ok(Math.abs(medio(`${P}.grande`) - medio(`${P}.pagina`)) <= 1, 'centrado');
  m.lua(`${P}.grande:Click()`);
  assert.notEqual(estado(m), 'parado');
  m.avanzar(0.6);
  assert.equal(m.lua(`${P}.grande:IsShown()`), false);
  assert.equal(m.lua(`${P}.vista:IsShown()`), true);
  assert.equal(m.lua(`${T}.huecos[1]:IsShown()`), true);
  assert.equal(m.lua(`${T}.huecos[1].celdas.objeto:GetText()`), 'Paño de seda');
  assert.match(m.lua(`${T}.huecos[1].celdas.pct:GetText()`), /60/);
  // Sonido: la casilla del engranaje cambia el ajuste.
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperSonido")'), true);
  m.lua(`${P}.engranaje:Click()`);
  m.lua(`${V}.ajustes.sonido:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperSonido")'), false);
  m.lua(`${P}.engranaje:Click()`);
  // Pulsar el hallazgo: pausa mientras busca su subasta y deja la compra lista (sin comprar).
  m.lua(`${T}.huecos[1]:Click()`);
  assert.equal(estado(m), 'pausado');
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  assert.equal(compras(m), 0);
  m.lua(`${P}.descartar:Click()`);
  // La pausa de abajo lo para (lo encontrado se queda); otra vez, sigue.
  m.lua(`${P}.pausa:Click()`);
  assert.equal(estado(m), 'parado');
  assert.equal(m.lua(`${P}.vista:IsShown()`), true, 'en pausa sigue la tabla');
  assert.equal(m.lua(`${T}.huecos[1]:IsShown()`), true);
  m.lua(`${P}.pausa:Click()`);
  assert.notEqual(estado(m), 'parado');
  // Salir del escaneo lo para del todo: al volver, el botón grande otra vez.
  m.lua(`${P}.salir:Click()`);
  assert.equal(estado(m), 'parado');
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  assert.equal(m.lua(`${P}.grande:IsShown()`), true, 'parado otra vez: vuelve el botón grande');
  assert.equal(m.lua(`${P}.vista:IsShown()`), false);
  m.lua('SnetForever.UIComercio.elegirPestana("lista")'); // la lista vieja: la página interna «ofertas»
  assert.equal(m.lua(`${V}.cuerpo:IsVisible()`), true);
  assert.equal(m.lua(`${P}.pagina:IsVisible()`), false);
  sinErrores(m);
});

test('pulsar un hallazgo lo deja pintado y prepara su compra', () => {
  const m = maquina();
  publicar(m, { 2589: 70000, 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[2589] = {{quantity = 1, buyoutAmount = 70000}}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  assert.equal(hallazgos(m).length, 2);
  assert.equal(m.lua(`${T}:elegida()`) ?? null, null, 'sin compra preparada no hay fila marcada');
  // Tarea S2: la clave de cada fila es su objeto («s:» y el itemID): sigue al hallazgo aunque lleguen otros.
  const hueco = [1, 2].find((k) => m.lua(`${T}.huecos[${k}].fila.item`) === 2589);
  assert.ok(hueco, 'hay una fila del lino');
  m.lua(`${T}.huecos[${hueco}]:Click()`);
  assert.equal(m.lua(`${T}:elegida()`), 's:2589', 'la fila pulsada queda marcada');
  assert.equal(m.lua('SnetForever.Compra.estado().item'), 2589);
  assert.equal(m.lua('SnetForever.Compra.estado().origen'), 'sniper');
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'lista');
  assert.equal(m.lua(`${T}:elegida()`), 's:2589', 'sigue marcada con la compra lista');
  assert.equal(compras(m), 0, 'elegir nunca compra');
  // Al descartar la compra, la marca se va.
  m.lua(`${P}.descartar:Click()`);
  assert.equal(m.lua(`${T}:elegida()`) ?? null, null);
  // Una compra del mismo objeto elegida desde la lista (sin origen sniper) no marca nada en el Sniper.
  m.lua('SnetForever.Compra.elegir({item = 2589, precio = 70000, cantidad = 10})');
  m.avanzar(0.05);
  assert.equal(m.lua(`${T}:elegida()`) ?? null, null, 'solo marca lo que viene del Sniper');
  sinErrores(m);
});

test('los hallazgos se ordenan pulsando la cabecera', () => {
  const m = maquina();
  publicar(m, { 2589: 70000, 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[2589] = {{quantity = 1, buyoutAmount = 70000}}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  assert.equal(hallazgos(m).length, 2);
  const objetos = () => [1, 2].map((k) => m.lua(`${T}.huecos[${k}].celdas.objeto:GetText()`));
  // Tarea S2: lo primero que llega sale ya ordenado por % de menos a más (como TSM).
  assert.deepEqual(objetos(), ['Paño de seda', 'Paño de lino'], 'de entrada, % de menor a mayor: el 60 % primero');
  m.lua(`${T}.cabeceras.pct:Click()`);
  assert.deepEqual(objetos(), ['Paño de lino', 'Paño de seda'], 'otra vez: al revés');
  m.lua(`${T}.cabeceras.pct:Click()`);
  assert.deepEqual(objetos(), ['Paño de seda', 'Paño de lino'], 'y otra vez de menor a mayor');
  m.lua(`${T}.cabeceras.objeto:Click()`);
  assert.deepEqual(objetos(), ['Paño de lino', 'Paño de seda'], 'por objeto, de la A a la Z');
  // La fila marcada sigue a su hallazgo al reordenar (la clave es su objeto, no la posición).
  m.lua(`${T}.huecos[2]:Click()`);
  assert.equal(m.lua(`${T}:elegida()`), 's:4306');
  m.lua(`${T}.cabeceras.objeto:Click()`);
  assert.deepEqual(objetos(), ['Paño de seda', 'Paño de lino']);
  assert.equal(m.lua(`${T}:elegida()`), 's:4306', 'la marca se queda con el mismo hallazgo');
  assert.equal(m.lua(`${T}.huecos[1].fila.clave`), 's:4306');
  sinErrores(m);
});

testSiempre('es y en tienen las mismas claves del sniper y los ajustes nuevos existen', () => {
  const m = crearMaquina();
  const es = Object.keys(m.lua('SnetForever.L.tablas.es')).filter((k) => k.startsWith('COMERCIO_')).sort();
  const en = Object.keys(m.lua('SnetForever.L.tablas.en')).filter((k) => k.startsWith('COMERCIO_')).sort();
  assert.deepEqual(es, en);
  for (const clave of ['COMERCIO_PESTANA_SNIPER', 'COMERCIO_SNIPER_EMPEZAR', 'COMERCIO_SNIPER_VACIO', 'COMERCIO_SNIPER_SONIDO']) {
    assert.ok(es.includes(clave), clave);
  }
  // Tarea S2: los textos de la pestaña nueva, también en los dos idiomas.
  const esS = Object.keys(m.lua('SnetForever.L.tablas.es')).filter((k) => k.startsWith('SUBASTA_SNIPER_')).sort();
  const enS = Object.keys(m.lua('SnetForever.L.tablas.en')).filter((k) => k.startsWith('SUBASTA_SNIPER_')).sort();
  assert.ok(esS.length > 10, 'hay textos de la pestaña');
  assert.deepEqual(esS, enS);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperCada")'), 5);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperSonido")'), true);
  sinErrores(m);
});

// --- Ronda de arreglos 1 ---

test('un hallazgo que sube de precio y sigue siendo bueno se actualiza en su sitio (sin sonar); si deja de serlo, sale', () => {
  const m = maquina();
  publicar(m, { 2589: 70000, 4306: 60000 });
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.deepEqual(hallazgos(m).map((x) => x.item).sort(), [2589, 4306]);
  const orden = hallazgos(m).map((x) => x.item);
  const hora = hallazgos(m).find((x) => x.item === 2589).hora;
  const suenan = sonidos(m);
  const avisos = m.lua('#SV');
  // Alguien compra el lino más barato: ahora el mínimo es 75 % (sigue ≤ 90 %).
  publicar(m, { 2589: 75000, 4306: 60000 });
  m.avanzar(5.2);
  let h = hallazgos(m);
  assert.deepEqual(h.map((x) => x.item), orden, 'en el mismo sitio');
  const lino = h.find((x) => x.item === 2589);
  assert.equal(lino.precio, 75000);
  assert.equal(Math.round(lino.pct), 75);
  // F1 (ronda 2): el precio nuevo es de la fila leída ahora: su hora es la de esa lectura (la columna Foto la enseña).
  assert.ok(lino.hora > hora, `la hora del precio nuevo: ${lino.hora} > ${hora}`);
  assert.equal(sonidos(m), suenan, 'no vuelve a sonar');
  assert.equal(m.lua('#SV'), avisos, 'no cuenta como hallazgo nuevo');
  // Y otra vez: al 95 % ya no cumple la regla (≤ 90 %).
  publicar(m, { 2589: 95000, 4306: 60000 });
  m.avanzar(5.2);
  h = hallazgos(m);
  assert.deepEqual(h.map((x) => x.item), [4306]);
  sinErrores(m);
});

test('un hallazgo que ya no está a la venta tras una vuelta completa sale de la lista', () => {
  const m = maquina();
  publicar(m, { 2589: 70000, 4306: 60000 });
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(hallazgos(m).length, 2);
  publicar(m, { 4306: 60000 });
  m.avanzar(5.2);
  assert.deepEqual(hallazgos(m).map((x) => x.item), [4306]);
  sinErrores(m);
});

test('suena como mucho una vez por vuelta aunque haya hallazgos en varias páginas', () => {
  const m = maquina({ extra: [30001, 30002, 30003, 30004] });
  publicar(m, { 30001: 50000, 30002: 50000, 30003: 50000, 30004: 50000 }, 1);
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(1);
  assert.equal(hallazgos(m).length, 4);
  assert.ok(m.lua('#SV') >= 2, 'avisa página a página');
  assert.equal(sonidos(m), 1, 'pero suena una vez');
  sinErrores(m);
});

test('sistema limitado entre páginas: no pierde la página, espera y acaba la vuelta', () => {
  const m = maquina({ extra: [30005] });
  const filas = {};
  for (let i = 0; i < 9; i++) filas[2000 + i] = 100000;
  filas[30005] = 50000; // en la última página
  publicar(m, filas, 2);
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.05); // llega la primera página
  m.lua('BANCO.ponerSubasta({lista = false})');
  const mas = masPaginas(m);
  m.avanzar(0.5);
  assert.equal(estado(m), 'buscando', 'un momento ocupado entre páginas no es «esperar»');
  m.avanzar(1.5);
  assert.equal(estado(m), 'esperando');
  assert.equal(motivo(m), 'limitado');
  assert.equal(masPaginas(m), mas, 'no pide páginas que se perderían');
  assert.equal(m.llamadas('C_AuctionHouse:limitada').length, 0);
  m.lua('BANCO.ponerSubasta({lista = true})');
  m.disparar('AUCTION_HOUSE_THROTTLED_SYSTEM_READY');
  m.avanzar(0.5);
  assert.deepEqual(hallazgos(m).map((x) => x.item), [30005], 'la vuelta sigue hasta la última página');
  sinErrores(m);
});

test('las búsquedas del escaneo cuentan para el mismo límite por minuto', () => {
  const m = maquina();
  const filas = {};
  for (let i = 0; i < 95; i++) filas[2000 + i] = 100000;
  publicar(m, filas, 1); // el escaneo de la apertura hace 95 búsquedas
  abrirYEscanear(m);
  const n = navegaciones(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(2);
  assert.equal(estado(m), 'esperando');
  assert.equal(motivo(m), 'ritmo');
  assert.equal(navegaciones(m), n);
  m.avanzar(60);
  assert.ok(navegaciones(m) > n, 'pasado el minuto, busca');
  sinErrores(m);
});

test('sigue tras un error de compra (sin oro)', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua('BANCO.jugador.dinero = 100');
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  m.lua(`${S}.elegir(1)`);
  assert.equal(estado(m), 'pausado');
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().motivo'), 'sin_oro');
  assert.notEqual(estado(m), 'pausado');
  const n = navegaciones(m);
  m.avanzar(6);
  assert.ok(navegaciones(m) > n, 'sigue buscando');
  assert.equal(hallazgos(m).length, 1, 'el hallazgo sigue en la lista');
  sinErrores(m);
});

test('con el sniper parado, lo comprado de la lista también sale', () => {
  const m = maquina();
  publicar(m, { 4306: 60000, 2589: 70000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  m.lua(`${S}.parar()`);
  const i = hallazgos(m).findIndex((x) => x.item === 4306) + 1;
  assert.equal(m.lua(`${S}.elegir(${i})`), true);
  m.avanzar(0.05);
  comprarObjeto(m);
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'hecho');
  assert.deepEqual(hallazgos(m).map((x) => x.item), [2589]);
  assert.equal(estado(m), 'parado', 'y no empieza solo');
  sinErrores(m);
});

test('si la compra no acepta el hallazgo, no se olvida cuál se estaba comprando', () => {
  const m = maquina();
  publicar(m, { 4306: 60000, 2589: 70000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  const i = hallazgos(m).findIndex((x) => x.item === 4306) + 1;
  m.lua(`${S}.elegir(${i})`);
  m.avanzar(0.05);
  comprarObjeto(m); // comprando: espera al servidor
  const j = hallazgos(m).findIndex((x) => x.item === 2589) + 1;
  assert.equal(m.lua(`${S}.elegir(${j})`), false, 'con una compra pedida al servidor no se elige otra');
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Compra.estado().fase'), 'hecho');
  assert.deepEqual(hallazgos(m).map((x) => x.item), [2589], 'sale lo comprado, no lo que se intentó elegir');
  sinErrores(m);
});

test('al cerrar, los temporizadores que quedan no hacen nada', () => {
  const m = maquina();
  const filas = {};
  for (let i = 0; i < 10; i++) filas[2000 + i] = 100000;
  publicar(m, filas, 2);
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.07); // a mitad de vuelta: hay plazo de página, mirar, etc.
  cerrar(m);
  m.lua(`rawset(_G, "TRAS", 0)
    local original = SnetForever.Comercio.ejecutar
    SnetForever.Comercio.ejecutar = function(nombre, ...) if nombre == "sniper" then TRAS = TRAS + 1 end return original(nombre, ...) end`);
  const avisos = m.lua('#SV');
  m.avanzar(70);
  assert.equal(m.lua('TRAS'), 0, 'ningún temporizador del sniper llega a trabajar');
  assert.equal(m.lua('#SV'), avisos);
  sinErrores(m);
});

test('la lista normal sigue con el sniper en marcha y avisa de que sus datos son de la última lectura', () => {
  const m = maquina();
  publicar(m, { 4306: 60000, 2589: 120000 });
  m.lua('BANCO.ponerSubasta({objetos = {[2589] = {{quantity = 1, buyoutAmount = 120000}}}})');
  abrirYEscanear(m);
  const V = 'SnetForever.UIComercio.marco()';
  const aviso = m.lua('SnetForever.L.t("COMERCIO_LISTA_SNIPER")');
  m.avanzar(0.6);
  assert.ok(!(m.lua(`${V}.avisos:GetText()`) || '').includes(aviso));
  m.lua(`${S}.empezar()`);
  m.avanzar(0.6);
  assert.ok((m.lua(`${V}.avisos:GetText()`) || '').includes(aviso), 'la cabecera lo dice');
  assert.ok(m.lua('SnetForever.UIComercio.fila(1)'), 'la lista sigue con filas');
  // Pulsar una fila de la lista también pausa el sniper.
  m.lua(`${V}.filas[1]:Click()`);
  assert.equal(estado(m), 'pausado');
  m.lua(`${V}.pie.descartar:Click()`);
  m.lua(`${S}.parar()`);
  m.avanzar(0.6);
  assert.ok(!(m.lua(`${V}.avisos:GetText()`) || '').includes(aviso), 'parado, ya no');
  sinErrores(m);
});

test('pestaña Sniper: Ctd es lo que hay a la venta y el aviso de la lista de Blizzard va en el tooltip de la pausa', () => {
  const m = maquina();
  publicar(m, { 2589: 100000 }); // una subasta sin nada no acaba «completo» (vuelta vacía)
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  assert.equal(m.lua(`${T}.cabeceras.cantidad.texto:GetText()`), m.lua('SnetForever.L.t("SUBASTA_RES_COL_CTD")'));
  m.lua(`${P}.pausa:GetScript("OnEnter")(${P}.pausa)`);
  assert.ok((m.lua('BANCO.lineasTooltip()') || []).includes(m.lua('SnetForever.L.t("COMERCIO_SNIPER_AVISO_BLIZZARD")')));
  m.lua(`${P}.pausa:GetScript("OnLeave")(${P}.pausa)`);
  sinErrores(m);
});

// En el juego (14-nov) la cabecera «Visto» se salía por la derecha y el estado salía cortado con «…». Tarea S2: todo lo de
// la pestaña cabe en su marco y cualquier estado de la barra de abajo (en los dos idiomas) cabe en su campo con margen,
// porque el banco solo aproxima el ancho de la letra; la última fila no pisa la barra de abajo.
test('pestaña Sniper: las columnas caben en el marco, el estado cabe en su campo y las filas no pisan la barra de abajo', () => {
  const m = maquina();
  publicar(m, { 2589: 100000, 4306: 60000 }); // la seda es un hallazgo: da una fila para medir
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  assert.equal(m.lua(`${T}.huecos[1]:IsShown()`), true, 'hay una fila que medir');
  const derecha = m.lua(`${P}.marcoTabla:GetRight()`);
  for (const clave of ['aviso', 'objeto', 'nivel', 'cantidad', 'compra', 'pct']) {
    assert.ok(m.lua(`${T}.cabeceras.${clave}:GetRight()`) <= derecha, `${clave} dentro del marco`);
  }
  assert.ok(m.lua(`${T}.huecos[1].celdas.pct:GetRight()`) <= derecha, 'la columna % de las filas, dentro');
  const ancho = m.lua(`${P}.estado.texto:GetRight() - ${P}.estado.texto:GetLeft()`);
  const claves = [['SUBASTA_SNIPER_ESCANEANDO', 999], ['SUBASTA_SNIPER_COMPLETO', '99.999'], ['SUBASTA_SNIPER_PAUSA', 50],
    ['SUBASTA_SNIPER_PAUSA_ELEGIDA', 50, 50], ['SUBASTA_SNIPER_ESPERA'], ['SUBASTA_SNIPER_ESPERA_ESCANEO'],
    ['SUBASTA_SNIPER_ESPERA_BUSQUEDA'], ['SUBASTA_SNIPER_ESPERA_AJENA'], ['SUBASTA_SNIPER_ESPERA_LIMITADO'],
    ['SUBASTA_SNIPER_ESPERA_RITMO'], ['SUBASTA_SNIPER_LLENA', 50]];
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    for (const [c, ...args] of claves) {
      m.lua(`${P}.estado.texto:SetText(SnetForever.L.t("${c}"${args.map((a) => `, "${a}"`).join('')}))`);
      const w = m.lua(`${P}.estado.texto:GetUnboundedStringWidth()`);
      assert.ok(w <= ancho * 0.85, `${idioma} ${c}: ${w} px en ${ancho} px`);
    }
  }
  const ultima = m.lua(`${T}.huecos[#${T}.huecos]:GetBottom()`);
  assert.ok(ultima >= m.lua(`${P}.pie:GetTop()`), 'la última fila queda encima de la barra de abajo');
  sinErrores(m);
});

test('ronda 2: en combate el Comprar de un hallazgo va apagado y no compra', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  // Tarea S2: el Comprar de la barra de abajo de la pestaña Sniper.
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.1);
  m.lua(`${T}.huecos[1]:Click()`);
  m.avanzar(0.6);
  const B = `${P}.comprar`;
  assert.equal(m.lua(`${B}.snfApagado`), false);
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(`${B}.snfApagado`), true, 'en combate, apagado');
  m.lua(`${B}.snfApagado = false; ${B}:Click()`);
  assert.equal(compras(m), 0, 'en combate no compra');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// T1a: el tooltip del objeto en todas las filas, con el ayudante común (UIComercio.tooltipObjeto): a la derecha de la fila.
test('con el ratón sobre un objeto del sniper sale su tooltip anclado a la fila y al salir se esconde', () => {
  const m = maquina();
  publicar(m, { 2589: 70000 });
  m.lua('BANCO.ponerSubasta({objetos = {[2589] = {{quantity = 1, buyoutAmount = 70000}}}})');
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  assert.equal(hallazgos(m).length, 1);
  const H1 = `${T}.huecos[1]`;
  m.lua(`${H1}:GetScript("OnEnter")(${H1})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.equal(m.lua('BANCO.lineasTooltip()[1]'), 'Paño de lino', 'el tooltip del objeto del juego');
  assert.deepEqual(m.lua(`(function() local p, r, rp = GameTooltip:GetPoint(1); return {p, r == ${H1}, rp} end)()`), ['LEFT', true, 'RIGHT'], 'a la derecha de la fila');
  m.lua(`${H1}:GetScript("OnLeave")(${H1})`);
  m.avanzar(0.3); // T1a ronda 1: se esconde pasada la espera
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  sinErrores(m);
});

// T1a, ronda 1 (sin parpadeos): el tooltip al cruzar de una fila a otra y al temblar en un borde, fotograma a fotograma (como la
// prueba del asa de la ventana). a y b son dos filas de objeto seguidas; l, la última fila de objeto que se ve. Devuelve la
// visibilidad del tooltip en cada fotograma, desde antes del primer cruce, cuántas veces se llamó a Hide al cruzar y, por
// fotograma, si el fondo del ratón de cada fila se ve encendido (LUZ: cómo se mira en esta tabla).
const TEMBLOR = (a, b, l, luz) => `(function()
  local vis, hides = {GameTooltip:IsShown()}, 0
  local luces, objetos = {}, {}
  local esconder = GameTooltip.Hide
  GameTooltip.Hide = function(self) hides = hides + 1; return esconder(self) end
  -- El fondo del ratón de una fila (el resalte): ¿se ve encendido?
  local encendida = ${luz}
  local a, b, l = ${a}, ${b}, ${l}
  local function foto()
    BANCO.avanzar(0.05)
    vis[#vis + 1] = GameTooltip:IsShown()
    luces[#luces + 1] = {encendida(a), encendida(b), encendida(l)}
    objetos[#objetos + 1] = GameTooltip:IsShown() and (BANCO.lineasTooltip())[1] or false
  end
  local function en(f) f:GetScript("OnEnter")(f) end
  local function fuera(f) f:GetScript("OnLeave")(f) end
  en(a); foto()
  -- Cruzar por el borde de dos filas, ida y vuelta en fotogramas seguidos (el OnLeave llega antes que el OnEnter).
  for _ = 1, 10 do fuera(a); en(b); foto(); fuera(b); en(a); foto() end
  local cruce = {hides = hides, vis = {unpack(vis)}, luces = {unpack(luces)}, objetos = {unpack(objetos)}}
  -- Temblar en el borde de la última fila: fuera y dentro en fotogramas seguidos.
  fuera(a); en(l); BANCO.avanzar(0.5); foto()
  local desde = #vis
  for _ = 1, 10 do fuera(l); foto(); en(l); foto() end
  local borde, luzBorde = {}, {}
  for i = desde, #vis do borde[#borde + 1] = vis[i]; luzBorde[#luzBorde + 1] = luces[i - 1][3] end
  -- Y al irse de verdad, se esconde y se apaga.
  fuera(l)
  for _ = 1, 10 do foto() end
  GameTooltip.Hide = esconder
  local ultima = luces[#luces]
  return {cruce = cruce, borde = borde, luzBorde = luzBorde, final = GameTooltip:IsShown(), todo = vis,
    apagadas = not (ultima[1] or ultima[2] or ultima[3])}
end)()`;
// ¿Pasa de «a la vista» (o encendida) a «escondido» y otra vez a «a la vista»?
const parpadea = (vis) => {
  let visto = false;
  let escondidoTras = false;
  for (const v of vis) {
    if (v && escondidoTras) return true;
    if (v) visto = true;
    else if (visto) escondidoTras = true;
  }
  return false;
};
const comprobarTemblor = (r) => {
  assert.equal(r.cruce.hides, 0, 'al cruzar de una fila a otra no hay ningún Hide');
  assert.deepEqual(r.cruce.vis, [false, ...r.cruce.vis.slice(1).map(() => true)], `al cruzar, siempre a la vista: ${r.cruce.vis}`);
  assert.deepEqual(r.borde, r.borde.map(() => true), `temblando en el borde de la última fila no se esconde: ${r.borde}`);
  assert.equal(parpadea(r.todo.slice(0, -10)), false, 'nunca sale, se esconde y vuelve a salir');
  assert.equal(r.final, false, 'al irse de verdad, se esconde');
  // El fondo del ratón: al cruzar siempre hay una fila encendida y ninguna se enciende, se apaga y se vuelve a encender.
  const luces = r.cruce.luces;
  assert.ok(luces.every((x) => x[0] || x[1]), `al cruzar, siempre una fila encendida: ${JSON.stringify(luces)}`);
  assert.equal(parpadea(luces.map((x) => x[0])), false, `la primera fila no se enciende y se apaga en fotogramas seguidos: ${luces.map((x) => (x[0] ? 1 : 0)).join('')}`);
  assert.equal(parpadea(luces.map((x) => x[1])), false, `la segunda tampoco: ${luces.map((x) => (x[1] ? 1 : 0)).join('')}`);
  assert.deepEqual(r.luzBorde, r.luzBorde.map(() => true), `temblando en el borde de la última fila su fondo no se apaga: ${r.luzBorde}`);
  assert.equal(r.apagadas, true, 'al irse de verdad, ninguna queda encendida');
  // El tooltip va con la luz: temblando entre dos filas de objeto no cambia de objeto (ni de contenido ni de tamaño).
  const objetos = r.cruce.objetos;
  assert.ok(objetos[0], 'al entrar, el tooltip de la primera fila');
  assert.deepEqual(objetos, objetos.map(() => objetos[0]), `temblando entre dos filas, siempre el mismo objeto: ${objetos.join(' | ')}`);
};
const LUZ = 'function(h) local c, b = {h.fondo:GetVertexColor()}, SnetForever.Estilo.comercio("filas"); return math.abs(c[1] - b[1]) + math.abs(c[2] - b[2]) + math.abs(c[3] - b[3]) > 0.001 end';

function sniperConHallazgos(m) {
  publicar(m, { 2589: 70000, 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[2589] = {{quantity = 1, buyoutAmount = 70000}}, [4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  assert.equal(hallazgos(m).length, 2);
}

test('sin parpadeos: en el sniper el tooltip no se esconde al cruzar de una fila a otra ni al temblar en el borde de la última', () => {
  const m = maquina();
  sniperConHallazgos(m);
  const H = (i) => `${T}.huecos[${i}]`;
  comprobarTemblor(m.lua(TEMBLOR(H(1), H(2), H(2), LUZ)));
  sinErrores(m);
});

// Ronda 1, menor 6: el sniper solo esconde su propio tooltip.
test('sniper: al salir de una fila no se esconde el tooltip de otro marco', () => {
  const m = maquina();
  sniperConHallazgos(m);
  const H1 = `${T}.huecos[1]`;
  m.lua(`${H1}:GetScript("OnEnter")(${H1})`);
  m.lua('local b = CreateFrame("Frame", nil, UIParent); GameTooltip:SetOwner(b, "ANCHOR_TOP"); GameTooltip:SetText("ayuda"); GameTooltip:Show()');
  m.lua(`${H1}:GetScript("OnLeave")(${H1})`);
  m.avanzar(0.5);
  assert.equal(m.lua('GameTooltip:IsShown()'), true, 'la ayuda del otro marco se queda');
  sinErrores(m);
});

// B3s: Mayús + clic y Ctrl + clic en las filas de objeto (UIComercio.clicModificado, el mismo sitio que la vista de
// resultados): en el sniper, con tecla, el hallazgo no se elige, no pausa el sniper ni prepara compra.
test('Mayús + clic funciona igual en la lista vieja, el sniper, las 4 listas de Grupos y el cuadro de cantidad: el sniper', () => {
  const m = maquina();
  sniperConHallazgos(m);
  const conTecla = (tecla, fn) => { m.lua(`BANCO.${tecla} = true`); try { fn(); } finally { m.lua(`BANCO.${tecla} = false`); } };
  const item = m.lua(`${T}.huecos[1].fila.item`);
  const enlace = m.lua(`(select(2, C_Item.GetItemInfo(${item})))`);
  const antes = estado(m);
  m.lua('BANCO.chat.abierta = true');
  conTecla('shift', () => m.lua(`${T}.huecos[1]:Click()`));
  assert.equal(m.lua('BANCO.chat.texto'), enlace, 'el enlace del hallazgo, en el chat');
  conTecla('ctrl', () => m.lua(`${T}.huecos[1]:Click()`));
  assert.equal(m.lua('BANCO.probador'), enlace, 'Ctrl + clic: al probador');
  m.avanzar(0.1);
  assert.equal(estado(m), antes, 'el sniper no se pausa');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'ni prepara compra');
  assert.equal(m.lua(`${T}:elegida()`) ?? null, null, 'ni marca la fila');
  assert.deepEqual(m.llamadas('SendChatMessage'), [], 'nada se envía');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

// F9p: un hallazgo de una mercancía lleva la misma indicación que la lista de ofertas.
test('una mercancía aprobada dice rotación sin confirmar en el sniper; un objeto suelto no', () => {
  const m = maquina({ mercancias: [2589] });
  publicar(m, { 2589: 70000, 4306: 60000 });
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${P}.grande:Click()`);
  m.avanzar(0.6);
  const de = (item) => hallazgos(m).find((x) => x.item === item);
  assert.equal(de(2589).rotacionSinConfirmar, true);
  assert.equal(de(4306).rotacionSinConfirmar ?? false, false);
  const hueco = (nombre) => m.lua(`(function() for i, h in ipairs(${T}.huecos) do
    if h:IsShown() and h.celdas.objeto:GetText() == "${nombre}" then return i end end end)()`);
  const marca = (i) => m.lua(`${T}.huecos[${i}].snfSinConfirmar:IsShown()`);
  const lino = hueco('Paño de lino');
  const seda = hueco('Paño de seda');
  assert.equal(marca(lino), true);
  assert.equal(marca(seda), false);
  assert.equal(m.lua(`${T}.huecos[${lino}].snfSinConfirmar:GetTexture()`), 'Interface\\RaidFrame\\ReadyCheck-Waiting');
  // La marca cabe en la columna (!), sin pisar el icono de alerta ni el de la fila.
  const r = m.lua(`(function() local h, s = ${T}.huecos[${lino}], ${T}.huecos[${lino}].snfSinConfirmar
    return {izq = s:GetLeft() - h:GetLeft(), der = s:GetRight() - h:GetLeft(), alerta = h.snfAlerta:GetRight() - h:GetLeft(), icono = h.snfIcono:GetLeft() - h:GetLeft()} end)()`);
  assert.ok(r.izq >= r.alerta && r.der <= r.icono, JSON.stringify(r));
  const FRASE = 'Rotación sin confirmar: lo que sale puede ser cancelaciones';
  const H = (i) => `${T}.huecos[${i}]`;
  m.lua(`${H(lino)}:GetScript("OnEnter")(${H(lino)})`);
  assert.ok(m.lua('BANCO.lineasTooltip()').some((x) => x.includes(FRASE)), 'el tooltip de la mercancía lo dice');
  m.lua(`${H(seda)}:GetScript("OnEnter")(${H(seda)})`);
  m.avanzar(0.3); // la luz de la tabla cruza de una fila a otra tras su espera
  assert.ok(!m.lua('BANCO.lineasTooltip()').some((x) => x.includes(FRASE)), 'el del objeto suelto no');
  // Al volver a mirarse a otro precio, sigue con su indicación.
  publicar(m, { 2589: 75000, 4306: 60000 });
  m.avanzar(5.2);
  assert.equal(de(2589).precio, 75000);
  assert.equal(de(2589).rotacionSinConfirmar, true);
  assert.equal(compras(m), 0, 'el sniper nunca compra');
  sinErrores(m);
});

// F12, ronda 1: la búsqueda general no dice de quién es el precio más bajo. Al elegir el hallazgo se lee la lista: si ese
// precio es de otro personaje de la cuenta no se compra y el hallazgo se va. Si la lista ya se había leído, ni se propone.
test('F12: un hallazgo que resulta ser de otro personaje de la cuenta no se compra y sale de la lista sin volver', () => {
  const m = maquina();
  publicar(m, { 2589: 70000 });
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 70000, numOwnerItems = 0, containsOwnerItem = false, containsAccountItem = true}, {quantity = 10, unitPrice = 90000}}}})');
  abrirYEscanear(m);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(hallazgos(m).length, 1);
  m.lua(`${S}.elegir(1)`);
  m.avanzar(0.05);
  const e = m.lua('SnetForever.Compra.estado()');
  assert.deepEqual([e.fase, e.motivo], ['error', 'otro_personaje']);
  assert.equal(hallazgos(m).length, 0, 'sale de la lista');
  m.avanzar(20);
  assert.equal(hallazgos(m).length, 0, 'y la vuelta siguiente no lo vuelve a proponer');
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('F12: con la lista ya leída, el sniper no propone el precio de una fila de otro personaje', () => {
  const m = maquina();
  publicar(m, { 2589: 70000 });
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 70000, numOwnerItems = 0, containsOwnerItem = false, containsAccountItem = true}, {quantity = 10, unitPrice = 90000}}}})');
  abrirYEscanear(m);
  m.lua('SnetForever.Busqueda.pedirSubastas(2589)');
  m.avanzar(0.2);
  assert.equal(m.lua('SnetForever.Busqueda.vivo(2589).minimoDudoso'), 70000);
  m.lua(`${S}.empezar()`);
  m.avanzar(0.1);
  assert.equal(hallazgos(m).length, 0);
  sinErrores(m);
});
