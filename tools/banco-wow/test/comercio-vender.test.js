import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const operation = `
  local SNF = SnetForever
  local O, V = SNF.Operaciones, SNF.Vender
  assert(O.crear("subasta", "Test"))
  local function set(field, value) assert(O.poner("subasta", "Test", field, value)) end
  set("precioMinimo", "100c")
  set("precioNormal", "200c")
  set("precioMaximo", "300c")
  set("rebaja", "5c")
  set("umbralReponer", "10c")
`;

test('auction pricing respects operation bounds and keeps the price of an owned tier', () => {
  const m = nuevaMaquina();
  try {
    const prices = m.lua(`(function()
      ${operation}
      local function price(rows) return V.precioPara(2589, "Test", rows) end
      local normal = price({})
      local undercut = price({{precioUnidad = 177}})
      local own = price({{precioUnidad = 177, mia = true}, {precioUnidad = 177}})
      local tooLow = price({{precioUnidad = 99}}) == nil
      set("bajoMinimo", "ignorar")
      local filtered = price({{precioUnidad = 99}, {precioUnidad = 150}})
      local capped = price({{precioUnidad = 600}})
      return {normal, undercut, own, tooLow, filtered, capped}
    end)()`);
    assert.deepEqual(prices, [200, 172, 177, true, 145, 300]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('posting reserves inventory and requires extra confirmation below vendor value', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen cloth', calidad: 1, precio: 500, apilado: 20 });
    const state = m.lua(`(function()
      ${operation}
      set("tope", "30")
      set("reservaEnBolsas", "10")
      set("duracion", "48")
      local plan = V.decidir(2589, "Test", {}, 50, 7, true)
      return {plan.publicar, plan.unidades, plan.duracion, plan.horas, plan.total, plan.confirmar.motivo, plan.confirmar.referencia}
    end)()`);
    assert.deepEqual(state, [true, 23, 3, 24, 4600, 'bajo_vendedor', 500]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('posting sizes commodity batches with only C_Item.GetItemInfo', () => {
  const m = nuevaMaquina({ sinApi: ['GetItemInfo'] });
  try {
    m.itemInfo(2589, { nombre: 'Linen cloth', precio: 50, apilado: 2 });
    const batches = m.lua(`(function()
      ${operation}
      set("tope", "100")
      local cached = V.decidir(2589, "Test", {}, 100, 0, true)
      local uncached = V.decidir(2590, "Test", {}, 100, 0, true)
      return {cached.porPublicacion, uncached.porPublicacion}
    end)()`);
    assert.deepEqual(batches, [80, 40]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('a starting bid respects the minimum and uses the currency allowed by the client', () => {
  const m = nuevaMaquina();
  try {
    const bids = m.lua(`(function()
      ${operation}
      C_AuctionHouse.SupportsCopperValues = function() return true end
      local function draft(pct, commodity)
        set("pujaPorcentaje", pct)
        local d = V.decidir(2589, "Test", {}, 8, 0, commodity)
        return {d.precioUnidad, d.puja or false}
      end
      local out = {draft(25), draft(75), draft(0), draft(100), draft(25, true)}
      C_AuctionHouse.SupportsCopperValues = function() return false end
      set("precioMinimo", "125c")
      set("precioNormal", "300c")
      out[#out + 1] = draft(50)
      return out
    end)()`);
    assert.deepEqual(bids, [[200, 100], [200, 150], [200, false], [200, false], [200, false], [300, 200]]);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('inherited sale operations plan against successive active ceilings and live bag reserves', () => {
  const m = nuevaMaquina();
  try {
    m.itemInfo(2589, { nombre: 'Linen', calidad: 1, precio: 50, apilado: 20 });
    const state = m.lua(`(function()
      ${operation}
      set("tope", "6")
      set("reservaEnBolsas", "4")
      for _, name in ipairs({"Same ceiling", "Restock"}) do
        assert(O.duplicar("subasta", "Test", name))
      end
      assert(O.poner("subasta", "Restock", "tope", "12"))
      assert(O.poner("subasta", "Restock", "reservaEnBolsas", "8"))
      local parent = assert(SNF.Arbol.crear("", "Linen"))
      local leaf = assert(SNF.Arbol.crear(parent, "Bags"))
      assert(SNF.Arbol.poner("i:2589", leaf))
      assert(O.ponerDeGrupo(parent, "subasta", {"Test", "Same ceiling", "Restock"}))
      local names = V.applicableOperations(2589)
      local plans = V.postPlans(2589, names, {}, 15, 2, true)
      return {{names[1], names[2], names[3]}, {plans[1].draft.unidades,
        plans[2].draft.motivo, plans[3].draft.unidades}}
    end)()`);
    assert.deepEqual(state, [['Test', 'Same ceiling', 'Restock'], [4, 'tope', 3]]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('an undercut listing is cancelled only when the repost would be cheaper', () => {
  const m = nuevaMaquina();
  try {
    const decisions = m.lua(`(function()
      ${operation}
      set("rebaja", "0c")
      local function cancel(mine, low)
        local d = V.decidirCancelar({item = 2589, precioUnidad = mine, cantidad = 1}, "Test",
          {{precioUnidad = mine, mia = true, cantidad = 1}, {precioUnidad = low, cantidad = 1}})
        return {d.cancelar, d.motivo, d.nuevo or false}
      end
      local out = {}
      out[#out + 1] = cancel(150, 140)
      set("bajoMinimo", "minimo")
      out[#out + 1] = cancel(100, 90)
      out[#out + 1] = cancel(150, 90)
      set("bajoMinimo", "normal")
      out[#out + 1] = cancel(200, 90)
      set("bajoMinimo", "maximo")
      out[#out + 1] = cancel(150, 90)
      set("cancelarParaSubir", false)
      out[#out + 1] = cancel(150, 90)
      set("bajoMinimo", "noPublicar")
      out[#out + 1] = cancel(150, 90)
      return out
    end)()`);
    assert.deepEqual(decisions, [
      [true, 'rebajada', 140],
      [false, 'bien', 100],
      [true, 'rebajada', 100],
      [false, 'bien', 200],
      [true, 'subir', 300],
      [false, 'bien', 300],
      [false, 'no_volveria', false],
    ]);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});
