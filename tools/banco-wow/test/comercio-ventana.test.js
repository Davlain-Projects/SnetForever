// Comercio, tarea 12: la ventana de comercio junto a la subasta (ui/comercio.lua) con la lista ordenada por %, los
// colores del %, el ritmo de venta en la fila, la señal de buena compra, la ventanita del ratón y los avisos de la
// cabecera. El escaneo en vivo (Task 10, SNF.Escaneo) aún no existe: aquí se imita con su interfaz prevista
// (iniciar, parar, estado, datos y el mensaje SNF_COMERCIO_ESCANEO).
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

const ADDON_UI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'addons', 'SnetForever_Comercio', 'ui'); // 0.7.0: addon aparte

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000; // GetServerTime() del banco al empezar (hh:13:20)
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357; // hh:22:37

// Una ranura de precios como la escribe la app (contrato de la tarea 7): casas = {casa: {item: [7 números]}}.
function ponerRanura(dir, i, { seq, generado, casas, conocidas = { 'Normal|Horde': 114 } }) { // F7: sin casa supuesta, la de la Horda descubierta
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\np2.lua\n`);
  const lista = Object.entries(conocidas).map(([k, v]) => `[${aLua(k)}] = ${v}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `if SNF_PRECIOS == nil or (SNF_PRECIOS.seq or 0) < ${seq} then
  SNF_PRECIOS = {v = 1, seq = ${seq}, generado = ${generado}, region = "us", conocidas = {${lista}}, casas = {},
    grupos = {{clave = "rapido", nombre = {es = "Suelen salir sin caducar", en = "Usually leave before expiring"}, tipo = "calculado", objetos = {2589}},
      "roto", {clave = "telas", nombre = {es = "Telas", en = "Cloth"}, tipo = "auto", objetos = {2589, 2592, 4306}}},
    nombres = {[14047] = "Tela rúnica"}}
end
`);
  const lineas = [`local P = SNF_PRECIOS; if not (P and P.seq == ${seq}) then return end`, 'local c = P.casas'];
  for (const [casa, objetos] of Object.entries(casas)) {
    lineas.push(`c[${casa}] = c[${casa}] or {}`);
    for (const [item, fila] of Object.entries(objetos)) lineas.push(`c[${casa}][${item}] = {${fila.join(', ')}}`);
  }
  lineas.push('P.completo = true');
  writeFileSync(join(carpeta, 'p2.lua'), `${lineas.join('\n')}\n`);
}

// Lo normal de todos es 10 de oro (100000 de cobre, por encima del valorMin de la plantilla); ritmo 0,42; tendencia
// +12 % en el lino. Con ritmo = -1 la app no sabe el ritmo (sin credenciales de Blizzard).
const ITEMS = [2589, 2592, 4306, 4338, 14047];
function casas({ ritmo = 0.42, mercancias = [] } = {}) {
  const fila = (tendencia) => [98000, 400, 100000, tendencia, ritmo, 85, 0];
  const horda = {};
  for (const item of ITEMS) horda[item] = fila(item === 2589 ? 12 : 0);
  for (const item of mercancias) horda[item].push(37, 1, 1); // F9p: subastas, tendencia sabida y el 1 de las mercancías
  return {
    114: horda,
    111: { 2589: [52000, 30, 60000, 0, 0.3, 4, 0] }, // Alianza
    117: { 2589: [61000, 12, 65000, 0, 0.2, 2, 1] }, // Aguasnegras (neutral)
  };
}

// Máquina de un personaje Horda del reino Normal, ya en el minuto 40 (los precios de la hora están escritos), con el
// idioma en español, nombres y calidades de objetos, y el lino en las bolsas (5) y en el banco (2).
function maquina({ precios = true, ritmo, previo, escaneo = true, mercancias } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-ventana-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  if (precios) ponerRanura(dir, ranuraDeHora(H), { seq: 1, generado: foto(H), casas: casas({ ritmo, mercancias }) });
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' }, previo });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2 });
  m.itemInfo(4338, { nombre: 'Paño de tejido mágico', calidad: 3 });
  m.objeto(2589, 5, { banco: 2 });
  if (escaneo) {
    m.lua(`SnetForever.Escaneo = {
      _estado = "escaneando", _datos = {}, _iniciado = 0,
      iniciar = function() SnetForever.Escaneo._iniciado = SnetForever.Escaneo._iniciado + 1 end,
      parar = function() SnetForever.Escaneo._estado = "parado" end,
      estado = function() return SnetForever.Escaneo._estado end,
      datos = function() return SnetForever.Escaneo._datos end,
    }`);
  }
  return m;
}

// F1 (ronda 1): la lista elige el precio de cada fila con SNF.Subasta.foto (la lista de Navegar, si no la foto de la app y,
// solo sin ella, el escaneo). Para que las pruebas de antes sigan mirando sus precios con el % de la app, las listas de
// Navegar imitadas dicen lo mismo que el escaneo falso (leídas a la vez). Las pruebas de la columna Foto lo cambian.
const LISTAS_COMO_ESCANEO = `SnetForever.Busqueda.vivo = function(i)
  local d = SnetForever.Escaneo._datos[i]
  if d then return {precio = d.precio, cantidad = d.cantidad, hora = d.hora, origen = "lista"} end
end`;

// Pone lo que «ha escaneado» el escaneo falso: {item: precio} (cantidad 20, visto hace 10 min) y avisa como él.
function escanear(m, precios, { avisar = true } = {}) {
  const filas = Object.entries(precios).map(([item, p]) => `[${item}] = {precio = ${p}, cantidad = 20, hora = GetServerTime() - 600}`);
  m.lua(`SnetForever.Escaneo._datos = {${filas.join(', ')}}`);
  m.lua(LISTAS_COMO_ESCANEO);
  if (avisar) m.lua(`SnetForever.emitir("SNF_COMERCIO_ESCANEO", ${filas.length}, ${filas.length})`);
}

// 45 %, 79 %, 99 %, 120 % y 200 % de lo normal (10 de oro), puestos desordenados.
const CINCO = { 4338: 120000, 2589: 45000, 14047: 200000, 2592: 79000, 4306: 99000 };

// La subasta de Blizzard se esconde un fotograma después de abrirse (por si TSM la esconde en el mismo aviso): abrir deja pasar uno.
const abrirSinEsperar = (m) => m.disparar('AUCTION_HOUSE_SHOW');
const abrir = (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.avanzar(0.05); };
const fila = (m, i) => m.lua(`SnetForever.UIComercio.fila(${i})`);
const cabecera = (m) => m.lua('SnetForever.UIComercio.marco().avisos:GetText()') || '';
const texto = (m, clave, ...args) => m.lua(`SnetForever.L.t(${[clave, ...args].map(aLua).join(', ')})`);

// AuctionHouseFrame de prueba (el banco no lo define): 800 × 500, arriba a la izquierda, a 10 y 100 de la esquina.
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}; AuctionHouseFrame.Otras = {}; AuctionHouseFrame:EnableMouse(true); ';
// Con 3 pestañas de Blizzard ancladas abajo (100 × 32, en .Tabs).
const SUBASTA_TABS = SUBASTA + `local previa
  for i = 1, 3 do
    local t = CreateFrame("Button", nil, AuctionHouseFrame)
    t:SetSize(100, 32)
    if previa then t:SetPoint("LEFT", previa, "RIGHT", 3, 0) else t:SetPoint("TOPLEFT", AuctionHouseFrame, "BOTTOMLEFT", 20, 2) end
    AuctionHouseFrame.Tabs[i] = t
    previa = t
  end `;
// Y 4 de otro addon (como Auctionator) colgando del borde de abajo, detrás de las de Blizzard y fuera de .Tabs, más una
// escondida aún más a la derecha.
const SUBASTA_OTRAS = `local previa = AuctionHouseFrame.Tabs[3]
  for i = 1, 4 do
    local t = CreateFrame("Button", nil, AuctionHouseFrame)
    t:SetSize(110, 32)
    t:SetPoint("LEFT", previa, "RIGHT", 3, 0)
    AuctionHouseFrame.Otras[i] = t
    previa = t
  end
  local e = CreateFrame("Button", nil, AuctionHouseFrame)
  e:SetSize(110, 32)
  e:SetPoint("LEFT", previa, "RIGHT", 30, 0)
  e:Hide()
  AuctionHouseFrame.Escondida = e `;

test('la ventana no existe hasta abrir la subasta; se abre sola junto a ella y se oculta al cerrarla', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.UIComercio.marco()'), undefined, 'nada creado antes de AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.UIComercio.abrir()'), false, 'con la subasta cerrada no se abre');
  assert.equal(m.lua('SnetForever.UIComercio.marco()'), undefined);
  abrir(m);
  assert.equal(m.lua('SnetForever.UIComercio.marco():IsShown()'), true);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m.lua('SnetForever.UIComercio.marco():IsShown()'), false);
  abrir(m);
  assert.equal(m.lua('SnetForever.UIComercio.marco():IsShown()'), true, 'vuelve a salir en la siguiente apertura');
  assert.equal(m.lua('SnetForever.Escaneo._iniciado'), 0, 'la ventana no lanza el escaneo: lo hace el escaneo solo');
  sinErrores(m);
});

test('fila(1) es la de menor %; orden de menor a mayor; colores azul, verde, amarillo, naranja y rojo', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  const filas = [1, 2, 3, 4, 5].map((i) => fila(m, i));
  assert.deepEqual(filas.map((f) => f.item), [2589, 2592, 4306, 4338, 14047]);
  assert.deepEqual(filas.map((f) => Math.round(f.pct)), [45, 79, 99, 120, 200]);
  assert.deepEqual(filas.map((f) => f.color), ['azul', 'verde', 'amarillo', 'naranja', 'rojo']);
  assert.equal(fila(m, 6), undefined);
  const lino = filas[0];
  assert.equal(lino.nombre, 'Paño de lino');
  assert.equal(lino.cantidad, 20);
  assert.equal(lino.precio, 45000);
  assert.equal(lino.ritmo, 0.42);
  assert.equal(filas[4].nombre, 'Tela rúnica', 'sin el objeto en caché, el nombre de los precios de la app');
  // Buena compra (plantilla: ≤ 85 % de lo normal y ritmo ≥ 0,25): solo 45 % y 79 %.
  assert.deepEqual(filas.map((f) => f.buena), [true, true, false, false, false]);
  // Lo que se ve en la primera fila.
  const F = 'SnetForever.UIComercio.marco().filas[1]'; // el hueco 1 de la tabla; sus textos están en F.celdas
  assert.equal(m.lua(`${F}.celdas.objeto:GetText()`), 'Paño de lino');
  assert.equal(m.lua(`${F}.celdas.cantidad:GetText()`), '20');
  assert.equal(m.lua(`${F}.celdas.precio:GetText()`), '4g 50s 00c');
  assert.equal(m.lua(`${F}.celdas.pct:GetText()`), '45%');
  assert.equal(m.lua(`${F}.celdas.ritmo:GetText()`), '0,42', 'dos decimales con coma en español');
  assert.equal(m.lua(`${F}.buena:IsShown()`), true);
  assert.equal(m.lua('SnetForever.UIComercio.marco().filas[3].buena:IsShown()'), false);
  // El color del % de la fila: azul (r < g < b).
  const [r, g, b] = m.lua(`{${F}.celdas.pct:GetTextColor()}`);
  assert.ok(b > r && b > g, `el 45 % se pinta azul (${r}, ${g}, ${b})`);
  // El color de calidad del nombre: el tejido mágico es azul (raro).
  const [r4, , b4] = m.lua('{SnetForever.UIComercio.marco().filas[4].celdas.objeto:GetTextColor()}');
  assert.ok(b4 > r4, 'el nombre del objeto raro sale en azul');
  sinErrores(m);
});

test('en inglés el ritmo lleva punto decimal y el precio g/s/c', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  abrir(m);
  escanear(m, { 2589: 45020 });
  assert.equal(m.lua('SnetForever.UIComercio.marco().filas[1].celdas.ritmo:GetText()'), '0.42');
  assert.equal(m.lua('SnetForever.UIComercio.marco().filas[1].celdas.precio:GetText()'), '4g 50s 20c');
  sinErrores(m);
});

test('sin ritmo (la app no tiene credenciales): la columna dice «—», nada es buena compra y la cabecera lo avisa', () => {
  const m = maquina({ ritmo: -1 });
  abrir(m);
  escanear(m, CINCO);
  assert.equal(fila(m, 1).ritmo, undefined);
  assert.equal(fila(m, 1).buena, false);
  assert.equal(m.lua('SnetForever.UIComercio.marco().filas[1].celdas.ritmo:GetText()'), '—');
  assert.ok(cabecera(m).includes(texto(m, 'COMERCIO_SIN_RITMO')), cabecera(m));
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_SIN_PRECIOS')));
  sinErrores(m);
});

test('con ritmo, la cabecera no avisa de nada de eso', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_SIN_RITMO')), cabecera(m));
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_SIN_PRECIOS')), cabecera(m));
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_ESPERANDO')), cabecera(m));
  sinErrores(m);
});

test('sin precios de la app: la lista funciona solo con el escaneo, sin % y la cabecera lo dice', () => {
  const m = maquina({ precios: false });
  abrir(m);
  escanear(m, CINCO);
  assert.equal(fila(m, 1).pct, undefined);
  assert.equal(fila(m, 1).color, undefined);
  assert.equal(m.lua('SnetForever.UIComercio.marco().filas[1].celdas.pct:GetText()'), '—');
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => fila(m, i).item).sort(), [...ITEMS].sort(), 'salen todos');
  assert.ok(cabecera(m).includes(texto(m, 'COMERCIO_SIN_PRECIOS')), cabecera(m));
  sinErrores(m);
});

test('sin el módulo de escaneo: lista vacía, «esperando a la subasta» y ningún error', () => {
  const m = maquina({ escaneo: false });
  abrir(m);
  assert.equal(fila(m, 1), undefined);
  assert.ok(cabecera(m).includes(texto(m, 'COMERCIO_ESPERANDO')), cabecera(m));
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 0)');
  sinErrores(m);
});

test('escaneo esperando (otro addon tiene ocupada la subasta) y sin datos: «esperando a la subasta»', () => {
  const m = maquina();
  m.lua('SnetForever.Escaneo._estado = "esperando"');
  abrir(m);
  assert.ok(cabecera(m).includes(texto(m, 'COMERCIO_ESPERANDO')), cabecera(m));
  escanear(m, { 2589: 45000 });
  m.lua('SnetForever.Escaneo._estado = "escaneando"');
  m.avanzar(0.5);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 1)');
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_ESPERANDO')), cabecera(m));
  assert.ok(m.lua('SnetForever.UIComercio.marco().pie.info:GetText()').includes('1'), 'cuántos objetos lleva, en la barra de progreso');
  sinErrores(m);
});

test('precios viejos y /reload: la cabecera lo avisa al llegar SNF_COMERCIO_AVISO', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.Precios.hayQueRecargar = function() return true end');
  m.lua('SnetForever.emitir("SNF_COMERCIO_AVISO", "COMERCIO_PRECIOS_RELOAD", 3)');
  assert.ok(cabecera(m).includes('/reload'), cabecera(m));
  // Tarea 13 (pendiente de la revisión de la tarea 12): la cabecera usa su propio texto, sin el prefijo del chat, en
  // vez de recortar «SnetForever: » con gsub (en otro idioma el prefijo podría no casar).
  const horas = Math.floor((m.lua('SnetForever.Precios.edad()') || 0) / 3600);
  assert.ok(cabecera(m).includes(texto(m, 'COMERCIO_RELOAD_CABECERA', horas)), cabecera(m));
  assert.ok(!cabecera(m).includes('SnetForever:'), cabecera(m));
  const fuente = readFileSync(join(ADDON_UI, 'comercio.lua'), 'utf8');
  assert.ok(!/gsub\([^)]*COMERCIO_PRECIOS_RELOAD/.test(fuente), 'sin recortar el texto del chat');
  sinErrores(m);
});

// Task 20d: el tooltip de la fila es el del juego (SetItemByID) con nuestras secciones por el enganche; el detalle de las
// líneas está en comercio-tooltip.test.js. Aquí, que la fila lo enseña y lo esconde con el ratón.
const lineasDe = (m) => m.detalleTooltip().map((d) => (d.der === undefined ? String(d.izq) : `${d.izq} ${d.der}`.replace(/\|c[0-9a-fA-F]{8}|\|r/g, '')));

test('el ratón sobre la fila de 2589 enseña el tooltip del objeto del juego con nuestras líneas de subasta', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")'); // ronda 2: la lista a la vista (la luz no se enciende en una fila escondida)
  escanear(m, CINCO);
  m.lua('SnetForever.UIComercio.marco().filas[1]:GetScript("OnEnter")(SnetForever.UIComercio.marco().filas[1])');
  const lineas = lineasDe(m);
  const todo = lineas.join('\n');
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.equal(lineas[0], 'Paño de lino', 'el tooltip del objeto del juego, no uno nuestro');
  assert.equal(m.lua('select(1, GameTooltip:GetItem())'), 'Paño de lino');
  assert.match(todo, /SnetForever · Subasta/);
  // F1: cada número dice de qué foto es (aquí la lista de Navegar imitada, leída hace 10 min) y lo de la app, la suya.
  assert.match(todo, /Compra mínima 4g 50s/, 'el precio de la lista de Navegar');
  assert.match(todo, /A la venta 20 unidades \(subasta, hace 10 min\)/, 'de qué foto es y de cuándo');
  assert.match(todo, /Valor de mercado 10g 00s 00c/, "T1b: sin corchete: esta fila es de 7 números y no trae la tendencia");
  // F5: una fila de 7 números (sin el 1 de las mercancías) se lee como de un objeto suelto.
  assert.match(todo, /Parte que sale antes de tiempo .vendida o retirada. 42 %/);
  assert.match(todo, /Salen antes de tiempo al día .vendidas o retiradas. 85$/m);
  assert.match(todo, /No son ventas: también cuenta lo que retira su dueño/);
  assert.ok(!/Ahora:|Lo normal|Tienes|Otras casas|Ritmo de venta|foto/.test(todo), todo);
  m.lua('SnetForever.UIComercio.marco().filas[1]:GetScript("OnLeave")(SnetForever.UIComercio.marco().filas[1])');
  m.avanzar(0.3); // T1a ronda 1: se esconde pasada la espera
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  sinErrores(m);
});

test('la ventanita sin precios de la app no inventa datos: solo lo que ha visto el escaneo', () => {
  const m = maquina({ precios: false });
  abrir(m);
  escanear(m, { 2589: 45000 });
  m.lua('SnetForever.UIComercio.ventanita(SnetForever.UIComercio.marco().filas[1], 2589)');
  const todo = lineasDe(m).join('\n');
  assert.match(todo, /Compra mínima 4g 50s/);
  assert.match(todo, /hace 10 min/);
  assert.ok(!/Valor de mercado|sin caducar|Alianza|Neutral/.test(todo), todo);
  sinErrores(m);
});

// Desde la tarea 15e la ventana sí se arrastra (comercio-arrastre.test.js); aquí queda que la clave vieja `ventana` se ignora.
test('la clave vieja comercio.ventana se ignora sin errores y sin arrastrar nada (la nueva es ventanaSubasta, tarea 15e)', () => {
  const m = maquina({ previo: SUBASTA });
  m.lua('SnetForeverCuenta.comercio.ventana = {punto = "TOPLEFT", relPunto = "BOTTOMLEFT", x = 500, y = 300}');
  const izqSubasta = m.lua('AuctionHouseFrame:GetLeft()');
  const arribaSubasta = m.lua('AuctionHouseFrame:GetTop()'); // la subasta se esconde al abrir: se mide antes
  abrir(m);
  const V = 'SnetForever.UIComercio.marco()';
  assert.equal(m.lua(`${V}.cabecera:GetScript("OnMouseDown")`), undefined, 'la cabecera no arranca el arrastre con OnMouseDown (usa OnDragStart)');
  const k = m.lua(`${V}:GetEffectiveScale() / UIParent:GetEffectiveScale()`); // bloque B: la ventana mide en píxeles reales
  assert.ok(Math.abs(m.lua(`${V}:GetLeft()`) * k - izqSubasta) < 0.01, 'la posición vieja no cuenta');
  assert.ok(Math.abs(m.lua(`${V}:GetTop()`) * k - arribaSubasta) < 0.01);
  assert.equal(m.llamadas('StartMoving').length, 0);
  assert.deepEqual(m.lua('SnetForeverCuenta.comercio.ventana'), { punto: 'TOPLEFT', relPunto: 'BOTTOMLEFT', x: 500, y: 300 }, 'no se toca lo viejo');
  sinErrores(m);
});

test('una posición guardada rota no rompe nada', () => {
  const m = maquina();
  m.lua('SnetForeverCuenta.comercio.ventana = {punto = "ARRIBA", x = "no"}');
  abrir(m);
  assert.equal(m.lua('SnetForever.UIComercio.marco():IsShown()'), true);
  assert.equal(typeof m.lua('SnetForever.UIComercio.marco():GetLeft()'), 'number');
  sinErrores(m);
});

// Tarea 9: la ventana va DENTRO de la subasta, con su pestaña abajo y un botón para volver a la vista de Blizzard.
const V9 = 'SnetForever.UIComercio.marco()';
const AH = 'AuctionHouseFrame';
// Los bordes en unidades de UIParent (bloque B, Task B2: nuestra ventana mide en píxeles reales y ya no tiene la escala de
// UIParent; la subasta y nuestra pestaña sí la tienen, así que para ellas es lo mismo que antes).
const bordes = (m, f) => m.lua(`(function() local k = ${f}:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return {${f}:GetLeft() * k, ${f}:GetRight() * k, ${f}:GetTop() * k, ${f}:GetBottom() * k} end)()`);
// La zona de clic: el rectángulo menos las sangrías (GetHitRectInsets) de izquierda y derecha.
const zona = (m, f) => {
  const b = bordes(m, f);
  const [il, ir] = m.lua(`{${f}:GetHitRectInsets()}`);
  return [b[0] + il, b[1] - ir];
};

test('con vista snet la ventana ocupa donde estaba la subasta (mismos bordes que tenía AuctionHouseFrame) y recibe el ratón', () => {
  const m = maquina({ previo: SUBASTA });
  const a = bordes(m, AH); // antes de abrir: al abrir la subasta se esconde
  abrir(m);
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'snet', 'por defecto, la nuestra');
  assert.equal(m.lua(`${V9}:IsShown()`), true);
  const v = bordes(m, V9);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - v[i]) < 0.01, `borde ${i}: ${v[i]} frente a ${a[i]}`);
  assert.ok(m.lua(`${V9}:GetFrameLevel()`) > m.lua(`${AH}:GetFrameLevel()`), 'por encima de la subasta');
  assert.equal(m.lua(`${V9}:IsMouseEnabled()`), true, 'no deja pasar el ratón a la de Blizzard');
  assert.equal(m.lua(`${AH}:IsShown()`), true, 'nunca se oculta AuctionHouseFrame: cerraría la subasta');
  sinErrores(m);
});

test('«Vista de Blizzard» oculta la nuestra y deja la de Blizzard; la pestaña SnetForever la vuelve a enseñar', () => {
  const m = maquina({ previo: SUBASTA });
  abrir(m);
  assert.equal(m.lua(`${V9}.verBlizzard.texto:GetText()`), texto(m, 'COMERCIO_VER_BLIZZARD'));
  assert.equal(texto(m, 'COMERCIO_VER_BLIZZARD'), 'Vista de Blizzard');
  assert.equal(m.lua(`${V9}.pestanaSnet.texto:GetText()`), 'SnetForever');
  assert.equal(m.lua(`${V9}.pestanaSnet:IsShown()`), true);
  // B3r: la letra «texto» del tema (antes FRIZQT__ 13).
  assert.deepEqual(fuenteDe(m, `${V9}.pestanaSnet.texto`), ['Interface\\AddOns\\SnetForever\\recursos\\fonts\\BarlowSemiCondensed-Medium.ttf', 12]);
  assert.equal(m.lua(`${V9}.pestanaSnet:GetHeight()`), 24);
  assert.ok(cercaDe(colorDe(m, `${V9}.pestanaSnet.fondo`), tokenDe(m, 'acento')), 'la nuestra, a la vista, en acento');
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), false);
  assert.equal(m.lua(`${AH}:IsShown()`), true, 'la subasta de Blizzard sigue abierta');
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'blizzard');
  assert.equal(m.lua(`${V9}.pestanaSnet:IsShown()`), true, 'la pestaña sigue abajo para volver');
  assert.ok(cercaDe(colorDe(m, `${V9}.pestanaSnet.fondo`), tokenDe(m, 'cabecera')), 'sin elegir, en gris');
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), true);
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'snet');
  assert.equal(m.lua(`${AH}:IsShown()`), true);
  assert.ok(cercaDe(colorDe(m, `${V9}.pestanaSnet.fondo`), tokenDe(m, 'acento')));
  sinErrores(m);
});

test('cerrar y abrir la subasta abre la última vista elegida', () => {
  const m = maquina({ previo: SUBASTA });
  abrir(m);
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioVista'), 'blizzard', 'se guarda en el ajuste comercioVista');
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  assert.equal(m.lua(`${V9}:IsShown()`), false, 'la última fue la de Blizzard');
  assert.equal(m.lua(`${V9}.pestanaSnet:IsShown()`), true);
  m.lua(`${V9}.pestanaSnet:Click()`);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m.lua(`${V9}:IsShown()`), false);
  abrir(m);
  assert.equal(m.lua(`${V9}:IsShown()`), true, 'la última fue la nuestra');
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(m.lua(`${V9}:IsShown()`), false);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioVista")'), 'blizzard');
  m.lua('SnetForever.UIComercio.ponerVista("lo que sea")');
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'snet', 'un valor raro cuenta como snet');
  assert.equal(m.lua(`${V9}:IsShown()`), true);
  sinErrores(m);
});

test('pulsar una pestaña de Blizzard o de otro addon enseña la vista de Blizzard', () => {
  const m = maquina({ previo: SUBASTA_TABS + SUBASTA_OTRAS });
  abrir(m);
  m.lua(`${AH}.Tabs[2]:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), false, 'si no, taparía lo que enseña la pestaña');
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'blizzard');
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), true);
  m.lua(`${AH}.Otras[3]:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), false, 'también las que cuelgan de la subasta sin estar en Tabs');
  sinErrores(m);
});

test('la pestaña va a la derecha de la última de AuctionHouseFrame.Tabs (también con 4 pestañas más de otro addon) y no tapa ninguna', () => {
  // Solo las 3 de Blizzard.
  // La pestaña se ancla a las de la subasta con la vista de Blizzard (con la nuestra la subasta está escondida).
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  const T = `${V9}.pestanaSnet`;
  const tercera = bordes(m, `${AH}.Tabs[3]`);
  const nuestra = bordes(m, T);
  assert.ok(zona(m, `${V9}.pestanaSnet`)[0] >= zona(m, `${AH}.Tabs[3]`)[1], 'la zona de clic, a la derecha de la de la tercera');
  assert.ok(nuestra[0] >= tercera[1], `a la derecha de la tercera: ${nuestra[0]} frente a ${tercera[1]}`);
  assert.ok(Math.abs(nuestra[2] - tercera[2]) < 0.01, 'a la misma altura');
  sinErrores(m);
  // Con las 4 de otro addon colgando del borde de abajo (y una escondida, que no cuenta).
  const m2 = maquina({ previo: SUBASTA_TABS + SUBASTA_OTRAS });
  abrir(m2);
  m2.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  const todas = [1, 2, 3].map((i) => `${AH}.Tabs[${i}]`).concat([1, 2, 3, 4].map((i) => `${AH}.Otras[${i}]`));
  const n = bordes(m2, T);
  const ultima = bordes(m2, `${AH}.Otras[4]`)[1];
  assert.equal(Math.max(...todas.map((f) => bordes(m2, f)[1])), ultima, 'la última de la fila es la cuarta de Auctionator');
  assert.ok(n[0] >= ultima, `a la derecha de la última: ${n[0]} frente a ${ultima}`);
  assert.ok(bordes(m2, `${AH}.Escondida`)[1] > ultima, 'la escondida estaba aún más a la derecha');
  for (const f of todas) assert.ok(zona(m2, T)[0] >= zona(m2, f)[1], `su zona de clic no pisa la de ${f}`);
  assert.equal(m2.lua(`${T}:IsShown()`), true);
  sinErrores(m2);
});

