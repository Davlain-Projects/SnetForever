// Comercio, tarea 15: la IA ve el comercio (ctx.comercio con la subasta abierta) y propone grupos y reglas que el jugador
// aplica con [Aplicar] o descarta con [Descartar] en el chat (comercio/propuesta.lua y ui/chat.lua). Nada cambia sin
// Aplicar y el addon nunca compra ni publica nada por el jugador.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { sinErrores, testConComercio as test } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever_Comercio'); // 0.7.0: el comercio es un addon aparte
const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000; // GetServerTime() del banco al empezar (hh:13:20): se carga la ranura de la hora anterior
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde' }; // casa supuesta 114

// Una ranura de precios como la escribe la app (Task 7), con la foto de la hora anterior y estas filas de la casa 114:
// {item: [precio, cantidad, normal, tendencia, ritmo|-1, vendidosDia|-1, poco]}.
function carpetaConPrecios(filas) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-propuesta-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  const i = ranuraDeHora(H - 1);
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\np2.lua\np3.lua\np4.lua\np5.lua\np6.lua\n`);
  const guarda = 'local P = SNF_PRECIOS; if not (P and P.seq == 1) then return end\n';
  const lineas = Object.entries(filas).map(([item, f]) => `P.casas[114][${item}] = {${f.join(', ')}}`);
  const archivos = [
    `SNF_PRECIOS = {v = 1, seq = 1, generado = ${(H - 1) * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114}, casas = {[114] = {}}, grupos = {}, nombres = {}}\n`,
    `${guarda}${lineas.join('\n')}\n`, guarda, guarda, guarda,
    `${guarda}SNF_PRECIOS.completo = true\n`,
  ];
  archivos.forEach((texto, k) => writeFileSync(join(carpeta, `p${k + 1}.lua`), texto));
  return dir;
}

// 25 objetos buenos (normal 10 de oro, ritmo 0,5, entre el 51 y el 75 % de lo normal), uno caro y uno sin ritmo.
function filasDePrueba() {
  const filas = {};
  for (let k = 1; k <= 25; k++) filas[4000 + k] = [50000 + k * 1000, 10, 100000, 0, 0.5, 20, 0];
  filas[4100] = [95000, 3, 100000, 0, 0.9, 5, 0];
  filas[4101] = [10000, 3, 100000, 0, -1, -1, 0];
  return filas;
}

function maquina(opciones = {}) {
  const m = crearMaquina({ addonsDir: carpetaConPrecios(filasDePrueba()), jugador: JUGADOR, ...opciones });
  return m;
}

const P = 'SnetForever.Propuesta';
const MC = 'SnetForever.Chat.marcos';
const responder = (m, registro) => m.lua(`SnetForever.Eventos.emitir("SNF_IA_RESPUESTA", ${aLua({ t: 'respuesta', texto: 'Te propongo un grupo.', ...registro })})`);
const conChat = (m) => { m.lua('SlashCmdList.SNET("chat")'); return m; };
const propios = (m) => m.lua('(function() local n = 0 for _, g in ipairs(SnetForever.Grupos.lista()) do if g.tipo == "propio" then n = n + 1 end end return n end)()');

const HIERBAS = { grupo: { nombre: 'Hierbas rápidas', objetos: [2447, 765] }, regla: { compraPct: 70, ritmoMin: 0.5 } };

// ---------------------------------------------------------------------------------------------------
// La tarjeta del chat
// ---------------------------------------------------------------------------------------------------

test('chat: un SNF_IA_RESPUESTA con registro.comercio enseña la tarjeta con Aplicar y Descartar', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  responder(m, { comercio: HIERBAS });
  assert.equal(m.lua(`${MC}.comercio:IsVisible()`), true);
  assert.equal(m.lua(`${MC}.comercio.aplicar.texto:GetText()`), m.lua('SnetForever.L.t("CHAT_APLICAR")'));
  assert.equal(m.lua(`${MC}.comercio.descartar.texto:GetText()`), m.lua('SnetForever.L.t("CHAT_DESCARTAR")'));
  const texto = m.lua(`${MC}.comercio.texto:GetText()`);
  assert.ok(texto.includes('Hierbas rápidas') && texto.includes('2 objetos'), texto);
  assert.ok(texto.includes('70 %') && texto.includes('0,50'), texto);
  // Nada ha cambiado todavía.
  assert.equal(propios(m), 0);
  assert.ok(m.lua(`${P}.pendiente()`));
  sinErrores(m);
});

test('chat: Descartar no crea nada y oculta la tarjeta', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  responder(m, { comercio: HIERBAS });
  m.lua(`${MC}.comercio.descartar:Click()`);
  assert.equal(m.lua(`${MC}.comercio:IsVisible()`), false);
  assert.equal(m.lua(`${P}.pendiente()`), undefined);
  assert.equal(propios(m), 0);
  assert.equal(m.lua('next(SnetForeverCuenta.comercio.reglas or {})'), undefined);
  sinErrores(m);
});

test('chat: Aplicar crea el grupo con sus objetos y su regla, y lo dice en el chat', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  responder(m, { comercio: HIERBAS });
  m.lua(`${MC}.comercio.aplicar:Click()`);
  assert.equal(m.lua(`${MC}.comercio:IsVisible()`), false);
  const g = m.lua('SnetForever.Grupos.lista()[1]');
  assert.equal(g.tipo, 'propio');
  assert.equal(g.nombre, 'Hierbas rápidas');
  assert.deepEqual(g.objetos, [765, 2447], 'los números salen de menor a mayor');
  const regla = m.lua(`SnetForever.Reglas.de(${aLua(g.clave)})`);
  assert.equal(regla.compraPct, 70);
  assert.equal(regla.ritmoMin, 0.5);
  assert.equal(regla.sniperPct, 90, 'lo que no trae la propuesta, de la plantilla');
  const ultima = m.lua('SnetForeverPJ.ia.chat').slice(-1)[0];
  assert.deepEqual(ultima, { q: 'sistema', t: 'Grupo «Hierbas rápidas» creado con 2 objetos.' });
  sinErrores(m);
});

test('chat: la tarjeta de comercio no tapa las demás propuestas', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  const P1 = { mapa: 1411, x: 40, y: 20, etiqueta: 'Habla con Garra', tipo: 'recoger', q: 4641, seguir: true };
  responder(m, { comercio: HIERBAS, propuesta: { titulo: 'Garra', puntos: [P1] } });
  const caja = (marco) => m.lua(`(function() local f = ${marco}; return {f:GetBottom(), f:GetTop()} end)()`);
  const a = caja(`${MC}.comercio`);
  const b = caja(`${MC}.propuesta`);
  const c = caja(`${MC}.cajaMensajes`);
  const solapan = (x, y) => x[0] < y[1] - 0.5 && y[0] < x[1] - 0.5;
  assert.ok(!solapan(a, b), `comercio ${a} y ruta ${b}`);
  assert.ok(!solapan(a, c), `comercio ${a} y mensajes ${c}`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Propuesta: validación y aplicar
// ---------------------------------------------------------------------------------------------------

test('propuesta: proponer emite SNF_COMERCIO_PROPUESTA; lo inválido no se propone y quita la pendiente de antes', () => {
  const m = crearMaquina({ jugador: JUGADOR });
  m.lua('rawset(_G, "VISTAS", {}) SnetForever.Eventos.escuchar("SNF_COMERCIO_PROPUESTA", function(p) VISTAS[#VISTAS + 1] = p ~= nil end)');
  assert.equal(m.lua(`${P}.proponer(${aLua(HIERBAS)})`), true);
  assert.deepEqual(m.lua('VISTAS'), [true]);
  for (const mala of [
    { grupo: { nombre: '   ', objetos: [2447] } },
    { grupo: { nombre: '|||', objetos: [2447] } },
    { grupo: { nombre: 'Sin objetos', objetos: [] } },
    { grupo: { nombre: 'Malos', objetos: ['x', -1, 2.5] } },
    { grupo: { nombre: 'Regla mala', objetos: [2447] }, regla: { compraPct: 150 } },
    { grupo: { nombre: 'Unidades', objetos: [2447] }, regla: { maxUnidades: 2.5 } },
    { regla: { compraPct: 70 } }, // sin grupo nuevo ni grupo abierto
    'nada',
  ]) {
    // Hay una buena pendiente: la nueva, aunque no valga, la quita (y emite para que el chat repinte).
    m.lua(`${P}.proponer(${aLua(HIERBAS)})`);
    assert.equal(m.lua(`${P}.proponer(${aLua(mala)})`), false, JSON.stringify(mala));
    assert.equal(m.lua(`${P}.pendiente()`), undefined, JSON.stringify(mala));
  }
  assert.equal(m.lua('#VISTAS'), 17);
  assert.equal(m.lua('VISTAS[#VISTAS]'), false);
  // El nombre pierde los «|» y se corta a 60 bytes sin partir un carácter (Grupos corta en bytes).
  m.lua(`${P}.proponer(${aLua({ grupo: { nombre: '|cFFFF0000Rojas|r', objetos: [2447] } })})`);
  assert.equal(m.lua(`${P}.pendiente().grupo.nombre`), 'cFFFF0000Rojasr');
  m.lua(`${P}.proponer(${aLua({ grupo: { nombre: 'ñ'.repeat(40), objetos: [2447] } })})`);
  assert.equal(m.lua(`${P}.pendiente().grupo.nombre`), 'ñ'.repeat(30));
  m.lua(`${P}.aplicar()`);
  assert.equal(m.lua('SnetForever.Grupos.lista()[1].nombre'), 'ñ'.repeat(30));
  // Más de 200 ids: se quedan los 200 primeros.
  const ids = Array.from({ length: 250 }, (_, k) => 9000 + k);
  assert.equal(m.lua(`${P}.proponer(${aLua({ grupo: { nombre: 'Muchos', objetos: ids } })})`), true);
  assert.equal(m.lua(`#${P}.pendiente().grupo.objetos`), 200);
  assert.equal(propios(m), 1, 'proponer no crea nada (el único es el aplicado arriba)');
  sinErrores(m);
});

