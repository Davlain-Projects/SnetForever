import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const value = (machine, id, expression = 'vendorbuy') =>
  machine.lua(`(SnetForever.Formulas.valor("${expression}", ${id}))`);

test('vendorbuy reads the lowest observed cash price per unit without purchasing or rounding up', () => {
  const m = nuevaMaquina();
  try {
    m.lua(`BANCO.ponerVendedor({{100, 404}, {100, 413}, {200, 700}})
      local original = C_MerchantFrame.GetItemInfo
      C_MerchantFrame.GetItemInfo = function(index)
        local info = original(index)
        info.stackCount = index == 1 and 3 or 1
        return info
      end`);
    assert.equal(value(m, 100), undefined, 'no vendor observation yet');
    m.disparar('MERCHANT_SHOW');
    assert.equal(value(m, 100), 404 / 3);
    assert.equal(value(m, 200, 'vendorbuy(item:100)'), 404 / 3);
    assert.equal(m.lua('SnetForever.Formulas.cobre((SnetForever.Formulas.valor("vendorbuy", 100)))'), 134);
    m.disparar('MERCHANT_CLOSED');
    assert.equal(value(m, 100), 404 / 3, 'last observed price is usable after the merchant closes');
    assert.equal(m.llamadas('BuyMerchantItem').length, 0);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('vendorbuy ignores extended costs, inaccessible rows and incomplete API results', () => {
  const m = nuevaMaquina();
  try {
    m.lua(`BANCO.ponerVendedor({{100, 10}, {101, 20}, {102, 30}, {103, 40},
      {104, 50}, {105, 60}, {106, 70}, {107, 80}, {108, 90}})
      local original = C_MerchantFrame.GetItemInfo
      C_MerchantFrame.GetItemInfo = function(index)
        local info = original(index)
        if index == 1 then info.hasExtendedCost = true end
        if index == 2 then info.hasExtendedCost = nil end
        if index == 3 then info.currencyID = 42 end
        if index == 4 then info.isPurchasable = false end
        if index == 5 then info.numAvailable = 0 end
        if index == 6 then info.stackCount = nil end
        if index == 7 then info.price = BANCO.secreto("number") end
        if index == 8 then return nil end
        return info
      end`);
    m.disparar('MERCHANT_SHOW');
    for (let id = 100; id <= 107; id++) {
      assert.equal(value(m, id), undefined, `item ${id}`);
      assert.equal(value(m, id, 'first(vendorbuy, 5c)'), 5);
    }
    assert.equal(value(m, 108), 90);
    assert.equal(m.llamadas('BuyMerchantItem').length, 0);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('vendorbuy refreshes only while observing a merchant and clears old prices across contexts', () => {
  const m = nuevaMaquina();
  try {
    m.lua('BANCO.ponerVendedor({{100, 100}})');
    m.disparar('MERCHANT_UPDATE');
    assert.equal(value(m, 100), undefined);
    m.disparar('MERCHANT_SHOW');
    assert.equal(value(m, 100), 100);
    m.lua('BANCO.ponerVendedor({{100, 85}})');
    m.disparar('MERCHANT_UPDATE');
    assert.equal(value(m, 100), 85);
    m.disparar('MERCHANT_CLOSED');
    m.lua('BANCO.ponerVendedor({{100, 75}})');
    m.disparar('MERCHANT_UPDATE');
    assert.equal(value(m, 100), 85);
    m.disparar('UPDATE_FACTION');
    assert.equal(value(m, 100), undefined);
    m.disparar('MERCHANT_SHOW');
    assert.equal(value(m, 100), 75);
    m.disparar('PLAYER_ENTERING_WORLD');
    assert.equal(value(m, 100), undefined);
    m.disparar('MERCHANT_SHOW');
    assert.equal(value(m, 100), 75);
    m.disparar('MERCHANT_CLOSED');
    m.lua('BANCO.tick = BANCO.tick + (15 * 60 + 1) * 20');
    assert.equal(value(m, 100), undefined, 'observation expires after 15 minutes');
    m.lua('BANCO.ponerVendedor({{200, 80}})');
    m.disparar('MERCHANT_SHOW');
    assert.equal(value(m, 100), undefined);
    assert.equal(value(m, 200), 80);
    m.lua('GetMerchantNumItems = function() return 999999 end');
    m.disparar('MERCHANT_UPDATE');
    assert.equal(value(m, 200), undefined, 'invalid enumeration replaces the stale snapshot');
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('vendorbuy resolves a cash offer from its item hyperlink when the ID accessor is absent', () => {
  const m = nuevaMaquina();
  m.lua(`BANCO.ponerVendedor({{100,85}})
    rawset(_G,"GetMerchantItemID",nil)
    rawset(_G,"GetMerchantItemLink",function() return "|Hitem:100:0|h[Test]|h" end)`);
  m.disparar('MERCHANT_SHOW');
  assert.equal(value(m, 100), 85);
  sinErrores(m);
});
