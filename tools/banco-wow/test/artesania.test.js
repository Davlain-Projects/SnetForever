// Artesanía (plan de paridad con TSM, fase 4): la vista previa de solo lectura de lo que las operaciones de Artesanía
// pondrían a fabricar para reponer, con las cuentas de CraftingOperation y Crafting/Restock de TSM 4.15.9.
// Todo lo de aquí es inventado.
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const A = 'SnetForever.Artesania';
const JUGADOR = { nombre: 'Buyer', reino: 'Normal', faccion: 'Horde' };
const POCION = 300; // se fabrica de 2 en 2
const HIERBA = 100; // 3 por fabricación
const VIAL = 101; // 1 por fabricación
const ELIXIR = 310; // otra receta

function maquina() {
  const m = nuevaMaquina({ jugador: JUGADOR, bolsas: 'forever' });
  m.itemInfo(POCION, { nombre: 'Poción', precio: 10, apilado: 20 });
  m.itemInfo(HIERBA, { nombre: 'Hierba', precio: 1, apilado: 20 });
  m.itemInfo(VIAL, { nombre: 'Vial', precio: 1, apilado: 20 });
  m.itemInfo(ELIXIR, { nombre: 'Elixir', precio: 10, apilado: 20 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  // Precios de prueba: lo normal de la app (snfmercado) y nada del escaneo (snfminimo sin valor).
  m.lua(`SnetForever.Guardado.preparar()
    PRE = {[${HIERBA}] = {precio = 900, normal = 1000}, [${VIAL}] = {precio = 400, normal = 500},
      [${POCION}] = {precio = 9000, normal = 10000}, [${ELIXIR}] = {precio = 9000, normal = 10000}}
    SnetForever.Precios.de = function(i) return PRE[i] end
    SnetForever.Escaneo.datos = function() return {} end
    SnetForever.MisSubastas.publicadas = function() return 0 end`);
  return m;
}

// La ventana de profesión: recetas aprendidas con rendimiento fijo.
function recetas(m, lista) {
  const cuerpo = lista.map((r) => `[${r.id}] = {outputItemID = ${r.sale}, quantityMin = ${r.n}, quantityMax = ${r.n},
    reagentSlotSchematics = {${r.materiales.map(([id, q]) => `{required = true, quantityRequired = ${q}, reagents = {{itemID = ${id}}}}`).join(', ')}}}`).join(',\n');
  m.lua(`local R = {${cuerpo}}
    rawset(_G, "C_TradeSkillUI", {
      GetAllRecipeIDs = function() local ids = {} for id in pairs(R) do ids[#ids + 1] = id end table.sort(ids) return ids end,
      GetRecipeInfo = function(id) return R[id] and {learned = true} or nil end,
      GetRecipeSchematic = function(id) return R[id] end,
    })`);
  m.disparar('TRADE_SKILL_LIST_UPDATE');
}

const RECETA_POCION = { id: 1, sale: POCION, n: 2, materiales: [[HIERBA, 3], [VIAL, 1]] };

// Alquimia tiene la operación; Alquimia`Pociones la hereda. El Grupo Base también tiene una y TSM no lo repone.
function grupos(m) {
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Alquimia"))
    assert(S.Arbol.crear("Alquimia", "Pociones"))
    assert(S.Arbol.poner("i:${POCION}", "Alquimia\`Pociones"))
    assert(S.Arbol.poner("i:${ELIXIR}", "Alquimia"))
    assert(S.Operaciones.crear("artesania", "Reponer"))
    assert(S.Operaciones.poner("artesania", "Reponer", "reponerMinimo", "2"))
    assert(S.Operaciones.poner("artesania", "Reponer", "reponerMaximo", "10"))
    assert(S.Operaciones.poner("artesania", "Reponer", "beneficioMinimo", "50s"))
    assert(S.Operaciones.ponerDeGrupo("Alquimia", "artesania", {"Reponer"}))
    assert(S.Operaciones.ponerDeGrupo("", "artesania", {"Reponer"}))`);
}

// El banco y el correo del personaje de ahora, vistos.
function inventarioVisto(m, banco = {}, correo = {}) {
  const t = (o) => `{${Object.entries(o).map(([k, v]) => `[${k}] = ${v}`).join(', ')}}`;
  m.lua(`SnetForeverCuenta.comercio.inventario = {v = 2, pj = {
      ["Buyer-Normal"] = {nombre = "Buyer", reino = "Normal", bolsas = {}, banco = ${t(banco)}, correo = ${t(correo)}}}}
    SnetForeverCuenta.comercio.inventario.bancoCuenta = {objetos = {}}
    SnetForever.InventarioCuenta.olvidarOrden()`);
}

const vista = (m, rutas) => m.lua(`return ${A}.vistaPrevia(${rutas || ''})`);
const fila = (v, item) => v.filas.find((f) => f.item === item);
const nadaEnElJuego = (m) => {
  for (const api of ['C_TradeSkillUI.CraftRecipe', 'C_TradeSkillUI.CraftSalvage', 'C_Container.PickupContainerItem',
    'C_Container.UseContainerItem', 'UseContainerItem', 'BuyMerchantItem', 'C_AuctionHouse.PlaceBid',
    'C_AuctionHouse.StartCommoditiesPurchase', 'C_AuctionHouse.ConfirmCommoditiesPurchase']) {
    assert.equal(m.llamadas(api).length, 0, api);
  }
};

test('repone hasta el máximo con la operación heredada, redondea las fabricaciones hacia abajo y lista los materiales', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    inventarioVisto(m, { [POCION]: 1 }, { [POCION]: 1 });
    m.objeto(POCION, 1);
    m.objeto(HIERBA, 4);
    const v = vista(m);
    assert.equal(v.estado, 'lista');
    assert.deepEqual(v.filas.map((f) => f.ruta).sort(), ['Alquimia', 'Alquimia`Pociones'], 'el Grupo Base no se repone');
    const p = fila(v, POCION);
    assert.deepEqual(p.operaciones, ['Reponer']);
    assert.equal(p.minimo, 2);
    assert.equal(p.maximo, 10);
    assert.equal(p.tienes, 3, 'bolsas, banco y correo vistos');
    assert.equal(p.faltan, 7);
    assert.equal(p.rendimiento, 2);
    assert.equal(p.fabricaciones, 3, 'floor(7 / 2), como TSM');
    assert.equal(p.unidades, 6);
    assert.equal(p.coste, 1750, '(3 × 10s + 5s) / 2');
    assert.equal(p.valor, 8550, 'valor general: first(snfminimo, snfmercado) × 0,95, con snfminimo = 90s');
    assert.equal(p.beneficio, 6800);
    assert.equal(p.estado, 'fabricar');
    assert.equal(p.costeTotal, 10500);
    assert.deepEqual(p.sinContar, ['subastasAlters', 'hermandad']);
    assert.equal(p.tope, true, 'lo que TSM cuenta y aquí no se ve hace que sea un tope');
    const hierba = v.materiales.find((x) => x.id === HIERBA);
    assert.deepEqual([hierba.necesarias, hierba.enBolsas, hierba.comprar, hierba.precio, hierba.coste], [9, 4, 5, 1000, 5000]);
    const vial = v.materiales.find((x) => x.id === VIAL);
    assert.deepEqual([vial.necesarias, vial.enBolsas, vial.comprar, vial.coste], [3, 0, 3, 1500]);
    assert.equal(v.totales.fabricaciones, 3);
    assert.equal(v.totales.compra, 6500);
    assert.equal(v.requisitos.ejecutable, false);
    assert.equal(fila(v, ELIXIR).motivo, 'sin_receta');
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('repuesto, por debajo del mínimo y una fabricación que da más de lo que falta no reponen', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    inventarioVisto(m);
    m.objeto(POCION, 10);
    let p = fila(vista(m), POCION);
    assert.equal(p.estado, 'nada');
    assert.equal(p.motivo, 'repuesto');
    m.objeto(POCION, 9);
    p = fila(vista(m), POCION);
    assert.equal(p.motivo, 'bajo_minimo', 'falta 1 y el mínimo es 2');
    assert.equal(p.detalle, '1/2');
    m.lua('assert(SnetForever.Operaciones.poner("artesania", "Reponer", "reponerMinimo", "0"))');
    p = fila(vista(m), POCION);
    assert.equal(p.motivo, 'rendimiento', 'floor(1 / 2) = 0');
    assert.equal(p.detalle, '2/1');
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('mínimo y máximo fuera de rango, ilegibles o cruzados dejan la operación sin reponer', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    inventarioVisto(m);
    m.lua('assert(SnetForever.Operaciones.poner("artesania", "Reponer", "reponerMaximo", "60000"))');
    let p = fila(vista(m), POCION);
    assert.equal(p.estado, 'apartada');
    assert.equal(p.motivo, 'formula');
    assert.equal(p.detalle, 'Reponer · reponerMaximo');
    m.lua(`assert(SnetForever.Operaciones.poner("artesania", "Reponer", "reponerMaximo", "5"))
      assert(SnetForever.Operaciones.poner("artesania", "Reponer", "reponerMinimo", "8"))`);
    p = fila(vista(m), POCION);
    assert.equal(p.motivo, 'min_max');
    assert.equal(p.detalle, '8 > 5');
    m.lua('assert(SnetForever.Operaciones.poner("artesania", "Reponer", "reponerMinimo", "snfmercado * 0"))');
    m.lua('PRE[300] = nil');
    p = fila(vista(m), POCION);
    assert.equal(p.motivo, 'formula', 'una fórmula sin valor no cuenta como cero');
    assert.equal(p.detalle, 'Reponer · reponerMinimo');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('el beneficio mínimo activado decide con valor y coste; sin él, el beneficio solo se enseña', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    inventarioVisto(m);
    m.lua('assert(SnetForever.Operaciones.poner("artesania", "Reponer", "beneficioMinimo", "1g"))');
    let p = fila(vista(m), POCION);
    assert.equal(p.estado, 'nada');
    assert.equal(p.motivo, 'beneficio');
    assert.equal(p.beneficio, 6800);
    assert.equal(p.beneficioMinimo, 10000);
    m.lua('assert(SnetForever.Operaciones.poner("artesania", "Reponer", "beneficioMinimo", "-1g"))');
    p = fila(vista(m), POCION);
    assert.equal(p.estado, 'fabricar', 'un mínimo negativo de TSM se respeta');
    // Valor propio de la operación.
    m.lua(`assert(SnetForever.Operaciones.poner("artesania", "Reponer", "beneficioMinimo", "1g"))
      assert(SnetForever.Operaciones.poner("artesania", "Reponer", "cambiarValor", true))
      assert(SnetForever.Operaciones.poner("artesania", "Reponer", "valorFabricado", "2g"))`);
    p = fila(vista(m), POCION);
    assert.equal(p.valor, 20000);
    assert.equal(p.valorGeneral, false);
    assert.equal(p.estado, 'fabricar');
    // Sin valor: con el beneficio mínimo activado la fila queda incierta, no se toma como cero.
    m.lua(`assert(SnetForever.Operaciones.poner("artesania", "Reponer", "cambiarValor", false))
      PRE[${POCION}] = nil`);
    p = fila(vista(m), POCION);
    assert.equal(p.estado, 'incierta');
    assert.equal(p.motivo, 'sin_valor');
    assert.equal(p.detalle, 'general');
    // Sin beneficio mínimo, TSM repone sin mirar el valor.
    m.lua('assert(SnetForever.Operaciones.poner("artesania", "Reponer", "beneficioMinimoActivo", false))');
    p = fila(vista(m), POCION);
    assert.equal(p.estado, 'fabricar');
    assert.equal(p.valor, undefined);
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('un material sin precio deja la receta sin coste: incierta con beneficio mínimo, recomendada sin él', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    inventarioVisto(m);
    m.lua(`PRE[${VIAL}] = nil`);
    let p = fila(vista(m), POCION);
    assert.equal(p.estado, 'incierta');
    assert.equal(p.motivo, 'sin_coste');
    assert.equal(p.detalle, 'Vial');
    m.lua('assert(SnetForever.Operaciones.poner("artesania", "Reponer", "beneficioMinimoActivo", false))');
    const v = vista(m);
    p = fila(v, POCION);
    assert.equal(p.estado, 'fabricar', 'TSM usa la única receta aunque no tenga coste');
    assert.equal(p.coste, undefined);
    assert.equal(p.motivo, 'sin_coste');
    assert.equal(p.costeTotal, undefined);
    assert.equal(v.totales.costeIncompleto, true);
    const vial = v.materiales.find((x) => x.id === VIAL);
    assert.equal(vial.precio, undefined);
    assert.equal(vial.coste, undefined);
    assert.equal(v.totales.compraIncompleta, true);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('con varias recetas se usa la más barata; si ninguna tiene coste no se elige ninguna', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION, { id: 2, sale: POCION, n: 1, materiales: [[HIERBA, 1]] }]);
    inventarioVisto(m);
    let p = fila(vista(m), POCION);
    assert.equal(p.receta, 2, '10s por unidad frente a 17,5s');
    assert.equal(p.coste, 1000);
    assert.equal(p.fabricaciones, 10);
    m.lua(`PRE[${HIERBA}] = nil`);
    p = fila(vista(m), POCION);
    assert.equal(p.estado, 'incierta');
    assert.equal(p.motivo, 'recetas_sin_coste');
    assert.equal(p.detalle, 'Hierba');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una operación ignorada aquí no deja paso a otra; variantes y mascotas se apartan', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    inventarioVisto(m);
    m.lua(`assert(SnetForever.Arbol.poner("i:${POCION}:0:0:0:0:0:7", "Alquimia"))
      assert(SnetForever.Arbol.poner("p:39:1:1", "Alquimia"))`);
    let v = vista(m);
    assert.equal(v.filas.find((f) => f.clave === `Alquimia|i:${POCION}:0:0:0:0:0:7`).motivo, 'variante');
    assert.equal(v.filas.find((f) => f.clave === 'Alquimia|p:39:1:1').motivo, 'mascota');
    m.lua('SnetForeverCuenta.comercio.v2.operaciones.artesania.Reponer.ignorarPersonajes = {["Buyer - Normal"] = true}');
    v = vista(m);
    const p = fila(v, POCION);
    assert.equal(p.estado, 'apartada');
    assert.equal(p.motivo, 'ignorada');
    assert.deepEqual(p.operaciones, ['Reponer'], 'la fila dice qué operación está ignorada');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('solo cuenta lo visto: banco, correo y subastas sin ver quedan como tope, nunca como cero', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    m.lua(`SnetForeverCuenta.comercio.inventario = {v = 2, pj = {
        ["Buyer-Normal"] = {nombre = "Buyer", reino = "Normal", bolsas = {}},
        ["Alt-Normal"] = {nombre = "Alt", reino = "Normal", bolsas = {[${POCION}] = 2}, banco = {}, correo = {[${POCION}] = 1}}}}
      SnetForever.InventarioCuenta.olvidarOrden()
      SnetForever.MisSubastas.publicadas = function() return nil end`);
    let p = fila(vista(m), POCION);
    assert.equal(p.tienes, 3, 'las bolsas y el correo del otro personaje, vistos');
    assert.deepEqual(p.sinContar, ['banco', 'correo', 'bancoCuenta', 'subastas', 'subastasAlters', 'hermandad']);
    assert.equal(p.fabricaciones, 3);
    assert.equal(p.tope, true);
    m.lua(`local inv = SnetForeverCuenta.comercio.inventario
      inv.pj["Buyer-Normal"].banco = {[${POCION}] = 2}
      inv.pj["Buyer-Normal"].correo = {}
      inv.bancoCuenta = {objetos = {[${POCION}] = 1}}
      SnetForever.MisSubastas.publicadas = function() return 1 end`);
    p = fila(vista(m), POCION);
    assert.equal(p.tienes, 7, "más el banco propio, el banco de cuenta y tu subasta");
    assert.deepEqual(p.sinContar, ['subastasAlters', 'hermandad']);
    assert.equal(p.fabricaciones, 1, "floor(3 / 2)");
    // El juego no da la cuenta de las bolsas: la fila queda incierta.
    m.lua('C_Item.GetItemCount = function() return nil end');
    p = fila(vista(m), POCION);
    assert.equal(p.estado, 'incierta');
    assert.equal(p.motivo, 'existencias');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('la ventana se abre con /snet c artesania, enseña las dos pestañas, se pausa en combate y no actúa', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    inventarioVisto(m);
    assert.equal(m.lua(`local v = ${A}.vistaPrevia(); return (${A}.vigente(v))`), true);
    assert.equal(m.lua(`local v = ${A}.vistaPrevia()
      C_Item.GetItemCount = function(id) return id == ${POCION} and 4 or 0 end
      local ok, motivo = ${A}.vigente(v); return motivo`), 'cambio');
    m.lua('SlashCmdList.SNET("c artesania")');
    assert.equal(m.lua('return SnetForever.UIArtesania.estaAbierta()'), true);
    const filas = m.lua('return SnetForever.UIArtesania.vista.filas');
    assert.equal(filas.length, 2);
    const motivo = m.lua(`for _, f in ipairs(SnetForever.UIArtesania.vista.filas) do
      if f.item == ${POCION} then return SnetForever.UIArtesania.motivo(f) end end`);
    assert.match(motivo, /fabricar/i);
    assert.match(m.lua('return SnetForever.UIArtesania.marco.estado:GetText()'), /fabricaciones/);
    m.lua('SnetForever.UIArtesania.marco.pestanas.pestanas[2]:Click("LeftButton")');
    assert.equal(m.lua('return SnetForever.UIArtesania.marco.tablas.materiales:IsShown()'), true);
    assert.match(m.lua('return SnetForever.UIArtesania.marco.estado:GetText()'), /materiales/);
    m.lua('BANCO.jugador.enCombate = true');
    m.lua('SnetForever.UIArtesania.refrescar(true)');
    assert.match(m.lua('return SnetForever.UIArtesania.marco.estado:GetText()'), /combate/i);
    m.lua('BANCO.jugador.enCombate = false');
    m.lua('SlashCmdList.SNET("trade crafting")');
    assert.equal(m.lua('return SnetForever.UIArtesania.estaAbierta()'), false, 'la orden en inglés la cierra');
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('con la ventana abierta, las recetas que lee la ventana de profesión llegan en un solo refresco', () => {
  const m = maquina();
  try {
    grupos(m);
    inventarioVisto(m);
    m.lua('SnetForever.UIArtesania.abrir()');
    const motivoDe = () => m.lua(`for _, f in ipairs(SnetForever.UIArtesania.vista.filas) do
      if f.item == ${POCION} then return f.estado .. ":" .. tostring(f.motivo) end end`);
    assert.equal(motivoDe(), 'apartada:sin_receta');
    assert.match(m.lua('return SnetForever.UIArtesania.marco.estado:GetText()'), /profesión/);
    recetas(m, [RECETA_POCION]);
    m.avanzar(0.5);
    assert.equal(motivoDe(), 'fabricar:nil');
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una lectura temporalmente vacía conserva la receta y una receta que deja de estar aprendida se retira', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    m.lua('SnetForever.UIArtesania.abrir()');
    const filas = () => m.lua('return SnetForever.UIArtesania.vista.filas');
    assert.equal(filas().find((f) => f.item === POCION).estado, 'fabricar');
    m.lua('C_TradeSkillUI.GetRecipeInfo = function() return nil end');
    m.disparar('TRADE_SKILL_LIST_UPDATE');
    m.avanzar(0.5);
    assert.equal(filas().find((f) => f.item === POCION).estado, 'fabricar');
    m.lua('C_TradeSkillUI.GetRecipeInfo = function() return {learned = false} end');
    m.disparar('TRADE_SKILL_LIST_UPDATE');
    m.avanzar(0.5);
    assert.equal(filas().find((f) => f.item === POCION).motivo, 'sin_receta');
    assert.equal(m.lua('return SnetForever.RecipeCosts.unit(' + POCION + ')'), undefined);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('banco y subastas actualizan la reposición y los materiales con la ventana abierta', () => {
  const m = maquina();
  try {
    grupos(m);
    recetas(m, [RECETA_POCION]);
    m.lua('SnetForever.UIArtesania.abrir()');
    const vistaActual = () => m.lua('return SnetForever.UIArtesania.vista');
    assert.equal(fila(vistaActual(), POCION).fabricaciones, 5);
    m.huecos(6, 4);
    m.bolsa(6, 1, { id: POCION, n: 4 });
    m.disparar('BANKFRAME_OPENED');
    m.avanzar(0.5);
    assert.equal(fila(vistaActual(), POCION).fabricaciones, 3);
    m.lua(`SnetForever.MisSubastas.publicadas = function(id) return id == ${POCION} and 2 or 0 end
      SnetForever.Eventos.emitir('SNF_COMERCIO_MIS', 'lista')`);
    m.avanzar(0.5);
    assert.equal(fila(vistaActual(), POCION).fabricaciones, 2);
    assert.equal(vistaActual().materiales.find((m) => m.id === HIERBA).necesarias, 6);
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});
