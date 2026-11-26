// Diario de objetos (ia/diario.lua): apunta cómo consigue el personaje cada objeto que importa, para que la IA pueda
// contestar «¿dónde lo obtuve?» con seguridad (docs/ia/2026-11-13-ia-con-herramientas-diseno.md, 5.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const ES = { jugador: { idioma: 'esES', nivel: 12 } };
const EN = { jugador: { idioma: 'enUS', nivel: 12 } };

// Un enlace de objeto con el color de su calidad (0 gris … 5 legendario), como los del chat.
const COLOR = ['9d9d9d', 'ffffff', '1eff00', '0070dd', 'a335ee', 'ff8000'];
const enlace = (id, calidad = 2, nombre = `Objeto ${id}`) => `|cff${COLOR[calidad]}|Hitem:${id}::::::::|h[${nombre}]|h|r`;
const recibir = (m, texto) => m.disparar('CHAT_MSG_LOOT', texto, 'Prueba');
const entradas = (m) => m.lua('SnetForever.Diario.entradas()') ?? [];

test('diario: leerMensaje entiende los seis textos, en español y en inglés', () => {
  const es = nuevaMaquina(ES);
  const leer = (m, t) => m.lua(`SnetForever.Diario.leerMensaje(${aLua(t)})`);
  assert.deepEqual(leer(es, `Recibes botín: ${enlace(2589, 1)}x3.`), { id: 2589, cantidad: 3, creado: false, calidad: 1 });
  assert.deepEqual(leer(es, `Recibes botín: ${enlace(5404, 2)}.`), { id: 5404, cantidad: 1, creado: false, calidad: 2 });
  assert.deepEqual(leer(es, `Recibes objeto: ${enlace(6318, 3)}.`), { id: 6318, cantidad: 1, creado: false, calidad: 3 });
  assert.deepEqual(leer(es, `Recibes objeto: ${enlace(159, 1)}x5.`), { id: 159, cantidad: 5, creado: false, calidad: 1 });
  assert.deepEqual(leer(es, `Creas: ${enlace(2581, 1)}.`), { id: 2581, cantidad: 1, creado: true, calidad: 1 });
  assert.deepEqual(leer(es, `Creas: ${enlace(2581, 1)}x2.`), { id: 2581, cantidad: 2, creado: true, calidad: 1 });
  // El botín de otro jugador no es del personaje.
  assert.equal(leer(es, `Fulano recibe botín: ${enlace(2589, 1)}.`), undefined);
  const en = nuevaMaquina(EN);
  assert.deepEqual(leer(en, `You receive loot: ${enlace(2589, 0)}x2.`), { id: 2589, cantidad: 2, creado: false, calidad: 0 });
  assert.deepEqual(leer(en, `You create: ${enlace(2581, 4)}.`), { id: 2581, cantidad: 1, creado: true, calidad: 4 });
  assert.equal(leer(en, 'Recibes botín: x.'), undefined);
  sinErrores(es);
  sinErrores(en);
});

test('diario: un mensaje sin contexto queda como «desconocido», con hora, nivel, mapa y si es equipo', () => {
  const m = nuevaMaquina(ES);
  m.itemInfo(5404, { nombre: 'Sobrehombros', equipa: 'INVTYPE_SHOULDER', clase: 4 });
  recibir(m, `Recibes objeto: ${enlace(5404, 2)}.`);
  const e = entradas(m);
  assert.equal(e.length, 1);
  assert.equal(e[0].i, 5404);
  assert.equal(e[0].c, 1);
  assert.equal(e[0].o, 'desconocido');
  assert.equal(e[0].eq, true);
  assert.equal(e[0].nv, 12);
  assert.equal(e[0].m, 1411);
  assert.equal(e[0].t, m.lua('GetServerTime()'));
  sinErrores(m);
});

test('diario: «Creas…» se apunta como fabricado', () => {
  const m = nuevaMaquina(ES);
  recibir(m, `Creas: ${enlace(4239, 3)}.`);
  assert.equal(entradas(m)[0].o, 'fabricado');
  sinErrores(m);
});

test('diario: el filtro deja fuera la basura y los materiales; el equipo y lo verde o mejor, dentro', () => {
  const m = nuevaMaquina(ES);
  m.itemInfo(25, { nombre: 'Espada gastada', equipa: 'INVTYPE_WEAPON', clase: 2 });
  recibir(m, `Recibes botín: ${enlace(117, 0)}.`); // gris que no es equipo: fuera
  recibir(m, `Recibes botín: ${enlace(2589, 1)}x4.`); // blanco que no es equipo (material): fuera
  recibir(m, `Recibes botín: ${enlace(25, 1)}.`); // blanco que es equipo: dentro
  recibir(m, `Recibes botín: ${enlace(5404, 2)}.`); // verde: dentro
  recibir(m, `Recibes botín: ${enlace(4239, 3)}.`); // azul: dentro
  assert.deepEqual(entradas(m).map((e) => e.i), [25, 5404, 4239]);
  sinErrores(m);
});