// Ronda 1 de arreglos de la Task 9.
test('una pestaña de otro addon creada DESPUÉS de abrir la subasta acaba con la nuestra a su derecha y enganchada; reabrir no duplica ganchos', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  // Cuenta las veces que se engancha cada pestaña (se mira por instancia).
  m.lua(`rawset(_G, "SNF_ENGANCHES", {})
    local function contar(t, nombre)
      local orig = t.HookScript
      rawset(t, "HookScript", function(self, ...) SNF_ENGANCHES[nombre] = (SNF_ENGANCHES[nombre] or 0) + 1; return orig(self, ...) end)
    end
    for i = 1, 3 do contar(AuctionHouseFrame.Tabs[i], "b" .. i) end
    rawset(_G, "SNF_CONTAR", contar)`);
  abrir(m);
  // Auctionator crea su pestaña después de nuestro oyente.
  m.lua(`local t = CreateFrame("Button", nil, AuctionHouseFrame)
    t:SetSize(110, 32)
    t:SetPoint("LEFT", AuctionHouseFrame.Tabs[3], "RIGHT", 3, 0)
    AuctionHouseFrame.Tardia = t
    SNF_CONTAR(t, "tardia")`);
  m.avanzar(1);
  const T = `${V9}.pestanaSnet`;
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.ok(bordes(m, T)[0] >= bordes(m, `${AH}.Tardia`)[1], 'la nuestra, a la derecha de la tardía');
  m.lua('SnetForever.UIComercio.ponerVista("snet")');
  m.lua(`${AH}.Tardia:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), false, 'la tardía también está enganchada');
  assert.equal(m.lua('SNF_ENGANCHES.tardia'), 1);
  // Reabrir dos veces: cada pestaña, un solo gancho.
  for (let i = 0; i < 2; i++) { m.disparar('AUCTION_HOUSE_CLOSED'); abrir(m); m.avanzar(1); }
  assert.deepEqual(m.lua('SNF_ENGANCHES'), { b1: 1, b2: 1, b3: 1, tardia: 1 });
  // Al mostrarse la ventana también se vuelve a colocar.
  m.lua(`${T}:ClearAllPoints(); ${T}:SetPoint("TOPLEFT", ${AH}, "BOTTOMLEFT", 0, 0)`);
  m.lua('SnetForever.UIComercio.ponerVista("snet"); SnetForever.UIComercio.ponerVista("blizzard")');
  assert.ok(bordes(m, T)[0] >= bordes(m, `${AH}.Tardia`)[1], 'recolocada al volver la subasta');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
  sinErrores(m);
});

test('un Frame que no es botón colgando del borde de la subasta no se mide, no se engancha y no rompe nada', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  m.lua(`local f = CreateFrame("Frame", nil, AuctionHouseFrame)
    f:SetSize(100, 32)
    f:SetPoint("TOPLEFT", AuctionHouseFrame, "BOTTOMLEFT", 600, 2)
    AuctionHouseFrame.NoBoton = f
    rawset(_G, "SNF_ENGANCHADO", false)
    rawset(f, "HookScript", function() SNF_ENGANCHADO = true; error("no es un botón") end)`);
  abrir(m);
  m.avanzar(1);
  assert.equal(m.lua('SNF_ENGANCHADO'), false);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
  assert.equal(m.lua(`${V9}:IsShown()`), true);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")'); // con la subasta repuesta se puede medir
  assert.ok(bordes(m, `${V9}.pestanaSnet`)[0] < bordes(m, `${AH}.NoBoton`)[0], 'no se ancla a un marco que no es pestaña');
  // Un gancho que falla (otro cliente) tampoco apaga el comercio.
  const m2 = maquina({ previo: SUBASTA_TABS });
  m2.lua(`rawset(AuctionHouseFrame.Tabs[2], "HookScript", function() error("falla") end)`);
  abrir(m2);
  m2.avanzar(1);
  assert.equal(m2.lua('SnetForever.Comercio.activo()'), true);
  sinErrores(m2);
  sinErrores(m);
});

test('la ventana y su pestaña usan el estrato de AuctionHouseFrame y un nivel mayor', () => {
  for (const estrato of ['MEDIUM', 'HIGH', 'DIALOG']) {
    const m = maquina({ previo: `${SUBASTA}AuctionHouseFrame:SetFrameStrata("${estrato}"); AuctionHouseFrame:SetFrameLevel(7); ` });
    abrir(m);
    assert.equal(m.lua(`${V9}:GetFrameStrata()`), estrato, estrato);
    assert.equal(m.lua(`${V9}.pestanaSnet:GetFrameStrata()`), estrato, `pestaña ${estrato}`);
    assert.ok(m.lua(`${V9}:GetFrameLevel()`) > 7, `nivel ${estrato}`);
    sinErrores(m);
  }
});

test('sin pestañas en la subasta, la nuestra va abajo a la izquierda; sin AuctionHouseFrame la ventana sale centrada y sin errores', () => {
  const m = maquina({ previo: SUBASTA });
  const a = bordes(m, AH);
  abrir(m);
  // Con nuestra vista, bajo nuestra ventana (que ocupa donde estaba la subasta).
  const v = bordes(m, `${V9}.pestanaSnet`);
  assert.ok(v[0] >= a[0] && v[0] < a[0] + 60 && v[2] <= a[3] + 1, 'bajo la ventana, abajo a la izquierda');
  // Con la de Blizzard, bajo la subasta repuesta.
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  const n = bordes(m, `${V9}.pestanaSnet`);
  assert.ok(n[0] >= a[0] && n[0] < a[0] + 60, 'abajo a la izquierda');
  assert.ok(n[2] <= a[3] + 1, 'colgando del borde de abajo');
  sinErrores(m);
  // Sin AuctionHouseFrame (como el banco de las otras pruebas).
  const m2 = maquina();
  abrir(m2);
  assert.equal(m2.lua(`${V9}:IsShown()`), true);
  assert.equal(m2.lua(`${V9}:GetParent() == UIParent`), true);
  const c = bordes(m2, V9);
  assert.ok(c[0] > 0 && c[1] > c[0], 'tiene sitio en pantalla');
  assert.ok(Math.abs((c[0] + c[1]) / 2 - m2.lua('UIParent:GetRight()') / 2) < 1, 'centrada a lo ancho');
  assert.equal(m2.lua(`${V9}.pestanaSnet:IsShown()`), true);
  m2.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(m2.lua(`${V9}:IsShown()`), false);
  m2.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(m2.lua(`${V9}:IsShown()`), true);
  m2.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m2.lua(`${V9}:IsShown()`), false);
  assert.equal(m2.lua(`${V9}.pestanaSnet:IsShown()`), false, 'sin subasta, la pestaña tampoco se queda');
  sinErrores(m2);
});

test('repinta como mucho cada 0,5 s al llegar SNF_COMERCIO_ESCANEO', () => {
  const m = maquina();
  abrir(m);
  m.avanzar(1);
  escanear(m, { 2589: 45000 });
  assert.equal(fila(m, 1).item, 2589, 'el primer aviso repinta enseguida');
  escanear(m, { 2589: 45000, 2592: 10000 });
  assert.equal(fila(m, 1).item, 2589, 'el segundo, dentro del medio segundo, espera');
  escanear(m, { 2589: 45000, 2592: 10000, 4306: 5000 });
  m.avanzar(0.25);
  assert.equal(fila(m, 2), undefined, 'aún no');
  m.avanzar(0.3);
  assert.equal(fila(m, 1).item, 4306, 'pasado el medio segundo, un solo repintado con lo último');
  assert.equal(fila(m, 3).item, 2589);
  sinErrores(m);
});

test('elegir un grupo deja solo sus objetos; un grupo roto de la app se salta', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  m.lua('SnetForever.UIComercio.elegirGrupo("rapido")');
  assert.equal(fila(m, 1).item, 2589);
  assert.equal(fila(m, 2), undefined);
  m.lua('SnetForever.UIComercio.elegirGrupo("telas")');
  assert.deepEqual([1, 2, 3].map((i) => fila(m, i).item), [2589, 2592, 4306]);
  assert.equal(fila(m, 4), undefined);
  m.lua('SnetForever.UIComercio.elegirGrupo(nil)');
  assert.equal(fila(m, 5).item, 14047, 'sin grupo, todos');
  // La lista de grupos de la izquierda: «Todos» y los dos grupos buenos.
  assert.equal(m.lua('SnetForever.UIComercio.marco().grupos[1].texto:GetText()'), texto(m, 'COMERCIO_TODOS'));
  assert.equal(m.lua('SnetForever.UIComercio.marco().grupos[2].texto:GetText()'), "Suelen salir sin caducar");
  assert.equal(m.lua('SnetForever.UIComercio.marco().grupos[3].texto:GetText()'), 'Telas');
  m.lua('SnetForever.UIComercio.marco().grupos[2]:Click()');
  assert.equal(fila(m, 2), undefined, 'pulsar el grupo lo elige');
  sinErrores(m);
});

test('grupo(): la clave del grupo elegido en la ventana; nil con todos o con la ventana cerrada', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.UIComercio.grupo()'), undefined, 'sin ventana');
  abrir(m);
  assert.equal(m.lua('SnetForever.UIComercio.grupo()'), undefined, 'con todos los objetos');
  m.lua('SnetForever.UIComercio.marco().grupos[3]:Click()');
  assert.equal(m.lua('SnetForever.UIComercio.grupo()'), 'telas');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m.lua('SnetForever.UIComercio.grupo()'), undefined, 'ventana cerrada');
  abrir(m);
  assert.equal(m.lua('SnetForever.UIComercio.grupo()'), 'telas', 'al volver a abrir sigue el grupo elegido');
  sinErrores(m);
});

test('un fallo dentro de la ventana lo recoge el cortafuegos del comercio: no llega al manejador de errores', () => {
  const m = maquina();
  abrir(m);
  m.avanzar(1);
  m.lua('SnetForever.Escaneo.datos = function() error("datos rotos") end');
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 1, 1)');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false, 'el comercio se apaga hasta cerrar la subasta');
  assert.match(m.lua('SnetForeverCuenta.fallos[#SnetForeverCuenta.fallos].texto'), /datos rotos/);
  sinErrores(m);
});

test('huecos para las tareas 13 y 14: pie y pestañas (bloque B: las de la cabecera; la lista es la página «ofertas»)', () => {
  const m = maquina();
  abrir(m);
  assert.equal(m.lua('SnetForever.UIComercio.marco().pie:GetObjectType()'), 'Frame');
  assert.equal(m.lua('SnetForever.UIComercio.marco().pestanas.sniper:GetObjectType()'), 'Button');
  assert.equal(m.lua('SnetForever.UIComercio.marco().pestanas.sniper.texto:GetText()'), texto(m, 'COMERCIO_PESTANA_SNIPER'));
  assert.equal(m.lua('SnetForever.UIComercio.marco().pestanas.navegar.texto:GetText()'), texto(m, 'SUBASTA_PESTANA_NAVEGAR'));
  assert.equal(m.lua('SnetForever.UIComercio.marco().cuerpo:GetParent() == SnetForever.SubastaVentana.marcos.paginas.ofertas'), true);
  sinErrores(m);
});

test('es y en tienen las mismas claves COMERCIO_*', () => {
  const m = crearMaquina();
  const es = Object.keys(m.lua('SnetForever.L.tablas.es')).filter((k) => k.startsWith('COMERCIO_')).sort();
  const en = Object.keys(m.lua('SnetForever.L.tablas.en')).filter((k) => k.startsWith('COMERCIO_')).sort();
  assert.deepEqual(es, en);
  for (const clave of ['COMERCIO_SIN_PRECIOS', 'COMERCIO_SIN_RITMO', 'COMERCIO_PRECIOS_RELOAD', 'COMERCIO_ESPERANDO',
    'COMERCIO_VER_BLIZZARD', 'COMERCIO_PESTANA_SNET']) { // B7: COMERCIO_TITULO ya no se usa
    assert.ok(es.includes(clave), clave);
  }
  sinErrores(m);
});

// Tarea 13 (pendientes de la revisión de la tarea 12).
test('tras apagarse el comercio por un fallo la ventana no se queda atascada: lo avisa y se puede ocultar', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  m.avanzar(1);
  m.lua('SnetForever.Escaneo.datos = function() error("datos rotos") end');
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 1, 1)');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  assert.ok(cabecera(m).includes(texto(m, 'COMERCIO_APAGADO')), `aviso de comercio apagado: ${cabecera(m)}`);
  // Ocultarla sigue funcionando; el tooltip no se queda colgado.
  const V = 'SnetForever.UIComercio.marco()';
  m.lua(`${V}.filas[1]:GetScript("OnEnter")(${V}.filas[1])`);
  m.lua(`${V}.filas[1]:GetScript("OnLeave")(${V}.filas[1])`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua(`${V}.verBlizzard:Click()`);
  assert.equal(m.lua(`${V}:IsShown()`), false, 'el botón «Vista de Blizzard» la oculta');
  m.lua(`${V}.pestanaSnet:Click()`);
  assert.equal(m.lua(`${V}:IsShown()`), true, 'y la pestaña la vuelve a enseñar, aunque el comercio esté apagado');
  sinErrores(m);
});

test('la rueda del ratón pone en el tooltip la fila nueva; el texto no lleva ▲/▼ ni la tendencia', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")'); // ronda 2: la lista a la vista (la luz no se enciende en una fila escondida)
  escanear(m, CINCO);
  const V = 'SnetForever.UIComercio.marco()';
  m.lua(`${V}.filas[1]:GetScript("OnEnter")(${V}.filas[1])`);
  const todo = lineasDe(m).join('\n');
  assert.ok(!/[▲▼]/.test(todo), todo);
  assert.ok(!/sube|baja/.test(todo), 'la tendencia ya no sale en el tooltip');
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua(`${V}.filas[1]:GetScript("OnLeave")(${V}.filas[1])`);
  // Con más filas de las que caben, la rueda corre la lista y la fila bajo el ratón es otra: la ventanita la sigue.
  // 60: con la lista a la vista la tabla estira y caben más de 20 (ronda 2).
  const muchos = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [3000 + i, 1000 + i]));
  escanearCant(m, Object.fromEntries(Object.entries(muchos).map(([k, p]) => [k, [p, 20]])));
  m.lua(`${V}.filas[1]:GetScript("OnEnter")(${V}.filas[1])`);
  const primero = lineasDe(m)[0];
  const marcoTabla = `${V}.tabla.marco`;
  m.lua(`${marcoTabla}:GetScript("OnMouseWheel")(${marcoTabla}, -1)`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.notEqual(lineasDe(m)[0], primero, 'la fila bajo el ratón ya es otra');
  m.lua(`${V}.filas[1]:GetScript("OnLeave")(${V}.filas[1])`);
  m.lua(`${V}.filas[1]:GetScript("OnEnter")(${V}.filas[1])`);
  m.lua(`${V}.panelGrupos:GetScript("OnMouseWheel")(${V}.panelGrupos, -1)`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua(`${V}.filas[1]:GetScript("OnLeave")(${V}.filas[1])`);
  m.avanzar(0.5);
  escanear(m, CINCO);
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.lua(`${V}.filas[1]:GetScript("OnEnter")(${V}.filas[1])`);
  assert.match(lineasDe(m).join('\n'), /SnetForever · Auction/);
  sinErrores(m);
});

test('GET_ITEM_INFO_RECEIVED repinta solo las filas (no recalcula la lista)', () => {
  const m = maquina();
  abrir(m);
  escanear(m, { 14047: 45000 });
  const V = 'SnetForever.UIComercio.marco()';
  assert.equal(m.lua(`${V}.filas[1].celdas.objeto:GetText()`), 'Tela rúnica');
  m.lua('_G.EVALUAR = 0; local f = SnetForever.Reglas.evaluar; SnetForever.Reglas.evaluar = function(...) EVALUAR = EVALUAR + 1; return f(...) end');
  m.itemInfo(14047, { nombre: 'Paño rúnico', calidad: 1 });
  m.avanzar(1);
  m.disparar('GET_ITEM_INFO_RECEIVED', 14047, true);
  assert.equal(m.lua(`${V}.filas[1].celdas.objeto:GetText()`), 'Paño rúnico', 'el nombre que acaba de llegar');
  assert.equal(m.lua('EVALUAR'), 0, 'sin recalcular las reglas de toda la lista');
  sinErrores(m);
});

test('the shopping window uses layered iron, copper and Forge fonts at the original sizes', () => {
  const m = maquina();
  const c = (t) => m.lua(`SnetForever.Estilo.comercio(${aLua(t)})`);
  const brillo = (t) => c(t)[0] + c(t)[1] + c(t)[2];
  const [r, g, b] = c('linea');
  assert.ok(r > g && g > b, 'the frame has a copper edge');
  assert.ok(brillo('filas') < brillo('fondo'), 'filas < fondo');
  assert.ok(brillo('fondo') < brillo('contenedor'), 'fondo < contenedor');
  assert.ok(brillo('contenedor') < brillo('cabecera'), 'contenedor < cabecera');
  const a = c('acento').slice(0, 3);
  assert.ok(Math.max(...a) - Math.min(...a) > 0.15, 'el acento no es gris');
  for (const t of ['texto', 'secundario', 'acentoTexto', 'rojo']) assert.equal(c(t).length, 4, `${t} existe`);
  assert.ok(Math.abs(m.lua('SnetForever.Estilo.aclarar({0.1, 0.1, 0.1, 1}, 5)[1]') - 0.15) < 1e-9);
  assert.equal(m.lua('SnetForever.Estilo.aclarar({0.98, 0.5, 0.1, 0.7}, 5)[1]'), 1, 'recorta a 1');
  assert.equal(m.lua('SnetForever.Estilo.aclarar({0.98, 0.5, 0.1, 0.7}, 5)[4]'), 0.7, 'el alfa no cambia');
  m.lua('FONTCOM = UIParent:CreateFontString(nil, "OVERLAY")');
  const letra = (tipo) => m.lua(`(function() SnetForever.Estilo.letraComercio(FONTCOM, ${aLua(tipo)}); local r, t = FONTCOM:GetFont(); return {r, t} end)()`);
  assert.deepEqual(letra('tabla'), ['Interface\\AddOns\\SnetForever\\recursos\\fonts\\BarlowSemiCondensed-SemiBold.ttf', 11]);
  assert.deepEqual(letra('texto'), ['Interface\\AddOns\\SnetForever\\recursos\\fonts\\BarlowSemiCondensed-Medium.ttf', 13]);
  assert.deepEqual(letra('titulo'), ['Interface\\AddOns\\SnetForever\\recursos\\fonts\\AlegreyaSC-Bold.ttf', 16]);
  sinErrores(m);
});

// Ventana de compra, tarea 3: la Lista usa la tabla ordenable.
const TAB = 'SnetForever.UIComercio.tabla()';
const celda = (m, i, clave) => m.lua(`${TAB}.huecos[${i}].celdas.${clave}:GetText()`);
// Escaneo con cantidades distintas: {item: [precio, cantidad]}.
function escanearCant(m, datos) {
  const lua = Object.entries(datos).map(([item, [p, n]]) => `[${item}] = {precio = ${p}, cantidad = ${n}, hora = GetServerTime() - 600}`);
  m.lua(`SnetForever.Escaneo._datos = {${lua.join(', ')}}`);
  m.lua(LISTAS_COMO_ESCANEO);
  m.avanzar(0.5);
  m.lua(`SnetForever.emitir("SNF_COMERCIO_ESCANEO", ${lua.length}, ${lua.length})`);
}
const fondo = (m, i) => m.lua(`{${TAB}.huecos[${i}].fondo:GetVertexColor()}`).map((x) => Math.round(x * 1000));

test('Lista: columnas objeto, nivel, cantidad, precio, % y ritmo; pulsar «Precio» ordena por precio', () => {
  const m = maquina();
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, nivel: 7 });
  abrir(m);
  escanear(m, CINCO);
  const claves = m.lua(`(function() local r = {} for _, c in ipairs(${TAB}._columnas) do r[#r + 1] = c.clave end return r end)()`);
  assert.deepEqual(claves, ['objeto', 'nivel', 'cantidad', 'precio', 'pct', 'ritmo', 'foto']);
  assert.equal(m.lua(`${TAB}.cabeceras.nivel.texto:GetText()`), texto(m, 'COMERCIO_COL_NIVEL'));
  assert.equal(m.lua(`${TAB}.cabeceras.precio.texto:GetText()`), texto(m, 'COMERCIO_COL_PRECIO'));
  assert.equal(fila(m, 1).nivel, 7, 'el nivel del objeto (nil si no se sabe)');
  assert.equal(fila(m, 5).nivel, undefined, 'el 14047 no está en caché');
  assert.equal(celda(m, 1, 'nivel'), '7');
  m.lua(`${TAB}.cabeceras.precio:Click()`);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => fila(m, i).precio), [45000, 79000, 99000, 120000, 200000]);
  assert.equal(celda(m, 1, 'precio'), '4g 50s 00c', 'las celdas siguen el orden');
  assert.deepEqual(m.lua('{SnetForeverCuenta.comercio.ordenLista.clave, SnetForeverCuenta.comercio.ordenLista.asc}'), ['precio', true]);
  m.lua(`${TAB}.cabeceras.precio:Click()`);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => fila(m, i).precio), [200000, 120000, 99000, 79000, 45000]);
  assert.equal(m.lua('SnetForeverCuenta.comercio.ordenLista.asc'), false);
  sinErrores(m);
});

test('sin precios de la app el orden de fábrica es por cantidad de mayor a menor; con precios, por % de menor a mayor', () => {
  const sin = maquina({ precios: false });
  abrir(sin);
  escanearCant(sin, { 2589: [45000, 5], 2592: [79000, 50], 4306: [99000, 20], 4338: [120000, 1] });
  assert.deepEqual([1, 2, 3, 4].map((i) => fila(sin, i).cantidad), [50, 20, 5, 1]);
  assert.deepEqual(sin.lua(`{${TAB}:orden()}`), ['cantidad', false]);
  assert.equal(sin.lua('SnetForeverCuenta.comercio.ordenLista'), undefined, 'el de fábrica no se guarda');
  sinErrores(sin);
  const con = maquina();
  abrir(con);
  escanearCant(con, { 2589: [45000, 5], 2592: [79000, 50], 4306: [99000, 20], 4338: [120000, 1] });
  assert.deepEqual([1, 2, 3, 4].map((i) => fila(con, i).item), [2589, 2592, 4306, 4338]);
  assert.deepEqual(con.lua(`{${TAB}:orden()}`), ['pct', true]);
  sinErrores(con);
});

test('pulsar una fila la deja elegida y pintada; sigue elegida al repintar', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  const normal = fondo(m, 1);
  m.lua(`${TAB}.huecos[2]:Click()`);
  const item = fila(m, 2).item;
  assert.equal(m.lua('SnetForever.Compra.estado().item'), item, 'la compra queda preparada con esa fila');
  assert.equal(m.lua(`${TAB}:elegida()`), item, 'la clave elegida de la tabla es el item de la compra');
  assert.notDeepEqual(fondo(m, 2), normal, 'la fila elegida se pinta distinta');
  assert.deepEqual(fondo(m, 1), normal);
  m.avanzar(0.5);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 5, 5)');
  assert.equal(m.lua(`${TAB}:elegida()`), item);
  assert.notDeepEqual(fondo(m, 2), normal, 'sigue pintada tras repintar');
  sinErrores(m);
});

test('si la fila elegida desaparece en un escaneo nuevo, la compra sigue preparada y ninguna fila queda pintada', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  const normal = fondo(m, 1);
  m.lua(`${TAB}.huecos[2]:Click()`);
  const item = fila(m, 2).item;
  const otros = Object.fromEntries(Object.entries(CINCO).filter(([k]) => Number(k) !== item));
  m.avanzar(0.5);
  escanear(m, otros);
  assert.equal(m.lua('SnetForever.Compra.estado().item'), item, 'la compra sigue preparada');
  assert.equal(m.lua(`${TAB}:elegida()`), undefined);
  for (let i = 1; i <= 4; i++) assert.deepEqual(fondo(m, i), normal, `la fila ${i} sin pintar`);
  sinErrores(m);
});

test('el orden elegido se recuerda al cerrar y abrir la subasta', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  m.lua(`${TAB}.cabeceras.precio:Click()`);
  m.lua(`${TAB}.cabeceras.precio:Click()`);
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  assert.deepEqual(m.lua(`{${TAB}:orden()}`), ['precio', false]);
  assert.equal(fila(m, 1).precio, 200000);
  const m2 = m.recargar();
  m2.disparar('AUCTION_HOUSE_SHOW');
  assert.deepEqual(m2.lua(`{${TAB}:orden()}`), ['precio', false], 'también tras /reload');
  // Un orden guardado roto no rompe nada: vuelve al de fábrica.
  m2.lua('SnetForeverCuenta.comercio.ordenLista = {clave = "nada", asc = "x"}');
  m2.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m2);
  assert.deepEqual(m2.lua(`{${TAB}:orden()}`), ['pct', true]);
  sinErrores(m2);
});

test('pulsar fila y luego Descartar suelta la fila elegida: la tabla no tiene elegida y ninguna fila queda pintada', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  const normal = fondo(m, 1);
  m.lua(`${TAB}.huecos[2]:Click()`);
  assert.notDeepEqual(fondo(m, 2), normal);
  m.lua('SnetForever.UIComercio.marco().pie.descartar:Click()');
  assert.equal(m.lua('SnetForever.Compra.estado()'), undefined, 'sin compra preparada');
  assert.equal(m.lua(`${TAB}:elegida()`), undefined);
  for (let i = 1; i <= 5; i++) assert.deepEqual(fondo(m, i), normal, `la fila ${i} sin pintar`);
  sinErrores(m);
});

test('un pulso rechazado (Compra.elegir da false) no deja la fila marcada', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  const normal = fondo(m, 1);
  m.lua('SnetForever.Compra.elegir = function() return false end');
  m.lua(`${TAB}.huecos[2]:Click()`);
  assert.equal(m.lua(`${TAB}:elegida()`), undefined);
  for (let i = 1; i <= 5; i++) assert.deepEqual(fondo(m, i), normal, `la fila ${i} sin pintar`);
  sinErrores(m);
});

// Ventana de compra, tarea 8: cabecera con oro y cerrar, pestañas con acento y panel de grupos con buscador y raya.
const VT = 'SnetForever.UIComercio.marco()';
const cercaDe = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-3);
const colorDe = (m, ref) => m.lua(`{${ref}:GetVertexColor()}`);
const tokenDe = (m, token) => m.lua(`SnetForever.Estilo.comercio(${aLua(token)})`);
const fuenteDe = (m, ref) => m.lua(`(function() local r, t = ${ref}:GetFont(); return {r, t} end)()`);

test('la cabecera enseña el oro del personaje y se repinta con PLAYER_MONEY', () => {
  const m = maquina();
  m.lua('BANCO.jugador.dinero = 123456');
  abrir(m);
  // Bloque B, Task B2: la cabecera de TSM lleva el logo (no el título) y el oro en tres colores (Tema.dinero).
  const dinero = (c) => m.lua(`SnetForever.Tema.dinero(${c})`);
  assert.equal(m.lua(`${VT}.cabecera.logo:GetText()`), 'SnetForever');
  assert.equal(m.lua(`${VT}.cabecera.oro:GetText()`), dinero(123456));
  assert.match(m.lua(`${VT}.cabecera.oro:GetText()`), /12g\|r \|cff[0-9a-f]{6}34s\|r \|cff[0-9a-f]{6}56c/);
  m.lua('BANCO.jugador.dinero = 5000000');
  m.disparar('PLAYER_MONEY');
  assert.equal(m.lua(`${VT}.cabecera.oro:GetText()`), dinero(5000000));
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.lua('BANCO.jugador.dinero = 7');
  m.disparar('PLAYER_MONEY');
  assert.equal(m.lua(`${VT}.cabecera.oro:GetText()`), dinero(5000000), 'con la ventana cerrada no se repinta');
  abrir(m);
  assert.equal(m.lua(`${VT}.cabecera.oro:GetText()`), dinero(7), 'al abrir se pinta con el oro de ahora');
  // Los avisos siguen en la cabecera.
  assert.equal(typeof m.lua(`${VT}.avisos:GetText()`), 'string');
  sinErrores(m);
});

test('cerrar desde la cabecera cierra la subasta', () => {
  const m = maquina();
  abrir(m);
  assert.equal(m.lua('BANCO.subasta.abierta'), true);
  m.lua(`${VT}.cabecera.cerrar:Click()`);
  assert.equal(m.lua('BANCO.subasta.abierta'), false, 'C_AuctionHouse.CloseAuctionHouse cierra la subasta');
  assert.equal(m.lua(`${VT}:IsShown()`), false, 'AUCTION_HOUSE_CLOSED esconde la ventana');
  assert.ok(m.lua('BANCO.llamadas["C_AuctionHouse.CloseAuctionHouse"]'), 'se llamó a CloseAuctionHouse');
  sinErrores(m);
  // Sin CloseAuctionHouse (otro cliente): HideUIPanel(AuctionHouseFrame).
  const previo = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); rawset(_G, "SNF_PRUEBA_OCULTO", false); rawset(_G, "HideUIPanel", function(f) SNF_PRUEBA_OCULTO = f end)';
  const m2 = maquina({ previo });
  abrir(m2);
  m2.lua('C_AuctionHouse.CloseAuctionHouse = nil');
  m2.lua(`${VT}.cabecera.cerrar:Click()`);
  assert.equal(m2.lua('SNF_PRUEBA_OCULTO == AuctionHouseFrame'), true, 'cierra con HideUIPanel(AuctionHouseFrame)');
  sinErrores(m2);
});

// Bloque B, Task B2: las pestañas son las de la cabecera de TSM: la elegida con el texto en acento y ninguna con fondo.
test('la pestaña elegida lleva el acento; la otra no', () => {
  const m = maquina();
  abrir(m);
  const N = `${VT}.pestanas.navegar`;
  const S = `${VT}.pestanas.sniper`;
  const tema = (t) => m.lua(`SnetForever.Tema.color(${aLua(t)})`);
  const sinFondo = (p) => m.lua(`(function() for _, t in ipairs({${p}:GetRegions()}) do if t:GetObjectType() == "Texture" and t:IsShown() then return false end end; return true end)()`);
  for (const p of [N, S]) {
    assert.match(m.lua(`(${p}.texto:GetFont())`), /BarlowSemiCondensed-SemiBold\.ttf$/);
    assert.equal(sinFondo(p), true, `${p} sin fondo`);
  }
  assert.ok(cercaDe(m.lua(`{${N}.texto:GetTextColor()}`), tema('acento')), 'Navegar, elegida, en acento');
  assert.ok(cercaDe(m.lua(`{${S}.texto:GetTextColor()}`), tema('textoPestana')), 'el Sniper, no elegido, en gris');
  m.lua(`${S}:Click()`);
  assert.ok(cercaDe(m.lua(`{${S}.texto:GetTextColor()}`), tema('acento')), 'el Sniper elegido, en acento');
  assert.ok(cercaDe(m.lua(`{${N}.texto:GetTextColor()}`), tema('textoPestana')), 'Navegar ya no');
  for (const p of [N, S]) assert.equal(sinFondo(p), true, `${p} sigue sin fondo`);
  sinErrores(m);
});

// Los textos de los grupos que se ven ahora en el panel (en el orden de las filas).
const gruposVistos = (m) => m.lua(`(function() local r = {}; for k, b in ipairs(${VT}.grupos) do if b:IsShown() then r[#r + 1] = b.texto:GetText() end end; return r end)()`);

function maquinaGrupos() {
  const m = maquina();
  for (const n of ['Hierbas', 'Barras de Hierro', 'Pieles', 'Té de Hiérbabuena']) m.lua(`SnetForever.Grupos.crear(${aLua(n)})`);
  return m;
}

test('buscar «hier» deja solo los grupos que lo contienen (sin tildes ni mayúsculas); vaciarlo los enseña todos', () => {
  const m = maquinaGrupos();
  abrir(m);
  const TODOS = texto(m, 'COMERCIO_TODOS');
  const sinFiltro = gruposVistos(m);
  assert.equal(sinFiltro.length, 7, 'Todos + 4 propios + 2 de la app');
  assert.equal(sinFiltro[0], TODOS);
  m.lua(`${VT}.grupos.buscar:SetText("hier")`);
  assert.deepEqual([...gruposVistos(m)].sort(), [TODOS, 'Barras de Hierro', 'Hierbas', 'Té de Hiérbabuena'].sort());
  m.lua(`${VT}.grupos.buscar:SetText("HIÉR")`);
  assert.equal(gruposVistos(m).length, 4, 'mayúsculas y tildes dan igual, también al escribir');
  m.lua(`${VT}.grupos.buscar:SetText("hierba")`);
  assert.deepEqual([...gruposVistos(m)].sort(), [TODOS, 'Hierbas', 'Té de Hiérbabuena'].sort());
  m.lua(`${VT}.grupos.buscar:SetText("zzz")`);
  assert.deepEqual(gruposVistos(m), [TODOS], 'sin coincidencias, solo «Todos los objetos»');
  m.lua(`${VT}.grupos.buscar:SetText("")`);
  assert.deepEqual(gruposVistos(m), sinFiltro, 'vaciarlo los enseña todos');
  // Elegir un grupo con el filtro puesto sigue funcionando.
  m.lua(`${VT}.grupos.buscar:SetText("tela")`);
  assert.deepEqual(gruposVistos(m), [TODOS, 'Telas']);
  m.lua(`${VT}.grupos[2]:Click()`);
  assert.equal(m.lua('SnetForever.UIComercio.grupo()'), 'telas');
  sinErrores(m);
});