test('chat (revisión): una propuesta nueva que no vale quita la tarjeta de la anterior', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  responder(m, { comercio: HIERBAS });
  assert.equal(m.lua(`${MC}.comercio:IsVisible()`), true);
  responder(m, { comercio: { grupo: { nombre: '', objetos: [1] } } });
  assert.equal(m.lua(`${MC}.comercio:IsVisible()`), false);
  assert.equal(m.lua(`${P}.pendiente()`), undefined);
  sinErrores(m);
});

const GUIA = { clave: 'Prueba (H)\\02-03 Sigue', titulo: 'x' };
const fallosComercio = (m) => (m.lua('SnetForeverCuenta.fallos') || []).filter((f) => f.origen === 'comercio');

test('chat (revisión): si Propuesta.proponer falla, la guía del mismo registro sale igual y no hay error de Lua', () => {
  for (const abrir of [false, true]) {
    const m = conChat(crearMaquina({ jugador: JUGADOR }));
    if (abrir) m.disparar('AUCTION_HOUSE_SHOW');
    m.lua(`${P}.proponer = function() error("roto") end`);
    responder(m, { comercio: HIERBAS, guia: GUIA });
    assert.equal(m.lua(`${MC}.guia:IsVisible()`), true, `subasta abierta: ${abrir}`);
    assert.equal(m.lua(`${MC}.comercio:IsVisible()`), false);
    const fallos = fallosComercio(m);
    assert.equal(fallos.length, 1);
    assert.match(fallos[0].texto, /^propuesta: .*roto/);
    sinErrores(m);
  }
});

