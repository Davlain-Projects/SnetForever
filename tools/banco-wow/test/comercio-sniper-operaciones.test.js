// Fase 3 de la paridad con TSM: el sniper por operaciones (comercio/sniper.lua con comercioSniperModo = «operaciones»).
// Un hallazgo es lo que no pasa del «Precio máximo» de la operación de Sniper del grupo del objeto (propia o importada,
// con la herencia y las listas «Ignorar…» de Operaciones). Sin operación, ignorada, con la fórmula rota o sin valor no hay
// hallazgo y nunca se vuelve a sniperPct. La operación y su precio se vuelven a mirar al elegir, al tener la lista, al
// llegar la cotización y antes de cada clic que compra. El modo «regla» sigue siendo el de lo guardado sin elegir.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

// Los mismos precios de la app que comercio-sniper.test.js: lo normal de todos es 10 de oro y la lana se vende poco.
const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const RITMOS = { 2589: 0.6, 2592: 0.2, 4306: 0.6, 4338: 0.6, 14047: 0.6 };

function ponerRanura(dir) {
  const i = (H % 8) + 1;
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n`);
  const filas = Object.entries(RITMOS).map(([item, r]) => `[${item}] = {98000, 400, 100000, 0, ${r}, 85, 0}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

function maquina() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-sniper-op-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir);
  const m = crearMaquina({ addonsDir: dir, jugador: { nombre: 'Comprador', reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('BANCO.jugador.dinero = 10000000');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2 });
  m.itemInfo(4338, { nombre: 'Paño de tejido mágico', calidad: 1 });
  return m;
}

const S = 'SnetForever.Sniper';
const O = 'SnetForever.Operaciones';
const hallazgos = (m) => m.lua(`${S}.hallazgos()`) || [];
const items = (m) => hallazgos(m).map((h) => h.item).sort();
const compra = (m) => m.lua('SnetForever.Compra.estado()') || {};
const navegaciones = (m) => m.llamadas('C_AuctionHouse.SendBrowseQuery').length;
const COMPRAS = ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase'];
const compras = (m) => COMPRAS.reduce((n, api) => n + m.llamadas(`C_AuctionHouse.${api}`).length, 0);
const pulsar = (m) => m.lua('SnetForever.UIComercio.marco().pie.comprar:Click()');

function publicar(m, filas) {
  const lua = Object.entries(filas).map(([item, p]) => `{itemID = ${item}, totalQuantity = 10, minPrice = ${p}}`);
  m.lua(`BANCO.ponerSubasta({navegar = {${lua.join(', ')}}, porPagina = 50})`);
}

function abrirYEscanear(m) {
  m.disparar('AUCTION_HOUSE_SHOW');
  for (let i = 0; i < 400 && m.lua('SnetForever.Escaneo.estado()') !== 'completo'; i++) m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo');
}