test('cada grupo lleva su raya de color y el elegido queda pintado como una fila elegida', () => {
  const m = maquinaGrupos();
  abrir(m);
  const n = gruposVistos(m).length;
  const AMARILLO = [0xfc / 255, 0xf1 / 255, 0x41 / 255, 1];
  for (let k = 1; k <= n; k++) {
    const b = `${VT}.grupos[${k}]`;
    assert.equal(m.lua(`${b}.raya:GetWidth()`), 3, `raya de 3 px en la fila ${k}`);
    assert.equal(m.lua(`${b}.raya:IsShown()`), true);
    assert.ok(cercaDe(colorDe(m, `${b}.raya`), AMARILLO), `todos son de nivel 1: amarillo (fila ${k})`);
    assert.equal(m.lua(`${b}.raya:GetLeft() == ${b}:GetLeft()`), true, 'a la izquierda de la fila');
  }
  const filas = tokenDe(m, 'filas');
  const hacia = (pct) => m.lua(`SnetForever.Estilo.aclarar(SnetForever.Estilo.comercio("filas"), ${pct})`);
  const elegida = hacia(5);
  // Sin grupo elegido, la elegida es «Todos los objetos».
  assert.ok(cercaDe(colorDe(m, `${VT}.grupos[1].fondo`), elegida));
  for (let k = 2; k <= n; k++) assert.ok(cercaDe(colorDe(m, `${VT}.grupos[${k}].fondo`), filas), `la fila ${k} sin elegir`);
  m.lua('SnetForever.UIComercio.elegirGrupo("telas")');
  const kTelas = gruposVistos(m).indexOf('Telas') + 1;
  assert.ok(kTelas > 1);
  assert.ok(cercaDe(colorDe(m, `${VT}.grupos[${kTelas}].fondo`), elegida), 'Telas, elegida, como una fila elegida');
  assert.ok(cercaDe(colorDe(m, `${VT}.grupos[1].fondo`), filas), 'Todos ya no');
  // Ratón encima: +5 % en una fila normal y +8 % en la elegida.
  m.lua(`${VT}.grupos[1]:GetScript("OnEnter")(${VT}.grupos[1])`);
  assert.ok(cercaDe(colorDe(m, `${VT}.grupos[1].fondo`), hacia(5)));
  m.lua(`${VT}.grupos[${kTelas}]:GetScript("OnEnter")(${VT}.grupos[${kTelas}])`);
  assert.ok(cercaDe(colorDe(m, `${VT}.grupos[${kTelas}].fondo`), hacia(8)));
  m.lua(`${VT}.grupos[${kTelas}]:GetScript("OnLeave")(${VT}.grupos[${kTelas}])`);
  assert.ok(cercaDe(colorDe(m, `${VT}.grupos[${kTelas}].fondo`), elegida));
  sinErrores(m);
});

// Ventana de compra, tarea 10: la fila elegida se abre en sus escalones de precio (precio, cantidad y tiempo restante).
const LINO10 = '[2589] = {{quantity = 5, unitPrice = 40000}, {quantity = 10, unitPrice = 45000}, {quantity = 50, unitPrice = 200000}}';
const dineroDe = (m, cobre) => m.lua(`SnetForever.UIComercio.dinero(${cobre})`);
const compra = (m) => m.lua('SnetForever.Compra.estado()');
const COMPRAS10 = ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase'];
const nCompras = (m) => COMPRAS10.reduce((n, api) => n + m.llamadas(`C_AuctionHouse.${api}`).length, 0);
// Lino (mercancía) o paño de tejido mágico (objeto suelto) elegido y con su búsqueda ya respondida.
function conElegida(subasta, item, precio, cantidad, opciones) {
  const m = maquina(opciones);
  m.lua('BANCO.jugador.dinero = 10000000');
  m.lua(`BANCO.ponerSubasta({${subasta}})`);
  abrir(m);
  escanearCant(m, { [item]: [precio, cantidad] });
  m.lua(`${TAB}.huecos[1]:Click()`);
  m.avanzar(0.05);
  return m;
}
const visibles = (m) => m.lua(`(function() local n = 0 for _, h in ipairs(${TAB}.huecos) do if h:IsShown() then n = n + 1 end end return n end)()`);

test('la fila elegida, cuando ya tiene escalones, enseña ▸ y al abrirla salen sus escalones (precio, cantidad y tiempo restante)', () => {
  const m = maquina();
  m.lua('BANCO.jugador.dinero = 10000000');
  m.lua(`BANCO.ponerSubasta({mercancias = {${LINO10}}})`);
  abrir(m);
  escanearCant(m, { 2589: [40000, 65], 2592: [79000, 50], 4306: [99000, 20] });
  const indice = [1, 2, 3].find((i) => fila(m, i).item === 2589);
  assert.equal(m.lua(`${TAB}.huecos[${indice}].abrir:IsShown()`), false, 'sin elegir, ninguna fila se abre');
  m.lua(`${TAB}.huecos[${indice}]:Click()`);
  assert.equal(m.lua(`${TAB}.huecos[${indice}].abrir:IsShown()`), false, 'mientras busca aún no hay escalones');
  m.avanzar(0.05);
  assert.equal(m.lua(`${TAB}.huecos[${indice}].abrir:IsShown()`), true, 'la elegida ya enseña el botón de abrir');
  for (let i = 1; i <= 3; i++) {
    if (i !== indice) assert.equal(m.lua(`${TAB}.huecos[${i}].abrir:IsShown()`), false, 'las demás no');
  }
  assert.equal(visibles(m), 3, 'cerrada: solo las 3 filas');
  m.lua(`${TAB}.huecos[${indice}].abrir:Click()`);
  assert.equal(visibles(m), 6, 'abierta: salen los 3 escalones');
  const sub = (k, clave) => m.lua(`${TAB}.huecos[${indice + k}].celdas.${clave}:GetText()`);
  assert.equal(sub(1, 'precio'), dineroDe(m, 40000));
  assert.equal(sub(1, 'cantidad'), '5');
  assert.equal(sub(2, 'precio'), dineroDe(m, 45000));
  assert.equal(sub(2, 'cantidad'), '10');
  assert.equal(sub(3, 'precio'), dineroDe(m, 200000));
  assert.equal(sub(3, 'cantidad'), '50');
  assert.equal(sub(1, 'pct'), '', 'las subfilas no repiten el %');
  m.lua(`${TAB}.huecos[${indice}].abrir:Click()`);
  assert.equal(visibles(m), 3, 'se vuelve a cerrar');
  // Elegir otra fila quita los escalones de la anterior: ya no es la elegida, aunque se hubiera dejado abierta.
  m.lua(`${TAB}.huecos[${indice}].abrir:Click()`);
  assert.equal(visibles(m), 6);
  const otra = [1, 2, 3].find((i) => i !== indice && i < indice) || indice + 4; // un hueco de fila, no de escalón
  m.lua(`${TAB}.huecos[${otra}]:Click()`);
  m.avanzar(0.05);
  assert.notEqual(m.lua(`${TAB}:elegida()`), 2589);
  assert.equal(visibles(m), 3, 'los escalones de la anterior se han quitado');
  for (let i = 1; i <= 3; i++) assert.equal(m.lua(`${TAB}.huecos[${i}].abrir:IsShown()`), false, 'sin escalones aún: ninguna se abre');
  assert.equal(nCompras(m), 0);
  sinErrores(m);
});

test('en un objeto suelto los escalones llevan el tiempo restante (p. ej. «2 h»); en una mercancía, «—»', () => {
  const suelto = conElegida(
    // Arreglo de la compra suelta: como en WoW Forever, la primera fila son 3 subastas iguales de 1 a 50000 cada una.
    'objetos = {[4338] = {{quantity = 3, buyoutAmount = 50000, timeLeftSeconds = 7200}, {quantity = 1, buyoutAmount = 55000, timeLeftSeconds = 1800}, {quantity = 1, buyoutAmount = 60000}}}',
    4338, 50000, 3);
  suelto.lua(`${TAB}:abrir(4338, true)`);
  const t = (k) => suelto.lua(`${TAB}.huecos[${1 + k}].celdas.objeto:GetText()`);
  assert.equal(t(1), '2 h');
  assert.equal(t(2), '30 min');
  assert.equal(t(3), texto(suelto, 'COMERCIO_SIN_DATO'), 'sin dato de tiempo');
  assert.equal(suelto.lua(`${TAB}.huecos[2].celdas.cantidad:GetText()`), '1', 'una subasta de objeto es 1 unidad');
  assert.equal(suelto.lua(`${TAB}.huecos[2].celdas.precio:GetText()`), dineroDe(suelto, 50000));
  sinErrores(suelto);
  const merc = conElegida(`mercancias = {${LINO10}}`, 2589, 40000, 65);
  merc.lua(`${TAB}:abrir(2589, true)`);
  for (const k of [1, 2, 3]) assert.equal(merc.lua(`${TAB}.huecos[${1 + k}].celdas.objeto:GetText()`), '—');
  sinErrores(merc);
});

test('pulsar un escalón abre el cuadro de cantidad con la cantidad acumulada hasta él, sin comprar', () => {
  // La fila a 4,5 de oro (regla nueva, ronda 1 de B5: su precio es el tope): entran los dos primeros escalones.
  const m = conElegida(`mercancias = {${LINO10}}`, 2589, 45000, 65);
  m.lua(`${TAB}:abrir(2589, true)`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false, 'abrir la fila no abre el cuadro');
  m.lua(`${TAB}.huecos[3]:Click()`); // 2.º escalón: 5 + 10
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  assert.equal(compra(m).cantidad, 15);
  assert.equal(m.lua('SnetForever.CantidadComercio.marco().caja:GetText()'), '15');
  assert.equal(m.lua(`${TAB}:elegida()`), 2589, 'la fila elegida sigue siendo la del objeto');
  assert.equal(nCompras(m), 0, 'pulsar un escalón nunca compra');
  m.avanzar(30);
  assert.equal(nCompras(m), 0);
  sinErrores(m);
});

test('un escalón por encima del precio límite sale atenuado y al pulsarlo la cantidad se recorta al máximo', () => {
  // La fila a 4,5 de oro (regla nueva, ronda 1 de B5: su precio es el tope): entran los dos primeros escalones.
  const m = conElegida(`mercancias = {${LINO10}}`, 2589, 45000, 65);
  m.lua(`${TAB}:abrir(2589, true)`);
  const color = (i) => m.lua(`{${TAB}.huecos[${i}].celdas.precio:GetTextColor()}`).slice(0, 3);
  assert.deepEqual(color(2), color(3), 'los de dentro del límite van normales');
  assert.notDeepEqual(color(4), color(2), 'el de fuera va atenuado');
  assert.equal(m.lua('SnetForever.Compra.maxCantidad()'), 15);
  m.lua(`${TAB}.huecos[4]:Click()`);
  assert.equal(compra(m).cantidad, 15, 'recortada al máximo');
  assert.equal(nCompras(m), 0);
  sinErrores(m);
});

test('en un objeto suelto pulsar un escalón no abre el cuadro ni compra', () => {
  const m = conElegida('objetos = {[4338] = {{quantity = 3, buyoutAmount = 50000}, {quantity = 1, buyoutAmount = 55000}}}', 4338, 50000, 3);
  m.lua(`${TAB}:abrir(4338, true)`);
  m.lua(`${TAB}.huecos[3]:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false);
  assert.equal(nCompras(m), 0);
  assert.equal(m.lua(`${TAB}:elegida()`), 4338);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglo final, Important 1: la ventana entera usa el tema de comercio (gris casi negro), siempre opaco.
// ---------------------------------------------------------------------------------------------------
test('la ventana de comercio no usa el tema viejo: nada de Estilo.tarjeta/UI.boton/UI.casilla/Estilo.color en ella', () => {
  for (const archivo of ['comercio.lua', 'comercio_cantidad.lua']) {
    const fuente = readFileSync(join(ADDON_UI, archivo), 'utf8');
    for (const viejo of ['Estilo.tarjeta', 'Estilo.fondo(', 'Estilo.color(', 'UI.boton(', 'UI.botonIcono(', 'UI.casilla(', 'Estilo.pestana(']) {
      assert.ok(!fuente.includes(viejo), `${archivo} no usa ${viejo}`);
    }
  }
});

test('ningún marco de la ventana lleva fondo del tema viejo (con alfa de ventana) y los fondos son opacos', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  m.lua('SnetForever.Ajustes.set("ventana.alfa", 0.2)'); // con el tema viejo esto dejaba ver la subasta de debajo
  m.lua('SnetForever.Ajustes.set("ventana.tema", "neutro")');
  const V = 'SnetForever.UIComercio.marco()';
  m.lua(`${V}.ajustes:Show()`); // el engranaje también cuenta
  const r = m.lua(`
    local viejos, translucidos, vistos = {}, {}, 0
    local function ver(f, ruta)
      vistos = vistos + 1
      if f.snfFondo then viejos[#viejos + 1] = ruta end
      if f.fondo and f.fondo.GetVertexColor then
        local _, _, _, a = f.fondo:GetVertexColor()
        if a ~= 1 then translucidos[#translucidos + 1] = ruta end
      end
      for i, h in ipairs({f:GetChildren()}) do ver(h, ruta .. "/" .. i) end
    end
    ver(${V}, "raiz")
    return {viejos = viejos, translucidos = translucidos, vistos = vistos}
  `);
  assert.ok(r.vistos > 40, `se han recorrido los marcos de la ventana (${r.vistos})`);
  assert.deepEqual(r.viejos || [], [], 'marcos con fondo del tema viejo');
  assert.deepEqual(r.translucidos || [], [], 'fondos con alfa');
  // La raíz, la lista, el sniper, la barra, la barra de progreso y el engranaje: fondo de la paleta de comercio.
  const rgb = (ruta) => m.lua(`{${ruta}.fondo:GetVertexColor()}`);
  const token = (t) => m.lua(`SnetForever.Estilo.comercio(${aLua(t)})`);
  assert.deepEqual(rgb(V), m.lua('SnetForever.Tema.color("fondo")'), 'bloque B: el fondo de TSM y de la ventana principal');
  assert.deepEqual(rgb(`${V}.cuerpo`), token('filas'));
  assert.deepEqual(rgb('SnetForever.SubastaSniper.marcos.marcoTabla'), token('filas')); // tarea S2: el marco de la tabla del sniper
  assert.deepEqual(rgb(`${V}.pie`), token('cabecera'));
  assert.deepEqual(rgb(`${V}.pie.progreso`), token('filas'));
  assert.deepEqual(rgb(`${V}.ajustes`), token('cabecera'));
  // Bloque B: «Vista de Blizzard» es un recuadro oscuro con borde fino (Piezas.boton con borde): sin relleno propio.
  assert.equal(m.lua(`${V}.verBlizzard.fondo`), undefined);
  for (const tira of m.lua(`(function() local r = {}; for _, t in ipairs(${V}.verBlizzard.bordes) do r[#r + 1] = {t:GetVertexColor()} end; return r end)()`)) {
    assert.deepEqual(tira, m.lua('SnetForever.Tema.color("borde")'));
  }
  assert.deepEqual(rgb(`${V}.pie.engranaje`), token('cabecera'));
  for (const ruta of [V, `${V}.cuerpo`, `${V}.pie`, `${V}.ajustes`]) {
    assert.equal(rgb(ruta)[3], 1, `${ruta} opaco`);
  }
  sinErrores(m);
});

test('los textos secundarios y las casillas usan los colores del tema de comercio', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  const V = 'SnetForever.UIComercio.marco()';
  const sec = m.lua('SnetForever.Estilo.comercio("secundario")').slice(0, 3);
  assert.deepEqual(m.lua(`{${V}.vacio:GetTextColor()}`).slice(0, 3), sec, 'el texto de «lista vacía»');
  // Tarea S2: el texto de «aún no hay hallazgos» del sniper (ui/subasta/sniper.lua).
  assert.deepEqual(m.lua('{SnetForever.SubastaSniper.marcos.vacio:GetTextColor()}').slice(0, 3), sec);
  // Las casillas (sonido del sniper, ahora en el engranaje, y «siguiente sola») se pintan con el tema de comercio y siguen
  // funcionando.
  const antes = m.lua('SnetForever.Ajustes.get("comercioSiguienteSola")');
  m.lua(`${V}.ajustes.siguiente:Click()`);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioSiguienteSola")'), !antes, 'la casilla cambia el ajuste');
  m.lua(`${V}.ajustes.sonido:Click()`);
  assert.equal(m.lua(`${V}.ajustes.sonido.marca:IsShown()`), m.lua('SnetForever.Ajustes.get("comercioSniperSonido") and true or false'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglo final, Minor 2 y Minor 4.
// ---------------------------------------------------------------------------------------------------
test('el estado del escaneo no sale arriba a la derecha: va solo en la barra de progreso', () => {
  const m = maquina();
  abrir(m);
  const V = 'SnetForever.UIComercio.marco()';
  assert.equal(m.lua(`${V}.estado`), undefined, 'ya no hay texto de estado arriba a la derecha');
  escanear(m, { 2589: 45000, 2592: 79000 });
  assert.equal(m.lua(`${V}.pie.info:GetText()`), texto(m, 'COMERCIO_BARRA_ESCANEANDO', 2));
  m.lua('SnetForever.Escaneo._estado = "completo"');
  m.avanzar(0.5);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 2, 2)');
  assert.equal(m.lua(`${V}.pie.info:GetText()`), texto(m, 'COMERCIO_BARRA_COMPLETO', 2));
  sinErrores(m);
});

test('GET_ITEM_INFO_RECEIVED pasa por el freno de 0,5 s: una ráfaga repinta una vez y deja un repintado pendiente', () => {
  const m = maquina();
  abrir(m);
  escanear(m, { 14047: 45000 });
  const V = 'SnetForever.UIComercio.marco()';
  m.avanzar(1);
  m.lua(`_G.PINTADAS = 0; local t = ${V}.tabla; local poner = t.poner; t.poner = function(...) PINTADAS = PINTADAS + 1; return poner(...) end`);
  m.itemInfo(14047, { nombre: 'Paño rúnico', calidad: 1 });
  for (let i = 0; i < 6; i++) {
    m.disparar('GET_ITEM_INFO_RECEIVED', 14047, true);
    m.avanzar(0.05);
  }
  assert.equal(m.lua('PINTADAS'), 1, 'seis eventos seguidos: una sola pasada de pintura');
  assert.equal(m.lua(`${V}.filas[1].celdas.objeto:GetText()`), 'Paño rúnico', 'la primera pasada ya enseña el nombre');
  m.avanzar(0.6);
  assert.equal(m.lua('PINTADAS'), 2, 'y pasado el freno, una más con lo último');
  m.avanzar(2);
  assert.equal(m.lua('PINTADAS'), 2, 'sin más');
  sinErrores(m);
});

// Convivencia con TSM: cuando TSM enseña su subasta saca AuctionHouseFrame de la pantalla y le pone escala 0,001; con
// «WoW UI» la devuelve a escala 1 y a su sitio. Lo hace sin ocultarla. Aquí se imita como lo hace el TSM de verdad
// (LibTSMWoW: Service/Move.lua y API/AuctionHouse.lua, tarea 15d r1):
// - al sacarla de la pantalla guarda GetPoint(1), solo si no tenía nada guardado, y la pone en (100000, 100000);
// - al abrir la subasta (TSM_PON) pone primero los puntos y luego la escala; con su pestaña (TSM_PESTANA), al revés;
// - con «WoW UI» (TSM_QUITA): escala 1, ClearAllPoints y el punto guardado (o el de fábrica), y lo olvida;
// - tras sacarla la primera vez engancha SetPoint: mientras tiene un punto guardado, cualquier SetPoint la vuelve a sacar
//   a (100000, 100000) (15d r2).
const TSM_FUERA = 'local f = AuctionHouseFrame; local g = rawget(_G, "TSM_PUNTO"); if not (g and g[1]) then rawset(_G, "TSM_PUNTO", {f:GetPoint(1)}) end; f:ClearAllPoints(); f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100000, 100000); if not rawget(_G, "TSM_GANCHO") then rawset(_G, "TSM_GANCHO", true); hooksecurefunc(f, "SetPoint", function(self) local t = rawget(_G, "TSM_PUNTO"); if rawget(_G, "TSM_IGNORA") or not (t and t[1]) then return end; rawset(_G, "TSM_IGNORA", true); self:ClearAllPoints(); self:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100000, 100000); rawset(_G, "TSM_IGNORA", false) end) end';
const TSM_PON = `${TSM_FUERA}; AuctionHouseFrame:SetScale(0.001)`;
const TSM_PESTANA = `AuctionHouseFrame:SetScale(0.001); ${TSM_FUERA}`;
const TSM_QUITA = 'local f = AuctionHouseFrame; f:SetScale(1); f:ClearAllPoints(); local p = rawget(_G, "TSM_PUNTO"); rawset(_G, "TSM_PUNTO", nil); if p and p[1] then f:SetPoint(p[1], p[2], p[3], p[4], p[5]) else f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100) end';
const enseña = (m, ref) => m.lua(`${ref}:IsShown()`);

test('si AuctionHouseFrame pasa a escala 0,001 y fuera de pantalla, nuestra ventana y la pestaña se esconden', () => {
  const m = maquina({ previo: SUBASTA });
  abrir(m);
  assert.equal(enseña(m, V9), true);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
  m.lua(TSM_PON); // TSM actúa justo después de AUCTION_HOUSE_SHOW
  assert.equal(enseña(m, V9), false, 'la ventana se esconde');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false, 'y su pestaña también, aunque su padre se encoja');
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioVista")'), 'snet', 'la preferencia no cambia: no es elegir la vista de Blizzard');
  assert.equal(m.lua(`${AH}:IsShown()`), true, 'AuctionHouseFrame no se toca (ni se oculta)');
  assert.equal(m.lua(`${AH}:GetScale() < 0.01`), true, 'ni se escala');
  // Un cambio solo de escala o solo de sitio también se nota. Al devolverla TSM solo sale nuestra pestaña.
  m.lua(TSM_QUITA);
  assert.equal(enseña(m, V9), false, 'devuelta por TSM: sin ventana');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true, 'solo la pestaña');
  m.lua(`${AH}:SetScale(0.001)`);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false, 'solo la escala');
  m.lua(`${AH}:SetScale(1)`);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
  m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 90000, 0)`);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false, 'solo el sitio (fuera de la pantalla)');
  assert.equal(enseña(m, V9), false);
  m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100)`); // otra vez en su sitio
  // TSM ya la tenía así antes del AUCTION_HOUSE_SHOW.
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.lua(TSM_PON);
  abrir(m);
  assert.equal(enseña(m, V9), false, 'abrir con la subasta ya inusable no enseña nada');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false);
  // La subasta se oculta y se enseña: OnHide / OnShow.
  m.lua(TSM_QUITA);
  assert.equal(enseña(m, V9), false, 'devuelta por TSM: solo la pestaña');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
  m.lua(`${AH}:Hide()`);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false, 'subasta oculta: nada nuestro a la vista');
  m.lua(`${AH}:Show()`);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
  assert.equal(enseña(m, V9), false);
  sinErrores(m);
});

test('al volver a escala 1 en su sitio, solo sale la pestaña; la ventana, cuando el jugador la pulsa', () => {
  const m = maquina({ previo: SUBASTA });
  const a = bordes(m, AH);
  abrir(m);
  m.lua(TSM_PON);
  assert.equal(enseña(m, V9), false);
  m.lua(TSM_QUITA);
  assert.equal(enseña(m, V9), false, 'aunque la vista guardada sea snet, no se vuelve a esconder la subasta sola');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'snet');
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(enseña(m, V9), true, 'vista snet: la ventana, al pulsar la pestaña');
  const v = bordes(m, V9);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - v[i]) < 0.01, `borde ${i}: sobre el sitio de la subasta`);
  // Con la vista de Blizzard guardada: solo vuelve la pestaña, y la preferencia se respeta.
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  m.lua(TSM_PON);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false);
  m.lua(TSM_QUITA);
  assert.equal(enseña(m, V9), false, 'vista blizzard: la ventana sigue escondida');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true, 'la pestaña queda para volver');
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'blizzard');
  // Y sin haber abierto nunca la ventana, los ganchos no crean nada.
  const n = maquina({ previo: SUBASTA });
  n.lua(TSM_PON);
  n.lua(TSM_QUITA);
  assert.equal(n.lua('SnetForever.UIComercio.marco()'), undefined);
  sinErrores(m);
  sinErrores(n);
});

test('tras /reload con la subasta abierta no sale nada nuestro hasta reabrirla (con o sin TSM); con ella abierta, PLAYER_ENTERING_WORLD recoloca o esconde', () => {
  // Tras /reload no llega AUCTION_HOUSE_SHOW y SNF.Comercio.abierta() es falso: nada nuestro se ve hasta el siguiente.
  const m = maquina({ previo: SUBASTA });
  abrir(m);
  const r = m.recargar();
  assert.equal(r.lua('SnetForever.Comercio.abierta()'), false);
  assert.equal(r.lua('SnetForever.UIComercio.marco()'), undefined, 'no se crea nada en PLAYER_ENTERING_WORLD');
  // TSM la tiene: al siguiente AUCTION_HOUSE_SHOW sigue sin verse nada.
  r.lua(TSM_PON);
  r.disparar('PLAYER_ENTERING_WORLD');
  abrir(r);
  assert.equal(enseña(r, V9), false);
  assert.equal(enseña(r, `${V9}.pestanaSnet`), false);
  // Con la subasta abierta, un PLAYER_ENTERING_WORLD (cambio de zona) recoloca si es usable...
  r.lua(TSM_QUITA);
  assert.equal(enseña(r, V9), false, 'devuelta por TSM: solo la pestaña');
  assert.equal(enseña(r, `${V9}.pestanaSnet`), true);
  r.disparar('PLAYER_ENTERING_WORLD');
  assert.equal(enseña(r, V9), false);
  assert.equal(enseña(r, `${V9}.pestanaSnet`), true);
  r.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(enseña(r, V9), true);
  r.disparar('PLAYER_ENTERING_WORLD');
  assert.equal(enseña(r, V9), true);
  assert.ok(Math.abs(bordes(r, V9)[0] - 10) < 0.01, 'en el sitio que tenía la subasta');
  assert.ok(escondida(r), 'y la subasta, escondida');
  // ...y esconde si no lo es, aunque el cambio se haya hecho sin que ningún gancho lo viera.
  r.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(escalaDe(r), 1);
  devuelta(r, SUBASTA_ORIGINAL, 'tras PLAYER_ENTERING_WORLD:');
  r.lua(`BANCO.originalDe(${AH}.SetScale)(${AH}, 0.001)`);
  r.disparar('PLAYER_ENTERING_WORLD');
  assert.equal(enseña(r, V9), false);
  assert.equal(enseña(r, `${V9}.pestanaSnet`), false);
  sinErrores(r);
});

test('nada flota: con la subasta inusable, ningún marco nuestro visible queda anclado a ella', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua(TSM_PON);
  // Todo lo nuestro (la ventana, la pestaña y cada descendiente) escondido.
  const vistos = m.lua(`
    local fuera = {}
    local function mirar(f, ruta)
      if f:IsVisible() then fuera[#fuera + 1] = ruta end
      for i, h in ipairs({f:GetChildren()}) do mirar(h, ruta .. "/" .. i) end
    end
    mirar(SnetForever.UIComercio.marco(), "ventana")
    mirar(SnetForever.UIComercio.marco().pestanaSnet, "pestana")
    return fuera`);
  assert.deepEqual(vistos, [], 'marcos nuestros que se ven');
  // Y en toda la pantalla, nada visible anclado a la subasta salvo sus pestañas de Blizzard (AuctionHouseFrame.Tabs: son
  // de la subasta, no nuestras).
  const flotan = m.lua(`
    local propias = {}
    for _, t in ipairs(AuctionHouseFrame.Tabs) do propias[t] = true end
    local fuera = {}
    local function mirar(f)
      for _, h in ipairs({f:GetChildren()}) do
        if h ~= AuctionHouseFrame and not propias[h] and h:IsVisible() then
          for i = 1, h:GetNumPoints() do
            local _, rel = h:GetPoint(i)
            if rel == AuctionHouseFrame then fuera[#fuera + 1] = h:GetName() or "sin nombre" end
          end
        end
        mirar(h)
      end
    end
    mirar(UIParent)
    return fuera`);
  assert.deepEqual(flotan, [], 'marcos a la vista anclados a la subasta');
  sinErrores(m);
});

test('la escala se mide respecto a UIParent: con la interfaz pequeña o la subasta reducida por el jugador se ve; con la de TSM no', () => {
  for (const [ui, sub] of [[0.64, 0.75], [0.36, 1]]) {
    const m = maquina({ previo: SUBASTA });
    m.lua(`UIParent:SetScale(${ui}); ${AH}:SetScale(${sub})`);
    abrir(m);
    assert.equal(enseña(m, V9), true, `UIParent ${ui} y subasta ${sub}: la ventana se ve`);
    assert.equal(enseña(m, `${V9}.pestanaSnet`), true, 'y la pestaña');
    sinErrores(m);
  }
  const m = maquina({ previo: SUBASTA });
  m.lua('UIParent:SetScale(0.64)');
  abrir(m);
  assert.equal(enseña(m, V9), true);
  m.lua(TSM_PON);
  assert.equal(enseña(m, V9), false, 'TSM (0,001) con UIParent a 0,64: se esconde');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false);
  sinErrores(m);
});

