// Vendedor (plan de paridad con TSM, fase 4): la vista previa de solo lectura de lo que las operaciones de Vendedor
// venderían al comerciante abierto o le comprarían para reponer, con las cuentas de VendoringOperation de TSM 4.15.9.
// Todo lo de aquí es inventado.
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const V = 'SnetForever.Vendedor';
const JUGADOR = { nombre: 'Buyer', reino: 'Normal', faccion: 'Horde' };
const PIEL = 2318; // basura que se vende
const COLMILLO = 3172;
const ANILLO = 9999; // con variantes en el árbol
const AGUA = 159; // la vende el comerciante

function maquina() {
  const m = nuevaMaquina({ jugador: JUGADOR, bolsas: 'forever' });
  m.huecos(0, 8);
  m.itemInfo(PIEL, { nombre: 'Piel ligera', precio: 15, apilado: 20 });
  m.itemInfo(COLMILLO, { nombre: 'Colmillo', precio: 40, apilado: 20 });
  m.itemInfo(AGUA, { nombre: 'Agua', precio: 1, apilado: 20 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m.lua(`SnetForever.Guardado.preparar()
    SnetForeverCuenta.comercio.ledger = SnetForeverCuenta.comercio.ledger or {}`);
  return m;
}

// Basura tiene dos operaciones; Basura`Pieles no tiene lista propia y las hereda.
function grupos(m) {
  m.lua(`local S = SnetForever
    assert(S.Arbol.crear("", "Basura"))
    assert(S.Arbol.crear("Basura", "Pieles"))
    assert(S.Arbol.poner("i:${PIEL}", "Basura\`Pieles"))
    assert(S.Arbol.poner("i:${COLMILLO}", "Basura"))
    assert(S.Operaciones.crear("vendedor", "Keep5"))
    assert(S.Operaciones.poner("vendedor", "Keep5", "conservar", "5"))
    assert(S.Operaciones.poner("vendedor", "Keep5", "caducadasMinimas", "0"))
    assert(S.Operaciones.crear("vendedor", "Keep2"))
    assert(S.Operaciones.poner("vendedor", "Keep2", "conservar", "2"))
    assert(S.Operaciones.poner("vendedor", "Keep2", "caducadasMinimas", "0"))
    assert(S.Operaciones.poner("vendedor", "Keep2", "venderActivo", false))
    assert(S.Operaciones.ponerDeGrupo("Basura", "vendedor", {"Keep5", "Keep2"}))`);
}

const vista = (m, modo, rutas) => m.lua(`return ${V}.vistaPrevia(${JSON.stringify(modo)}${rutas ? `, ${rutas}` : ''})`);
const fila = (v, item) => v.filas.find((f) => f.item === item);
const abrirComerciante = (m, filas = [[AGUA, 5]]) => {
  m.lua(`BANCO.ponerVendedor(${luaLista(filas)})`);
  m.disparar('MERCHANT_SHOW');
};
const luaLista = (filas) => `{${filas.map(([id, precio]) => `{${id}, ${precio}}`).join(', ')}}`;
const sinVenderNiComprar = (m) => {
  for (const api of ['C_Container.UseContainerItem', 'UseContainerItem', 'C_Container.PickupContainerItem',
    'C_Container.SplitContainerItem', 'BuyMerchantItem']) {
    assert.equal(m.llamadas(api).length, 0, api);
  }
};

test('sin comerciante abierto, en combate o con un modo que no existe no hay vista previa', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: PIEL, n: 20 });
    assert.equal(vista(m, 'vender').estado, 'sin_comerciante');
    abrirComerciante(m);
    m.lua('BANCO.jugador.enCombate = true');
    assert.equal(vista(m, 'vender').estado, 'en_combate');
    m.lua('BANCO.jugador.enCombate = false');
    assert.equal(vista(m, 'regalar').estado, 'modo');
    assert.equal(vista(m, 'vender').estado, 'lista');
    m.disparar('MERCHANT_CLOSED');
    assert.equal(m.lua(`return ${V}.abierto()`), false);
    assert.equal(vista(m, 'vender').estado, 'sin_comerciante');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('vender hereda las operaciones, salta la venta desactivada y da reserva y precio del comerciante', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: PIEL, n: 12 });
    m.bolsa(0, 2, { id: PIEL, n: 8 });
    m.bolsa(0, 3, { id: COLMILLO, n: 4 });
    abrirComerciante(m);
    const v = vista(m, 'vender');
    assert.equal(v.estado, 'lista');
    const piel = fila(v, PIEL);
    assert.equal(piel.ruta, 'Basura`Pieles');
    assert.deepEqual(piel.operaciones, ['Keep5'], 'Keep2 tiene la venta desactivada');
    assert.equal(piel.tienes, 20);
    assert.equal(piel.vender, 15);
    assert.equal(piel.quedan, 5);
    assert.equal(piel.precio, 15);
    assert.equal(piel.valor, 225);
    assert.equal(piel.estado, 'vender');
    const colmillo = fila(v, COLMILLO);
    assert.equal(colmillo.estado, 'nada');
    assert.equal(colmillo.motivo, 'conserva');
    assert.equal(v.totales.unidades, 15);
    assert.equal(v.totales.valor, 225);
    assert.equal(v.requisitos.ejecutable, false);
    assert.equal(v.requisitos.motivoEjecutar, 'solo_lectura');
    sinVenderNiComprar(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('dos operaciones con la venta activada suman sus propuestas como TSM y la fila lo dice', () => {
  const m = maquina();
  try {
    grupos(m);
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Keep2", "venderActivo", true))');
    m.bolsa(0, 1, { id: PIEL, n: 12 });
    m.bolsa(0, 2, { id: PIEL, n: 8 });
    abrirComerciante(m);
    const piel = fila(vista(m, 'vender'), PIEL);
    // Keep5 propone 15 y Keep2 propone 18: TSM las vende una tras otra con lo que queda, y se acaba todo.
    assert.deepEqual(piel.porOperacion.map((p) => p.propone), [15, 18]);
    assert.equal(piel.vender, 20);
    assert.equal(piel.quedan, 0);
    assert.equal(piel.detalleSuma, 2);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una operación ignorada aquí se salta; sin ninguna, la fila sale apartada', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: PIEL, n: 20 });
    abrirComerciante(m);
    m.lua('SnetForeverCuenta.comercio.v2.operaciones.vendedor.Keep5.ignorarPersonajes = {["Buyer - Normal"] = true}');
    let piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'apartada');
    assert.equal(piel.motivo, 'venta_desactivada', 'solo queda Keep2, con la venta desactivada');
    assert.deepEqual(piel.operaciones, ['Keep2'], 'la fila dice qué operación tiene la venta desactivada');
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Keep2", "venderActivo", true))');
    piel = fila(vista(m, 'vender'), PIEL);
    assert.deepEqual(piel.operaciones, ['Keep2']);
    assert.equal(piel.vender, 18);
    m.lua('SnetForeverCuenta.comercio.v2.operaciones.vendedor.Keep2.ignorarReinos = {["Normal|Horde"] = true}');
    piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.motivo, 'ignorada');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una fórmula inválida deja esa operación sin vender y un máximo sin dato no se toma como cero', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: PIEL, n: 20 });
    abrirComerciante(m);
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "conservar", "60000"))');
    let piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'nada');
    assert.equal(piel.motivo, 'formula');
    assert.equal(piel.detalle, 'Keep5 · conservar');
    m.lua(`assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "conservar", "5"))
      assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "valorMercadoMaximo", "1g"))
      assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "valorMercado", "snfmercado"))`);
    piel = fila(vista(m, 'vender'), PIEL);
    // TSM tomaría el mercado que falta como 0 y lo vendería: aquí no se decide.
    assert.equal(piel.estado, 'incierta');
    assert.equal(piel.motivo, 'sin_dato');
    assert.equal(piel.detalle, 'Keep5 · valorMercado');
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "valorMercado", "2g"))');
    piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'nada');
    assert.equal(piel.motivo, 'mercado');
    m.lua(`assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "valorMercado", "50s"))
      assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "valorDestruccionMaximo", "10s"))
      assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "valorDestruccion", "10s"))`);
    piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.motivo, 'destruccion');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('las caducadas se cuentan desde la última venta y una carta de venta sin ID deja la cuenta incierta', () => {
  const m = maquina();
  try {
    grupos(m);
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "caducadasMinimas", "10"))');
    m.bolsa(0, 1, { id: PIEL, n: 20 });
    abrirComerciante(m);
    const caducada = (owner, n, at) => m.lua(`local l = SnetForeverCuenta.comercio.ledger
      l[${JSON.stringify(owner)}] = l[${JSON.stringify(owner)}] or {}
      table.insert(l[${JSON.stringify(owner)}], {kind = "expired", name = "Piel ligera", item = ${PIEL}, quantity = ${n}, expires = ${at}, seen = 1})`);
    const venta = (owner, at, item) => m.lua(`local l = SnetForeverCuenta.comercio.ledger
      l[${JSON.stringify(owner)}] = l[${JSON.stringify(owner)}] or {}
      table.insert(l[${JSON.stringify(owner)}], {kind = "sale", name = "Piel ligera", ${item ? `item = ${item}, ` : ''}quantity = 1, gross = 100, deposit = 0, fee = 5, net = 95, expires = ${at}, seen = 1})`);
    caducada('Buyer-Normal', 6, 1000);
    let piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.motivo, 'caducadas');
    assert.equal(piel.detalle, '6/10');
    caducada('Alt-Normal', 5, 2000); // otro personaje del mismo reino también cuenta, como en TSM
    caducada('Buyer-Lejano', 50, 2000); // otro reino, no
    piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'vender');
    assert.equal(piel.vender, 15);
    venta('Buyer-Normal', 1500); // venta sin ID con el mismo nombre, entre las dos
    piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'incierta');
    assert.equal(piel.motivo, 'caducadas_sin_id');
    assert.equal(piel.detalle, '5-11/10');
    venta('Buyer-Normal', 1800, PIEL); // una venta con ID: ahora se sabe que solo quedan 5
    piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'nada');
    assert.equal(piel.motivo, 'caducadas');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('ligados, objetos sin valor y precios sin cargar no se venden ni se dan por buenos', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: PIEL, n: 20, ligado: true });
    m.bolsa(0, 2, { id: COLMILLO, n: 9, sinValor: true });
    abrirComerciante(m);
    let v = vista(m, 'vender');
    assert.equal(fila(v, PIEL).estado, 'nada');
    assert.equal(fila(v, PIEL).motivo, 'ligado');
    assert.equal(fila(v, COLMILLO).estado, 'apartada');
    assert.equal(fila(v, COLMILLO).motivo, 'no_acepta');
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "venderLigados", true))');
    assert.equal(fila(vista(m, 'vender'), PIEL).vender, 15);
    // Un ligado que el juego no dice: sin «vender ligados» la fila queda incierta.
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Keep5", "venderLigados", false))');
    m.lua(`local original = C_Container.GetContainerItemInfo
      C_Container.GetContainerItemInfo = function(b, h)
        local i = original(b, h)
        if i and i.itemID == ${PIEL} then i.isBound = nil end
        return i
      end`);
    assert.equal(fila(vista(m, 'vender'), PIEL).motivo, 'ligado_desconocido');
    // Un objeto que el cliente aún no tiene cargado: sin precio de venta no se propone.
    m.lua(`assert(SnetForever.Arbol.poner("i:4444", "Basura"))`);
    m.bolsa(0, 3, { id: 4444, n: 9 });
    const sinCargar = fila(vista(m, 'vender'), 4444);
    assert.equal(sinCargar.estado, 'incierta');
    assert.equal(sinCargar.motivo, 'sin_info');
    // Un objeto con precio de venta 0: el comerciante no lo compra.
    m.itemInfo(PIEL, { nombre: 'Piel ligera', precio: 0, apilado: 20 });
    assert.equal(fila(vista(m, 'vender'), PIEL).motivo, 'no_acepta');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('huecos sin datos dejan las filas inciertas y partir una pila necesita un hueco libre', () => {
  const m = maquina();
  try {
    grupos(m);
    m.huecos(0, 2);
    m.bolsa(0, 1, { id: PIEL, n: 12 });
    m.bolsa(0, 2, { id: PIEL, n: 10 });
    abrirComerciante(m);
    // 22 - 5 = 17: la pila de 10 entera y 7 de la de 12, que hay que partir, sin ningún hueco libre.
    let piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'vender');
    assert.equal(piel.vender, 10);
    assert.equal(piel.motivo, 'sin_hueco');
    m.lua(`local original = C_Container.GetContainerItemInfo
      C_Container.GetContainerItemInfo = function(b, h)
        if b == 0 and h == 2 then return {itemID = nil, stackCount = 3} end
        return original(b, h)
      end`);
    piel = fila(vista(m, 'vender'), PIEL);
    assert.equal(piel.estado, 'incierta');
    assert.equal(piel.motivo, 'huecos');
    assert.equal(piel.quedan, undefined);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('con variantes en el árbol un hueco con sufijo se aparta; sin ellas cuenta como el objeto base', () => {
  const m = maquina();
  try {
    m.lua(`local S = SnetForever
      assert(S.Arbol.crear("", "Joyas"))
      assert(S.Arbol.poner("i:${ANILLO}", "Joyas"))
      assert(S.Operaciones.crear("vendedor", "Todo"))
      assert(S.Operaciones.poner("vendedor", "Todo", "caducadasMinimas", "0"))
      assert(S.Operaciones.ponerDeGrupo("Joyas", "vendedor", {"Todo"}))`);
    m.itemInfo(ANILLO, { nombre: 'Anillo', precio: 500, apilado: 1 });
    m.bolsa(0, 1, { id: ANILLO, n: 1, enlace: `|cff1eff00|Hitem:${ANILLO}::::::1201:::::::|h[Anillo del oso]|h|r` });
    abrirComerciante(m);
    assert.equal(fila(vista(m, 'vender'), ANILLO).estado, 'vender', 'TSM lo traduce al objeto base del grupo');
    m.lua(`assert(SnetForever.Arbol.poner("i:${ANILLO}::1201", "Joyas"))`);
    const anillo = fila(vista(m, 'vender'), ANILLO);
    assert.equal(anillo.estado, 'apartada');
    assert.equal(anillo.motivo, 'variante');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('reponer usa la primera operación, cuenta las fuentes que sabe y no compra más de lo que queda', () => {
  const m = maquina();
  try {
    m.lua(`local S = SnetForever
      assert(S.Arbol.crear("", "Viaje"))
      assert(S.Arbol.poner("i:${AGUA}", "Viaje"))
      assert(S.Arbol.poner("i:${PIEL}", "Viaje"))
      assert(S.Operaciones.crear("vendedor", "Agua20"))
      assert(S.Operaciones.poner("vendedor", "Agua20", "reponerCantidad", "20"))
      assert(S.Operaciones.crear("vendedor", "Segunda"))
      assert(S.Operaciones.poner("vendedor", "Segunda", "reponerCantidad", "99"))
      assert(S.Operaciones.ponerDeGrupo("Viaje", "vendedor", {"Agua20", "Segunda"}))`);
    m.bolsa(0, 1, { id: AGUA, n: 6 });
    m.objeto(AGUA, 6);
    m.lua(`BANCO.ponerVendedor({{${AGUA}, 10}, {${AGUA}, 25}, {${PIEL}, 100}})
      local original = C_MerchantFrame.GetItemInfo
      C_MerchantFrame.GetItemInfo = function(i)
        local info = original(i)
        if info and (i == 1 or i == 3) then info.hasExtendedCost = true end
        return info
      end`);
    m.disparar('MERCHANT_SHOW');
    let v = vista(m, 'reponer');
    assert.equal(v.estado, 'lista');
    const agua = fila(v, AGUA);
    assert.deepEqual(agua.operaciones, ['Agua20']);
    assert.equal(agua.tienes, 6);
    assert.equal(agua.objetivo, 20);
    assert.equal(agua.comprar, 14);
    assert.equal(agua.disponibles, -1);
    assert.equal(agua.coste, 14 * 25);
    assert.equal(fila(v, PIEL).estado, 'apartada');
    assert.equal(fila(v, PIEL).motivo, 'coste_no_oro');
    // Stock limitado del comerciante.
    m.lua(`local original = C_MerchantFrame.GetItemInfo
      C_MerchantFrame.GetItemInfo = function(i)
        local info = original(i)
        if info and i == 2 then info.numAvailable = 3 end
        return info
      end`);
    m.disparar('MERCHANT_UPDATE');
    assert.equal(fila(vista(m, 'reponer'), AGUA).comprar, 3);
    // Una fuente que el addon no sabe contar deja la fila incierta; la compra desactivada, apartada.
    m.lua('assert(SnetForever.Operaciones.poner("vendedor", "Agua20", "fuentesReponer", {"hermandad"}))');
    let agua2 = fila(vista(m, 'reponer'), AGUA);
    assert.equal(agua2.estado, 'incierta');
    assert.equal(agua2.motivo, 'fuente_sin_cobertura');
    m.lua(`assert(SnetForever.Operaciones.poner("vendedor", "Agua20", "fuentesReponer", {}))
      assert(SnetForever.Operaciones.poner("vendedor", "Agua20", "comprarActivo", false))`);
    agua2 = fila(vista(m, 'reponer'), AGUA);
    assert.equal(agua2.motivo, 'compra_desactivada', 'TSM no pasa a la segunda operación');
    sinVenderNiComprar(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('la vista sabe si sigue valiendo y la ventana se cierra con el comerciante', () => {
  const m = maquina();
  try {
    grupos(m);
    m.bolsa(0, 1, { id: PIEL, n: 20 });
    abrirComerciante(m);
    assert.equal(m.lua(`local v = ${V}.vistaPrevia("vender"); return (${V}.vigente(v))`), true);
    assert.equal(m.lua(`local v = ${V}.vistaPrevia("vender")
      BANCO.ponerBolsa(0, 2, {id = ${PIEL}, n = 3})
      local ok, motivo = ${V}.vigente(v); return motivo`), 'cambio');
    m.lua('SnetForever.UIVendedor.abrir()');
    assert.equal(m.lua('return SnetForever.UIVendedor.estaAbierta()'), true);
    const filas = m.lua('return SnetForever.UIVendedor.vista.filas');
    assert.equal(filas.length, 1);
    assert.match(m.lua(`return SnetForever.UIVendedor.motivo(SnetForever.UIVendedor.vista.filas[1])`), /vend/i);
    m.lua('BANCO.jugador.enCombate = true');
    m.lua('SnetForever.UIVendedor.refrescar(true)');
    assert.match(m.lua('return SnetForever.UIVendedor.marco.estado:GetText()'), /combat/i);
    m.lua('BANCO.jugador.enCombate = false');
    m.disparar('MERCHANT_CLOSED');
    assert.equal(m.lua('return SnetForever.UIVendedor.estaAbierta()'), false);
    m.lua('SnetForever.UIVendedor.abrir()');
    assert.equal(m.lua('return SnetForever.UIVendedor.estaAbierta()'), false, 'sin comerciante no se abre');
    sinVenderNiComprar(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});