test('diario: un texto secreto no se apunta y suma a «omitidos»', () => {
  const m = nuevaMaquina(ES);
  m.lua('BANCO.disparar("CHAT_MSG_LOOT", BANCO.secreto("string"), "Prueba")');
  assert.deepEqual(entradas(m), []);
  assert.equal(m.lua('SnetForeverPJ.diario.omitidos'), 1);
  sinErrores(m);
});

test('diario: lleno, la nueva entrada desplaza a la más vieja que no es equipo; si todas son equipo, a la más vieja', () => {
  const m = nuevaMaquina(ES);
  assert.equal(m.lua('SnetForever.Diario.MAX'), 2000);
  // 2000 entradas: la 1.ª y la 2.ª son equipo, la 3.ª no.
  m.lua(`local e = SnetForeverPJ.diario.e
    for k = 1, 2000 do e[k] = {i = 10000 + k, c = 1, t = k, nv = 1, o = "desconocido", eq = (k <= 2) or nil} end`);
  recibir(m, `Recibes botín: ${enlace(4239, 3)}.`);
  let e = entradas(m);
  assert.equal(e.length, 2000);
  assert.deepEqual([e[0].i, e[1].i, e[2].i, e.at(-1).i], [10001, 10002, 10004, 4239]);
  // Todas equipo: sale la más vieja.
  m.lua('for _, x in ipairs(SnetForeverPJ.diario.e) do x.eq = true end');
  recibir(m, `Recibes botín: ${enlace(5404, 2)}.`);
  e = entradas(m);
  assert.equal(e.length, 2000);
  assert.deepEqual([e[0].i, e.at(-1).i], [10002, 5404]);
  sinErrores(m);
});

test('diario: un guardado viejo sin diario, o con el diario roto, queda limpio sin perder lo viejo', () => {
  const sin = nuevaMaquina({ ...ES, guardado: { SnetForeverPJ: { esquema: 1, progreso: {} } } });
  assert.deepEqual(sin.lua('SnetForeverPJ.diario'), { v: 1, e: [], omitidos: 0 });
  const roto = nuevaMaquina({ ...ES, guardado: { SnetForeverPJ: { esquema: 1, diario: 7 } } });
  assert.deepEqual(roto.lua('SnetForeverPJ.diario'), { v: 1, e: [], omitidos: 0, _roto: 7 });
  sinErrores(sin);
  sinErrores(roto);
});

// ---------------------------------------------------------------------------------------------------------------
// Tarea 3: de dónde viene cada objeto.
// ---------------------------------------------------------------------------------------------------------------

const origen = (e) => {
  const salida = { o: e.o };
  for (const k of ['q', 'npc', 'obj', 'p']) if (e[k] !== undefined) salida[k] = e[k];
  return salida;
};

test('diario: recompensa de misión, solo la opción elegida y las fijas', () => {
  const m = nuevaMaquina(ES);
  m.lua('BANCO.ponerRecompensas({q = 788, recompensas = {5404}, elegir = {6318, 6324}})');
  m.disparar('QUEST_COMPLETE');
  m.lua('GetQuestReward(1)');
  m.disparar('QUEST_TURNED_IN', 788, 100, 0);
  recibir(m, `Recibes objeto: ${enlace(6318, 2)}.`);
  recibir(m, `Recibes objeto: ${enlace(5404, 2)}.`);
  recibir(m, `Recibes objeto: ${enlace(6324, 2)}.`);
  assert.deepEqual(entradas(m).map(origen), [{ o: 'mision', q: 788 }, { o: 'mision', q: 788 }, { o: 'desconocido' }]);
  sinErrores(m);
});

test('diario: compra a un vendedor, con su PNJ y el precio', () => {
  const m = nuevaMaquina(ES);
  m.lua('BANCO.ponerVendedor({npc = 3164, {5107, 125}})');
  m.disparar('MERCHANT_SHOW');
  m.lua('BuyMerchantItem(1, 1)');
  recibir(m, `Recibes objeto: ${enlace(5107, 2)}.`);
  assert.deepEqual(entradas(m).map(origen), [{ o: 'vendedor', npc: 3164, p: 125 }]);
  sinErrores(m);
});