test('una subasta sin medidas (sin anclajes) se esconde igual y la ventana sale centrada; si otro addon la recoloca, la soltamos y se esconden la ventana y el cuadro de cantidad', () => {
  const sin = maquina({ previo: `${SUBASTA}${AH}:ClearAllPoints(); ` });
  assert.equal(sin.lua(`${AH}:GetLeft()`), undefined, 'la subasta de prueba no tiene medidas');
  abrir(sin);
  assert.equal(enseña(sin, V9), true, 'abrir con la subasta sin anclar: la ventana se ve');
  assert.equal(enseña(sin, `${V9}.pestanaSnet`), true);
  sinErrores(sin);
  // Cerrar y reponerla: sin puntos otra vez (como estaba).
  sin.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(sin.lua(`${AH}:GetNumPoints()`), 0);
  assert.equal(escalaDe(sin), 1);
  devuelta(sin, [], 'sin anclajes:');

  const m = conElegida(`mercancias = {${LINO10}}`, 2589, 40000, 65, { previo: SUBASTA });
  m.lua(`${TAB}:abrir(2589, true)`);
  m.lua(`${TAB}.huecos[3]:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  // Otro addon solo recoloca la subasta que teníamos escondida (el gestor de paneles de Blizzard lo hace): seguimos
  // siendo dueños, la ventana y el cuadro de cantidad siguen y la subasta vuelve fuera de la pantalla.
  m.lua(`${AH}:ClearAllPoints()`);
  assert.equal(enseña(m, V9), true, 'la ventana sigue: la subasta sigue siendo nuestra');
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true);
  m.lua(`${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100)`);
  assert.ok(oculta(m), 'a la vista otra vez: escondido de reserva en el acto (15d r2)');
  assert.ok(enReserva(m));
  m.avanzar(0.05);
  assert.ok(oculta(m), 'sigue sin verse ni poderse pulsar');
  // Y al cerrar se repone lo de antes.
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'al cerrar:');
  sinErrores(m);
});

test('con el comercio apagado, ponerVista("snet") no enseña la ventana si la subasta no se puede usar', () => {
  const m = maquina({ previo: SUBASTA });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  m.lua('SnetForever.Comercio.ejecutar("prueba", function() error("roto") end)'); // apaga el comercio
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  m.lua(TSM_PON);
  m.lua('SnetForever.UIComercio.ponerVista("snet")');
  assert.equal(enseña(m, V9), false, 'TSM tiene la subasta: ni siquiera el respaldo la enseña');
  m.lua(TSM_QUITA);
  m.lua('SnetForever.UIComercio.ponerVista("snet")');
  assert.equal(enseña(m, V9), true, 'con la subasta usable, el respaldo la enseña como antes');
  assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true);
  m.lua(TSM_PON);
  assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), false);
  assert.equal(maquina().lua('SnetForever.UIComercio.subastaUsable()'), true, 'sin AuctionHouseFrame cuenta como usable');
});

test('los ganchos sobre la subasta se ponen una sola vez aunque se abra y cierre varias veces y entre PLAYER_ENTERING_WORLD', () => {
  const m = maquina({ previo: SUBASTA });
  for (let i = 0; i < 3; i++) { abrir(m); m.disparar('AUCTION_HOUSE_CLOSED'); }
  abrir(m);
  m.disparar('PLAYER_ENTERING_WORLD');
  m.disparar('PLAYER_ENTERING_WORLD');
  m.lua(`${V9}.verBlizzard:Click()`); // con la subasta a la vista: un SetScale ajeno solo se revisa
  m.lua(`CUENTA = 0; local o = SnetForever.Comercio.abierta
    SnetForever.Comercio.abierta = function() CUENTA = CUENTA + 1; return o() end`);
  m.lua(`${AH}:SetScale(1)`);
  assert.equal(m.lua('CUENTA'), 1, 'un SetScale provoca una sola revisión: un solo gancho');
  sinErrores(m);
});

// Tras «WoW UI» en la misma apertura: el escaneo que no arrancó porque TSM tenía la subasta arranca al volver la ventana.
const REPLICA = 'BANCO.ponerSubasta({replica = {{name = "Lino", itemID = 2589, count = 20, buyoutPrice = 2400}}})';
const consultas = (m) => m.lua('#(BANCO.llamadas["C_AuctionHouse.ReplicateItems"] or {}) + #(BANCO.llamadas["C_AuctionHouse.SendBrowseQuery"] or {})');

test('tras «WoW UI» en la misma apertura, el escaneo arranca y la cabecera no se queda en «Esperando a la subasta…»', () => {
  const m = maquina({ previo: SUBASTA, escaneo: false });
  m.lua(REPLICA);
  abrir(m);
  m.lua(TSM_PON);
  m.avanzar(1.5); // se cumple la espera con TSM dueña de la subasta
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'parado');
  assert.equal(m.lua('SnetForever.Escaneo.motivo()'), 'otro', 'el motivo propio no se borra');
  assert.equal(consultas(m), 0);
  m.lua(TSM_QUITA);
  assert.equal(enseña(m, V9), false, 'solo sale la pestaña');
  assert.equal(consultas(m), 0, 'y no arranca nada hasta que el jugador pulse nuestra pestaña');
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(enseña(m, V9), true, 'sale la ventana');
  assert.equal(consultas(m), 1, 'y el escaneo arranca');
  assert.notEqual(m.lua('SnetForever.Escaneo.estado()'), 'parado');
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_ESPERANDO')), cabecera(m));
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_ESCANEO_OTRO')), cabecera(m));
  m.avanzar(3);
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo');
  sinErrores(m);
});

test('la cabecera dice «Otro addon…» solo si la subasta no es usable en ese momento (el motivo «otro» solo no basta)', () => {
  const m = maquina({ previo: SUBASTA, escaneo: false });
  m.lua(REPLICA);
  abrir(m);
  m.lua('SnetForever.Escaneo.parar(); SnetForever.Escaneo.motivo = function() return "otro" end');
  // Subasta usable: la cabecera no miente.
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 0)');
  m.avanzar(1);
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_ESCANEO_OTRO')), cabecera(m));
  // Subasta de TSM (con la ventana enseñada a la fuerza para que se repinte): sí.
  m.lua(TSM_PON);
  m.lua(`${V9}:Show(); SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 0)`);
  m.avanzar(1);
  assert.ok(cabecera(m).includes(texto(m, 'COMERCIO_ESCANEO_OTRO')), cabecera(m));
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_ESPERANDO')), cabecera(m));
  sinErrores(m);
});

test('con la vista blizzard guardada, tras «WoW UI» y pulsar nuestra pestaña, el escaneo pendiente arranca', () => {
  const m = maquina({ previo: SUBASTA, escaneo: false });
  m.lua(REPLICA);
  m.lua('SnetForever.Ajustes.set("comercioVista", "blizzard")');
  abrir(m);
  m.lua(TSM_PON);
  m.avanzar(1.5);
  assert.equal(m.lua('SnetForever.Escaneo.motivo()'), 'otro');
  m.lua(TSM_QUITA);
  assert.equal(consultas(m), 0, 'con la vista de Blizzard, «WoW UI» no arranca nada');
  m.lua(`${V9}.pestanaSnet:Click()`); // nuestra pestaña: ponerVista("snet") -> abrir()
  assert.equal(enseña(m, V9), true);
  assert.equal(consultas(m), 1, 'ahora que sale la ventana, el escaneo arranca (una sola vez)');
  assert.ok(!cabecera(m).includes(texto(m, 'COMERCIO_ESCANEO_OTRO')), cabecera(m));
  sinErrores(m);
});

test('la misma situación con la vista guardada «blizzard»: al volver la subasta no arranca nada', () => {
  const m = maquina({ previo: SUBASTA, escaneo: false });
  m.lua(REPLICA);
  m.lua('SnetForever.Ajustes.set("comercioVista", "blizzard")');
  abrir(m);
  m.lua(TSM_PON);
  m.avanzar(1.5);
  assert.equal(m.lua('SnetForever.Escaneo.motivo()'), 'otro');
  m.lua(TSM_QUITA);
  assert.equal(enseña(m, V9), false, 'la ventana no sale');
  assert.equal(consultas(m), 0, 'y no arranca nada');
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'parado');
  sinErrores(m);
});

// Tarea 15b: con nuestra vista, la subasta de Blizzard se esconde (sin Hide) y «Vista de Blizzard» la repone. Desde la
// tarea 15d se esconde sin tocar la escala: alfa 0, fuera de la pantalla y sin ratón. Medidas útiles: bordes de un marco
// en coordenadas absolutas.
const absoluto = (m, f) => m.lua(`{${f}:GetLeft() * ${f}:GetEffectiveScale(), ${f}:GetRight() * ${f}:GetEffectiveScale(), ${f}:GetTop() * ${f}:GetEffectiveScale(), ${f}:GetBottom() * ${f}:GetEffectiveScale()}`);
const puntosDe = (m, f) => m.lua(`(function()
  local r = {}
  for i = 1, ${f}:GetNumPoints() do
    local p, rel, rp, x, y = ${f}:GetPoint(i)
    r[#r + 1] = {p, rel == UIParent and "UIParent" or "otro", rp, x, y}
  end
  return r
end)()`);
const escalaDe = (m) => m.lua(`${AH}:GetScale()`);
const PUNTOS_DEL_JUGADOR = 'AuctionHouseFrame:SetScale(0.8); AuctionHouseFrame:ClearAllPoints(); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 40, -60); AuctionHouseFrame:SetPoint("BOTTOMRIGHT", UIParent, "TOPLEFT", 900, -700); ';
// Ronda de arreglos 1.
// ¿Tiene la subasta nuestro punto fuera de la pantalla (-100000, 100000)? true = lo tiene.
const conPuntoPropio = (m) => puntosDe(m, AH).some((p) => p[3] === -100000 && p[4] === 100000);
// Escondida por nosotros (tarea 15d): alfa 0, nuestro punto fuera de la pantalla y sin ratón.
const escondida = (m) => m.lua(`${AH}:GetAlpha()`) === 0 && conPuntoPropio(m) && m.lua(`${AH}:IsMouseEnabled()`) === false;
// No se ve ni se puede pulsar (15d r2): alfa 0, sin ratón y fuera de la pantalla o a escala 0,001 (ver pulsable).
const oculta = (m) => m.lua(`${AH}:GetAlpha()`) === 0 && m.lua(`${AH}:IsMouseEnabled()`) === false && !pulsable(m);
const enReserva = (m) => m.lua(`${AH}:GetEffectiveScale()`) < 0.01;
// Devuelta como estaba (15d r1): sus puntos, su alfa (1 si no se dice otro), con ratón y sin nuestro punto.
const devuelta = (m, puntos, msg = '', alfa = 1) => {
  assert.deepEqual(puntosDe(m, AH), puntos, `${msg} sus puntos`);
  assert.ok(Math.abs(m.lua(`${AH}:GetAlpha()`) - alfa) < 1e-6, `${msg} su alfa: ${m.lua(`${AH}:GetAlpha()`)}`);
  assert.equal(m.lua(`${AH}:IsMouseEnabled()`), true, `${msg} su ratón`);
  assert.equal(conPuntoPropio(m), false, `${msg} sin nuestro punto`);
};

test('con la vista nuestra, la subasta de Blizzard queda con alfa 0, sin ratón y fuera de la pantalla, sin Hide y con su escala, y sigue abierta', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  m.lua(`HIDES_AH = 0; ${AH}:HookScript("OnHide", function() HIDES_AH = HIDES_AH + 1 end)`);
  abrir(m);
  assert.ok(escondida(m), `alfa ${m.lua(`${AH}:GetAlpha()`)}`);
  assert.equal(escalaDe(m), 1, 'la escala no se toca');
  assert.equal(m.lua('HIDES_AH'), 0, 'nunca Hide(): cerraría la subasta');
  assert.equal(m.lua(`${AH}:IsShown()`), true, 'la subasta sigue abierta');
  const a = absoluto(m, AH);
  assert.ok(a[1] < 0 || a[0] > 1000000 || a[3] > 100000 || a[2] < 0, `fuera de la pantalla: ${a}`);
  assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true, 'para nosotros no es de «otro addon»');
  // Las pestañas que cuelgan de ella se van con ella.
  for (const t of [`${AH}.Tabs[1]`, `${AH}.Tabs[3]`]) {
    const b = absoluto(m, t);
    assert.ok(b[1] < 0 || b[0] > 1000000, `${t} fuera de la pantalla: ${b}`);
    assert.equal(m.lua(`${t}:GetEffectiveAlpha()`), 0, `${t} invisible con ella`);
  }
  // Lo nuestro, a la vista y no colgando de ella.
  assert.equal(m.lua(`${V9}:IsShown()`), true);
  assert.equal(m.lua(`${V9}.pestanaSnet:IsShown()`), true);
  assert.equal(m.lua(`${V9}.pestanaSnet:GetParent() == UIParent`), true, 'la pestaña nuestra no cuelga de la subasta escondida');
  assert.ok(m.lua(`${V9}.pestanaSnet:GetEffectiveScale()`) > 0.5);
  assert.ok(m.lua(`${V9}:GetEffectiveScale()`) > 0.5);
  // Otro PLAYER_ENTERING_WORLD no la guarda otra vez encima: reponer deja lo de antes (si se hubiera guardado otra vez,
  // volvería escondida: alfa 0, sin ratón y con nuestro punto).
  m.disparar('PLAYER_ENTERING_WORLD');
  m.disparar('PLAYER_ENTERING_WORLD');
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(escalaDe(m), 1);
  devuelta(m, [['TOPLEFT', 'UIParent', 'TOPLEFT', 10, -100]], 'tras PLAYER_ENTERING_WORLD:');
  sinErrores(m);
});

test('nuestra ventana ocupa el sitio que tenía la subasta', () => {
  // 800 × 500 a 10 y 100 de la esquina de arriba a la izquierda.
  const m = maquina({ previo: SUBASTA });
  const antes = absoluto(m, AH);
  abrir(m);
  const v = absoluto(m, V9);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(antes[i] - v[i]) < 0.01, `borde ${i}: ${v[i]} frente a ${antes[i]}`);
  assert.equal(m.lua(`${V9}:GetParent() == UIParent`), true);
  assert.ok(Math.abs(v[1] - v[0] - 800) < 0.01 && Math.abs(v[2] - v[3] - 500) < 0.01, `800 × 500 de UIParent: ${v}`);
  assert.ok(m.lua(`${V9}:GetFrameLevel()`) > m.lua(`${AH}:GetFrameLevel()`), 'por encima, con el nivel de la subasta');
  assert.equal(m.lua(`${V9}:IsMouseEnabled()`), true);
  sinErrores(m);
  // Con la interfaz pequeña y la subasta un poco achicada, en pantalla ocupa lo mismo.
  const n = maquina({ previo: SUBASTA });
  n.lua(`UIParent:SetScale(0.9); ${AH}:SetScale(0.97)`);
  const antes2 = absoluto(n, AH);
  abrir(n);
  const v2 = absoluto(n, V9);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(antes2[i] - v2[i]) < 0.01, `con escalas, borde ${i}: ${v2[i]} frente a ${antes2[i]}`);
  sinErrores(n);
  // Bloque B: si la subasta achicada mide menos que el mínimo de la ventana (830 × 500 píxeles reales), la ventana sale con
  // el mínimo, con la esquina de arriba a la izquierda donde la de la subasta.
  const o = maquina({ previo: SUBASTA });
  o.lua(`UIParent:SetScale(0.64); ${AH}:SetScale(0.75)`);
  const antes3 = absoluto(o, AH);
  abrir(o);
  const v3 = absoluto(o, V9);
  assert.ok(Math.abs(antes3[0] - v3[0]) < 0.01 && Math.abs(antes3[2] - v3[2]) < 0.01, `la misma esquina: ${v3} frente a ${antes3}`);
  assert.deepEqual([o.lua('SnetForever.SubastaVentana.sitioActual()').ancho, o.lua('SnetForever.SubastaVentana.sitioActual()').alto], [830, 500]);
  sinErrores(o);
  // Sin medidas válidas (la subasta sin anclajes): centrada y de su tamaño de siempre.
  const s = maquina({ previo: `${SUBASTA}${AH}:ClearAllPoints(); ` });
  abrir(s);
  assert.equal(s.lua(`${V9}:IsShown()`), true);
  assert.deepEqual([s.lua('SnetForever.SubastaVentana.sitioActual()').ancho, s.lua('SnetForever.SubastaVentana.sitioActual()').alto], [860, 545], 'en píxeles reales (bloque B)');
  const c = bordes(s, V9);
  assert.ok(Math.abs((c[0] + c[1]) / 2 - s.lua('UIParent:GetRight()') / 2) < 1, 'centrada a lo ancho');
  assert.ok(Math.abs((c[2] + c[3]) / 2 - s.lua('UIParent:GetTop()') / 2) < 1, 'y a lo alto');
  sinErrores(s);
});

test('Vista de Blizzard repone la escala y todos los puntos que tenía, también si otro addon ya la había movido', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR });
  const puntosAntes = puntosDe(m, AH);
  assert.equal(puntosAntes.length, 2);
  abrir(m);
  assert.ok(escondida(m));
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, `escala repuesta: ${escalaDe(m)}`);
  devuelta(m, puntosAntes, 'los dos puntos, tal cual:');
  assert.equal(m.lua(`${AH}:IsShown()`), true);
  assert.equal(m.lua(`${V9}:IsShown()`), false);
  // Nuestra pestaña, junto a las suyas.
  assert.equal(m.lua(`${V9}.pestanaSnet:IsShown()`), true);
  assert.equal(m.lua(`${V9}.pestanaSnet:GetParent() == ${AH}`), true);
  assert.ok(bordes(m, `${V9}.pestanaSnet`)[0] >= bordes(m, `${AH}.Tabs[3]`)[1], 'a la derecha de la última de Blizzard');
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'blizzard');
  // Pulsar nuestra pestaña: otra vez nuestra vista y otra vez escondida; y vuelta a Blizzard, otra vez repuesta.
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), true);
  assert.ok(escondida(m));
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6);
  devuelta(m, puntosAntes, 'otra vez:');
  // Una pestaña de Blizzard lleva a la vista de Blizzard, con la subasta repuesta.
  m.lua(`${V9}.pestanaSnet:Click()`);
  m.lua(`${AH}.Tabs[2]:Click()`);
  assert.equal(m.lua(`${V9}:IsShown()`), false);
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, 'con la subasta repuesta');
  devuelta(m, puntosAntes, 'con una pestaña de Blizzard:');
  sinErrores(m);
});

test('al cerrar la subasta todo queda como estaba', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR });
  const puntosAntes = puntosDe(m, AH);
  abrir(m);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, 'escala repuesta');
  devuelta(m, puntosAntes, 'al cerrar:');
  assert.equal(m.lua(`${V9}:IsShown()`), false);
  assert.equal(m.lua(`${V9}.pestanaSnet:IsShown()`), false);
  // Nada guardado colgando: lo que cambie con la subasta cerrada es lo que se repone la próxima vez.
  m.lua(`${AH}:SetScale(0.9)`);
  abrir(m);
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(escalaDe(m) - 0.9) < 1e-6, `no repone lo viejo: ${escalaDe(m)}`);
  // Cerrar en la vista de Blizzard no toca nada.
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.ok(Math.abs(escalaDe(m) - 0.9) < 1e-6);
  assert.equal(m.lua(`${V9}.pestanaSnet:IsShown()`), false);
  // Y UIComercio.cerrar() (nuestro cierre): lo mismo.
  m.lua(`${AH}:SetScale(1)`);
  m.lua('SnetForever.Ajustes.set("comercioVista", "snet")');
  abrir(m);
  assert.ok(escondida(m));
  m.lua('SnetForever.UIComercio.cerrar()');
  assert.equal(escalaDe(m), 1);
  devuelta(m, puntosAntes, 'con UIComercio.cerrar():');
  sinErrores(m);
});

test('si otro addon esconde la subasta mientras la tenemos, la soltamos y no la reponemos', () => {
  const m = maquina({ previo: SUBASTA });
  abrir(m);
  assert.ok(escondida(m));
  m.lua(TSM_PON); // TSM actúa sobre la que ya teníamos escondida
  assert.equal(enseña(m, V9), false, 'nuestra ventana se oculta');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false, 'y su pestaña: la subasta es de TSM');
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioVista")'), 'snet', 'la preferencia no cambia');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.ok(escalaDe(m) < 0.01, 'no la reponemos: ahora es de TSM');
  assert.deepEqual(puntosDe(m, AH), [['TOPLEFT', 'UIParent', 'TOPLEFT', 100000, 100000]], 'ni sus puntos');
  // 15d r1: una escala usable de otro addon no nos la quita (la escondemos con el alfa): sigue escondida y al cerrar se
  // devuelve con la escala del otro.
  const n = maquina({ previo: SUBASTA });
  abrir(n);
  n.lua(`${AH}:SetScale(0.5)`);
  assert.equal(enseña(n, V9), true, 'otro addon le cambió la escala: sigue siendo nuestra');
  assert.ok(escondida(n));
  n.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(escalaDe(n), 0.5, 'queda con la escala que le puso el otro');
  devuelta(n, SUBASTA_ORIGINAL, 'al cerrar:');
  const p = maquina({ previo: SUBASTA });
  abrir(p);
  p.lua(`${AH}:SetScale(0.001); ${AH}:ClearAllPoints(); ${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`);
  assert.equal(enseña(p, V9), false, 'otro addon la esconde con su escala y su sitio');
  p.disparar('AUCTION_HOUSE_CLOSED');
  assert.deepEqual(puntosDe(p, AH), [['CENTER', 'UIParent', 'CENTER', 0, 0]], 'sin tocarla: es suya');
  assert.equal(p.lua(`${AH}:GetAlpha()`), 1, 'pero con su alfa');
  assert.equal(p.lua(`${AH}:IsMouseEnabled()`), true, 'y su ratón');
  assert.ok(Math.abs(escalaDe(p) - 0.001) < 1e-6, 'su escala sigue como la tenía');
  // Si al ir a esconderla ya no es usable (otro addon la tiene), no la tocamos.
  const q = maquina({ previo: SUBASTA });
  q.lua(TSM_PON);
  abrir(q);
  assert.ok(escalaDe(q) < 0.01);
  assert.deepEqual(puntosDe(q, AH), [['TOPLEFT', 'UIParent', 'TOPLEFT', 100000, 100000]], 'no se toca');
  assert.equal(enseña(q, V9), false);
  sinErrores(m);
  sinErrores(n);
  sinErrores(p);
  sinErrores(q);
});

test('si otro addon devuelve la subasta, solo sale nuestra pestaña', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua(TSM_PON);
  m.lua(TSM_QUITA); // el «WoW UI» de TSM
  assert.equal(enseña(m, V9), false, 'no sale la ventana');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true, 'solo nuestra pestaña');
  assert.equal(escalaDe(m), 1, 'y la subasta no se vuelve a esconder por nuestra cuenta');
  devuelta(m, [['TOPLEFT', 'UIParent', 'TOPLEFT', 10, -100]], 'devuelta por TSM:');
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'snet', 'la vista guardada no cambia');
  assert.equal(m.lua(`${V9}.pestanaSnet:GetParent() == ${AH}`), true, 'con las de Blizzard');
  // Otros cambios sueltos con la subasta ya repuesta no la esconden.
  m.lua(`${AH}:SetScale(1)`);
  assert.equal(escalaDe(m), 1);
  assert.equal(enseña(m, V9), false);
  // El jugador pulsa nuestra pestaña: ahora sí nuestra ventana y la subasta escondida.
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(enseña(m, V9), true);
  assert.ok(escondida(m));
  // Al abrir la subasta de nuevo manda la vista guardada.
  m.lua(TSM_PON);
  m.lua(TSM_QUITA);
  assert.equal(enseña(m, V9), false);
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  assert.equal(enseña(m, V9), true, 'vista guardada: snet');
  assert.ok(escondida(m));
  sinErrores(m);
});

test('en combate, esconderla espera a salir; devolverla («Vista de Blizzard» y cerrar) es enseguida (15d r1)', () => {
  const m = maquina({ previo: SUBASTA_TABS + `${AH}:EnableMouse(true); ` });
  m.lua('ALFAS = 0; hooksecurefunc(AuctionHouseFrame, "SetAlpha", function() ALFAS = ALFAS + 1 end)');
  const puntosAntes = puntosDe(m, AH);
  m.lua('BANCO.jugador.enCombate = true');
  abrir(m);
  assert.equal(enseña(m, V9), true, 'lo nuestro sale ya');
  assert.equal(m.lua(`${AH}:GetAlpha()`), 1, 'la subasta no se toca en combate');
  assert.equal(m.lua(`${AH}:IsMouseEnabled()`), true);
  assert.deepEqual(puntosDe(m, AH), puntosAntes);
  assert.equal(m.lua('ALFAS'), 0);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.ok(escondida(m), 'al salir de combate se esconde');
  assert.equal(enseña(m, V9), true);
  // Ahora al revés: Vista de Blizzard en combate oculta lo nuestro y devuelve la subasta enseguida (no está protegida):
  // nunca espera invisible a que acabe el combate.
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(enseña(m, V9), false, 'lo nuestro, ya');
  devuelta(m, puntosAntes, 'en combate, enseguida:');
  // Esconderla otra vez en combate espera; solo cuenta el último estado pedido: nuestra vista, Blizzard, y otra vez la
  // nuestra.
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(m.lua(`${AH}:GetAlpha()`), 1, 'esconderla espera a salir');
  m.lua(`${V9}.verBlizzard:Click()`);
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(enseña(m, V9), true);
  m.lua('ALFAS = 0');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.ok(escondida(m), 'último estado pedido: escondida');
  assert.equal(m.lua('ALFAS'), 1, 'sin vaivenes: escondida una sola vez');
  // Y repuesta si el último estado fue Blizzard.
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${V9}.pestanaSnet:Click()`);
  m.lua(`${V9}.verBlizzard:Click()`);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(escalaDe(m), 1);
  devuelta(m, puntosAntes, 'último estado Blizzard:');
  // Cerrar la subasta en combate: se devuelve enseguida.
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.ok(escondida(m));
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(escalaDe(m), 1);
  devuelta(m, puntosAntes, 'cerrar en combate:');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  devuelta(m, puntosAntes, 'tras el combate:');
  sinErrores(m);
});

test('un fallo al tocar la subasta no escapa ni deja la subasta rota', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  m.lua(`local o = AuctionHouseFrame.SetAlpha
    rawset(_G, "SNF_FALLA", true)
    rawset(AuctionHouseFrame, "SetAlpha", function(self, ...) if SNF_FALLA then error("no se puede") end return o(self, ...) end)`);
  m.lua(`${AH}:EnableMouse(true)`);
  abrir(m);
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true, 'el comercio sigue en marcha');
  assert.equal(enseña(m, V9), true);
  assert.equal(escalaDe(m), 1);
  assert.equal(m.lua(`${AH}:GetAlpha()`), 1);
  assert.equal(m.lua(`${AH}:IsMouseEnabled()`), true, 'a medias: se deja como estaba, con su ratón');
  assert.deepEqual(puntosDe(m, AH), [['TOPLEFT', 'UIParent', 'TOPLEFT', 10, -100]], 'y en su sitio');
  m.lua('SNF_FALLA = false');
  m.disparar('AUCTION_HOUSE_CLOSED');
  devuelta(m, [['TOPLEFT', 'UIParent', 'TOPLEFT', 10, -100]], 'al cerrar:');
  sinErrores(m);
});

// Ronda de arreglos 1 de la tarea 15b.
const SUBASTA_ORIGINAL = [['TOPLEFT', 'UIParent', 'TOPLEFT', 10, -100]];
const TSM_PUNTOS = [['TOPLEFT', 'UIParent', 'TOPLEFT', 100000, 100000]];

test('otro addon recoloca (ClearAllPoints + SetPoint): seguimos dueños, la ventana sigue y la subasta nunca queda a la vista ni pulsable', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  assert.ok(escondida(m));
  // Fuera de la pantalla (como el (100000, 100000) de TSM) o sin anclajes: un fotograma después vuelve nuestro punto.
  m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100000, 100000)`);
  assert.ok(oculta(m), 'fuera de la pantalla: no se ve ni se pulsa');
  m.avanzar(0.05);
  assert.ok(escondida(m));
  assert.deepEqual(puntosDe(m, AH), [['TOPLEFT', 'UIParent', 'TOPLEFT', -100000, 100000]], 'nuestro punto otra vez');
  // Como el gestor de paneles de Blizzard, en pantalla: el escondido de reserva en el acto (15d r2), sin un fotograma a
  // la vista ni pulsable.
  m.lua(`${AH}:ClearAllPoints()`);
  m.lua(`${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`);
  assert.equal(enseña(m, V9), true, 'nuestra ventana sigue');
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
  assert.ok(oculta(m), 'en el acto');
  assert.ok(enReserva(m));
  // Con dos puntos nuevos, igual.
  m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 5, -5); ${AH}:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -5, 5)`);
  assert.ok(oculta(m));
  m.avanzar(0.05);
  assert.ok(oculta(m));
  // Y seguimos pudiendo reponerla como estaba al volver a la vista de Blizzard.
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'Vista de Blizzard:');
  sinErrores(m);
});