// Telas (operación «Telas», tope 6,5 de oro) con el subgrupo Telas`Finas, que la hereda. La seda va en el subgrupo, la
// lana y el lino en Telas; el tejido mágico no tiene grupo (Grupo Base, sin operación de Sniper).
function grupos(m, formula = '65000c') {
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Telas"))
    assert(S.Arbol.crear("Telas", "Finas"))
    assert(S.Arbol.poner("i:2589", "Telas"))
    assert(S.Arbol.poner("i:2592", "Telas"))
    assert(S.Arbol.poner("i:4306", "Telas\`Finas"))
    assert(S.Operaciones.crear("sniper", "Telas"))
    assert(S.Operaciones.poner("sniper", "Telas", "precioMaximo", "${formula}"))
    assert(S.Operaciones.ponerDeGrupo("Telas", "sniper", {"Telas"}))`);
}

function modoOperaciones(m) {
  m.lua('SnetForever.Ajustes.set("comercioSniperModo", "operaciones")');
}

function empezar(m) {
  assert.equal(m.lua(`${S}.empezar()`), true);
  m.avanzar(0.1);
}

// La vuelta siguiente (comercioSniperCada = 5 s).
function otraVuelta(m) {
  const n = navegaciones(m);
  for (let i = 0; i < 200 && navegaciones(m) === n; i++) m.avanzar(0.1);
  m.avanzar(0.1);
}

test('lo guardado sin elegir sigue en modo regla: el porcentaje manda y las operaciones no cuentan', () => {
  const m = maquina();
  grupos(m);
  publicar(m, { 2589: 70000, 2592: 60000, 4306: 60000 });
  abrirYEscanear(m);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperModo")'), 'regla');
  assert.equal(m.lua(`${S}.modo()`), 'regla');
  empezar(m);
  // Regla de sniper (90 %, ritmo mínimo): el lino al 70 % entra aunque pase del tope de la operación; la lana no (lenta).
  assert.deepEqual(items(m), [2589, 4306]);
  assert.equal(hallazgos(m)[0].operacion, undefined, 'sin operación en modo regla');
  sinErrores(m);
});

test('modo operaciones: la operación heredada del grupo padre decide con su precio máximo, sin mirar el porcentaje', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 2589: 70000, 2592: 60000, 4306: 60000, 4338: 1000 });
  abrirYEscanear(m);
  empezar(m);
  // Lino a 7 de oro: pasa de 6,5. Lana a 6 (el ritmo no cuenta). Seda a 6 en el subgrupo: hereda «Telas». El tejido
  // mágico va al Grupo Base, que no tiene operación de Sniper: nada, aunque esté al 1 %.
  assert.deepEqual(items(m), [2592, 4306]);
  const seda = hallazgos(m).find((h) => h.item === 4306);
  assert.equal(seda.operacion, 'Telas');
  assert.equal(seda.ruta, 'Telas`Finas');
  assert.equal(seda.tope, 65000);
  assert.equal(Math.round(seda.pct), 60);
  sinErrores(m);
});

test('modo operaciones: la operación del Grupo Base vale para lo que no tiene grupo, y una propia del subgrupo manda sobre la heredada', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  m.lua(`local O = SnetForever.Operaciones
    assert(O.crear("sniper", "Base"))
    assert(O.poner("sniper", "Base", "precioMaximo", "5000c"))
    assert(O.ponerDeGrupo("", "sniper", {"Base"}))
    assert(O.crear("sniper", "Finas"))
    assert(O.poner("sniper", "Finas", "precioMaximo", "50000c"))
    assert(O.ponerDeGrupo("Telas\`Finas", "sniper", {"Finas"}))`);
  publicar(m, { 4306: 60000, 4338: 1000 });
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [4338], 'la seda pasa de los 5 de oro de «Finas»; el tejido mágico entra por el Grupo Base');
  assert.equal(hallazgos(m)[0].operacion, 'Base');
  assert.equal(hallazgos(m)[0].ruta, '');
  sinErrores(m);
});

test('modo operaciones: una operación ignorada aquí o anulada excluye el objeto y no deja paso a la del padre ni al porcentaje', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  m.lua(`local O = SnetForever.Operaciones
    assert(O.crear("sniper", "Finas"))
    assert(O.ponerDeGrupo("Telas\`Finas", "sniper", {"Finas"}))
    -- Como la guardan el editor y la importación de TSM: «<nombre> - <reino>».
    SnetForeverCuenta.comercio.v2.operaciones.sniper.Finas.ignorarPersonajes = {["Comprador - Normal"] = true}`);
  publicar(m, { 2592: 60000, 4306: 60000 });
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [2592], 'la seda (operación ignorada para este personaje) no sale');
  // Ignorada por la casa en vez de por el personaje: igual.
  m.lua(`local op = SnetForeverCuenta.comercio.v2.operaciones.sniper.Finas
    op.ignorarPersonajes = {}
    op.ignorarReinos = {["Normal|Horde"] = true}`);
  assert.equal(m.lua(`${O}.aplicable("Telas\`Finas", "sniper")`), undefined);
  assert.equal(m.lua(`select(2, ${O}.aplicable("Telas\`Finas", "sniper"))`), 'ignorada');
  // Anulada: el subgrupo nombra una operación que se ha borrado. No hereda la del padre.
  m.lua(`assert(${O}.borrar("sniper", "Finas"))`);
  assert.equal(m.lua(`select(2, ${O}.aplicable("Telas\`Finas", "sniper"))`), 'sin_operacion');
  m.lua(`${S}.reiniciar()`);
  m.avanzar(0.2);
  assert.deepEqual(items(m), [2592], 'con la operación borrada la seda tampoco sale');
  sinErrores(m);
});