test('chat (revisión): con la subasta cerrada un fallo no apaga el comercio; las propuestas siguen funcionando', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  const proponer = m.lua(`(function() rawset(_G, "PROPONER", ${P}.proponer) return true end)()`);
  assert.equal(proponer, true);
  m.lua(`${P}.proponer = function() error("roto") end`);
  responder(m, { comercio: HIERBAS });
  m.lua(`${P}.proponer = PROPONER`);
  responder(m, { comercio: HIERBAS });
  assert.equal(m.lua(`${MC}.comercio:IsVisible()`), true);
  // Y al abrir la subasta el comercio funciona.
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
  sinErrores(m);
});

test('chat (revisión): si aplicar falla, la línea dice que no se ha podido y no hay error de Lua', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  responder(m, { comercio: HIERBAS });
  m.lua(`${P}.aplicar = function() error("roto al aplicar") end`);
  m.lua(`${MC}.comercio.aplicar:Click()`);
  assert.deepEqual(m.lua('SnetForeverPJ.ia.chat').slice(-1)[0], { q: 'sistema', t: m.lua('SnetForever.L.t("CHAT_COMERCIO_NO_APLICADO")') });
  assert.equal(fallosComercio(m).length, 1);
  assert.equal(propios(m), 0);
  sinErrores(m);
});