test('otro addon recoloca en combate: nunca queda a la vista ni pulsable, también en combate, y al cerrar se repone lo de antes', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`);
  assert.equal(enseña(m, V9), true);
  // 15d r1 y r2: en pantalla con alfa 0 se podría pulsar sin verla: no se espera a salir del combate (AuctionHouseFrame no
  // está protegida; TSM también la mueve en combate). Escondido de reserva en el acto.
  assert.ok(oculta(m), 'en combate, en el acto');
  m.avanzar(0.05);
  assert.ok(oculta(m));
  // Cerrar la subasta en combate con otro recolocado por medio: se repone enseguida (seguimos siendo dueños).
  m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'al cerrar en combate:');
  m.avanzar(0.05);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  devuelta(m, SUBASTA_ORIGINAL, 'tras el combate:');
  sinErrores(m);
});

test('15d r1: otro addon pone SetScale(1) a la subasta que tenemos escondida: no nos la quita, sigue escondida, y al devolverla queda con esa escala', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR });
  const puntosAntes = puntosDe(m, AH);
  abrir(m);
  m.lua(`${AH}:SetScale(1)`);
  assert.equal(escalaDe(m), 1, 'la escala es la del otro');
  assert.ok(escondida(m), 'sigue escondida');
  assert.equal(enseña(m, V9), true, 'la ventana sigue');
  m.avanzar(0.05);
  assert.ok(escondida(m));
  assert.equal(enseña(m, V9), true);
  // Al devolverla, sus puntos, su alfa y su ratón; la escala, la que le puso el otro.
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(escalaDe(m), 1);
  devuelta(m, puntosAntes, 'al cerrar:');
  sinErrores(m);
  // Igual en combate.
  const n = maquina({ previo: SUBASTA_TABS });
  abrir(n);
  n.lua('BANCO.jugador.enCombate = true');
  n.lua(`${AH}:SetScale(1)`);
  n.avanzar(0.05);
  assert.ok(escondida(n));
  n.lua('BANCO.jugador.enCombate = false');
  n.disparar('PLAYER_REGEN_ENABLED');
  assert.ok(escondida(n));
  assert.equal(enseña(n, V9), true);
  // Un SetScale(0,001) sí nos la quita: es de ese addon.
  n.lua(`${AH}:SetScale(0.001)`);
  assert.equal(enseña(n, V9), false);
  assert.equal(n.lua(`${AH}:GetAlpha()`), 1, 'con su alfa');
  assert.equal(n.lua(`${AH}:IsMouseEnabled()`), true, 'y su ratón');
  sinErrores(n);
});

test('otro addon pone SetScale(0,001) y sus puntos: la soltamos sin tocarla', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua('SCALES = 0; hooksecurefunc(AuctionHouseFrame, "SetScale", function() SCALES = SCALES + 1 end); PUNTOS = 0; hooksecurefunc(AuctionHouseFrame, "SetPoint", function() PUNTOS = PUNTOS + 1 end)');
  m.lua(TSM_PON);
  m.avanzar(0.05); // tampoco un fotograma después
  assert.equal(m.lua('SCALES'), 1, 'solo la llamada de TSM');
  assert.equal(m.lua('PUNTOS'), 1, 'solo la de TSM: no nos metemos');
  assert.deepEqual(puntosDe(m, AH), TSM_PUNTOS);
  assert.equal(enseña(m, V9), false);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.deepEqual(puntosDe(m, AH), TSM_PUNTOS, 'cerrar tampoco la toca');
  assert.equal(m.lua('SCALES'), 1);
  sinErrores(m);
});

test('TSM escondiendo en el mismo AUCTION_HOUSE_SHOW: no la tocamos y no hay doble escondido', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  m.lua('SCALES = 0; hooksecurefunc(AuctionHouseFrame, "SetScale", function() SCALES = SCALES + 1 end)');
  m.lua('ALFAS = 0; hooksecurefunc(AuctionHouseFrame, "SetAlpha", function() ALFAS = ALFAS + 1 end)');
  abrirSinEsperar(m);
  assert.equal(m.lua(`${AH}:GetAlpha()`), 0, 'no se ve ni un fotograma (15d r1: nada de destellos)');
  assert.deepEqual(puntosDe(m, AH), SUBASTA_ORIGINAL, 'pero de momento no se mueve: un fotograma después');
  m.lua(TSM_PON); // TSM, que carga después, esconde en el mismo aviso
  m.avanzar(0.05);
  assert.equal(m.lua('SCALES'), 1, 'solo la de TSM');
  assert.equal(m.lua(`${AH}:GetAlpha()`), 1, 'es de TSM: se le devuelve el alfa');
  assert.equal(m.lua('ALFAS'), 2, 'alfa 0 al abrir y devuelto, nada más');
  assert.deepEqual(puntosDe(m, AH), TSM_PUNTOS);
  assert.equal(enseña(m, V9), false);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), false);
  // Su «WoW UI» devuelve la subasta como era: no queda nada nuestro en ella.
  m.lua(TSM_QUITA);
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'su «WoW UI»:');
  assert.equal(enseña(m, V9), false);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true, 'solo la pestaña');
  // Sin TSM: un fotograma después sí se esconde, y una sola vez.
  const n = maquina({ previo: SUBASTA_TABS });
  n.lua('SCALES = 0; hooksecurefunc(AuctionHouseFrame, "SetScale", function() SCALES = SCALES + 1 end)');
  n.lua('ALFAS = 0; hooksecurefunc(AuctionHouseFrame, "SetAlpha", function() ALFAS = ALFAS + 1 end)');
  abrirSinEsperar(n);
  assert.equal(n.lua(`${AH}:GetAlpha()`), 0, 'invisible ya');
  assert.equal(conPuntoPropio(n), false, 'aún sin mover');
  n.avanzar(0.05);
  assert.ok(escondida(n));
  assert.equal(n.lua('ALFAS'), 1, 'una sola vez');
  assert.equal(n.lua('SCALES'), 0, 'sin tocar la escala');
  // Pulsar nuestra pestaña es sin retraso.
  n.lua(`${V9}.verBlizzard:Click()`);
  devuelta(n, SUBASTA_ORIGINAL, 'Vista de Blizzard:');
  n.lua(`${V9}.pestanaSnet:Click()`);
  assert.ok(escondida(n), 'al instante');
  sinErrores(m);
  sinErrores(n);
});

test('tras cualquier cambio ajeno y cerrar, la subasta nunca queda invisible, sin ratón ni con nuestro punto', () => {
  // suelta = otro addon se la queda (escala diminuta); si no, seguimos dueños y sigue escondida hasta cerrar (15d r1).
  const casos = {
    'SetScale(1)': [`${AH}:SetScale(1)`, false],
    'SetScale(0.5)': [`${AH}:SetScale(0.5)`, false],
    'SetScale(0.3) y recolocar': [`${AH}:SetScale(0.3); ${AH}:ClearAllPoints(); ${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`, false],
    'TSM esconde': [TSM_PON, true],
    'TSM esconde con su pestaña': [TSM_PESTANA, true],
    'TSM esconde y devuelve': [`${TSM_PON}; ${TSM_QUITA}`, true],
  };
  for (const [nombre, [accion, suelta]] of Object.entries(casos)) {
    const m = maquina({ previo: SUBASTA_TABS });
    abrir(m);
    m.lua(accion);
    m.avanzar(0.05);
    const devueltos = (cuando) => {
      assert.equal(m.lua(`${AH}:GetAlpha()`), 1, `${nombre}: ${cuando}nuestro alfa`);
      assert.equal(m.lua(`${AH}:IsMouseEnabled()`), true, `${nombre}: ${cuando}sin ratón`);
      assert.equal(conPuntoPropio(m), false, `${nombre}: ${cuando}nuestro punto fuera de la pantalla`);
    };
    if (suelta) devueltos('');
    else {
      assert.ok(oculta(m), `${nombre}: sigue escondida por nosotros (sin verse ni poderse pulsar)`);
      assert.equal(enseña(m, V9), true, `${nombre}: y nuestra ventana`);
    }
    m.disparar('AUCTION_HOUSE_CLOSED');
    devueltos('tras cerrar, ');
    sinErrores(m);
  }
});

// Ronda de arreglos 2.
test('otro addon esconde la subasta con solo SetScale(0,001) y la devuelve con solo SetScale(1): acaba usable y en sus puntos de antes', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR });
  const puntosAntes = puntosDe(m, AH);
  abrir(m);
  m.lua(`${AH}:SetScale(0.001)`); // la esconde otro addon: es suya, no se toca
  assert.equal(enseña(m, V9), false);
  m.lua(`${AH}:SetScale(1)`); // y la devuelve sin tocar los puntos
  assert.equal(escalaDe(m), 1);
  devuelta(m, puntosAntes, 'en sus puntos de antes:');
  assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true, 'solo la pestaña');
  assert.equal(enseña(m, V9), false);
  // Si el otro addon pone sus propios puntos, no se toca nada.
  const n = maquina({ previo: SUBASTA_TABS });
  abrir(n);
  n.lua(`${AH}:SetScale(0.001); ${AH}:ClearAllPoints(); ${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`);
  n.lua(`${AH}:SetScale(1)`);
  assert.deepEqual(puntosDe(n, AH), [['CENTER', 'UIParent', 'CENTER', 0, 0]], 'los suyos, sin tocar');
  // Con sus propios puntos puestos tras cerrar, tampoco se repone lo viejo.
  const o = maquina({ previo: SUBASTA_TABS });
  abrir(o);
  o.lua(`${AH}:SetScale(0.001)`);
  o.disparar('AUCTION_HOUSE_CLOSED');
  o.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`);
  o.lua(`${AH}:SetScale(1)`);
  assert.deepEqual(puntosDe(o, AH), [['CENTER', 'UIParent', 'CENTER', 0, 0]]);
  sinErrores(m);
  sinErrores(n);
  sinErrores(o);
});

// Ronda de arreglos 3.
test('otro addon esconde con SetScale(0,001) sin puntos, se cierra y se vuelve a abrir la subasta, y la devuelve con SetScale(1): usable y en sus puntos de antes', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR });
  const puntosAntes = puntosDe(m, AH);
  abrir(m);
  m.lua(`${AH}:SetScale(0.001)`);
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  assert.equal(enseña(m, V9), false, 'abrir con la subasta de otro addon no enseña nada');
  m.lua(`${AH}:SetScale(1)`);
  assert.equal(escalaDe(m), 1);
  devuelta(m, puntosAntes, 'tras cerrar y abrir:');
  assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true);
  assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
  sinErrores(m);
});

// Tarea 15c, fallo 1: al devolver la subasta de Blizzard (como hace TSM) se vuelve a la pantalla de Comprar con
// SetDisplayMode, después de poner la escala y los puntos; así el skin que pinta la lista vuelve a medir.
const MODOS = 'rawset(_G, "AuctionHouseFrameDisplayMode", {Buy = 1, Sell = 2}); ';
// El falso apunta cada llamada con la escala y los puntos de ese momento.
const CON_MODO = `${MODOS}rawset(_G, "LLAMADAS_MODO", {})
  rawset(AuctionHouseFrame, "SetDisplayMode", function(self, modo)
    local punto, _, _, x, y = self:GetPoint(1)
    LLAMADAS_MODO[#LLAMADAS_MODO + 1] = {modo = modo, escala = self:GetScale(), alfa = self:GetAlpha(), x = x, y = y}
  end) `;
const llamadasModo = (m) => m.lua('LLAMADAS_MODO');

test('15c: de nuestra vista a «Vista de Blizzard» se llama una vez a SetDisplayMode con Buy, con la escala y el sitio ya repuestos', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR + CON_MODO });
  abrir(m);
  assert.ok(escondida(m));
  assert.equal(llamadasModo(m).length, 0, 'escondida: aún no');
  m.lua(`${V9}.verBlizzard:Click()`);
  const l = llamadasModo(m);
  assert.equal(l.length, 1, 'una sola vez');
  assert.equal(l[0].modo, 1, 'a Comprar');
  assert.ok(Math.abs(l[0].escala - 0.8) < 1e-6, `con la escala de antes: ${l[0].escala}`);
  assert.equal(l[0].x, 40, 'y su punto de antes');
  assert.equal(l[0].y, -60);
  assert.equal(l[0].alfa, 1, 'y su alfa de antes (15d)');
  devuelta(m, [['TOPLEFT', 'UIParent', 'TOPLEFT', 40, -60], ['BOTTOMRIGHT', 'UIParent', 'TOPLEFT', 900, -700]], 'repuesta:');
  // Ida y vuelta otra vez: otra llamada.
  m.lua(`${V9}.pestanaSnet:Click()`);
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(llamadasModo(m).length, 2);
  sinErrores(m);
});

test('15c: cerrar la subasta con nuestra vista también la devuelve a Comprar', () => {
  const m = maquina({ previo: SUBASTA_TABS + CON_MODO });
  abrir(m);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'al cerrar:');
  assert.equal(llamadasModo(m).length, 1);
  sinErrores(m);
});

test('15c: en combate no se llama; al salir del combate, sí (una vez, ya repuesta)', () => {
  const m = maquina({ previo: SUBASTA_TABS + CON_MODO });
  abrir(m);
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(llamadasModo(m).length, 0, 'en combate, nada');
  devuelta(m, SUBASTA_ORIGINAL, 'la subasta vuelve enseguida (15d r1):');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  const l = llamadasModo(m);
  assert.equal(l.length, 1);
  assert.equal(l[0].escala, 1, 'después de la escala');
  assert.equal(l[0].alfa, 1, 'y del alfa');
  assert.equal(l[0].x, 10, 'y de los puntos');
  sinErrores(m);
});

test('15c: abrir con la vista de Blizzard sin haberla escondido nunca no la llama', () => {
  const m = maquina({ previo: SUBASTA_TABS + CON_MODO });
  m.lua('SnetForever.Ajustes.set("comercioVista", "blizzard")');
  abrir(m);
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrir(m);
  assert.equal(llamadasModo(m).length, 0);
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'sin esconderla nunca:');
  sinErrores(m);
});

test('15c: si otro addon la esconde con escala diminuta (y no la devuelve), no se llama', () => {
  const m = maquina({ previo: SUBASTA + CON_MODO });
  abrir(m);
  m.lua(TSM_PON);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(llamadasModo(m).length, 0);
  const q = maquina({ previo: SUBASTA + CON_MODO });
  q.lua(TSM_PON); // ya era de otro al abrir
  abrir(q);
  q.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(llamadasModo(q).length, 0);
  sinErrores(m);
  sinErrores(q);
});

test('15c: si otro addon pone una escala usable a la subasta que teníamos, no se llama (sigue escondida, 15d r1); al devolverla nosotros, una vez', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR + CON_MODO });
  abrir(m);
  m.lua(`${AH}:SetScale(1)`);
  m.avanzar(0.05);
  assert.equal(llamadasModo(m).length, 0);
  m.lua(`${V9}.verBlizzard:Click()`);
  const l = llamadasModo(m);
  assert.equal(l.length, 1);
  assert.equal(l[0].modo, 1);
  assert.equal(l[0].x, 40, 'ya con sus puntos');
  sinErrores(m);
});

test('15c: sin SetDisplayMode o sin AuctionHouseFrameDisplayMode.Buy no hay error y la subasta se repone igual', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR });
  abrir(m);
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6);
  devuelta(m, [['TOPLEFT', 'UIParent', 'TOPLEFT', 40, -60], ['BOTTOMRIGHT', 'UIParent', 'TOPLEFT', 900, -700]], 'sin SetDisplayMode:');
  const n = maquina({ previo: SUBASTA_TABS + CON_MODO + 'AuctionHouseFrameDisplayMode = {}; ' });
  abrir(n);
  n.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(escalaDe(n), 1);
  devuelta(n, SUBASTA_ORIGINAL, 'sin Buy:');
  assert.equal(llamadasModo(n).length, 0, 'sin Buy no se llama');
  // Si SetDisplayMode falla, tampoco escapa.
  const p = maquina({ previo: SUBASTA_TABS + MODOS + 'rawset(AuctionHouseFrame, "SetDisplayMode", function() error("falla") end); ' });
  abrir(p);
  p.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(escalaDe(p), 1);
  devuelta(p, SUBASTA_ORIGINAL, 'SetDisplayMode que falla:');
  assert.equal(p.lua('SnetForever.Comercio.activo()'), true);
  sinErrores(m);
  sinErrores(n);
  sinErrores(p);
});

test('15c: lo que haga SetDisplayMode con la escala o los puntos no se toma por cambio ajeno', () => {
  const m = maquina({ previo: SUBASTA_TABS + MODOS + `rawset(AuctionHouseFrame, "SetDisplayMode", function(self)
    self:SetScale(self:GetScale()); self:ClearAllPoints(); self:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100) end); ` });
  abrir(m);
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'repuesta:');
  assert.equal(enseña(m, V9), false);
  m.avanzar(0.05);
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(enseña(m, V9), true, 'la subasta sigue siendo nuestra: se vuelve a esconder');
  assert.ok(escondida(m));
  sinErrores(m);
});

// Tarea 15c, fallo 2: nuestra pestaña es la última de la fila de abajo, también detrás de las que crea LibAHTab (nietas de la
// subasta: botones con la plantilla de Blizzard colgados de un marco raíz hijo de la subasta, encadenados entre sí).
const LIBAH = `rawset(_G, "RESIZADAS", {}); rawset(_G, "DESELECCIONADAS", {})
  rawset(_G, "PanelTemplates_TabResize", function(t) RESIZADAS[#RESIZADAS + 1] = t end)
  rawset(_G, "PanelTemplates_DeselectTab", function(t) DESELECCIONADAS[#DESELECCIONADAS + 1] = t end)
  local rz = CreateFrame("Frame", nil, AuctionHouseFrame)
  rz:SetSize(1, 1)
  rz:SetPoint("TOPLEFT", AuctionHouseFrame.Tabs[3], "TOPRIGHT")
  rawset(_G, "LIB_RAIZ", rz)
  AuctionHouseFrame.Lib = {}
  rawset(_G, "LIB_NUEVA", function()
    local ant = AuctionHouseFrame.Lib[#AuctionHouseFrame.Lib]
    local t = CreateFrame("Button", nil, LIB_RAIZ, "AuctionHouseFrameDisplayModeTabTemplate")
    t:SetSize(100, 32)
    if ant then t:SetPoint("TOPLEFT", ant, "TOPRIGHT", 3, 0) else t:SetPoint("TOPLEFT", LIB_RAIZ, "TOPLEFT", 3, 0) end
    AuctionHouseFrame.Lib[#AuctionHouseFrame.Lib + 1] = t
    PanelTemplates_TabResize(t)
    return t
  end)
  LIB_NUEVA(); LIB_NUEVA() `;
const TODAS_LIB = [1, 2, 3].map((i) => `${AH}.Tabs[${i}]`).concat([1, 2].map((i) => `${AH}.Lib[${i}]`));
const PESTANA = `${V9}.pestanaSnet`;
const detrasDe = (m, f) => m.lua(`select(2, ${PESTANA}:GetPoint(1)) == ${f}`);
const estaEn = (m, lista) => m.lua(`(function() for _, t in ipairs(${lista}) do if t == ${PESTANA} then return true end end return false end)()`);

test('15c: con pestañas de LibAHTab (nietas de la subasta) la nuestra se ancla a la derecha de la última de ellas y no pisa ninguna', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(detrasDe(m, `${AH}.Lib[2]`), true, 'anclada a la segunda de la librería');
  assert.equal(m.lua(`${PESTANA}:GetParent() == ${AH}`), true, 'hija de la subasta con su vista');
  const n = bordes(m, PESTANA);
  for (const f of TODAS_LIB) assert.ok(n[0] >= bordes(m, f)[1], `no pisa ${f}: ${n[0]} frente a ${bordes(m, f)[1]}`);
  assert.equal(m.lua(`${PESTANA}:IsShown()`), true);
  sinErrores(m);
});

test('15c: nuestra pestaña no se mete en AuctionHouseFrame.Tabs ni en las de la librería, y su OnClick es el nuestro', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(m.lua(`#${AH}.Tabs`), 3);
  assert.equal(m.lua(`#${AH}.Lib`), 2);
  m.lua(`${PESTANA}:Click()`);
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'snet');
  assert.equal(enseña(m, V9), true);
  sinErrores(m);
});

test('15c: con la vista de Blizzard la pestaña se ajusta y se deselecciona como las de la fila', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  m.lua('RESIZADAS = {}; DESELECCIONADAS = {}');
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(estaEn(m, 'RESIZADAS'), true, 'TabResize');
  assert.equal(estaEn(m, 'DESELECCIONADAS'), true, 'DeselectTab');
  sinErrores(m);
});

test('15c: la pestaña lleva el estrato y el nivel de las de la subasta (las de la librería si son las últimas)', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(m.lua(`${PESTANA}:GetFrameStrata()`), m.lua(`${AH}.Tabs[3]:GetFrameStrata()`));
  assert.equal(m.lua(`${PESTANA}:GetFrameLevel()`), m.lua(`${AH}.Tabs[3]:GetFrameLevel()`));
  const n = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(n);
  n.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.equal(n.lua(`${PESTANA}:GetFrameStrata()`), n.lua(`${AH}.Lib[2]:GetFrameStrata()`));
  assert.equal(n.lua(`${PESTANA}:GetFrameLevel()`), n.lua(`${AH}.Lib[2]:GetFrameLevel()`));
  assert.ok(n.lua(`${PESTANA}:GetFrameLevel()`) < n.lua(`${V9}:GetFrameLevel()`), 'no el de nuestra ventana');
  sinErrores(m);
  sinErrores(n);
});

test('15c: con nuestra vista la pestaña sigue bajo nuestra ventana, con su estrato y su nivel', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  assert.equal(m.lua(`${PESTANA}:GetParent() == UIParent`), true);
  assert.equal(detrasDe(m, V9), true, 'anclada a nuestra ventana');
  assert.equal(m.lua(`${PESTANA}:GetFrameStrata()`), m.lua(`${V9}:GetFrameStrata()`));
  assert.equal(m.lua(`${PESTANA}:GetFrameLevel()`), m.lua(`${V9}:GetFrameLevel()`));
  sinErrores(m);
});

test('15c: otro addon añade su pestaña después y llama a PanelTemplates_TabResize: la nuestra pasa detrás en el fotograma siguiente, una sola vez', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  m.avanzar(1);
  m.lua(`PUESTAS = 0; hooksecurefunc(${PESTANA}, "SetPoint", function() PUESTAS = PUESTAS + 1 end)`);
  m.lua('LIB_NUEVA(); PanelTemplates_TabResize(AuctionHouseFrame.Lib[3]); PanelTemplates_TabResize(AuctionHouseFrame.Lib[3])');
  assert.equal(detrasDe(m, `${AH}.Lib[2]`), true, 'aún no: espera un fotograma');
  m.avanzar(0.05);
  assert.equal(detrasDe(m, `${AH}.Lib[3]`), true, 'detrás de la nueva');
  assert.equal(m.lua('PUESTAS'), 1, 'varios avisos seguidos, una sola recolocación');
  assert.ok(bordes(m, PESTANA)[0] >= bordes(m, `${AH}.Lib[3]`)[1]);
  sinErrores(m);
});

test('15c: al enseñarse la subasta la pestaña se recoloca un fotograma después; fuera de la subasta abierta no se hace nada', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  m.avanzar(1);
  m.lua(`${PESTANA}:ClearAllPoints(); ${PESTANA}:SetPoint("TOPLEFT", ${AH}, "BOTTOMLEFT", 0, 0)`);
  m.lua(`${AH}:Hide(); ${AH}:Show()`);
  m.avanzar(0.05);
  assert.equal(detrasDe(m, `${AH}.Lib[2]`), true);
  // Con la subasta cerrada, ni TabResize ni OnShow tocan nuestra pestaña.
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.avanzar(1);
  m.lua(`PUESTAS = 0; hooksecurefunc(${PESTANA}, "SetPoint", function() PUESTAS = PUESTAS + 1 end)`);
  m.lua('LIB_NUEVA(); PanelTemplates_TabResize(AuctionHouseFrame.Lib[3]); AuctionHouseFrame:Hide(); AuctionHouseFrame:Show()');
  m.avanzar(1);
  assert.equal(m.lua('PUESTAS'), 0);
  sinErrores(m);
});

test('15c: no se ancla nunca a un marco anclado, directa o indirectamente, a nuestra pestaña', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  // Un botón ajeno colgado de la nuestra (y otro colgado de ese), más a la derecha que todas.
  m.lua(`local a = CreateFrame("Button", nil, AuctionHouseFrame)
    a:SetSize(100, 32); a:SetPoint("TOPLEFT", ${PESTANA}, "TOPRIGHT", 0, 0)
    local b = CreateFrame("Button", nil, AuctionHouseFrame)
    b:SetSize(100, 32); b:SetPoint("TOPLEFT", a, "TOPRIGHT", 0, 0)
    AuctionHouseFrame.Colgadas = {a, b}`);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  m.avanzar(1);
  assert.equal(detrasDe(m, `${AH}.Lib[2]`), true, 'se ancla a la librería, no a las colgadas');
  sinErrores(m);
});

// Tarea 15c, ronda 1.
// Una cadena de botones (hijos de la subasta, con sangrías de clic 5,5) detrás de las de Blizzard, cada uno anclado al anterior
// con el desplazamiento x dado (en Forever, LibAHTab usa -14).
const cadena = (x) => `AuctionHouseFrame.Cad = {}
  local ant = AuctionHouseFrame.Tabs[3]
  for i = 1, 2 do
    local t = CreateFrame("Button", nil, AuctionHouseFrame)
    t:SetSize(100, 32)
    t:SetHitRectInsets(5.5, 5.5, 0, 0)
    t:SetPoint("TOPLEFT", ant, "TOPRIGHT", ${x}, 0)
    AuctionHouseFrame.Cad[i] = t
    ant = t
  end `;
const puntoDe = (m, f) => m.lua(`(function() local p, r, rp, x, y = ${f}:GetPoint(1); return {p, rp, x, y} end)()`);

test('15c r1: el hueco de la pestaña se copia del desplazamiento x de la última respecto a la anterior (-14 y 3)', () => {
  for (const x of [-14, 3, 0, -7]) {
    const m = maquina({ previo: SUBASTA_TABS + cadena(x) });
    abrir(m);
    m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
    assert.equal(m.lua(`select(2, ${PESTANA}:GetPoint(1)) == ${AH}.Cad[2]`), true, `x ${x}: detrás de la última`);
    assert.deepEqual(puntoDe(m, PESTANA), ['TOPLEFT', 'TOPRIGHT', x, 0], `x ${x}`);
    sinErrores(m);
  }
});

test('15c r1: sin poder medir el hueco, -14 con la plantilla y 4 con el botón plano de reserva', () => {
  // Una sola pestaña, anclada a la subasta (no a otra pestaña): no hay hueco que copiar.
  const una = `local t = CreateFrame("Button", nil, AuctionHouseFrame)
    t:SetSize(100, 32); t:SetPoint("TOPLEFT", AuctionHouseFrame, "BOTTOMLEFT", 20, 2)
    AuctionHouseFrame.Tabs[1] = t `;
  const m = maquina({ previo: SUBASTA + una });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.deepEqual(puntoDe(m, PESTANA), ['TOPLEFT', 'TOPRIGHT', -14, 0], 'con plantilla');
  sinErrores(m);
  // Sin plantilla en el cliente: el botón plano.
  const sin = `local crear = CreateFrame
    rawset(_G, "CreateFrame", function(tipo, nombre, padre, plantilla)
      if plantilla == "AuctionHouseFrameDisplayModeTabTemplate" then error("sin plantilla") end
      return crear(tipo, nombre, padre, plantilla)
    end) `;
  const n = maquina({ previo: SUBASTA + una + sin });
  abrir(n);
  n.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.deepEqual(puntoDe(n, PESTANA), ['TOPLEFT', 'TOPRIGHT', 4, 0], 'botón plano');
  sinErrores(n);
});

test('15c r1: la pestaña lleva las mismas sangrías de clic que la última (5,5 por defecto con plantilla) y con nuestra vista, ninguna', () => {
  const m = maquina({ previo: SUBASTA_TABS + cadena(-14) });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.deepEqual(m.lua(`{${PESTANA}:GetHitRectInsets()}`), [5.5, 5.5, 0, 0]);
  // Las de la última son otras: se copian.
  m.lua(`${AH}.Cad[2]:SetHitRectInsets(2, 3, 0, 0)`);
  m.lua('SnetForever.UIComercio.ponerVista("snet"); SnetForever.UIComercio.ponerVista("blizzard")');
  assert.deepEqual(m.lua(`{${PESTANA}:GetHitRectInsets()}`), [2, 3, 0, 0]);
  // La zona de clic no pisa la de la última con el hueco de -14 y sangrías de 5,5.
  const n = maquina({ previo: SUBASTA_TABS + cadena(-14) });
  abrir(n);
  n.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.ok(zona(n, PESTANA)[0] >= zona(n, `${AH}.Cad[2]`)[1] - 3.001, 'las zonas, a unos 3 px, como las de la librería');
  // Sin poder leerlas (la última no sabe decirlas), 5,5 con plantilla.
  const sinLeer = maquina({ previo: SUBASTA_TABS + cadena(-14) + 'rawset(AuctionHouseFrame.Cad[2], "GetHitRectInsets", function() error("no") end); ' });
  abrir(sinLeer);
  sinLeer.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  assert.deepEqual(sinLeer.lua(`{${PESTANA}:GetHitRectInsets()}`), [5.5, 5.5, 0, 0]);
  // Con nuestra vista, la pestaña es la de siempre: sin sangrías.
  m.lua('SnetForever.UIComercio.ponerVista("snet")');
  assert.deepEqual(m.lua(`{${PESTANA}:GetHitRectInsets()}`), [0, 0, 0, 0]);
  sinErrores(m);
  sinErrores(n);
  sinErrores(sinLeer);
});

test('15c r1: el botón de la pestaña tiene nombre global único', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  assert.equal(m.lua(`SnetForeverPestanaSubasta == ${PESTANA}`), true);
  assert.equal(m.lua(`${PESTANA}:GetName()`), 'SnetForeverPestanaSubasta');
  sinErrores(m);
});