test('diario: botín de un PNJ y de un cofre', () => {
  const m = nuevaMaquina(ES);
  m.lua(`BANCO.ponerBotin({{${aLua(enlace(5404, 2))}, "Creature-0-1-1-1-3098-0"}, {${aLua(enlace(6414, 2))}, "GameObject-0-1-1-1-2843-0"}})`);
  m.disparar('LOOT_OPENED', false, false);
  recibir(m, `Recibes botín: ${enlace(5404, 2)}.`);
  recibir(m, `Recibes botín: ${enlace(6414, 2)}.`);
  assert.deepEqual(entradas(m).map(origen), [{ o: 'botin', npc: 3098 }, { o: 'botin', obj: 2843 }]);
  sinErrores(m);
});

test('diario: correo y subasta se apuntan al cogerlos, sin ningún nombre de jugador y sin repetirse con el mensaje', () => {
  const m = nuevaMaquina(ES);
  m.lua(`BANCO.ponerCorreo({
    {indice = 1, adjunto = 1, id = 6324},
    {indice = 2, adjunto = 1, id = 6414, factura = {tipo = "buyer", jugador = "Alguien", puja = 14000}},
  })`);
  m.itemInfo(6324, { nombre: 'Togas', equipa: 'INVTYPE_ROBE', clase: 4 });
  m.itemInfo(6414, { nombre: 'Sello', equipa: 'INVTYPE_FINGER', clase: 4 });
  m.lua('TakeInboxItem(1, 1)');
  m.lua('TakeInboxItem(2, 1)');
  // Si el juego además escribe «Recibes objeto…», no se apunta otra vez.
  recibir(m, `Recibes objeto: ${enlace(6414, 2)}.`);
  assert.deepEqual(entradas(m).map(origen), [{ o: 'correo' }, { o: 'subasta', p: 14000 }]);
  assert.ok(!JSON.stringify(m.lua('SnetForeverPJ.diario')).includes('Alguien'));
  sinErrores(m);
});

test('diario: pasada la ventana de 10 s, el contexto ya no vale', () => {
  const m = nuevaMaquina(ES);
  m.lua('BANCO.ponerVendedor({npc = 3164, {5107, 125}})');
  m.disparar('MERCHANT_SHOW');
  m.lua('BuyMerchantItem(1, 1)');
  m.avanzar(11);
  recibir(m, `Recibes objeto: ${enlace(5107, 2)}.`);
  assert.deepEqual(entradas(m).map(origen), [{ o: 'desconocido' }]);
  sinErrores(m);
});

test('diario: cada mensaje gasta un contexto; dos botines del mismo objeto de dos PNJ, cada uno con el suyo', () => {
  const m = nuevaMaquina(ES);
  m.lua(`BANCO.ponerBotin({{${aLua(enlace(5404, 2))}, "Creature-0-1-1-1-3098-0"}, {${aLua(enlace(5404, 2))}, "Creature-0-1-1-1-3099-0"}})`);
  m.disparar('LOOT_OPENED', false, false);
  recibir(m, `Recibes botín: ${enlace(5404, 2)}.`);
  recibir(m, `Recibes botín: ${enlace(5404, 2)}.`);
  recibir(m, `Recibes botín: ${enlace(5404, 2)}.`);
  assert.deepEqual(entradas(m).map(origen), [{ o: 'botin', npc: 3098 }, { o: 'botin', npc: 3099 }, { o: 'desconocido' }]);
  sinErrores(m);
});

test('diario: sin las funciones del cliente, sale desconocido o correo, sin errores', () => {
  const sinBotin = nuevaMaquina({ ...ES, sinApi: ['GetLootSourceInfo'] });
  sinBotin.lua(`BANCO.ponerBotin({{${aLua(enlace(5404, 2))}, "Creature-0-1-1-1-3098-0"}})`);
  sinBotin.disparar('LOOT_OPENED', false, false);
  recibir(sinBotin, `Recibes botín: ${enlace(5404, 2)}.`);
  assert.deepEqual(entradas(sinBotin).map(origen), [{ o: 'desconocido' }]);
  sinErrores(sinBotin);
  const sinFactura = nuevaMaquina({ ...ES, sinApi: ['GetInboxInvoiceInfo'] });
  sinFactura.lua('BANCO.ponerCorreo({{indice = 1, adjunto = 1, id = 6414, factura = {tipo = "buyer", jugador = "Alguien", puja = 14000}}})');
  sinFactura.itemInfo(6414, { nombre: 'Sello', equipa: 'INVTYPE_FINGER', clase: 4 });
  sinFactura.lua('TakeInboxItem(1, 1)');
  assert.deepEqual(entradas(sinFactura).map(origen), [{ o: 'correo' }]);
  sinErrores(sinFactura);
  const sinGanchos = nuevaMaquina({ ...ES, sinApi: ['BuyMerchantItem', 'GetQuestReward', 'TakeInboxItem'] });
  recibir(sinGanchos, `Recibes objeto: ${enlace(5404, 2)}.`);
  assert.deepEqual(entradas(sinGanchos).map(origen), [{ o: 'desconocido' }]);
  sinErrores(sinGanchos);
});