test('chat (revisión): con un solo objeto la línea va en singular', () => {
  const m = conChat(crearMaquina({ jugador: JUGADOR }));
  responder(m, { comercio: { grupo: { nombre: 'Uno', objetos: [2447] } } });
  m.lua(`${MC}.comercio.aplicar:Click()`);
  assert.equal(m.lua('SnetForeverPJ.ia.chat').slice(-1)[0].t, 'Grupo «Uno» creado con 1 objeto.');
  sinErrores(m);
});

test('propuesta: una regla sola va al grupo abierto que existe; si el grupo ya no está, no se aplica nada', () => {
  const m = crearMaquina({ jugador: JUGADOR });
  const clave = m.lua('SnetForever.Grupos.crear("Telas")');
  assert.equal(m.lua(`${P}.proponer(${aLua({ regla: { sniperPct: 75 }, paraGrupo: { clave, nombre: 'Telas' } })})`), true);
  assert.equal(m.lua(`${P}.aplicar()`), true);
  assert.equal(m.lua(`SnetForever.Reglas.de(${aLua(clave)}).sniperPct`), 75);
  assert.equal(m.lua(`${P}.pendiente()`), undefined);
  m.lua(`${P}.proponer(${aLua({ regla: { sniperPct: 60 }, paraGrupo: { clave: 'propio:99', nombre: 'Borrado' } })})`);
  assert.equal(m.lua(`(${P}.aplicar())`), false);
  assert.equal(m.lua('SnetForeverCuenta.comercio.reglas["propio:99"]'), undefined);
  sinErrores(m);
});

test('propuesta: el código de propuesta.lua no compra, no puja y no publica', () => {
  const texto = readFileSync(join(ADDON, 'comercio', 'propuesta.lua'), 'utf8');
  for (const f of ['PlaceBid', 'StartCommoditiesPurchase', 'ConfirmCommoditiesPurchase', 'PostItem', 'PostCommodity']) {
    assert.ok(!texto.includes(f), f);
  }
});

// ---------------------------------------------------------------------------------------------------
// Contexto: ctx.comercio
// ---------------------------------------------------------------------------------------------------

test('contexto: con la subasta abierta lleva comercio con casa, edad de precios y como mucho 20 oportunidades', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.Contexto.construir().comercio'), undefined, 'sin subasta no va');
  m.disparar('AUCTION_HOUSE_SHOW');
  const c = m.lua('SnetForever.Contexto.construir().comercio');
  assert.equal(c.casa, 114);
  assert.equal(typeof c.edadPrecios, 'number');
  assert.equal(c.oportunidades.length, 20);
  assert.deepEqual(c.oportunidades[0], { id: 4001, precio: 51000, pct: 51, ritmo: 0.5, fuente: 'app', edad: c.edadPrecios },
    'F1: cada oportunidad dice de qué foto es y su edad');
  const ids = c.oportunidades.map((o) => o.id);
  assert.ok(!ids.includes(4100), 'la cara no es una oportunidad');
  assert.ok(!ids.includes(4101), 'sin ritmo no es una oportunidad');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(m.lua('SnetForever.Contexto.construir().comercio'), undefined, 'al cerrar ya no va');
  sinErrores(m);
});

// F9p, ronda 1: la oportunidad lleva el dato ella misma: puede quedarse fuera de los 60 objetos de datos.comercio.
test('contexto: una oportunidad de una mercancía lleva mercancia; la de un objeto suelto, no', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua('SNF_PRECIOS.casas[114][4001][10] = 1');
  const c = m.lua('SnetForever.Contexto.construir().comercio');
  const por = (id) => c.oportunidades.find((o) => o.id === id);
  assert.equal(por(4001).mercancia, true);
  assert.equal(por(4002).mercancia, undefined);
  sinErrores(m);
});