test('15c r1: TabResize solo recoloca si la pestaña ajustada cuelga de la subasta (hija, nieta o de Tabs)', () => {
  const m = maquina({ previo: SUBASTA_TABS + LIBAH });
  abrir(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  m.avanzar(1);
  m.lua(`PUESTAS = 0; hooksecurefunc(${PESTANA}, "SetPoint", function() PUESTAS = PUESTAS + 1 end)`);
  // Ajena: una pestaña de otra ventana.
  m.lua('local x = CreateFrame("Button", nil, UIParent); PanelTemplates_TabResize(x)');
  m.avanzar(0.05);
  assert.equal(m.lua('PUESTAS'), 0, 'una ajena a la subasta no recoloca');
  // Nuestra propia pestaña tampoco.
  m.lua(`PanelTemplates_TabResize(${PESTANA})`);
  m.avanzar(0.05);
  assert.equal(m.lua('PUESTAS'), 0, 'ni la nuestra');
  // Hija de la subasta.
  m.lua(`PanelTemplates_TabResize(${AH}.Tabs[1])`);
  m.avanzar(0.05);
  assert.equal(m.lua('PUESTAS'), 1, 'hija');
  // Nieta.
  m.lua(`PanelTemplates_TabResize(${AH}.Lib[1])`);
  m.avanzar(0.05);
  assert.equal(m.lua('PUESTAS'), 2, 'nieta');
  // En Tabs aunque no cuelgue de ella.
  m.lua(`local y = CreateFrame("Button", nil, UIParent); ${AH}.Tabs[4] = y; PanelTemplates_TabResize(y)`);
  m.avanzar(0.05);
  assert.equal(m.lua('PUESTAS'), 3, 'en Tabs');
  sinErrores(m);
});

// Las listas de la subasta que están a la vista se esconden y se enseñan otra vez tras SetDisplayMode(Buy), para que salte su
// OnShow (si ya estaba en Comprar, SetDisplayMode puede no volver a enseñarlas y lo que las pinta no mide).
const LISTAS = `${CON_MODO}
  rawset(_G, "ORDEN", {})
  rawset(AuctionHouseFrame, "SetDisplayMode", function(self, modo) ORDEN[#ORDEN + 1] = "modo" end)
  local function lista(padre, clave, nombre)
    local f = CreateFrame("Frame", nil, padre)
    f:HookScript("OnHide", function() ORDEN[#ORDEN + 1] = "Hide " .. nombre end)
    f:HookScript("OnShow", function() ORDEN[#ORDEN + 1] = "Show " .. nombre end)
    padre[clave] = f
    return f
  end
  for _, n in ipairs({"BrowseResultsFrame", "CommoditiesBuyFrame", "ItemBuyFrame", "AuctionsFrame"}) do
    AuctionHouseFrame[n] = CreateFrame("Frame", nil, AuctionHouseFrame)
    lista(AuctionHouseFrame[n], "ItemList", n)
  end
  lista(AuctionHouseFrame, "ItemSellList", "ItemSellList")
  lista(AuctionHouseFrame, "CommoditiesSellList", "CommoditiesSellList")
  AuctionHouseFrame.ItemBuyFrame.ItemList:Hide()
  AuctionHouseFrame.CommoditiesSellList:Hide()
  ORDEN = {} `;

test('15c r1: tras SetDisplayMode(Buy), cada lista a la vista recibe Hide y Show y queda a la vista; las escondidas no se tocan', () => {
  const m = maquina({ previo: SUBASTA_TABS + LISTAS });
  abrir(m);
  m.lua('ORDEN = {}');
  m.lua(`${V9}.verBlizzard:Click()`);
  const orden = m.lua('ORDEN');
  assert.equal(orden[0], 'modo', 'primero SetDisplayMode');
  const rest = orden.slice(1);
  for (const n of ['BrowseResultsFrame', 'CommoditiesBuyFrame', 'AuctionsFrame', 'ItemSellList']) {
    const h = rest.indexOf(`Hide ${n}`);
    assert.ok(h >= 0 && rest[h + 1] === `Show ${n}`, `${n}: Hide y luego Show`);
    assert.equal(rest.filter((x) => x === `Hide ${n}`).length, 1);
  }
  assert.equal(rest.filter((x) => /ItemBuyFrame|CommoditiesSellList/.test(x)).length, 0, 'las escondidas, ni tocadas');
  assert.equal(m.lua(`${AH}.BrowseResultsFrame.ItemList:IsShown()`), true);
  assert.equal(m.lua(`${AH}.ItemSellList:IsShown()`), true);
  assert.equal(m.lua(`${AH}.ItemBuyFrame.ItemList:IsShown()`), false);
  assert.equal(m.lua(`${AH}.CommoditiesSellList:IsShown()`), false);
  sinErrores(m);
});

test('15c r1: en combate las listas no se tocan; al salir, sí; y un fallo en una lista no impide las demás', () => {
  const m = maquina({ previo: SUBASTA_TABS + LISTAS });
  abrir(m);
  m.lua('ORDEN = {}');
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(m.lua('#ORDEN'), 0, 'en combate, nada');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.ok(m.lua('#ORDEN') >= 1 + 2 * 4, 'al salir, sí');
  const n = maquina({ previo: SUBASTA_TABS + LISTAS + 'rawset(AuctionHouseFrame.BrowseResultsFrame.ItemList, "Hide", function() error("falla") end); ' });
  abrir(n);
  n.lua('ORDEN = {}');
  n.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(n.lua('ORDEN').includes('Show CommoditiesBuyFrame'), 'las demás, igual');
  sinErrores(m);
  sinErrores(n);
});

// Tarea 15d: las franjas grises eran bordes de 1 píxel del skin de EllesmereUI, que calcula su grosor con la escala de la
// subasta (1 / escala efectiva). Medido a escala 0,001 sale unas 1000 veces más grueso y no se recalcula solo al volver.
// Ahora nuestro escondido no toca la escala (alfa 0, fuera de la pantalla y sin ratón) y, cuando la subasta vuelve a tener
// escala usable (la devuelve TSM o la devolvemos nosotros), se llama a EllesmereUI.PP.ResnapBordersUnder(subasta) un
// fotograma después. Aquí, un skin falso: cada pasada (SKIN_PASADA, como al refrescarse la lista en el escaneo) pone al
// borde de una barra hija de la subasta el alto 1 / escala efectiva; ResnapBordersUnder lo vuelve a calcular y lo apunta.
const SKIN = `AuctionHouseFrame:EnableMouse(true)
  local barra = CreateFrame("Frame", nil, AuctionHouseFrame)
  barra:SetSize(100, 20)
  barra:SetPoint("TOPLEFT", AuctionHouseFrame, "TOPLEFT", 0, 0)
  local borde = barra:CreateTexture()
  rawset(_G, "BORDE", borde)
  rawset(_G, "SKIN_PASADA", function() borde:SetHeight(1 / barra:GetEffectiveScale()) end)
  rawset(_G, "RESNAPS", {})
  rawset(_G, "EllesmereUI", {PP = {ResnapBordersUnder = function(raiz)
    RESNAPS[#RESNAPS + 1] = raiz
    local p = barra
    while p do
      if p == raiz then SKIN_PASADA() break end
      p = p:GetParent()
    end
  end}})
  SKIN_PASADA() `;
const borde = (m) => m.lua('BORDE:GetHeight()');
const resnaps = (m) => m.lua('#RESNAPS');
const alfaDe = (m) => m.lua(`${AH}:GetAlpha()`);
const ratonDe = (m) => m.lua(`${AH}:IsMouseEnabled()`);
const FUERA = [['TOPLEFT', 'UIParent', 'TOPLEFT', -100000, 100000]];

test('15d: con nuestra vista la subasta queda con su escala, alfa 0, fuera de la pantalla y sin ratón; «Vista de Blizzard» y cerrar devuelven su alfa, sus puntos y su ratón', () => {
  const m = maquina({ previo: SUBASTA_TABS + PUNTOS_DEL_JUGADOR + `${AH}:SetAlpha(0.9); ${AH}:EnableMouse(true); ` });
  const puntosAntes = puntosDe(m, AH);
  abrir(m);
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, `la escala no se toca: ${escalaDe(m)}`);
  assert.equal(alfaDe(m), 0, 'alfa 0');
  assert.equal(ratonDe(m), false, 'sin ratón');
  assert.deepEqual(puntosDe(m, AH), FUERA, 'fuera de la pantalla');
  const a = absoluto(m, AH);
  assert.ok(a[1] < 0, `fuera de la pantalla: ${a}`);
  assert.equal(m.lua(`${AH}.Tabs[1]:GetEffectiveAlpha()`), 0, 'sus pestañas, invisibles con ella');
  assert.equal(m.lua(`${AH}:IsShown()`), true, 'sin Hide');
  // «Vista de Blizzard»: lo de antes, tal cual.
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(alfaDe(m) - 0.9) < 1e-6, `su alfa de antes: ${alfaDe(m)}`);
  assert.equal(ratonDe(m), true, 'su ratón');
  assert.deepEqual(puntosDe(m, AH), puntosAntes, 'sus puntos');
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, 'su escala');
  // Otra vez la nuestra y cerrar la subasta: lo mismo.
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(alfaDe(m), 0);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.ok(Math.abs(alfaDe(m) - 0.9) < 1e-6, 'al cerrar, su alfa');
  assert.equal(ratonDe(m), true, 'su ratón');
  assert.deepEqual(puntosDe(m, AH), puntosAntes, 'sus puntos');
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, 'su escala');
  sinErrores(m);
  // Sin ratón antes: sigue sin ratón al devolverla.
  const n = maquina({ previo: SUBASTA_TABS + `${AH}:EnableMouse(false); ` });
  abrir(n);
  n.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(ratonDe(n), false);
  assert.equal(alfaDe(n), 1);
  sinErrores(n);
});

test('15d: con nuestra vista el skin mide a la escala buena: el borde sigue en 1 escondida y al volver', () => {
  const m = maquina({ previo: SUBASTA_TABS + SKIN });
  abrir(m);
  assert.ok(escondida(m));
  m.lua('SKIN_PASADA()'); // se refresca la lista mientras está escondida
  assert.ok(Math.abs(borde(m) - 1) < 1e-6, `borde ${borde(m)}`);
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(alfaDe(m), 1);
  assert.equal(ratonDe(m), true);
  assert.deepEqual(puntosDe(m, AH), SUBASTA_ORIGINAL);
  assert.ok(Math.abs(borde(m) - 1) < 1e-6, `al volver, borde ${borde(m)}`);
  // Al devolverla nosotros también se pide al skin que recalcule, en el acto y una vez (15d r2).
  assert.equal(resnaps(m), 1, 'en la misma llamada');
  assert.equal(m.lua('RESNAPS[1] == AuctionHouseFrame'), true, 'con la subasta');
  m.avanzar(1);
  assert.equal(resnaps(m), 1, 'una sola vez');
  assert.ok(Math.abs(borde(m) - 1) < 1e-6);
  sinErrores(m);
});

test('15d: TSM la esconde a 0,001 y la devuelve a 1: el borde mal medido se recalcula en el acto, una sola vez', () => {
  const m = maquina({ previo: SUBASTA_TABS + SKIN });
  m.lua('SnetForever.Ajustes.set("comercioVista", "blizzard")');
  abrir(m);
  m.lua(TSM_PON);
  m.lua('SKIN_PASADA()'); // el escaneo refresca la lista mientras TSM la tiene a 0,001
  assert.ok(Math.abs(borde(m) - 1000) < 1, `borde a escala 0,001: ${borde(m)}`);
  m.avanzar(0.05);
  assert.equal(resnaps(m), 0, 'escondida por TSM: nada');
  m.lua(TSM_QUITA); // el «WoW UI» de TSM
  assert.equal(resnaps(m), 1, 'en el acto (15d r2): ni un fotograma con las franjas');
  assert.equal(m.lua('RESNAPS[1] == AuctionHouseFrame'), true, 'con la subasta');
  assert.ok(Math.abs(borde(m) - 1) < 1e-6, `borde otra vez en 1: ${borde(m)}`);
  m.avanzar(1);
  assert.equal(resnaps(m), 1, 'una sola vez');
  // Otra vuelta, otra llamada.
  m.lua(TSM_PON);
  m.lua(TSM_QUITA);
  assert.equal(resnaps(m), 2);
  // Escondida otra vez por TSM: nada (mediría a 0,001).
  m.lua(TSM_PON);
  m.avanzar(1);
  assert.equal(resnaps(m), 2);
  // En el mismo paso en que vuelve la escala usable, el borde ya mide 1.
  m.lua('SKIN_PASADA()');
  assert.ok(borde(m) > 900);
  m.lua(`${AH}:SetScale(1)`);
  assert.ok(Math.abs(borde(m) - 1) < 1e-6, `en el mismo paso: ${borde(m)}`);
  sinErrores(m);
  // TSM la coge mientras la tenemos escondida nosotros, y la devuelve.
  const n = maquina({ previo: SUBASTA_TABS + SKIN });
  abrir(n);
  n.lua(TSM_PON);
  n.lua('SKIN_PASADA()');
  assert.ok(borde(n) > 900);
  n.lua(TSM_QUITA);
  assert.equal(resnaps(n), 1);
  assert.ok(Math.abs(borde(n) - 1) < 1e-6);
  sinErrores(n);
  // Con solo SetScale(0,001) y solo SetScale(1), igual.
  const o = maquina({ previo: SUBASTA_TABS + SKIN });
  abrir(o);
  o.lua(`${AH}:SetScale(0.001)`);
  o.lua('SKIN_PASADA()');
  o.lua(`${AH}:SetScale(1)`);
  assert.equal(resnaps(o), 1);
  assert.ok(Math.abs(borde(o) - 1) < 1e-6);
  sinErrores(o);
});

test('15d: TSM coge la subasta mientras la tenemos escondida: al devolverla tiene alfa 1 y ratón, nunca queda invisible', () => {
  const casos = {
    'TSM esconde y devuelve': [TSM_PON, TSM_QUITA],
    'solo SetScale(0,001) y solo SetScale(1)': [`${AH}:SetScale(0.001)`, `${AH}:SetScale(1)`],
    'con cierre y apertura por medio': [`${AH}:SetScale(0.001)`, 'CERRAR_Y_ABRIR', `${AH}:SetScale(1)`],
  };
  for (const enCombate of [false, true]) {
    for (const [nombre, pasos] of Object.entries(casos)) {
      const m = maquina({ previo: SUBASTA_TABS + `${AH}:EnableMouse(true); ` });
      abrir(m);
      assert.ok(escondida(m));
      if (enCombate) m.lua('BANCO.jugador.enCombate = true');
      m.lua(pasos[0]);
      assert.equal(alfaDe(m), 1, `${nombre}: el alfa se le devuelve al soltarla`);
      assert.equal(ratonDe(m), true, `${nombre}: y el ratón`);
      for (const paso of pasos.slice(1)) {
        if (paso === 'CERRAR_Y_ABRIR') { m.disparar('AUCTION_HOUSE_CLOSED'); abrir(m); } else m.lua(paso);
      }
      if (enCombate) { m.lua('BANCO.jugador.enCombate = false'); m.disparar('PLAYER_REGEN_ENABLED'); }
      const e = enCombate ? ' (combate)' : '';
      assert.equal(escalaDe(m), 1, `${nombre}${e}: escala`);
      assert.equal(alfaDe(m), 1, `${nombre}${e}: devuelta con alfa 1`);
      assert.equal(ratonDe(m), true, `${nombre}${e}: y con ratón`);
      assert.equal(conPuntoPropio(m), false, `${nombre}${e}: sin nuestro punto`);
      assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true, `${nombre}${e}: usable`);
      sinErrores(m);
    }
  }
});

test('15d: otro addon cambia el alfa de la subasta que tenemos escondida: seguimos dueños y vuelve a alfa 0 al momento (también en combate)', () => {
  const m = maquina({ previo: SUBASTA_TABS + `${AH}:EnableMouse(true); ` });
  abrir(m);
  m.lua(`${AH}:SetAlpha(1)`);
  assert.equal(alfaDe(m), 0, 'otra vez escondida, sin un fotograma a la vista');
  assert.ok(escondida(m));
  assert.equal(enseña(m, V9), true, 'nuestra ventana sigue: la subasta sigue siendo nuestra');
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${AH}:SetAlpha(0.5)`);
  assert.equal(alfaDe(m), 0, 'en combate también (15d r1)');
  assert.equal(enseña(m, V9), true);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(alfaDe(m), 0, 'al salir, sigue en alfa 0');
  // Al devolverla manda lo que tenía antes de esconderla, no el alfa del otro.
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(alfaDe(m), 1);
  assert.equal(ratonDe(m), true);
  // Con la subasta a la vista (no es nuestra) un SetAlpha ajeno no se toca.
  m.lua(`${AH}:SetAlpha(0.7)`);
  assert.ok(Math.abs(alfaDe(m) - 0.7) < 1e-6);
  sinErrores(m);
});

test('15d: combate: no se esconde hasta salir; los bordes, en el acto también en combate (15d r3)', () => {
  const m = maquina({ previo: SUBASTA_TABS + SKIN });
  m.lua('BANCO.jugador.enCombate = true');
  abrir(m);
  assert.equal(alfaDe(m), 1);
  assert.equal(ratonDe(m), true);
  assert.deepEqual(puntosDe(m, AH), SUBASTA_ORIGINAL);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.ok(escondida(m), 'al salir, escondida');
  // TSM la coge y la devuelve en combate: el skin se llama en el acto, una vez, y no otra al salir.
  m.lua(`${V9}.verBlizzard:Click()`);
  m.avanzar(0.05);
  const antes = resnaps(m);
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(TSM_PON);
  m.lua('SKIN_PASADA()');
  m.lua(TSM_QUITA);
  assert.equal(resnaps(m), antes + 1, 'en combate, en el acto');
  assert.ok(Math.abs(borde(m) - 1) < 1e-6);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  m.avanzar(0.05);
  assert.equal(resnaps(m), antes + 1, 'al salir, ninguna más');
  assert.ok(Math.abs(borde(m) - 1) < 1e-6);
  sinErrores(m);
});

test('15d: sin EllesmereUI, sin su PP o con ResnapBordersUnder que falla, no hay error', () => {
  for (const previo of ['', 'rawset(_G, "EllesmereUI", {}); ', 'rawset(_G, "EllesmereUI", {PP = {}}); ',
    'rawset(_G, "EllesmereUI", {PP = {ResnapBordersUnder = function() error("roto") end}}); ']) {
    const m = maquina({ previo: SUBASTA_TABS + previo });
    abrir(m);
    m.lua(TSM_PON);
    m.lua(TSM_QUITA);
    m.avanzar(0.05);
    m.lua(`${V9}.pestanaSnet:Click()`);
    m.lua(`${V9}.verBlizzard:Click()`);
    m.avanzar(0.05);
    assert.equal(m.lua('SnetForever.Comercio.activo()'), true, `«${previo}»: el comercio sigue en marcha`);
    assert.equal(alfaDe(m), 1);
    sinErrores(m);
  }
});

test('15d: si al devolverla fallan los puntos, el alfa y el ratón vuelven igual; los puntos, al salir de combate, y solo ellos', () => {
  const m = maquina({ previo: SUBASTA_TABS + `${AH}:EnableMouse(true); ` });
  abrir(m);
  assert.ok(escondida(m));
  m.lua(`local o = AuctionHouseFrame.SetPoint
    rawset(_G, "SNF_FALLA", true)
    rawset(AuctionHouseFrame, "SetPoint", function(self, ...) if SNF_FALLA then error("no se puede") end return o(self, ...) end)`);
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(alfaDe(m), 1, 'el alfa vuelve aunque fallen los puntos');
  assert.equal(ratonDe(m), true, 'y el ratón');
  m.lua('SNF_FALLA = false');
  // 15d r1, punto 6: lo que ya se devolvió no se vuelve a poner al salir del combate (otro addon lo pudo cambiar).
  m.lua(`${AH}:SetAlpha(0.5); ${AH}:EnableMouse(false)`);
  m.lua('ALFAS = 0; hooksecurefunc(AuctionHouseFrame, "SetAlpha", function() ALFAS = ALFAS + 1 end)');
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.deepEqual(puntosDe(m, AH), SUBASTA_ORIGINAL, 'los puntos, al salir');
  assert.equal(m.lua('ALFAS'), 0, 'el alfa ya se había devuelto: no se toca');
  assert.equal(alfaDe(m), 0.5);
  assert.equal(ratonDe(m), false, 'el ratón tampoco');
  sinErrores(m);
});

// Tarea 15d, ronda de arreglos 1 (y 2).
// Un «mover» falso, como EnhanceQoLMover (Init.lua) con AuctionHouseFrame habilitado:
// - cada vez que alguien llama a SetPoint en la subasta la vuelve a poner en su punto guardado (MOVER_PUNTO) y su escala
//   (MOVER_ESCALA, si la tiene), dentro de esa misma llamada (también dentro de la nuestra);
// - al enseñarse, y otra vez un fotograma después: la sujeta a la pantalla (SetClampedToScreen), le enciende el ratón y le
//   pone su punto y su escala. El banco recoloca dentro de la pantalla lo sujeto (BANCO.sujetarAPantalla).
// La subasta empieza oculta: la prueba la enseña (como el cliente al abrirla) antes del AUCTION_HOUSE_SHOW.
const MOVER = `rawset(_G, "MOVER_ACTIVO", true)
  rawset(_G, "MOVER_PUNTO", {"TOPLEFT", 10, -100})
  BANCO.sujetarAPantalla = true
  local moviendo = false
  local function ponerSuyo(self)
    local p, e = rawget(_G, "MOVER_PUNTO"), rawget(_G, "MOVER_ESCALA")
    if moviendo or not MOVER_ACTIVO or (not p and not e) then return end
    moviendo = true
    if p then self:ClearAllPoints(); self:SetPoint(p[1], UIParent, p[1], p[2], p[3]) end
    if e then self:SetScale(e) end
    moviendo = false
  end
  local function aplicar(self)
    if not MOVER_ACTIVO then return end
    self:SetClampedToScreen(true)
    self:EnableMouse(true)
    ponerSuyo(self)
  end
  hooksecurefunc(AuctionHouseFrame, "SetPoint", ponerSuyo)
  AuctionHouseFrame:HookScript("OnShow", function(self)
    aplicar(self)
    C_Timer.After(0, function() if self:IsShown() then aplicar(self) end end)
  end)
  AuctionHouseFrame:Hide() `;
const abrirConMover = (m) => { m.lua(`${AH}:Show()`); abrirSinEsperar(m); };
// ¿Se puede pulsar? En pantalla, con su tamaño real en píxeles de más de 2 × 2.
const pulsable = (m) => {
  if (!m.lua(`${AH}:IsVisible()`)) return false;
  const a = absoluto(m, AH);
  if (a.some((x) => typeof x !== 'number')) return false;
  const enPantalla = a[1] > 0 && a[0] < m.lua('UIParent:GetRight()') && a[2] > 0 && a[3] < m.lua('UIParent:GetTop()');
  return enPantalla && a[1] - a[0] > 2 && a[2] - a[3] > 2;
};

test('15d r1: un mover que la vuelve a poner en su sitio dentro de nuestro SetPoint: pasa a escala 0,001, sin un fotograma a la vista, y al devolverla todo queda como estaba', () => {
  const m = maquina({ previo: SUBASTA_TABS + `${AH}:SetScale(0.8); ` + SKIN + MOVER + 'MOVER_ESCALA = 0.8; ' });
  m.lua('VISTA = 0; hooksecurefunc(AuctionHouseFrame, "SetAlpha", function(self, a) if a > 0 and self:GetEffectiveScale() > 0.01 then VISTA = VISTA + 1 end end)');
  abrirConMover(m);
  assert.equal(alfaDe(m), 0, 'invisible desde el primer fotograma');
  m.avanzar(0.05); // se esconde: el mover la devuelve a su sitio y, en el acto, escala 0,001 (15d r2)
  assert.equal(alfaDe(m), 0);
  assert.ok(m.lua(`${AH}:GetEffectiveScale()`) < 0.01, `escala ${escalaDe(m)}`);
  assert.equal(ratonDe(m), false);
  assert.equal(pulsable(m), false, 'no se puede pulsar');
  assert.equal(enseña(m, V9), true, 'nuestra ventana sigue: es nuestra');
  assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true);
  m.avanzar(1);
  assert.ok(m.lua(`${AH}:GetEffectiveScale()`) < 0.01, 'sin vaivenes');
  assert.equal(m.lua('VISTA'), 0, 'ningún momento a la vista');
  // Al devolverla: su escala, sus puntos, su alfa y su ratón; y se pide al skin que recalcule, como con TSM.
  const antes = resnaps(m);
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, `su escala: ${escalaDe(m)}`);
  devuelta(m, SUBASTA_ORIGINAL, 'Vista de Blizzard:');
  assert.equal(resnaps(m), antes + 1, 'una llamada a ResnapBordersUnder, en el acto');
  m.avanzar(0.05);
  assert.equal(resnaps(m), antes + 1, 'una sola');
  assert.ok(Math.abs(borde(m) - 1 / 0.8) < 1e-6, `borde ${borde(m)}`);
  // Otra vez nuestra vista y cerrar: lo mismo.
  m.lua(`${V9}.pestanaSnet:Click()`);
  m.avanzar(0.1);
  assert.ok(m.lua(`${AH}:GetEffectiveScale()`) < 0.01);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6);
  devuelta(m, SUBASTA_ORIGINAL, 'al cerrar:');
  sinErrores(m);
});

test('15d r1: si un mover la devuelve a la pantalla cuando ya estaba escondida (también en combate), pasa a escala 0,001 sin verse', () => {
  for (const enCombate of [false, true]) {
    const m = maquina({ previo: SUBASTA_TABS + MOVER + 'MOVER_ACTIVO = false; AuctionHouseFrame:Show(); ' });
    abrir(m);
    assert.ok(escondida(m));
    m.lua('MOVER_ACTIVO = true');
    if (enCombate) m.lua('BANCO.jugador.enCombate = true');
    m.lua(`${AH}:SetPoint("CENTER", UIParent, "CENTER", 0, 0)`); // el gestor de paneles la recoloca; el mover la pone en su sitio
    const e = enCombate ? ' (combate)' : '';
    assert.ok(oculta(m), `en el acto (15d r2)${e}`);
    m.avanzar(0.1);
    assert.equal(alfaDe(m), 0);
    assert.ok(m.lua(`${AH}:GetEffectiveScale()`) < 0.01, `escala 0,001${e}`);
    assert.equal(pulsable(m), false, `no se puede pulsar${e}`);
    assert.equal(enseña(m, V9), true);
    if (enCombate) { m.lua('BANCO.jugador.enCombate = false'); m.disparar('PLAYER_REGEN_ENABLED'); }
    m.disparar('AUCTION_HOUSE_CLOSED');
    assert.equal(escalaDe(m), 1);
    devuelta(m, SUBASTA_ORIGINAL, `al cerrar${e}:`);
    sinErrores(m);
  }
});

test('15d r1: TSM guarda nuestro punto de fuera al esconderla y lo repone con «WoW UI»: la subasta vuelve a su sitio', () => {
  for (const [nombre, esconde] of [['al abrir', TSM_PON], ['con su pestaña', TSM_PESTANA]]) {
    const m = maquina({ previo: SUBASTA_TABS });
    abrir(m);
    assert.ok(escondida(m));
    m.lua(esconde);
    m.avanzar(0.05);
    assert.equal(m.lua('TSM_PUNTO[4]'), -100000, `${nombre}: TSM se ha guardado nuestro punto (es el caso)`);
    assert.equal(enseña(m, V9), false);
    m.avanzar(1);
    m.lua(TSM_QUITA);
    assert.equal(escalaDe(m), 1);
    devuelta(m, SUBASTA_ORIGINAL, `${nombre}:`);
    assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true);
    assert.equal(enseña(m, `${V9}.pestanaSnet`), true, 'solo nuestra pestaña');
    // Si se cierra entre medias y TSM la devuelve al cerrar, igual.
    m.lua(`${V9}.pestanaSnet:Click()`);
    m.lua(esconde);
    m.disparar('AUCTION_HOUSE_CLOSED');
    m.lua(TSM_QUITA);
    devuelta(m, SUBASTA_ORIGINAL, `${nombre}, tras cerrar:`);
    sinErrores(m);
  }
});

test('15d r1: cerrar en combate con nuestra vista y volver a abrir en combate con TSM: al devolverla TSM queda en su sitio', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua('BANCO.jugador.enCombate = true');
  m.disparar('AUCTION_HOUSE_CLOSED');
  devuelta(m, SUBASTA_ORIGINAL, 'cerrar en combate la devuelve enseguida:');
  abrirSinEsperar(m);
  m.lua(TSM_PON);
  m.avanzar(0.05);
  assert.deepEqual(m.lua('{TSM_PUNTO[4], TSM_PUNTO[5]}'), [10, -100], 'TSM guarda su sitio, no el nuestro');
  m.lua(TSM_QUITA);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'devuelta por TSM:');
  sinErrores(m);
});

test('15d r1: en combate, «Vista de Blizzard» y cerrar devuelven alfa, ratón y puntos enseguida, y el skin también (15d r3); SetDisplayMode y las listas, al salir', () => {
  for (const como of ['vista', 'cerrar']) {
    const m = maquina({ previo: SUBASTA_TABS + SKIN + LISTAS });
    abrir(m);
    m.lua('ORDEN = {}');
    const r0 = resnaps(m);
    m.lua('BANCO.jugador.enCombate = true');
    if (como === 'vista') m.lua(`${V9}.verBlizzard:Click()`);
    else m.disparar('AUCTION_HOUSE_CLOSED');
    devuelta(m, SUBASTA_ORIGINAL, `${como}, en combate:`);
    m.avanzar(0.1);
    assert.equal(m.lua('#ORDEN'), 0, `${como}: SetDisplayMode y las listas esperan`);
    assert.equal(resnaps(m), r0 + 1, `${como}: el skin, en el acto`);
    m.lua('BANCO.jugador.enCombate = false');
    m.disparar('PLAYER_REGEN_ENABLED');
    m.avanzar(0.05);
    assert.equal(m.lua('ORDEN[1]'), 'modo', `${como}: al salir, SetDisplayMode`);
    assert.equal(resnaps(m), r0 + 1, `${como}: y el skin, ninguna vez más`);
    devuelta(m, SUBASTA_ORIGINAL, `${como}, tras el combate:`);
    sinErrores(m);
  }
});

test('15d r1: al abrir la subasta con nuestra vista no se ve ni un fotograma; si se cierra o se pasa a Blizzard antes de esconderla, vuelve su alfa', () => {
  const m = maquina({ previo: SUBASTA_TABS + `${AH}:SetAlpha(0.9); ` });
  abrirSinEsperar(m);
  assert.equal(alfaDe(m), 0, 'invisible en el mismo AUCTION_HOUSE_SHOW');
  assert.deepEqual(puntosDe(m, AH), SUBASTA_ORIGINAL, 'aún en su sitio');
  m.disparar('AUCTION_HOUSE_CLOSED');
  devuelta(m, SUBASTA_ORIGINAL, 'cerrada antes de esconderla:', 0.9);
  m.avanzar(0.05);
  devuelta(m, SUBASTA_ORIGINAL, 'y no se esconde después:', 0.9);
  // Pasar a la vista de Blizzard antes del fotograma siguiente.
  abrirSinEsperar(m);
  m.lua('SnetForever.UIComercio.ponerVista("blizzard")');
  devuelta(m, SUBASTA_ORIGINAL, 'Vista de Blizzard antes de esconderla:', 0.9);
  m.avanzar(0.05);
  devuelta(m, SUBASTA_ORIGINAL, 'y sigue así:', 0.9);
  // Con la vista de Blizzard guardada no se toca al abrir.
  m.disparar('AUCTION_HOUSE_CLOSED');
  abrirSinEsperar(m);
  assert.ok(Math.abs(alfaDe(m) - 0.9) < 1e-6, 'vista de Blizzard: la subasta se ve');
  // Esconderla después guarda el alfa de antes (0,9), no el 0 del primer fotograma.
  m.lua('SnetForever.UIComercio.ponerVista("snet")');
  m.lua(`${V9}.verBlizzard:Click()`);
  devuelta(m, SUBASTA_ORIGINAL, 'ida y vuelta:', 0.9);
  const n = maquina({ previo: SUBASTA_TABS + `${AH}:SetAlpha(0.9); ` });
  abrirSinEsperar(n);
  n.avanzar(0.05);
  assert.ok(escondida(n));
  n.lua(`${V9}.verBlizzard:Click()`);
  devuelta(n, SUBASTA_ORIGINAL, 'el alfa de antes del primer fotograma:', 0.9);
  // Si el combate empieza justo en ese fotograma, se termina de esconder (ya estaba invisible): ni vuelve a verse un
  // fotograma ni se queda en pantalla con alfa 0.
  const d = maquina({ previo: SUBASTA_TABS });
  abrirSinEsperar(d);
  d.lua('ALFAS = 0; hooksecurefunc(AuctionHouseFrame, "SetAlpha", function() ALFAS = ALFAS + 1 end)');
  d.lua('BANCO.jugador.enCombate = true');
  d.avanzar(0.05);
  assert.ok(escondida(d), 'escondida del todo');
  assert.equal(d.lua('ALFAS'), 0, 'sin volver a verse');
  d.lua('BANCO.jugador.enCombate = false');
  d.disparar('PLAYER_REGEN_ENABLED');
  assert.ok(escondida(d));
  d.lua(`${V9}.verBlizzard:Click()`);
  devuelta(d, SUBASTA_ORIGINAL, 'combate en el primer fotograma:');
  sinErrores(d);
  // En combate no se toca al abrir (esconderla espera a salir): se ve hasta entonces, sin destellos.
  const c = maquina({ previo: SUBASTA_TABS });
  c.lua('BANCO.jugador.enCombate = true');
  abrirSinEsperar(c);
  c.avanzar(0.05);
  devuelta(c, SUBASTA_ORIGINAL, 'en combate:');
  sinErrores(m);
  sinErrores(n);
  sinErrores(c);
});

// Tarea 15d, ronda de arreglos 2.
const SUJETA = 'BANCO.sujetarAPantalla = true; AuctionHouseFrame:SetClampedToScreen(true); ';

test('15d r2: sujeta a la pantalla (SetClampedToScreen), nuestro punto la deja en pantalla: escala 0,001 en el acto y nada pulsable', () => {
  const m = maquina({ previo: SUBASTA_TABS + SUJETA });
  abrirSinEsperar(m);
  m.avanzar(0.05);
  assert.deepEqual(puntosDe(m, AH), [['TOPLEFT', 'UIParent', 'TOPLEFT', -100000, 100000]], 'GetPoint dice nuestro punto');
  assert.ok(oculta(m), 'pero WoW la mete en la pantalla: tiene que ir a 0,001');
  assert.ok(enReserva(m));
  assert.equal(enseña(m, V9), true, 'nuestra vista sigue');
  for (const t of [`${AH}.Tabs[1]`, `${AH}.Tabs[3]`]) {
    assert.ok(m.lua(`${t}:GetEffectiveScale()`) < 0.01, `${t}: tampoco se puede pulsar`);
  }
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'Vista de Blizzard:');
  sinErrores(m);
  // Sujeta aunque el banco no la recoloque: IsClampedToScreen basta.
  const n = maquina({ previo: SUBASTA_TABS + `${AH}:SetClampedToScreen(true); ` });
  abrir(n);
  assert.ok(enReserva(n), 'IsClampedToScreen: reserva');
  assert.equal(alfaDe(n), 0);
  sinErrores(n);
  // Y si la sujetan cuando ya estaba escondida.
  const o = maquina({ previo: SUBASTA_TABS + 'BANCO.sujetarAPantalla = true; ' });
  abrir(o);
  assert.ok(escondida(o));
  o.lua(`${AH}:SetClampedToScreen(true)`);
  assert.ok(oculta(o), 'en el acto');
  assert.ok(enReserva(o));
  sinErrores(o);
});

// Un addon falso que deshace nuestro SetScale(0,001): dentro de la misma llamada (dentro = true) o un fotograma después.
const HOSTIL = (dentro) => `rawset(_G, "HOSTIL", true)
  hooksecurefunc(AuctionHouseFrame, "SetScale", function(self, e)
    if not HOSTIL or e >= 0.1 then return end
    ${dentro ? 'self:SetScale(1)' : ''}
    C_Timer.After(0, function() if HOSTIL then self:SetScale(1) end end)
  end) `;
// Lo que se ve en cada fotograma: 'nuestra' (nuestra ventana), 'blizzard' (la subasta de Blizzard a la vista), o nada.
const loQueSeVe = (m) => {
  const nuestra = m.lua(`${V9} ~= nil and ${V9}:IsVisible() and ${V9}:GetEffectiveAlpha() > 0`);
  const blizzard = m.lua(`${AH}:GetEffectiveAlpha()`) > 0 && pulsable(m);
  return [nuestra ? 'nuestra' : '', blizzard ? 'blizzard' : ''].filter(Boolean).join('+') || 'nada';
};

test('15d r2: si otro addon deshace el escondido de reserva, nos rendimos una sola vez: vista de Blizzard, todo devuelto, sin bucle ni vaivén', () => {
  for (const dentro of [true, false]) {
    const m = maquina({ previo: SUBASTA_TABS + SUJETA + HOSTIL(dentro) });
    const vistos = [];
    abrirSinEsperar(m);
    vistos.push(loQueSeVe(m));
    for (let i = 0; i < 40; i++) { m.avanzar(0.05); vistos.push(loQueSeVe(m)); }
    const d = dentro ? 'dentro' : 'después';
    // Una sola vez y sin que nuestra ventana llegue a verse (15d r3): «nada…» y luego «blizzard», nada más.
    const cambios = vistos.filter((v, i) => i === 0 || v !== vistos[i - 1]);
    assert.deepEqual(cambios, ['nada', 'blizzard'], `${d}: lo que se ve, fotograma a fotograma: ${vistos}`);
    // Todo devuelto y usable.
    assert.ok(escalaDe(m) >= 0.1, `${d}: escala usable`);
    devuelta(m, SUBASTA_ORIGINAL, `${d}:`);
    assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true);
    assert.equal(enseña(m, V9), false);
    assert.equal(enseña(m, `${V9}.pestanaSnet`), true, `${d}: nuestra pestaña, con las de Blizzard`);
    // Sin bucle: ya no tocamos más su escala.
    m.lua('ESCALAS = 0; hooksecurefunc(AuctionHouseFrame, "SetScale", function() ESCALAS = ESCALAS + 1 end)');
    m.avanzar(1);
    assert.equal(m.lua('ESCALAS'), 0, `${d}: sin bucle`);
    // Hasta cerrar, pulsar nuestra pestaña no lo vuelve a intentar (no hay vaivén).
    m.lua(`${V9}.pestanaSnet:Click()`);
    m.avanzar(0.5);
    assert.equal(enseña(m, V9), false, `${d}: sigue la de Blizzard`);
    devuelta(m, SUBASTA_ORIGINAL, `${d}, tras pulsar la pestaña:`);
    // Al abrirla otra vez se intenta de nuevo.
    m.disparar('AUCTION_HOUSE_CLOSED');
    m.lua('HOSTIL = false');
    abrir(m);
    assert.ok(oculta(m), `${d}: otra apertura, otra vez escondida`);
    assert.equal(enseña(m, V9), true);
    sinErrores(m);
  }
});

test('15d r2: al abrir, nuestra ventana no sale hasta que la subasta está escondida (nada se ve un fotograma para irse en el siguiente)', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrirSinEsperar(m);
  assert.equal(m.lua(`${V9}:GetAlpha()`), 0, 'nuestra ventana, aún invisible');
  assert.equal(m.lua(`${V9}.pestanaSnet:GetAlpha()`), 0, 'y su pestaña');
  assert.equal(alfaDe(m), 0, 'la subasta, también');
  m.avanzar(0.05);
  assert.equal(m.lua(`${V9}:GetAlpha()`), 1, 'escondida la subasta: sale la nuestra');
  assert.equal(m.lua(`${V9}.pestanaSnet:GetAlpha()`), 1);
  assert.ok(escondida(m));
  // Si TSM la tiene en el mismo aviso, la nuestra ni sale.
  const n = maquina({ previo: SUBASTA_TABS });
  abrirSinEsperar(n);
  n.lua(TSM_PON);
  n.avanzar(0.05);
  assert.equal(enseña(n, V9), false);
  assert.equal(n.lua(`${V9}:GetAlpha()`), 1, 'lista para cuando vuelva');
  sinErrores(m);
  sinErrores(n);
});

test('15d r2: un «volver a esconderla» pedido para el dueño anterior no lleva al nuevo al escondido de reserva', () => {
  const m = maquina({ previo: SUBASTA_TABS });
  abrir(m);
  m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100000, 100000)`); // pide uno
  m.lua(`${V9}.verBlizzard:Click()`);
  m.lua(`${V9}.pestanaSnet:Click()`); // otro dueño
  m.avanzar(0.1);
  assert.ok(escondida(m), 'escondida con nuestro punto');
  assert.equal(enReserva(m), false, 'sin reserva');
  assert.equal(escalaDe(m), 1);
  sinErrores(m);
});