test('modo operaciones: una fórmula rota o sin valor excluye el objeto sin volver al porcentaje', () => {
  const m = maquina();
  grupos(m, 'vendorsell'); // sin precio de vendedor conocido: la fuente no da valor
  modoOperaciones(m);
  publicar(m, { 2589: 10000, 4306: 10000 });
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [], 'al 10 % la regla las daría por buenas; sin valor no hay hallazgo');
  // Rota (como podría llegar de una importación o de un guardado viejo: el editor no la deja escribir).
  m.lua('SnetForeverCuenta.comercio.v2.operaciones.sniper.Telas.valores.precioMaximo = "max("');
  assert.equal(m.lua(`${O}.cobre("sniper", "Telas", "precioMaximo", 4306)`), undefined);
  m.lua(`${S}.reiniciar()`);
  m.avanzar(0.2);
  assert.deepEqual(items(m), []);
  sinErrores(m);
});

test('modo operaciones: variantes en otro grupo y mascotas no se adivinan; variantes en el mismo grupo sí valen', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Otras"))
    assert(S.Arbol.poner("i:4306::1:99", "Otras"))
    assert(S.Arbol.poner("i:2592::1:7", "Telas"))`);
  m.lua(`BANCO.ponerSubasta({navegar = {{itemID = 4306, totalQuantity = 3, minPrice = 60000},
    {itemID = 2592, totalQuantity = 3, minPrice = 60000},
    {itemKey = {itemID = 82800, itemLevel = 0, itemSuffix = 0, battlePetSpeciesID = 40}, totalQuantity = 1, minPrice = 10}},
    porPagina = 50})`);
  m.lua(`local O = SnetForever.Operaciones
    assert(O.crear("sniper", "Todo"))
    assert(O.poner("sniper", "Todo", "precioMaximo", "1000000c"))
    assert(O.ponerDeGrupo("", "sniper", {"Todo"}))`);
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [2592], 'la seda tiene una variante en «Otras» y la mascota va por especie: ninguna sale');
  assert.equal(hallazgos(m)[0].cantidad, 3, 'la cantidad es la de la fila (todo lo que hay a la venta)');
  const vigente = () => m.lua(`${S}.vigente(2592, nil, 60000, {operacion = "Telas", ruta = "Telas"})`);
  assert.equal(vigente(), true);
  m.lua('assert(SnetForever.Arbol.poner("i:2592::1:7", "Otras"))');
  assert.equal(vigente(), false, 'la comprobación lee la ruta actual incluso con el índice preparado');
  m.lua('assert(SnetForever.Arbol.quitar("i:2592::1:7"))');
  assert.equal(vigente(), true);
  m.lua('assert(SnetForever.Arbol.poner("i:2592::1:8", "Otras"))');
  assert.equal(vigente(), false, 'una variante recién añadida cuenta antes de hacer otra búsqueda');
  sinErrores(m);
});

test('modo operaciones: si la fórmula baja después de enseñar el hallazgo, elegirlo no prepara nada y sale de la lista', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [4306]);
  m.lua(`assert(${O}.poner("sniper", "Telas", "precioMaximo", "50000c"))`);
  assert.equal(m.lua(`${S}.elegir(1)`), false);
  assert.equal(compra(m).fase, undefined, 'ninguna compra preparada');
  assert.deepEqual(items(m), []);
  // La compra tampoco acepta un hallazgo así que le llegue por otro camino.
  assert.equal(m.lua(`SnetForever.Compra.elegir({item = 4306, precio = 60000, cantidad = 1, origen = "sniper",
    sniperOp = {operacion = "Telas", ruta = "Telas\`Finas"}})`), false);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('modo operaciones: con un objeto «lista» o por confirmar, la fórmula cambiada para el clic que compra', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  empezar(m);
  assert.equal(m.lua(`${S}.elegir(1)`), true);
  m.avanzar(0.05);
  assert.equal(compra(m).fase, 'lista');
  m.avanzar(0.6);
  pulsar(m); // primer clic de un objeto suelto: pide confirmar, no compra
  assert.equal(compra(m).fase, 'confirmar');
  m.avanzar(0.6);
  m.lua(`assert(${O}.poner("sniper", "Telas", "precioMaximo", "59999c"))`);
  pulsar(m);
  assert.deepEqual([compra(m).fase, compra(m).motivo], ['error', 'operacion']);
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 0, 'nada comprado');
  assert.equal(m.lua('SnetForever.UIComercio.textoMotivo(SnetForever.Compra.estado())'),
    m.lua('SnetForever.L.t("COMERCIO_MOTIVO_OPERACION")'));
  assert.deepEqual(items(m), [], 'el hallazgo sale de la lista');
  sinErrores(m);
});

test('modo operaciones: con el mismo precio y la fórmula intacta se compra como siempre, con dos clics del jugador', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  empezar(m);
  m.lua(`${S}.elegir(1)`);
  m.avanzar(0.05);
  m.avanzar(0.6);
  pulsar(m);
  assert.equal(m.llamadas('C_AuctionHouse.PlaceBid').length, 0, 'el primer clic no compra');
  m.avanzar(0.6);
  pulsar(m);
  assert.deepEqual(m.llamadas('C_AuctionHouse.PlaceBid'), [[4306 * 1000 + 1, 60000]]);
  m.avanzar(0.05);
  assert.equal(compra(m).fase, 'hecho');
  sinErrores(m);
});

test('modo operaciones: en combate no compra aunque la operación siga valiendo', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 4306: 60000 });
  m.lua('BANCO.ponerSubasta({objetos = {[4306] = {{quantity = 1, buyoutAmount = 60000}}}})');
  abrirYEscanear(m);
  empezar(m);
  m.lua(`${S}.elegir(1)`);
  m.avanzar(0.65);
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForever.Compra.pulsar()'), false);
  assert.equal(compras(m), 0);
  sinErrores(m);
});

test('modo operaciones: una mercancía cuya fórmula cambia con la cotización en pantalla se cancela sin confirmar', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 2589: 60000 });
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 60000}}}})');
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [2589]);
  m.lua(`${S}.elegir(1)`);
  m.avanzar(0.05);
  assert.equal(compra(m).fase, 'lista');
  pulsar(m); // abre el cuadro de cantidad
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()'); // pide el precio real
  m.avanzar(0.05);
  assert.equal(compra(m).fase, 'confirmar');
  m.lua(`assert(${O}.poner("sniper", "Telas", "precioMaximo", "1000c"))`);
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.Compra.pulsar()'), false);
  assert.deepEqual([compra(m).fase, compra(m).motivo], ['error', 'operacion']);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0, 'no se confirma');
  assert.ok(m.llamadas('C_AuctionHouse.CancelCommoditiesPurchase').length >= 1, 'la cotización se suelta');
  sinErrores(m);
});

test('modo operaciones: la cotización de una mercancía con la fórmula ya cambiada no llega a ofrecer el clic de confirmar', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 2589: 60000 });
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 60000}}}})');
  abrirYEscanear(m);
  empezar(m);
  m.lua(`${S}.elegir(1)`);
  m.avanzar(0.05);
  pulsar(m);
  // La fórmula cambia entre el clic que pide el precio y la respuesta del servidor.
  m.lua(`assert(${O}.poner("sniper", "Telas", "precioMaximo", "1000c"))`);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  m.avanzar(0.05);
  assert.deepEqual([compra(m).fase, compra(m).motivo], ['error', 'operacion']);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('modo operaciones: la oferta que sube por encima del tope o la fórmula que baja la saca en la vuelta siguiente', () => {
  const m = maquina();
  grupos(m);
  modoOperaciones(m);
  publicar(m, { 2592: 60000, 4306: 60000 });
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [2592, 4306]);
  // La seda sube a 7 de oro (alguien compró las baratas); la lana sigue a 6, pero su grupo pasa a un tope de 5,5.
  publicar(m, { 2592: 60000, 4306: 70000 });
  otraVuelta(m);
  assert.deepEqual(items(m), [2592], 'la seda sale al subir');
  m.lua(`assert(${O}.poner("sniper", "Telas", "precioMaximo", "55000c"))`);
  otraVuelta(m);
  assert.deepEqual(items(m), [], 'la lana sale al mismo precio: su operación ya no la admite');
  m.lua(`assert(${O}.poner("sniper", "Telas", "precioMaximo", "65000c"))`);
  otraVuelta(m);
  assert.deepEqual(items(m), [2592], 'a newly eligible row returns at its unchanged price');
  sinErrores(m);
});

test('cambiar de modo vacía lo encontrado con el otro y la vuelta sigue con el nuevo', () => {
  const m = maquina();
  grupos(m);
  publicar(m, { 2589: 70000, 2592: 60000 });
  abrirYEscanear(m);
  empezar(m);
  assert.deepEqual(items(m), [2589], 'regla: el lino al 70 %');
  modoOperaciones(m);
  assert.deepEqual(items(m), [], 'lo de la regla ya no vale');
  otraVuelta(m);
  assert.deepEqual(items(m), [2592], 'operaciones: la lana bajo el tope');
  m.lua('SnetForever.Ajustes.set("comercioSniperModo", "regla")');
  otraVuelta(m);
  assert.deepEqual(items(m), [2589]);
  sinErrores(m);
});

test('cambiar a operaciones cancela la compra aún sin enviar de un hallazgo del modo anterior', () => {
  const m = maquina();
  grupos(m);
  publicar(m, { 2589: 70000 });
  m.lua('BANCO.ponerSubasta({mercancias = {[2589] = {{quantity = 10, unitPrice = 70000}}}})');
  abrirYEscanear(m);
  empezar(m);
  assert.equal(m.lua(`${S}.elegir(1)`), true);
  m.avanzar(0.05);
  pulsar(m);
  m.lua('SnetForever.CantidadComercio.marco().comprar:Click()');
  m.avanzar(0.05);
  assert.equal(compra(m).fase, 'confirmar');

  modoOperaciones(m);
  assert.equal(compra(m).fase, undefined);
  assert.deepEqual(items(m), []);
  assert.ok(m.llamadas('C_AuctionHouse.CancelCommoditiesPurchase').length >= 1);
  pulsar(m);
  assert.equal(m.llamadas('C_AuctionHouse.ConfirmCommoditiesPurchase').length, 0);
  sinErrores(m);
});

test('la casilla del engranaje cambia el modo y enseña el guardado', () => {
  const m = maquina();
  publicar(m, { 4306: 60000 });
  abrirYEscanear(m);
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  const casilla = 'SnetForever.UIComercio.marco().ajustes.sniperOperaciones';
  assert.equal(m.lua(`type(${casilla})`), 'table');
  m.lua('SnetForever.UIComercio.alternarAjustes(SnetForever.SubastaSniper.marcos.engranaje)');
  assert.equal(m.lua(`${casilla}.marca:IsShown()`), false);
  m.lua(`${casilla}:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperModo")'), 'operaciones');
  m.lua('SnetForever.Ajustes.set("comercioSniperModo", nil)');
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSniperModo")'), 'regla', 'sin elegir, el de siempre');
  sinErrores(m);
});