// F1 (ronda 1): antes, en cuanto el escaneo traía algo, las oportunidades salían solo de él (una réplica vieja podía dar una
// «buena compra» que ya no existía). Ahora cada objeto sale de la foto que elige SNF.Subasta.foto, con su fuente y su edad.
test('contexto: con escaneo y app, las oportunidades salen de la app (la réplica no gana); con la lista de Navegar, de la lista', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua(`SnetForever.Escaneo = {datos = function() return {[4005] = {precio = 30000, cantidad = 2, hora = GetServerTime() - 60}, [4100] = {precio = 30000, cantidad = 1, hora = GetServerTime() - 60}, [9000] = {precio = 10, cantidad = 1, hora = GetServerTime() - 60}} end}`);
  const c = m.lua('SnetForever.Contexto.construir().comercio');
  const por = (id) => c.oportunidades.find((o) => o.id === id);
  assert.deepEqual(por(4005), { id: 4005, precio: 55000, pct: 55, ritmo: 0.5, fuente: 'app', edad: c.edadPrecios }, 'la réplica de 3 de oro no gana a la app');
  assert.equal(por(4100), undefined, 'la cara (9g 50s en la app) no es oportunidad aunque la réplica la diga barata');
  assert.equal(por(9000), undefined, 'lo que solo trae el escaneo no tiene valor de mercado: no es oportunidad');
  // La lista de Navegar de la cara, leída hace 30 s: ahora sí, de la lista y de ahora.
  m.lua(`SnetForever.Busqueda.vivo = function(id) if id == 4100 then return {precio = 30000, cantidad = 1, hora = GetServerTime() - 30, origen = "lista"} end end
    SnetForever.Busqueda.versionVivo = function() return 1 end`);
  const l = m.lua('SnetForever.Contexto.construir().comercio');
  assert.deepEqual(l.oportunidades[0], { id: 4100, precio: 30000, pct: 30, ritmo: 0.9, fuente: 'lista', edad: 30 });
  // Sin escaneo y con la memoria de la app llena (sin listas), la cara no es oportunidad; con la lista, la memoria no vale.
  m.lua(`SnetForever.Escaneo = {datos = function() return {} end}
    SnetForever.Busqueda.vivo = function() return nil end
    SnetForever.Busqueda.versionVivo = function() return 0 end
    rawset(_G, "LLAMADAS", 0)
    local de = SnetForever.Precios.de
    SnetForever.Precios.de = function(...) LLAMADAS = LLAMADAS + 1 return de(...) end`);
  const app = m.lua('SnetForever.Contexto.construir().comercio');
  assert.ok(app.oportunidades.every((o) => o.fuente === 'app') && !app.oportunidades.some((o) => o.id === 4100));
  const llamadas = m.lua('LLAMADAS');
  m.lua('SnetForever.Contexto.construir()');
  assert.equal(m.lua('LLAMADAS'), llamadas, 'la memoria está llena: la segunda vez no se pregunta nada');
  m.lua(`SnetForever.Busqueda.vivo = function(id) if id == 4100 then return {precio = 30000, cantidad = 1, hora = GetServerTime() - 30, origen = "lista"} end end
    SnetForever.Busqueda.versionVivo = function() return 1 end`);
  const conLista = m.lua('SnetForever.Contexto.construir().comercio');
  assert.ok(m.lua('LLAMADAS') > llamadas, 'con una lista, la memoria no vale: se vuelve a mirar');
  assert.deepEqual(conLista.oportunidades[0], { id: 4100, precio: 30000, pct: 30, ritmo: 0.9, fuente: 'lista', edad: 30 });
  // Un escaneo que aún no ha visto nada: las oportunidades salen de los precios de la app.
  m.lua('SnetForever.Escaneo = {datos = function() return {} end}');
  assert.equal(m.lua('#SnetForever.Contexto.construir().comercio.oportunidades'), 20);
  m.lua('SnetForever.Escaneo = nil');
  sinErrores(m);
});