test('15d r2: con TSM, su gancho de SetPoint y el mover, todo sigue en su sitio al devolverla', () => {
  const m = maquina({ previo: SUBASTA_TABS + MOVER + 'AuctionHouseFrame:Show(); ' });
  abrir(m);
  assert.ok(oculta(m));
  m.lua(TSM_PON);
  m.avanzar(0.05);
  assert.equal(enseña(m, V9), false, 'es de TSM');
  assert.equal(alfaDe(m), 1, 'con su alfa');
  m.lua(TSM_QUITA);
  m.avanzar(0.1);
  assert.equal(escalaDe(m), 1);
  devuelta(m, SUBASTA_ORIGINAL, 'tras «WoW UI»:');
  assert.equal(m.lua('SnetForever.UIComercio.subastaUsable()'), true);
  sinErrores(m);
});

// Tarea 15d, ronda de arreglos 3 (casos de la prueba suelta del revisor, revision-r2.test.js).
const recorrido = (m, n) => {
  const v = [loQueSeVe(m)];
  for (let i = 0; i < n; i++) { m.avanzar(0.05); v.push(loQueSeVe(m)); }
  return v;
};
const sinRepetir = (v) => v.filter((x, i) => i === 0 || x !== v[i - 1]);

test('15d r3: al abrir en combate, la subasta y nuestra ventana salen a la vez (sin el salto de «blizzard» a «nuestra+blizzard»)', () => {
  for (const previo of [SUBASTA_TABS, SUBASTA_TABS + MOVER]) {
    const m = maquina({ previo });
    m.lua('BANCO.jugador.enCombate = true');
    if (previo !== SUBASTA_TABS) m.lua(`${AH}:Show()`);
    abrirSinEsperar(m);
    const v = recorrido(m, 4);
    const c = sinRepetir(v);
    assert.deepEqual(c, ['nuestra+blizzard'], `en combate: ${v}`);
    m.lua('BANCO.jugador.enCombate = false');
    m.disparar('PLAYER_REGEN_ENABLED');
    const d = sinRepetir([...v, ...recorrido(m, 2)]);
    assert.deepEqual(d, ['nuestra+blizzard', 'nuestra'], `al salir, la subasta se va: ${d}`);
    sinErrores(m);
  }
});

test('15d r3: con la reserva, nuestra ventana sale cuando lleva unos fotogramas quieta; sin reserva, en el fotograma siguiente', () => {
  const m = maquina({ previo: SUBASTA_TABS + SUJETA });
  abrirSinEsperar(m);
  const v = recorrido(m, 8);
  assert.deepEqual(sinRepetir(v), ['nada', 'nuestra'], `${v}`);
  assert.ok(v.indexOf('nuestra') >= 3, `espera unos fotogramas quieta: ${v}`);
  assert.ok(enReserva(m));
  const n = maquina({ previo: SUBASTA_TABS });
  abrirSinEsperar(n);
  const w = recorrido(n, 3);
  assert.deepEqual(w.slice(0, 2), ['nada', 'nuestra'], `${w}`);
  sinErrores(m);
  sinErrores(n);
});

test('15d r3: el mover que pone su escala en cada SetPoint, 10 recolocaciones en un segundo: no nos rendimos', () => {
  const m = maquina({ previo: SUBASTA_TABS + MOVER + 'MOVER_ESCALA = 0.8; ' });
  m.lua(`${AH}:Show()`);
  abrirSinEsperar(m);
  m.avanzar(0.5);
  assert.ok(oculta(m));
  assert.equal(enseña(m, V9), true);
  for (let i = 0; i < 10; i++) {
    // como UpdateUIPanelPositions al abrir y cerrar otro panel
    m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", ${i % 2 ? 10 : 400}, -100)`);
    m.avanzar(0.1);
    assert.ok(oculta(m), `recolocación ${i + 1}: sin verse ni poderse pulsar`);
  }
  assert.equal(enseña(m, V9), true, 'sigue nuestra vista');
  assert.ok(enReserva(m));
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, 'con la escala que puso el mover');
  devuelta(m, SUBASTA_ORIGINAL, 'Vista de Blizzard:');
  sinErrores(m);
});

test('15d r3: volver a Blizzard en combate tras la reserva deja el borde en 1 en el acto', () => {
  const m = maquina({ previo: SUBASTA_TABS + SKIN + MOVER });
  m.lua(`${AH}:Show()`);
  abrirSinEsperar(m);
  m.avanzar(0.2);
  assert.ok(enReserva(m));
  m.lua('SKIN_PASADA()'); // una pasada del skin con la reserva: borde gordo
  assert.ok(borde(m) > 900);
  m.lua('BANCO.jugador.enCombate = true');
  m.lua(`${V9}.verBlizzard:Click()`);
  assert.ok(Math.abs(borde(m) - 1) < 1e-6, `en combate, en el acto: ${borde(m)}`);
  // TSM en combate, igual.
  m.lua(TSM_PON);
  m.lua('SKIN_PASADA()');
  m.lua(TSM_QUITA);
  assert.ok(Math.abs(borde(m) - 1) < 1e-6, `TSM en combate: ${borde(m)}`);
  m.lua('BANCO.jugador.enCombate = false');
  m.disparar('PLAYER_REGEN_ENABLED');
  sinErrores(m);
});

const AVISO_ES = 'SnetForever: otro addon no deja esconder la subasta de Blizzard; se queda la vista de Blizzard hasta que la cierres.';
const avisos = (m) => m.llamadas('AddMessage').map((a) => a[0]).filter((t) => t === AVISO_ES).length;

test('15d r3: al rendirnos, un aviso en el chat una sola vez por apertura; pulsar nuestra pestaña no cambia la vista guardada y lo repite como mucho cada pocos segundos', () => {
  const m = maquina({ previo: SUBASTA_TABS + SUJETA + HOSTIL(true) });
  abrir(m);
  m.avanzar(0.5);
  assert.equal(enseña(m, V9), false, 'rendidos');
  assert.equal(avisos(m), 1, 'un aviso');
  m.avanzar(10);
  assert.equal(avisos(m), 1, 'solo uno');
  m.lua('SnetForever.Ajustes.set("comercioVista", "blizzard")');
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(m.lua('SnetForever.UIComercio.vista()'), 'blizzard', 'la vista guardada no cambia');
  assert.equal(avisos(m), 2, 'pulsar la pestaña lo repite');
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(avisos(m), 2, 'no enseguida otra vez');
  m.avanzar(6);
  m.lua(`${V9}.pestanaSnet:Click()`);
  assert.equal(avisos(m), 3, 'pasados unos segundos, sí');
  assert.equal(enseña(m, V9), false);
  // Otra apertura: otro aviso si hay que rendirse otra vez.
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.lua('SnetForever.Ajustes.set("comercioVista", "snet")');
  abrir(m);
  m.avanzar(0.5);
  assert.equal(avisos(m), 4);
  // En inglés.
  const n = maquina({ previo: SUBASTA_TABS + SUJETA + HOSTIL(true) });
  n.lua('SnetForever.Ajustes.set("idioma", "en")');
  abrir(n);
  n.avanzar(0.5);
  const en = n.llamadas('AddMessage').map((a) => a[0]);
  assert.ok(en.includes("SnetForever: another addon won't let the Blizzard auction house be hidden; the Blizzard view stays until you close it."), `${en}`);
  sinErrores(m);
  sinErrores(n);
});

// Tarea 15d, ronda de arreglos 4: se cuentan FOTOGRAMAS seguidos en los que alguien deshace la reserva, no veces.
const N_RENDIRSE = 5; // sub.FOTOGRAMAS_RENDIRSE: nos rendimos si la deshacen en más de 5 fotogramas seguidos
// Un addon hostil que deshace la reserva cada n fotogramas. orden = 'antes': con un C_Timer creado antes que los nuestros
// (corre antes que ellos en cada fotograma); 'despues': con un OnUpdate (corre después de los C_Timer).
const HOSTIL_CADA = (n, orden) => `rawset(_G, "HOSTIL", true); rawset(_G, "DESHECHAS", 0)
  local cuenta = 0
  local function mirar()
    if not HOSTIL then return end
    if AuctionHouseFrame:GetScale() >= 0.1 then cuenta = 0 return end
    cuenta = cuenta + 1
    if cuenta >= ${n} then cuenta = 0; DESHECHAS = DESHECHAS + 1; AuctionHouseFrame:SetScale(1) end
  end
  ${orden === 'antes' ? 'C_Timer.NewTicker(BANCO.PASO, mirar)' : 'CreateFrame("Frame"):SetScript("OnUpdate", mirar)'} `;
// Cuántos marcos de nuestra ventana (ella, todo lo que cuelga de ella y su pestaña) cogen el ratón.
const conRaton = (m) => m.lua(`(function()
  local n = 0
  local function mira(f)
    if f:IsMouseEnabled() then n = n + 1 end
    for _, h in ipairs({f:GetChildren()}) do mira(h) end
  end
  mira(${V9}); mira(${V9}.pestanaSnet)
  return n
end)()`);

test('15d r4: el mover que pone su escala en cada SetPoint, con 1, 2 y 3 SetPoint por recolocación y 10 recolocaciones en un segundo: no nos rendimos', () => {
  for (const porVez of [1, 2, 3]) {
    const m = maquina({ previo: SUBASTA_TABS + MOVER + 'MOVER_ESCALA = 0.8; ' });
    m.lua(`${AH}:Show()`);
    abrirSinEsperar(m);
    const vistos = recorrido(m, 10);
    for (let i = 0; i < 10; i++) {
      for (let k = 0; k < porVez; k++) {
        m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", ${(i + k) % 2 ? 10 : 400}, -100)`);
        assert.ok(oculta(m), `${porVez} por vez, recolocación ${i + 1}: sin verse ni poderse pulsar`);
      }
      for (let f = 0; f < 2; f++) { m.avanzar(0.05); vistos.push(loQueSeVe(m)); assert.ok(oculta(m)); }
    }
    assert.deepEqual(sinRepetir(vistos), ['nada', 'nuestra'], `${porVez} por vez: ${vistos}`);
    assert.equal(enseña(m, V9), true, `${porVez} por vez: sigue nuestra vista`);
    assert.equal(avisos(m), 0, `${porVez} por vez: sin aviso de rendidos`);
    assert.ok(enReserva(m));
    m.lua(`${V9}.verBlizzard:Click()`);
    assert.ok(Math.abs(escalaDe(m) - 0.8) < 1e-6, 'con la escala del mover');
    devuelta(m, SUBASTA_ORIGINAL, `${porVez} por vez, Vista de Blizzard:`);
    sinErrores(m);
  }
});

test('15d r4: el mover recolocando en 5 fotogramas seguidos (y varias veces en cada uno) no nos rinde', () => {
  const m = maquina({ previo: SUBASTA_TABS + MOVER + 'MOVER_ESCALA = 0.8; ' });
  m.lua(`${AH}:Show()`);
  abrirSinEsperar(m);
  m.avanzar(0.5);
  for (let i = 0; i < N_RENDIRSE; i++) {
    for (let k = 0; k < 3; k++) m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", ${k % 2 ? 10 : 400}, -100)`);
    m.avanzar(0.05);
    assert.ok(oculta(m));
  }
  assert.equal(enseña(m, V9), true, 'sigue nuestra vista');
  assert.equal(avisos(m), 0);
  // Tras un fotograma quieta, la cuenta vuelve a cero: otros 5 seguidos tampoco nos rinden.
  m.avanzar(0.1);
  for (let i = 0; i < N_RENDIRSE; i++) {
    m.lua(`${AH}:ClearAllPoints(); ${AH}:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 400, -100)`);
    m.avanzar(0.05);
  }
  assert.equal(enseña(m, V9), true, 'la cuenta volvió a cero');
  assert.equal(avisos(m), 0);
  sinErrores(m);
});

test('15d r4: un hostil que deshace la reserva en cada fotograma: nos rendimos tras más de 5 fotogramas seguidos, una sola vez y sin que nuestra ventana llegue a verse; igual corra antes o después de nuestros temporizadores', () => {
  for (const orden of ['antes', 'despues']) {
    const m = maquina({ previo: SUBASTA_TABS + SUJETA + HOSTIL_CADA(1, orden) });
    abrirSinEsperar(m);
    const vistos = [loQueSeVe(m)];
    for (let i = 0; i < 40; i++) {
      m.avanzar(0.05);
      vistos.push(loQueSeVe(m));
      assert.ok(m.lua(`${AH}:GetEffectiveAlpha()`) > 0 || !pulsable(m), `${orden}, fotograma ${i + 1}: nunca invisible y pulsable`);
    }
    assert.deepEqual(sinRepetir(vistos), ['nada', 'blizzard'], `${orden}: ${vistos}`);
    assert.equal(m.lua('DESHECHAS'), N_RENDIRSE + 1, `${orden}: nos rendimos al deshacerla en el fotograma ${N_RENDIRSE + 1} seguido`);
    assert.equal(avisos(m), 1, `${orden}: un aviso`);
    assert.ok(escalaDe(m) >= 0.1);
    devuelta(m, SUBASTA_ORIGINAL, `${orden}:`);
    assert.equal(enseña(m, V9), false);
    assert.equal(enseña(m, `${V9}.pestanaSnet`), true);
    assert.equal(m.lua(`${V9}.pestanaSnet:GetEffectiveAlpha()`) > 0, true, `${orden}: nuestra pestaña se ve, con las de Blizzard`);
    m.lua('ESCALAS = 0; hooksecurefunc(AuctionHouseFrame, "SetScale", function() ESCALAS = ESCALAS + 1 end)');
    m.avanzar(1);
    assert.equal(m.lua('ESCALAS'), 0, `${orden}: sin bucle`);
    sinErrores(m);
    // Si el hostil empieza cuando nuestra ventana ya se ve: un solo cambio, de la nuestra a la de Blizzard.
    const n = maquina({ previo: SUBASTA_TABS + SUJETA + HOSTIL_CADA(1, orden) + 'HOSTIL = false; ' });
    abrirSinEsperar(n);
    const w = recorrido(n, 10);
    n.lua('HOSTIL = true');
    for (let i = 0; i < 20; i++) { n.avanzar(0.05); w.push(loQueSeVe(n)); }
    assert.deepEqual(sinRepetir(w), ['nada', 'nuestra', 'blizzard'], `${orden}, empieza después: ${w}`);
    assert.equal(n.lua('DESHECHAS'), N_RENDIRSE + 1, `${orden}, empieza después`);
    assert.equal(avisos(n), 1);
    sinErrores(n);
  }
});

test('15d r4: un hostil que deshace la reserva cada dos fotogramas: seguimos con nuestra vista, la subasta siempre invisible y sin poderse pulsar, y nuestra ventana sale una sola vez', () => {
  for (const orden of ['antes', 'despues']) {
    const m = maquina({ previo: SUBASTA_TABS + SUJETA + HOSTIL_CADA(2, orden) });
    abrirSinEsperar(m);
    const vistos = [loQueSeVe(m)];
    for (let i = 0; i < 80; i++) {
      m.avanzar(0.05);
      vistos.push(loQueSeVe(m));
      assert.ok(oculta(m), `${orden}, fotograma ${i + 1}: ni se ve ni se puede pulsar`);
    }
    assert.deepEqual(sinRepetir(vistos), ['nada', 'nuestra'], `${orden}: ${vistos}`);
    // El velo no espera sin fin: como mucho un segundo (20 fotogramas de 0,05 s, más el del AUCTION_HOUSE_SHOW).
    const sale = vistos.indexOf('nuestra');
    assert.ok(sale >= 19 && sale <= 23, `${orden}: nuestra ventana sale al segundo: fotograma ${sale}`);
    assert.ok(m.lua('DESHECHAS') > 30, `${orden}: el hostil sigue: ${m.lua('DESHECHAS')}`);
    assert.equal(avisos(m), 0, `${orden}: no nos rendimos`);
    assert.equal(enseña(m, V9), true);
    m.lua(`${V9}.verBlizzard:Click()`);
    assert.equal(escalaDe(m), 1);
    devuelta(m, SUBASTA_ORIGINAL, `${orden}, Vista de Blizzard:`);
    sinErrores(m);
  }
});

test('15d r4: el velo dura como mucho un segundo de reloj (GetTime), no un número de fotogramas', () => {
  // A 5 fotogramas por segundo, con el hostil de cada dos fotogramas: sale al segundo (5 o 6 fotogramas), no a los 20.
  const m = maquina({ previo: 'BANCO.PASO = 0.2; ' + SUBASTA_TABS + SUJETA + HOSTIL_CADA(2, 'despues') });
  abrirSinEsperar(m);
  const vistos = [loQueSeVe(m)];
  for (let i = 0; i < 15; i++) { m.avanzar(0.2); vistos.push(loQueSeVe(m)); assert.ok(oculta(m)); }
  assert.deepEqual(sinRepetir(vistos), ['nada', 'nuestra'], `${vistos}`);
  const sale = vistos.indexOf('nuestra');
  assert.ok(sale >= 5 && sale <= 8, `sale al segundo: fotograma ${sale} de 0,2 s`);
  sinErrores(m);
  // Y con el hostil de cada fotograma a 5 fotogramas por segundo (rendirse tarda más de un segundo): el velo espera a que
  // acabe la racha, y nuestra ventana no llega a verse.
  const n = maquina({ previo: 'BANCO.PASO = 0.2; ' + SUBASTA_TABS + SUJETA + HOSTIL_CADA(1, 'despues') });
  abrirSinEsperar(n);
  const w = [loQueSeVe(n)];
  for (let i = 0; i < 15; i++) { n.avanzar(0.2); w.push(loQueSeVe(n)); }
  assert.deepEqual(sinRepetir(w), ['nada', 'blizzard'], `${w}`);
  sinErrores(n);
});

test('15d r4: mientras está velada, nuestra ventana no coge el ratón (ni ella, ni lo que cuelga de ella, ni su pestaña); al quitar el velo vuelve como estaba', () => {
  // Sin reserva: velada solo hasta el fotograma siguiente.
  const m = maquina({ previo: SUBASTA_TABS });
  abrirSinEsperar(m);
  assert.equal(m.lua(`${V9}:GetAlpha()`), 0, 'velada');
  assert.equal(m.lua(`${V9}:IsMouseEnabled()`), false, 'el marco raíz no coge el ratón');
  assert.equal(m.lua(`${V9}.pestanaSnet:IsMouseEnabled()`), false, 'su pestaña tampoco');
  assert.equal(conRaton(m), 0, 'nada de ella coge el ratón');
  m.avanzar(0.05);
  assert.equal(m.lua(`${V9}:GetAlpha()`), 1);
  assert.equal(m.lua(`${V9}:IsMouseEnabled()`), true, 'sin velo: otra vez con ratón');
  assert.equal(m.lua(`${V9}.pestanaSnet:IsMouseEnabled()`), true);
  const antes = conRaton(m);
  assert.ok(antes > 5, `los botones vuelven a coger el ratón: ${antes}`);
  // Lo que no cogía el ratón antes del velo sigue sin cogerlo después.
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.lua(`${V9}.verBlizzard:EnableMouse(false)`);
  const sinUno = conRaton(m);
  assert.equal(sinUno, antes - 1);
  abrirSinEsperar(m);
  assert.equal(conRaton(m), 0, 'otra apertura: velada sin ratón');
  m.avanzar(0.05);
  assert.equal(conRaton(m), sinUno, 'vuelve como estaba');
  assert.equal(m.lua(`${V9}.verBlizzard:IsMouseEnabled()`), false, 'lo que estaba apagado sigue apagado');
  sinErrores(m);
  // Con reserva: velada varios fotogramas, todos sin ratón.
  const n = maquina({ previo: SUBASTA_TABS + SUJETA });
  abrirSinEsperar(n);
  let velados = 0;
  for (let i = 0; i < 8; i++) {
    if (n.lua(`${V9}:GetEffectiveAlpha()`) === 0) {
      velados += 1;
      assert.equal(conRaton(n), 0, `fotograma ${i}: velada y sin ratón`);
    } else {
      assert.ok(conRaton(n) > 5, `fotograma ${i}: a la vista y con ratón`);
    }
    n.avanzar(0.05);
  }
  assert.ok(velados >= 3, `velada varios fotogramas: ${velados}`);
  sinErrores(n);
  // Si nos rendimos velados: nuestra pestaña (queda con las de Blizzard) vuelve a coger el ratón.
  const o = maquina({ previo: SUBASTA_TABS + SUJETA + HOSTIL(true) });
  abrir(o);
  o.avanzar(0.2);
  assert.equal(enseña(o, V9), false, 'rendidos');
  assert.equal(o.lua(`${V9}.pestanaSnet:IsMouseEnabled()`), true);
  assert.equal(o.lua(`${V9}:IsMouseEnabled()`), true);
  sinErrores(o);
  // Si se cierra velada: también vuelve.
  const p = maquina({ previo: SUBASTA_TABS });
  abrirSinEsperar(p);
  p.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(p.lua(`${V9}:IsMouseEnabled()`), true);
  assert.equal(p.lua(`${V9}.pestanaSnet:IsMouseEnabled()`), true);
  sinErrores(p);
});