// ---------------------------------------------------------------------------------------------------------------
// Tarea 4: /snet diario.
// ---------------------------------------------------------------------------------------------------------------

const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));

// Siete entradas de todos los orígenes, de la más vieja a la más nueva.
function conEntradas(m) {
  for (const [id, nombre] of [[6318, 'Bastón'], [5404, 'Sobrehombros'], [5107, 'Camisa'], [6414, 'Sello'], [6324, 'Togas'], [4239, 'Capa'], [25, 'Espada']]) {
    m.lua(`BANCO.nombresJuego.item[${id}] = ${aLua(nombre)}`); // el nombre que da el juego (C_Item.GetItemNameByID)
  }
  m.lua(`SnetForeverPJ.diario.e = {
    {i = 25, c = 1, t = 1, nv = 1, o = "desconocido"},
    {i = 4239, c = 1, t = 2, nv = 1, o = "fabricado"},
    {i = 6324, c = 1, t = 3, nv = 1, o = "correo"},
    {i = 6318, c = 1, t = 4, nv = 1, o = "mision", q = 788},
    {i = 5404, c = 1, t = 5, nv = 1, o = "botin", npc = 3143},
    {i = 5107, c = 1, t = 6, nv = 1, o = "vendedor", npc = 3143, p = 125},
    {i = 6414, c = 1, t = 7, nv = 1, o = "subasta", p = 14000},
  }`);
}

test('diario: /snet diario escribe las 5 últimas, de la más nueva a la más vieja, con nombre y origen', () => {
  const m = nuevaMaquina(ES);
  conEntradas(m);
  const pnj = m.lua('SnetForever.Datos.nombrePNJ(3143)');
  m.lua('SlashCmdList.SNET("diario")');
  assert.deepEqual(impresos(m).slice(-5), [
    'SnetForever: Sello — comprado en la subasta por 1g 40s 00c', // B6r, punto 11: g, s y c, como Tema.dinero
    `SnetForever: Camisa — comprado a ${pnj} por 1s 25c`,
    `SnetForever: Sobrehombros — botín de ${pnj}`,
    'SnetForever: Bastón — recompensa de «Afilando los dientes»',
    'SnetForever: Togas — por correo',
  ]);
  sinErrores(m);
});

test('diario: /snet diario dice cómo se ven los demás orígenes y el diario vacío', () => {
  const m = nuevaMaquina(ES);
  m.lua('SlashCmdList.SNET("diario")');
  assert.equal(impresos(m).at(-1), 'SnetForever: tu diario de objetos está vacío');
  conEntradas(m);
  m.lua('SnetForever.Diario.mostrar(7)');
  assert.deepEqual(impresos(m).slice(-2), ['SnetForever: Capa — fabricado', 'SnetForever: Espada — origen desconocido']);
  // Un botín de un objeto del mundo y un vendedor sin PNJ ni precio.
  m.lua('SnetForeverPJ.diario.e = {{i = 25, c = 1, t = 1, o = "vendedor"}, {i = 6414, c = 1, t = 2, o = "botin", obj = 2843}}');
  const cofre = m.lua('SnetForever.Datos.nombreObjeto(2843)');
  m.lua('SnetForever.Diario.mostrar()');
  assert.deepEqual(impresos(m).slice(-2), [`SnetForever: Sello — botín de ${cofre}`, 'SnetForever: Espada — comprado a un vendedor']);
  sinErrores(m);
});