test('contexto (revisión): sin escaneo, las oportunidades se guardan hasta que cambia la regla o la ranura de precios', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua(`rawset(_G, "LLAMADAS", 0)
    local de = SnetForever.Precios.de
    SnetForever.Precios.de = function(...) LLAMADAS = LLAMADAS + 1 return de(...) end`);
  m.lua('SnetForever.Contexto.construir()');
  assert.equal(m.lua('LLAMADAS'), 27, 'una sola vez por objeto de la casa');
  const primera = m.lua('SnetForever.Contexto.construir().comercio');
  assert.equal(m.lua('LLAMADAS'), 27, 'la segunda vez sale de la memoria');
  assert.equal(primera.oportunidades.length, 20);
  // Con un grupo abierto con su regla propia cambia la clave: se vuelve a calcular.
  const clave = m.lua('SnetForever.Grupos.crear("Todo")');
  for (let k = 1; k <= 25; k++) m.lua(`SnetForever.Grupos.anadir(${aLua(clave)}, ${4000 + k})`);
  m.lua(`SnetForever.UIComercio = {grupo = function() return ${aLua(clave)} end}`);
  m.lua(`SnetForever.Reglas.poner(${aLua(clave)}, {compraPct = 55})`);
  const c = m.lua('SnetForever.Contexto.construir().comercio');
  assert.deepEqual(c.oportunidades.map((o) => o.id), [4001, 4002, 4003, 4004, 4005]);
  // Otra ranura de precios (otra tabla SNF_PRECIOS): también se vuelve a calcular.
  const antes = m.lua('LLAMADAS');
  m.lua('local P = SNF_PRECIOS; local copia = {} for k, v in pairs(P) do copia[k] = v end; SNF_PRECIOS = copia');
  m.lua('SnetForever.Contexto.construir()');
  assert.ok(m.lua('LLAMADAS') > antes);
  m.lua('SnetForever.UIComercio = nil');
  sinErrores(m);
});

test('contexto: el grupo abierto en la ventana de comercio va en comercio.grupo y limita las oportunidades', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  const clave = m.lua('SnetForever.Grupos.crear("Dos")');
  m.lua(`SnetForever.Grupos.anadir(${aLua(clave)}, 4003) SnetForever.Grupos.anadir(${aLua(clave)}, 4010)`);
  m.lua(`SnetForever.UIComercio = {grupo = function() return ${aLua(clave)} end}`);
  const c = m.lua('SnetForever.Contexto.construir().comercio');
  assert.deepEqual(c.grupo, { clave, nombre: 'Dos' });
  assert.deepEqual(c.oportunidades.map((o) => o.id), [4003, 4010]);
  m.lua('SnetForever.UIComercio = nil');
  sinErrores(m);
});

test('contexto: si el mensaje no cabe, «comercio» se recorta justo antes que «zonas»', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  const recorte = m.lua(`(function()
    local ctx = SnetForever.Contexto.construir()
    ctx.mazmorras = nil
    ctx.zonas = {{mapa = 1411, n = 3}}
    local mensaje = {v = 1, ctx = ctx}
    local sin = SnetForever.JSON.codificar(mensaje)
    SnetForever.Contexto.recortar(mensaje, #sin - 10)
    return ctx.recorte
  end)()`);
  assert.equal(recorte[0], 'comercio', JSON.stringify(recorte));
  sinErrores(m);
});

// F1 (ronda 2): la memoria de las oportunidades no puede dejar parada su edad: lo de la app tiene la edad de la foto cargada.
test('contexto (F1 ronda 2): con la memoria llena, al pasar el tiempo la edad de cada oportunidad crece con edadPrecios', () => {
  const m = maquina();
  m.disparar('AUCTION_HOUSE_SHOW');
  m.lua(`rawset(_G, "LLAMADAS", 0)
    local de = SnetForever.Precios.de
    SnetForever.Precios.de = function(...) LLAMADAS = LLAMADAS + 1 return de(...) end`);
  const antes = m.lua('SnetForever.Contexto.construir().comercio');
  const llamadas = m.lua('LLAMADAS');
  m.lua(`BANCO.tick = BANCO.tick + ${10 * 60 * 20}`); // pasan 10 min
  const despues = m.lua('SnetForever.Contexto.construir().comercio');
  assert.equal(m.lua('LLAMADAS'), llamadas, 'sale de la memoria');
  assert.equal(despues.edadPrecios, antes.edadPrecios + 600);
  assert.equal(despues.oportunidades.length, 20);
  for (const o of despues.oportunidades) assert.deepEqual([o.fuente, o.edad], ['app', despues.edadPrecios], `${o.id}`);
  sinErrores(m);
});