// Ronda 3 de B5: en combate pulsar un escalón no abre el cuadro de cantidad.
test('ronda 3: en combate pulsar un escalón no abre el cuadro de cantidad', () => {
  const m = conElegida(`mercancias = {${LINO10}}`, 2589, 45000, 65);
  m.lua(`${TAB}:abrir(2589, true)`);
  m.disparar('PLAYER_REGEN_DISABLED'); // con InCombatLockdown() aún false, como en el cliente
  m.lua(`${TAB}.huecos[3]:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), false, 'no se abre');
  assert.equal(nCompras(m), 0);
  m.disparar('PLAYER_REGEN_ENABLED');
  m.lua(`${TAB}.huecos[3]:Click()`);
  assert.equal(m.lua('SnetForever.CantidadComercio.abierto()'), true, 'fuera de combate, sí');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T1a: un solo ayudante para el tooltip del objeto en todas las filas (UIComercio.tooltipObjeto y su esconder)
// ---------------------------------------------------------------------------------------------------

// Apunta lo que se pide al tooltip: los enlaces de SetHyperlink y los ids de SetItemByID.
const ESPIAR_TT = '_G.ENLACES = {}; _G.PORID = {}; _G.SHOWS = 0; local h, i, s = GameTooltip.SetHyperlink, GameTooltip.SetItemByID, GameTooltip.Show; GameTooltip.SetHyperlink = function(self, e) table.insert(ENLACES, e); return h(self, e) end; GameTooltip.SetItemByID = function(self, id) table.insert(PORID, id); return i(self, id) end; GameTooltip.Show = function(self) SHOWS = SHOWS + 1; return s(self) end';
const FILA_SUELTA = (lado) => `local f = CreateFrame("Frame", nil, UIParent); f:SetSize(200, 20); f:SetPoint("${lado}", UIParent, "${lado}", 0, 0); _G.FILA = f`;

test('una fila con enlace usa SetHyperlink y sin enlace SetItemByID (UIComercio.tooltipObjeto); con el tooltip prohibido no enseña nada', () => {
  const m = maquina();
  m.lua(ESPIAR_TT);
  m.lua(FILA_SUELTA('LEFT'));
  const enlace = '|cff1eff00|Hitem:4306::::::::25:::::::|h[Paño de seda del oso]|h|r';
  assert.equal(m.lua(`SnetForever.UIComercio.tooltipObjeto(FILA, {enlace = ${aLua(enlace)}, item = 4306})`), true);
  assert.deepEqual(m.lua('ENLACES'), [enlace], 'con enlace: SetHyperlink');
  assert.deepEqual(m.lua('PORID'), [], 'y no SetItemByID');
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.equal(m.lua('GameTooltip:GetOwner() == FILA'), true, 'anclado a la fila');
  assert.equal(m.lua('SHOWS'), 1, 'solo un Show, sin animación');
  m.lua('SnetForever.UIComercio.esconderTooltipObjeto(FILA)');
  assert.equal(m.lua('GameTooltip:IsShown()'), true, 'no al momento: pasada la espera (ronda 1, sin parpadeos)');
  m.avanzar(0.3);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2589})');
  assert.deepEqual(m.lua('PORID'), [2589], 'sin enlace: SetItemByID');
  m.lua('SnetForever.UIComercio.esconderTooltipObjeto(FILA)');
  m.avanzar(0.3);
  // Sin objeto (una fila de grupo o un aviso) no sale nada.
  assert.equal(m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {})'), false);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  m.lua('BANCO.tooltipProhibido = true');
  assert.equal(m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2589})'), false, 'IsForbidden: nada');
  assert.deepEqual(m.lua('PORID'), [2589]);
  m.lua('BANCO.tooltipProhibido = false');
  sinErrores(m);
});

test('el tooltip del objeto se ancla a la derecha de la fila y, si no cabe, a la izquierda; esconder solo quita el de esa fila', () => {
  const m = maquina();
  const punto = () => m.lua('(function() local p, r, rp, x, y = GameTooltip:GetPoint(1); return {p, r == FILA, rp, x, y, GameTooltip:GetNumPoints()} end)()');
  m.lua(FILA_SUELTA('LEFT'));
  m.lua('GameTooltip:SetWidth(300)');
  m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2589})');
  assert.deepEqual(punto(), ['LEFT', true, 'RIGHT', 0, 0, 1], 'a la derecha de la fila, como TSM');
  m.lua(FILA_SUELTA('RIGHT'));
  m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2589})');
  assert.deepEqual(punto(), ['RIGHT', true, 'LEFT', 0, 0, 1], 'pegada al borde derecho: a la izquierda');
  // Otro marco se ha quedado el tooltip (un botón con su ayuda): esconder la fila no se lo quita.
  m.lua('local b = CreateFrame("Frame", nil, UIParent); GameTooltip:SetOwner(b, "ANCHOR_TOP"); GameTooltip:SetText("ayuda"); GameTooltip:Show()');
  m.lua('SnetForever.UIComercio.esconderTooltipObjeto(FILA)');
  assert.equal(m.lua('GameTooltip:IsShown()'), true, 'no es suyo: se queda');
  sinErrores(m);
});

test('el nombre con sufijo sale del enlace, en los dos formatos de enlace (UIComercio.deEnlace)', () => {
  const m = maquina();
  const de = (e) => m.lua(`{SnetForever.UIComercio.deEnlace(${aLua(e)})}`);
  assert.deepEqual(de('|cff1eff00|Hitem:15248::::::::20:::::::|h[Hacha Natocolina de espíritu]|h|r'), ['Hacha Natocolina de espíritu', 2]);
  assert.deepEqual(de('|cnIQ3:|Hitem:15248::::::::20:::::::|h[Hacha Natocolina del oso]|h|r'), ['Hacha Natocolina del oso', 3]);
  assert.deepEqual(de('sin enlace'), []);
  assert.deepEqual(de(42), []);
  sinErrores(m);
});

test('con el ratón sobre un objeto de la lista vieja de grandes ofertas sale su tooltip anclado a la fila y al salir se esconde', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")'); // ronda 2: la lista a la vista (la luz no se enciende en una fila escondida)
  escanear(m, CINCO);
  const F1 = 'SnetForever.UIComercio.marco().filas[1]';
  m.lua(`${F1}:GetScript("OnEnter")(${F1})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.equal(m.lua('BANCO.lineasTooltip()[1]'), 'Paño de lino');
  assert.deepEqual(m.lua(`(function() local p, r, rp = GameTooltip:GetPoint(1); return {p, r == ${F1}, rp} end)()`), ['LEFT', true, 'RIGHT'], 'a la derecha de la fila, como TSM');
  m.lua(`${F1}:GetScript("OnLeave")(${F1})`);
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

test('sin parpadeos: en la lista vieja el tooltip no se esconde al cruzar de una fila a otra ni al temblar en el borde de la última', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")'); // ronda 2: la lista a la vista (la luz no se enciende en una fila escondida)
  escanear(m, CINCO);
  comprobarTemblor(m.lua(TEMBLOR('SnetForever.UIComercio.marco().filas[1]', 'SnetForever.UIComercio.marco().filas[2]', 'SnetForever.UIComercio.marco().filas[5]', LUZ)));
  sinErrores(m);
});

// Ronda 1, Importante 2: una fila que no es un objeto bajo el ratón (lo que avisaría la tabla al repintar) esconde el tooltip
// del objeto de antes.
test('lista vieja: una fila que no es un objeto bajo el ratón esconde el tooltip del objeto de antes', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")'); // ronda 2: la lista a la vista (la luz no se enciende en una fila escondida)
  escanear(m, CINCO);
  const F1 = 'SnetForever.UIComercio.marco().filas[1]';
  m.lua(`${F1}:GetScript("OnEnter")(${F1})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  m.lua(`SnetForever.UIComercio.marco().tabla._opciones.alEntrar({clave = "aviso"}, ${F1})`);
  m.avanzar(0.5);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  sinErrores(m);
});

// Ronda 1, menor 6: la lista solo esconde su propio tooltip.
test('lista vieja: al salir de una fila no se esconde el tooltip de otro marco', () => {
  const m = maquina();
  abrir(m);
  escanear(m, CINCO);
  const F1 = 'SnetForever.UIComercio.marco().filas[1]';
  m.lua(`${F1}:GetScript("OnEnter")(${F1})`);
  m.lua('local b = CreateFrame("Frame", nil, UIParent); GameTooltip:SetOwner(b, "ANCHOR_TOP"); GameTooltip:SetText("ayuda"); GameTooltip:Show()');
  m.lua(`${F1}:GetScript("OnLeave")(${F1})`);
  m.avanzar(0.5);
  assert.equal(m.lua('GameTooltip:IsShown()'), true, 'la ayuda del otro marco se queda');
  sinErrores(m);
});

// Ronda 1 (duda del SetOwner): volver a la misma fila con el mismo objeto (temblar en su borde) no vuelve a poner el tooltip:
// ni SetOwner ni anclaje nuevos; solo deja de esperar para esconderlo.
test('la misma fila con el mismo objeto no vuelve a poner el tooltip (sin SetOwner) y no se esconde', () => {
  const m = maquina();
  m.lua(FILA_SUELTA('LEFT'));
  const owners = () => m.llamadas('GameTooltip:SetOwner').length;
  m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2589})');
  const antes = owners();
  m.lua('SnetForever.UIComercio.esconderTooltipObjeto(FILA)');
  m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2589})');
  assert.equal(owners(), antes, 'sin SetOwner');
  m.avanzar(0.3);
  assert.equal(m.lua('GameTooltip:IsShown()'), true, 'y no se esconde');
  m.lua('SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2592})');
  assert.equal(owners(), antes + 1, 'otro objeto: se vuelve a poner');
  assert.equal(m.lua('BANCO.lineasTooltip()[1]'), 'Paño de lana');
  sinErrores(m);
});

// T1a, ronda 2, menor 1: soltarTooltipObjeto(fila) solo esconde el tooltip si es de la misma tabla que esa fila.
test('soltarTooltipObjeto solo esconde el tooltip de su tabla', () => {
  const m = maquina();
  m.lua(`local t1 = CreateFrame("Frame", nil, UIParent); local t2 = CreateFrame("Frame", nil, UIParent)
    _G.X = CreateFrame("Frame", nil, t1); X:SetSize(100, 20); X:SetPoint("LEFT", UIParent, "LEFT", 0, 0)
    _G.X2 = CreateFrame("Frame", nil, t1); X2:SetSize(100, 20); X2:SetPoint("LEFT", UIParent, "LEFT", 0, -20)
    _G.Y = CreateFrame("Frame", nil, t2); Y:SetSize(100, 20); Y:SetPoint("LEFT", UIParent, "LEFT", 0, -60)`);
  m.lua('SnetForever.UIComercio.tooltipObjeto(X, {item = 2589})');
  m.lua('SnetForever.UIComercio.soltarTooltipObjeto(Y)');
  assert.equal(m.lua('GameTooltip:IsShown() and GameTooltip:GetOwner() == X'), true, 'una fila de otra tabla no lo quita');
  m.lua('SnetForever.UIComercio.soltarTooltipObjeto(X2)');
  assert.equal(m.lua('GameTooltip:IsShown()'), false, 'una fila de su tabla, sí');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F1, ronda 1: la lista de ofertas enseña el precio de cada objeto de la misma foto que el tooltip (SNF.Subasta.foto: la
// lista de Navegar, si no la foto de la app y, solo sin ella, el escaneo), mira la regla con esa foto y dice cuál es y de
// cuándo en la columna Foto. Datos inventados.
// ---------------------------------------------------------------------------------------------------

// El escaneo falso con su hora de lectura: {item: [precio, cantidad, segundos desde que se leyó | null]}.
function escaneoConHora(m, datos) {
  const lua = Object.entries(datos).map(([item, [p, n, hace]]) => `[${item}] = {precio = ${p}, cantidad = ${n}${hace == null ? '' : `, hora = GetServerTime() - ${hace}`}}`);
  m.lua(`SnetForever.Escaneo._datos = {${lua.join(', ')}}`);
}
const filaDe = (m, item) => {
  for (let i = 1; i <= 20; i++) {
    const f = fila(m, i);
    if (!f) return null;
    if (f.item === item) return { ...f, i };
  }
  return null;
};

test('F1: cada fila de la lista de ofertas sale de la foto elegida, el veredicto se mira con ella y la columna Foto dice cuál y de cuándo', () => {
  const m = maquina();
  m.itemInfo(7777, { nombre: 'Sin foto de la app', calidad: 1 });
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  // El escaneo (una réplica): el lino barato (45 %) leído hace 1 min, la seda y un objeto que la app no trae.
  escaneoConHora(m, { 2589: [45000, 20, 60], 4306: [30000, 5, 60], 7777: [50000, 3, 300], 4338: [70000, 2, null] });
  // La lista de Navegar de la seda, leída hace 20 s: 60 % de lo normal (su hora es fija: la de la lectura).
  m.lua(`local leida = GetServerTime() - 20
  SnetForever.Busqueda.vivo = function(i)
    if i == 4306 then return {precio = 60000, cantidad = 9, hora = leida, origen = "lista"} end
  end`);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 4, 4)');
  m.avanzar(0.6);
  // El lino: la foto de la app (9g 80s, hace 17 min); la réplica de 4g 50s no gana y la fila no es buena compra.
  const lino = filaDe(m, 2589);
  assert.deepEqual([lino.precio, lino.cantidad, lino.fuente, lino.pct, lino.buena], [98000, 400, 'app', 98, false]);
  // Ronda 2: la columna dice la hora fija de la foto (la app, de las hh:22).
  const hora = (hace) => m.lua(`date("%H:%M", GetServerTime() - ${hace})`);
  assert.equal(celda(m, lino.i, 'foto'), `app ${m.lua('date("%H:%M", GetServerTime() - SnetForever.Precios.edad())')}`);
  // La seda: su lista de Navegar (6g, 9 unidades, ahora), buena compra mirada con ese mínimo.
  const seda = filaDe(m, 4306);
  assert.deepEqual([seda.precio, seda.cantidad, seda.fuente, seda.pct, seda.buena], [60000, 9, 'lista', 60, true]);
  assert.equal(celda(m, seda.i, 'foto'), `subasta ${hora(20)}`);
  // Lo que la app no trae: el escaneo, que dice que lo es y cuándo se leyó; sin la app no hay % ni buena compra.
  const suelto = filaDe(m, 7777);
  assert.deepEqual([suelto.precio, suelto.fuente, suelto.buena], [50000, 'escaneo', false]);
  assert.equal(celda(m, suelto.i, 'foto'), `escaneo ${hora(300)}`);
  // Con la app en el tejido mágico, el escaneo sin hora no se usa: sale la app.
  assert.equal(filaDe(m, 4338).fuente, 'app');
  // En inglés, con sus palabras.
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 4)');
  m.avanzar(0.6);
  assert.equal(celda(m, filaDe(m, 4306).i, 'foto'), `AH ${hora(20)}`);
  assert.equal(celda(m, filaDe(m, 7777).i, 'foto'), `scan ${hora(300)}`);
  // La hora no envejece: pasados 20 min, sin repintar, la celda dice lo mismo; y repintada, también (es la hora de la foto).
  const antes = celda(m, filaDe(m, 4306).i, 'foto');
  m.lua(`BANCO.tick = BANCO.tick + ${20 * 60 * 20}`);
  assert.equal(celda(m, filaDe(m, 4306).i, 'foto'), antes);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 4)');
  m.avanzar(0.6);
  assert.equal(celda(m, filaDe(m, 4306).i, 'foto'), antes, 'repintada, la misma hora');
  sinErrores(m);
});

test('F1: los textos de la columna Foto llevan la hora fija de la foto (otro día, el día); el tooltip sigue con «hace»', () => {
  const m = maquina();
  const conHora = (f, hace) => m.lua(`SnetForever.UIComercio.momentoHora(${JSON.stringify(f)}, ${hace == null ? 'nil' : `GetServerTime() - ${hace}`})`);
  const largo = (f, s) => m.lua(`SnetForever.UIComercio.momento(${JSON.stringify(f)}, ${s == null ? 'nil' : s})`);
  const hh = (hace) => m.lua(`date("%H:%M", GetServerTime() - ${hace})`);
  assert.deepEqual([conHora('lista', 20), conHora('app', 1020), conHora('escaneo', 300), conHora('navegar', 60)],
    [`subasta ${hh(20)}`, `app ${hh(1020)}`, `escaneo ${hh(300)}`, `navegar ${hh(60)}`]);
  assert.deepEqual([conHora('escaneo', null), conHora('app', null), conHora('otra', 5)], ['escaneo', 'app', '']);
  // Una foto de otro día dice el día.
  assert.equal(conHora('app', 2 * 86400), `app ${m.lua('date("%d/%m", GetServerTime() - 2 * 86400)')}`);
  // El tooltip, que se rehace cada vez que se abre, sigue con «hace».
  assert.deepEqual([largo('lista', 20), largo('app', 20), largo('app', 1020), largo('escaneo', 20), largo('escaneo', null), largo('otra', 5)],
    ['(subasta, ahora mismo)', '(app, hace menos de 1 min)', '(app, hace 17 min)', '(escaneo, leído hace menos de 1 min)', '(escaneo)', '']);
  for (const [f, s] of [['app', 20], ['escaneo', 20], ['app', null], ['escaneo', null]]) {
    assert.ok(!largo(f, s).includes('ahora'), `${f} ${s}: solo la lista es «ahora»`);
  }
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.deepEqual([conHora('lista', 20), conHora('escaneo', 300), conHora('navegar', 60)], [`AH ${hh(20)}`, `scan ${hh(300)}`, `browse ${hh(60)}`]);
  sinErrores(m);
});

// La letra de verdad (Montserrat, anchos medidos por carácter y punto, como en comercio-compra), un 3 % más ancha por si acaso.
const FACTOR_LETRA_F1 = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };

test('F1: la columna Foto cabe en es y en con la letra de verdad y la ventana al mínimo (830 × 500)', () => {
  for (const idioma of ['es', 'en']) {
    const m = maquina();
    m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA_F1).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);
    m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.ventanaSubasta = {x = 50, y = 50, ancho = 800, alto = 450}');
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    m.itemInfo(7777, { nombre: 'Sin foto de la app', calidad: 1 });
    abrir(m);
    m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
    // Los textos más largos de cada fuente («escaneo 14:02», «subasta 14:32»; la app de otro día, «app 18/11»).
    escaneoConHora(m, { 7777: [50000, 3, 3599], 4306: [30000, 5, 60] });
    m.lua(`SnetForever.Busqueda.vivo = function(i)
      if i == 4306 then return {precio = 60000, cantidad = 9, hora = GetServerTime() - 3599, origen = "lista"} end
    end`);
    m.lua('SnetForever.Precios.edad = function() return 2 * 86400 end');
    escaneoConHora(m, { 7777: [50000, 3, 3599], 4306: [30000, 5, 60], 2589: [45000, 20, 60] });
    m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 3, 3)');
    m.avanzar(0.6);
    const r = m.lua(`(function()
      local t = SnetForever.UIComercio.tabla()
      local r = {ancho = SnetForever.SubastaVentana.sitioActual().ancho, col = t:anchoDe("foto"), textos = {}, malos = {}}
      local c = t.cabeceras.foto
      if c.texto:GetUnboundedStringWidth() > c:GetWidth() - 8 then r.malos[#r.malos + 1] = "cabecera" end
      for _, h in ipairs(t.huecos) do
        if h:IsShown() then
          local fs = h.celdas.foto
          r.textos[#r.textos + 1] = fs:GetText()
          if fs:GetUnboundedStringWidth() > t:anchoDe("foto") - 8 then r.malos[#r.malos + 1] = fs:GetText() .. " " .. fs:GetUnboundedStringWidth() end
        end
      end
      -- La tabla entera dentro de la ventana.
      local v = SnetForever.UIComercio.marco()
      r.dentro = t.marco:GetRight() <= v:GetRight() + 0.01
      return r
    end)()`);
    assert.equal(Math.round(r.ancho), 830, `${idioma}: al mínimo`);
    assert.equal(r.textos.length, 3, JSON.stringify(r));
    assert.deepEqual(r.malos, [], `${idioma}: textos que no caben (columna de ${r.col}): ${JSON.stringify(r.textos)}`);
    assert.equal(r.dentro, true, `${idioma}: la tabla dentro de la ventana`);
    sinErrores(m);
  }
});

test('F1 ronda 2: al llegar una lista de Navegar, la lista de ofertas se repinta, como con el escaneo (como mucho cada medio segundo)', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  escaneoConHora(m, { 4306: [30000, 5, 60] });
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 1, 1)');
  m.avanzar(0.6);
  assert.equal(filaDe(m, 4306).fuente, 'app');
  // Llega la lista de la seda (versionVivo sube): el aviso de la búsqueda repinta la lista.
  m.lua(`VERSION = 1
    SnetForever.Busqueda.versionVivo = function() return VERSION end
    SnetForever.Busqueda.vivo = function(i)
      if i == 4306 then return {precio = 60000, cantidad = 9, hora = GetServerTime() - 2, origen = "lista"} end
    end`);
  m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "completa")');
  m.avanzar(0.6);
  assert.deepEqual([filaDe(m, 4306).fuente, filaDe(m, 4306).precio], ['lista', 60000]);
  // Otra lista más (VERSION 2): de dos avisos seguidos con la misma lista, solo el primero repinta (ronda 3: el segundo no
  // trae una lista nueva), y lo hace con lo último.
  m.lua(`VERSION = 2
    SnetForever.Busqueda.vivo = function(i)
      if i == 4306 then return {precio = 55000, cantidad = 4, hora = GetServerTime() - 1, origen = "lista"} end
    end`);
  m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "buscando"); SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "completa")');
  m.avanzar(0.6);
  assert.equal(filaDe(m, 4306).precio, 55000, 'con la lista nueva');
  sinErrores(m);
});

// F1 (ronda 3): las páginas de una búsqueda y las listas a medias no cambian versionVivo: su aviso no recalcula nada.
test('F1 ronda 3: un aviso de la búsqueda sin lista nueva (páginas, listas a medias) no recalcula la lista de ofertas', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  escaneoConHora(m, { 4306: [30000, 5, 60] });
  m.lua(`VERSION = 3
    SnetForever.Busqueda.versionVivo = function() return VERSION end
    SnetForever.Busqueda.vivo = function(i)
      if i == 4306 then return {precio = 60000, cantidad = 9, hora = GetServerTime() - 2, origen = "lista"} end
    end`);
  m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "completa")');
  m.avanzar(0.6);
  assert.equal(filaDe(m, 4306).precio, 60000);
  // Cuenta las veces que se pide la foto de un objeto (cada recálculo la pide).
  m.lua(`FOTOS = 0
    local foto = SnetForever.Subasta.foto
    SnetForever.Subasta.foto = function(...) FOTOS = FOTOS + 1 return foto(...) end`);
  for (let i = 0; i < 5; i++) {
    m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "buscando")');
    m.avanzar(0.6);
  }
  assert.equal(m.lua('FOTOS'), 0, 'cinco páginas sin lista nueva: nada se recalcula');
  m.lua('VERSION = 4; SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "completa")');
  m.avanzar(0.6);
  assert.ok(m.lua('FOTOS') > 0, 'con una lista nueva, sí');
  sinErrores(m);
});

// F1 (detalle que va con F2): al cerrar la subasta se olvida la versión de la última lista, para que al volver a abrirla la
// primera lista repinte la lista de ofertas aunque versionVivo no haya cambiado.
test('F1: al cerrar la subasta se olvida la versión de las listas; al volver a abrirla, la primera lista repinta las ofertas', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  escaneoConHora(m, { 4306: [30000, 5, 60] });
  m.lua(`VERSION = 7
    SnetForever.Busqueda.versionVivo = function() return VERSION end
    SnetForever.Busqueda.vivo = function(i)
      if i == 4306 then return {precio = 60000, cantidad = 9, hora = GetServerTime() - 2, origen = "lista"} end
    end`);
  m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "completa")');
  m.avanzar(0.6);
  assert.equal(m.lua('SnetForever.UIComercio._versionListas'), 7);
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m.lua('SnetForever.UIComercio._versionListas') ?? null, null, 'al cerrar se olvida');
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  m.avanzar(0.6);
  m.lua(`FOTOS = 0
    local foto = SnetForever.Subasta.foto
    SnetForever.Subasta.foto = function(...) FOTOS = FOTOS + 1 return foto(...) end`);
  m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "completa")');
  m.avanzar(0.6);
  assert.ok(m.lua('FOTOS') > 0, 'la primera lista tras volver a abrir repinta, con la misma versión');
  sinErrores(m);
});

// F1 (ronda 3): la hora de la columna Foto es la de la foto misma (Subasta.foto la da), no «ahora menos la edad»: aunque el
// reloj avance entre la edad y el ahora de calcular, no se mueve entre repintados.
test('F1 ronda 3: la hora de cada fila es la de su foto, la misma en cada repintado aunque cambie el reloj', () => {
  const m = maquina();
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  m.lua(`local leida = GetServerTime() - 31
    SnetForever.Busqueda.vivo = function(i)
      if i == 4306 then return {precio = 60000, cantidad = 9, hora = leida, origen = "lista"} end
    end
    LEIDA = leida`);
  escaneoConHora(m, { 4306: [30000, 5, 60], 2589: [45000, 20, 60] });
  const horas = () => [filaDe(m, 4306).hora, filaDe(m, 2589).hora];
  const esperadas = m.lua('{LEIDA, SnetForever.Precios.generado()}');
  // El reloj del servidor que se lee avanza un segundo en cada lectura (como si cada llamada cayera en otro segundo): con
  // «ahora menos la edad», la hora de la fila se movería entre la lectura de Subasta.foto y la de calcular.
  m.lua(`local real, n = SnetForever.API.horaServidor, 0
    SnetForever.API.horaServidor = function() n = n + 1 return real() + n end`);
  for (let i = 0; i < 4; i++) {
    m.lua(`BANCO.tick = BANCO.tick + ${17 * 20}`); // 17 s cada vez
    m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 0, 2)');
    m.avanzar(0.6);
    assert.deepEqual(horas(), esperadas, `repintado ${i + 1}`);
  }
  // Y la de la app es la de su foto (Precios.generado), con la misma hora que dice la celda.
  assert.equal(celda(m, filaDe(m, 2589).i, 'foto'), `app ${m.lua('date("%H:%M", SnetForever.Precios.generado())')}`);
  sinErrores(m);
});

// F9p: la marca de una mercancía aprobada se distingue de la de un aprobado normal; una textura fija, sin colores que cambien.
test('una mercancía aprobada dice rotación sin confirmar en la lista de ofertas; un objeto suelto no', () => {
  const m = maquina({ mercancias: [2589] });
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  escanear(m, { 2589: 45000, 2592: 79000, 4306: 99000 });
  const F = (i) => `SnetForever.UIComercio.marco().filas[${i}]`;
  assert.deepEqual([fila(m, 1).item, fila(m, 1).buena, fila(m, 1).rotacionSinConfirmar], [2589, true, true]);
  assert.deepEqual([fila(m, 2).item, fila(m, 2).buena, fila(m, 2).rotacionSinConfirmar ?? false], [2592, true, false]);
  assert.equal(fila(m, 3).buena, false);
  assert.equal(m.lua(`${F(1)}.buena:IsShown()`), true);
  assert.equal(m.lua(`${F(1)}.buena:GetTexture()`), 'Interface\\RaidFrame\\ReadyCheck-Waiting');
  assert.equal(m.lua(`${F(2)}.buena:GetTexture()`), 'Interface\\RaidFrame\\ReadyCheck-Ready');
  // El tooltip de la fila lo dice con palabras; el de un objeto suelto, no.
  const FRASE = 'Rotación sin confirmar: lo que sale puede ser cancelaciones';
  m.lua(`${F(1)}:GetScript("OnEnter")(${F(1)})`);
  assert.ok(m.lua('BANCO.lineasTooltip()').some((x) => x.includes(FRASE)), 'la fila de la mercancía');
  m.lua(`${F(2)}:GetScript("OnEnter")(${F(2)})`);
  m.avanzar(0.3); // la luz de la tabla cruza de una fila a otra tras su espera
  assert.ok(!m.lua('BANCO.lineasTooltip()').some((x) => x.includes(FRASE)), 'la del objeto suelto');
  // El hueco se reutiliza: al cambiar de orden, cada fila lleva su marca.
  m.lua(`${F(2)}:GetScript('OnLeave')(${F(2)})`);
  m.avanzar(0.6);
  escanear(m, { 2589: 79000, 2592: 45000, 4306: 99000 });
  m.avanzar(0.6); // los avisos del escaneo se repintan agrupados
  assert.equal(fila(m, 1).item, 2592);
  assert.equal(m.lua(`${F(1)}.buena:GetTexture()`), 'Interface\\RaidFrame\\ReadyCheck-Ready');
  assert.equal(m.lua(`${F(2)}.buena:GetTexture()`), 'Interface\\RaidFrame\\ReadyCheck-Waiting');
  sinErrores(m);
});

// F9p, ronda 1: con el ratón quieto en la fila, la línea del tooltip dice lo mismo que la marca, en los dos sentidos.
const FRASE_F9 = 'Rotación sin confirmar: lo que sale puede ser cancelaciones';
const conFrase = (m) => m.lua('BANCO.lineasTooltip()').filter((x) => x.includes(FRASE_F9)).length;
function llegaPrecio(m, precio) {
  m.avanzar(1);
  escanear(m, { 2589: precio });
  m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "lista")');
  m.avanzar(1);
}

test('la línea de rotación sin confirmar se va de la fila si la mercancía pasa a cara, sin rehacer el tooltip de más', () => {
  const m = maquina({ mercancias: [2589] });
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  escanear(m, { 2589: 45000 });
  m.avanzar(0.6);
  const F = 'SnetForever.UIComercio.marco().filas[1]';
  m.lua(`${F}:GetScript("OnEnter")(${F})`);
  assert.equal(conFrase(m), 1);
  const dueños = m.llamadas('GameTooltip:SetOwner').length;
  const refrescos = m.llamadas('GameTooltip:RefreshData').length;
  llegaPrecio(m, 99000);
  assert.equal(m.lua(`${F}.buena:IsShown()`), false, 'la marca se va');
  assert.equal(conFrase(m), 0, 'y la línea también');
  assert.equal(m.llamadas('GameTooltip:SetOwner').length, dueños, 'no se vuelve a anclar');
  assert.equal(m.llamadas('GameTooltip:RefreshData').length, refrescos + 1, 'un solo repintado');
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  sinErrores(m);
});

test('la línea de rotación sin confirmar aparece en la fila si la mercancía pasa a aprobada, una sola vez', () => {
  const m = maquina({ mercancias: [2589] });
  abrir(m);
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  escanear(m, { 2589: 99000 });
  m.avanzar(0.6);
  const F = 'SnetForever.UIComercio.marco().filas[1]';
  m.lua(`${F}:GetScript("OnEnter")(${F})`);
  assert.equal(conFrase(m), 0);
  const dueños = m.llamadas('GameTooltip:SetOwner').length;
  llegaPrecio(m, 45000);
  assert.equal(m.lua(`${F}.buena:IsShown()`), true, 'la marca aparece');
  assert.equal(conFrase(m), 1, 'y la línea, una vez');
  llegaPrecio(m, 46000);
  assert.equal(conFrase(m), 1, 'otra lista no la repite');
  assert.equal(m.llamadas('GameTooltip:SetOwner').length, dueños, 'no se vuelve a anclar');
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  sinErrores(m);
});