test('diario: /snet log en inglés', () => {
  const m = nuevaMaquina(EN);
  conEntradas(m);
  m.lua('SlashCmdList.SNET("log")');
  assert.ok(impresos(m).includes('SnetForever: Bastón — reward from “Cutting Teeth”'), impresos(m).join('\n'));
  assert.ok(impresos(m).includes('SnetForever: Sello — bought at the auction house for 1g 40s 00c'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------
// Revisión final: lo que el cliente de WoW Forever hace de verdad.
// ---------------------------------------------------------------------------------------------------------------

// Los enlaces de WoW Forever llevan la calidad como «|cnIQ<n>:» (comprobado: 488 enlaces en las SavedVariables del
// juego, ninguno «|cffRRGGBB»).
const enlaceForever = (id, calidad = 2, nombre = `Objeto ${id}`) => `|cnIQ${calidad}:|Hitem:${id}::::::::|h[${nombre}]|h|r`;

test('revisión: la calidad sale de «|cnIQ<n>:» (el formato de WoW Forever) y el filtro funciona con ella', () => {
  const m = nuevaMaquina(ES);
  assert.deepEqual(m.lua(`SnetForever.Diario.leerMensaje(${aLua(`Recibes botín: ${enlaceForever(2589, 2)}x3.`)})`),
    { id: 2589, cantidad: 3, creado: false, calidad: 2 });
  recibir(m, `Recibes botín: ${enlaceForever(117, 0)}.`); // gris: fuera
  recibir(m, `Recibes botín: ${enlaceForever(2589, 1)}.`); // blanco que no es equipo: fuera
  recibir(m, `Recibes botín: ${enlaceForever(9999, 3)}.`); // azul que no es equipo: dentro
  assert.deepEqual(entradas(m).map((e) => e.i), [9999]);
  sinErrores(m);
});

test('revisión: el precio del vendedor sale de C_MerchantFrame.GetItemInfo si no está GetMerchantItemInfo', () => {
  const m = nuevaMaquina({ ...ES, sinApi: ['GetMerchantItemInfo'] });
  m.lua('BANCO.ponerVendedor({npc = 3164, {5107, 125}})');
  m.disparar('MERCHANT_SHOW');
  m.lua('BuyMerchantItem(1, 1)');
  recibir(m, `Recibes objeto: ${enlaceForever(5107, 2)}.`);
  assert.deepEqual(entradas(m).map(origen), [{ o: 'vendedor', npc: 3164, p: 125 }]);
  sinErrores(m);
});

test('revisión: el correo apunta la cantidad del adjunto, y mayúsculas + clic (AutoLootMailItem) coge todos', () => {
  const m = nuevaMaquina(ES);
  m.lua(`BANCO.ponerCorreo({
    {indice = 1, adjunto = 1, id = 4306, cantidad = 20, factura = {tipo = "buyer", jugador = "Alguien", puja = 6000}},
    {indice = 2, adjunto = 1, id = 6324},
    {indice = 2, adjunto = 2, id = 6414},
  })`);
  for (const [id, calidad] of [[4306, 2], [6324, 2], [6414, 2]]) m.itemInfo(id, { nombre: `Objeto ${id}`, calidad });
  m.lua('TakeInboxItem(1, 1)');
  m.lua('AutoLootMailItem(2)');
  const e = entradas(m);
  assert.deepEqual(e.map((x) => [x.i, x.c, x.o]), [[4306, 20, 'subasta'], [6324, 1, 'correo'], [6414, 1, 'correo']]);
  sinErrores(m);
});

test('revisión: coger dos veces seguidas el mismo adjunto (doble clic) lo apunta una sola vez', () => {
  const m = nuevaMaquina(ES);
  m.lua('BANCO.ponerCorreo({{indice = 1, adjunto = 1, id = 6324}})');
  m.itemInfo(6324, { nombre: 'Togas', equipa: 'INVTYPE_ROBE', clase: 4 });
  m.lua('TakeInboxItem(1, 1)');
  m.lua('TakeInboxItem(1, 1)');
  assert.equal(entradas(m).length, 1);
  sinErrores(m);
});

test('revisión: una factura con el tipo secreto no da error y queda como correo; un gancho que falla no rompe al juego', () => {
  const m = nuevaMaquina({ ...ES, vigilarSecretos: ['ia/diario.lua'] });
  m.lua('BANCO.ponerCorreo({{indice = 1, adjunto = 1, id = 6414}})');
  m.itemInfo(6414, { nombre: 'Sello', equipa: 'INVTYPE_FINGER', clase: 4 });
  m.lua('rawset(_G, "GetInboxInvoiceInfo", function() return BANCO.secreto("string"), "x", "y", BANCO.secreto("number") end)');
  m.lua('TakeInboxItem(1, 1)');
  assert.deepEqual(entradas(m).map(origen), [{ o: 'correo' }]);
  sinErrores(m);
  // Un fallo dentro del gancho del vendedor no llega a quien compra.
  const v = nuevaMaquina(ES);
  v.lua('BANCO.ponerVendedor({npc = 3164, {5107, 125}})');
  v.lua('rawset(_G, "GetMerchantItemLink", function() error("roto") end) rawset(C_MerchantFrame, "GetItemInfo", function() error("roto") end)');
  assert.doesNotThrow(() => v.lua('BuyMerchantItem(1, 1)'));
});
