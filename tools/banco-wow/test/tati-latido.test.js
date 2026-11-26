// Puente con TATI, tarea A1: el latido (ia/latido.lua). Solo cuando la cabecera del buzón de la app trae `latido = true`
// (la app la pone únicamente con el puente encendido), el addon manda por la franja un mensaje `tipo = "latido"` con su
// contexto (sin inventario) al cambiar de zona, subir de nivel, aceptar o entregar una misión o completar una del
// registro. Como mucho uno por minuto (desde el último latido o mensaje), nunca mientras el jugador escribe ni con un
// mensaje en camino, sin aviso «Enviando a SnetForever…» y sin gastar ninguna ranura del buzón.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
import { comprobarLua51 } from '../src/comprobar-lua51.js';
import { sinErrores } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');

const maquinas = [];
const carpetas = [];
after(() => {
  maquinas.forEach((m) => m.cerrar());
  carpetas.forEach((c) => rmSync(c, { recursive: true, force: true }));
});

const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;

// Carpeta de AddOns con las ranuras R001…R<ranuras>: la R001 con el buzón dado (con `todas`, todas con él), las demás
// vacías. Sin los .wav: sin sonido.
function carpeta(buzon, ranuras = 4, todas = false) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-latido-'));
  carpetas.push(dir);
  for (let i = 1; i <= ranuras; i++) {
    const r = nombreRanura(i);
    mkdirSync(join(dir, r), { recursive: true });
    writeFileSync(join(dir, r, `${r}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\nbuzon.lua\n`);
    writeFileSync(join(dir, r, 'buzon.lua'), i === 1 || todas ? `SNF_BUZON = ${aLua({ ...buzon, seq: i })}\n` : 'SNF_BUZON = nil\n');
  }
  return dir;
}

// Latidos ya enseñados al terminar preparar() (el de la primera cabecera con latido, ruling P14).
const bases = new WeakMap();

// Máquina con la app viva y la cabecera del buzón ya leída. `estado` es la cabecera (estadoApp()). Por defecto deja pasar
// el latido de la primera cabecera (P14) y su minuto, para que las pruebas empiecen sin nada pendiente; con
// {calentar: false} vuelve justo tras cargar la ranura (y enviados() cuenta también ese latido). {todas: true}: todas las
// ranuras traen la misma cabecera. `antes(m)` se llama justo antes de cargar la ranura.
// {chat: false}: con el chat de la IA cerrado (16-nov, interfaz: sin el chat abierto no hay franja ni latidos).
function preparar(estado = { claude: 'ok', latido: true }, { calentar = true, todas = false, antes, chat = true, ...opciones } = {}) {
  const dir = carpeta({ v: 1, app: '0.7.0', seq: 1, ahora: 1790000000, estado, registros: [] }, 4, todas);
  const m = crearMaquina({ addonsDir: dir, ...opciones });
  maquinas.push(m);
  m.lua('SnetForever.Timbres.appViva = function() return true end');
  if (chat) m.lua('SnetForever.Chat.abrir()');
  if (antes) antes(m);
  m.lua('SnetForever.Buzon.cargar("prueba")');
  if (calentar) {
    m.avanzar(61);
    bases.set(m, m.lua('SnetForever.Latido.enviados()'));
  }
  return m;
}

const base = (m) => bases.get(m) ?? 0;
const enviados = (m) => m.lua('SnetForever.Latido.enviados()') - base(m);
const visible = (m) => m.lua('SnetForever.Franja.visible()');
const proxima = (m) => m.lua('SnetForever.Buzon.proxima()');
const fase = (m) => m.lua('SnetForever.Envio.estado().fase');
const zona = (m) => m.disparar('ZONE_CHANGED_NEW_AREA');

// Lee la trama que enseña la franja ahora, como la app: las celdas visibles por su sitio y su color (3 bits cada una), los
// bytes [0x53 0x46] [trama] [len] [carga] [Fletcher-16]. Devuelve {trama, carga: Buffer} o null si no se ve nada.
function leerTrama(m) {
  const t = m.lua('BANCO.texturasDe("SnetForeverFranja")');
  const celdas = t.lista.filter((c) => c.mostrada && c.color)
    .map((c) => ({ i: Math.round(-c.y / 2) * 200 + Math.round(c.x / 2), v: c.color.r * 4 + c.color.g * 2 + c.color.b }))
    .sort((a, b) => a.i - b.i);
  if (celdas.length === 0) return null;
  celdas.forEach((c, k) => assert.equal(c.i, k, 'las celdas van seguidas'));
  const bits = celdas.flatMap((c) => [(c.v >> 2) & 1, (c.v >> 1) & 1, c.v & 1]);
  const bytes = [];
  for (let k = 0; k + 8 <= bits.length; k += 8) bytes.push(bits.slice(k, k + 8).reduce((a, b) => a * 2 + b, 0));
  assert.deepEqual(bytes.slice(0, 2), [0x53, 0x46], 'magia');
  const len = bytes[4] * 256 + bytes[5];
  let s1 = 0;
  let s2 = 0;
  for (let k = 2; k < 6 + len; k++) { s1 = (s1 + bytes[k]) % 255; s2 = (s2 + s1) % 255; }
  assert.deepEqual(bytes.slice(6 + len, 8 + len), [s1, s2], 'Fletcher-16');
  return { trama: bytes[2] * 256 + bytes[3], carga: Buffer.from(bytes.slice(6, 6 + len)) };
}

// Campos de la carga P1: SNF1 US pj US id US parte US total US z US r US c US datos.
function campos(carga) {
  const partes = [];
  let desde = 0;
  for (let k = 0; k < carga.length && partes.length < 8; k++) {
    if (carga[k] === 0x1f) { partes.push(carga.subarray(desde, k).toString('utf8')); desde = k + 1; }
  }
  const [snf, pj, id, parte, total, z, r, c] = partes;
  return { snf, pj, id, parte: +parte, total: +total, z: +z, r: +r, c: +c, datos: carga.subarray(desde) };
}

// Reúne todas las partes del mensaje que enseña la franja (avanzando un periodo por parte) y da {primera, mensaje}.
function leerMensaje(m) {
  const t = leerTrama(m);
  assert.ok(t, 'la franja enseña algo');
  const primera = campos(t.carga);
  const datos = new Map([[primera.parte, primera.datos]]);
  for (let k = 1; k < primera.total * 2 && datos.size < primera.total; k++) {
    m.avanzar(m.lua('SnetForever.Franja.PERIODO'));
    const p = campos(leerTrama(m).carga);
    assert.equal(p.id, primera.id);
    datos.set(p.parte, p.datos);
  }
  assert.equal(datos.size, primera.total, 'todas las partes');
  assert.equal(primera.z, 0, 'sin compresión en el banco');
  const cuerpo = Buffer.concat([...Array(primera.total)].map((_, k) => datos.get(k + 1)));
  return { primera, mensaje: JSON.parse(cuerpo.toString('utf8')) };
}

test('sin «latido» en la cabecera de la app no pasa nada: ni franja ni latidos', () => {
  for (const estado of [{ claude: 'ok' }, { claude: 'ok', latido: false }, { claude: 'ok', latido: 'true' }]) {
    const m = preparar(estado);
    zona(m);
    m.disparar('PLAYER_LEVEL_UP', 2);
    m.disparar('QUEST_ACCEPTED', 1);
    m.disparar('QUEST_LOG_UPDATE');
    m.avanzar(0.1);
    assert.equal(visible(m), false, JSON.stringify(estado));
    m.avanzar(120);
    assert.equal(visible(m), false, JSON.stringify(estado));
    assert.equal(enviados(m), 0, JSON.stringify(estado));
    sinErrores(m);
  }
});

test('sin buzón leído (estadoApp() nil) o con la app sin vida tampoco sale nada', () => {
  const m = crearMaquina();
  maquinas.push(m);
  m.lua('SnetForever.Timbres.appViva = function() return true end');
  zona(m);
  m.avanzar(61);
  assert.equal(enviados(m), 0);
  const n = preparar();
  n.lua('SnetForever.Timbres.appViva = function() return false end');
  zona(n);
  n.avanzar(61);
  assert.equal(enviados(n), 0);
  assert.equal(visible(n), false);
  sinErrores(m);
  sinErrores(n);
});

test('con «latido»: un cambio de zona enseña la franja con un mensaje tipo latido, sin aviso y sin inventario', () => {
  const m = preparar();
  m.lua('SnetForever.Ajustes.set("ia.inventario", true)'); // aunque el jugador lo tenga encendido, el latido no lo lleva
  const r = proxima(m);
  zona(m);
  assert.equal(visible(m), true);
  assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false, 'sin «Enviando a SnetForever…»');
  assert.equal(enviados(m), 1);
  assert.equal(fase(m), 'libre', 'un latido no es un mensaje');
  const { primera, mensaje } = leerMensaje(m);
  assert.equal(primera.snf, 'SNF1');
  assert.equal(primera.pj, m.lua('SnetForever.Personaje.clave()'));
  assert.equal(primera.id, `${m.lua('SnetForever.Envio.sesion()')}-L${base(m) + 1}`);
  assert.equal(primera.r, r, 'la r es la ranura siguiente');
  assert.equal(primera.c, m.lua('SnetForever.Buzon.cursor()'));
  assert.equal(mensaje.v, 1);
  assert.equal(mensaje.tipo, 'latido');
  assert.equal(mensaje.id, primera.id);
  assert.equal(mensaje.pj, primera.pj);
  assert.equal(mensaje.idioma, m.lua('SnetForever.L.idioma()'));
  assert.equal(mensaje.ctx.lugar.zona, 'Durotar');
  assert.equal(mensaje.ctx.inv, undefined, 'sin inventario');
  assert.equal(mensaje.texto, undefined);
  // La sesión es la de los mensajes: el id del latido empieza como el de un mensaje.
  m.lua('SnetForever.Envio.enviar("hola")');
  assert.equal(m.lua('SnetForever.Envio.estado().id').slice(0, 5), primera.id.slice(0, 5));
  sinErrores(m);
});

// F3, ronda 1: sin pj (Personaje.clave() da nil) la trama no se puede armar: el latido no sale, sin error.
test('F3: sin el nombre del personaje (Personaje.clave() da nil) el latido no sale', () => {
  const m = preparar();
  m.lua('SnetForever.Personaje.clave = function() return nil end');
  zona(m);
  m.avanzar(1);
  assert.equal(visible(m), false, 'sin franja');
  assert.equal(enviados(m), 0);
  assert.equal(m.lua('SnetForever.Latido.ultimoError()'), 'sin_pj', 'solo apuntado para depurar');
  sinErrores(m);
});

test('la franja del latido se oculta sola tras dos vueltas y 3 s, y no gasta ranura', () => {
  const m = preparar();
  const r = proxima(m);
  zona(m);
  m.avanzar(2.8);
  assert.equal(visible(m), true, 'antes de 3 s sigue');
  m.avanzar(0.4);
  assert.equal(visible(m), false, 'a los 3 s con dos vueltas, fuera');
  assert.equal(proxima(m), r, 'Buzon.proxima() no cambia');
  assert.equal(m.llamadas('C_AddOns.LoadAddOn').filter((a) => a[0] === nombreRanura(r)).length, 0, 'no carga ninguna ranura');
  sinErrores(m);
});

test('dos disparos en 10 s: un solo latido, y el segundo sale a los 60 s con el estado de ese momento', () => {
  const m = preparar();
  zona(m);
  const primero = leerMensaje(m).mensaje;
  assert.equal(primero.ctx.lugar.zona, 'Durotar');
  m.avanzar(10);
  m.jugador({ zona: 'Los Baldíos' });
  m.disparar('PLAYER_LEVEL_UP', 2);
  m.avanzar(0.1);
  assert.equal(enviados(m), 1);
  assert.equal(visible(m), false, 'la del primero ya se ocultó');
  m.avanzar(49.5); // 59,6 s desde el primero
  assert.equal(enviados(m), 1, 'antes del minuto, nada');
  m.jugador({ zona: 'Mulgore' });
  m.avanzar(0.6);
  assert.equal(enviados(m), 2, 'al minuto, el segundo');
  assert.equal(visible(m), true);
  const segundo = leerMensaje(m);
  assert.equal(segundo.primera.id, `${m.lua('SnetForever.Envio.sesion()')}-L${base(m) + 2}`);
  assert.equal(segundo.mensaje.ctx.lugar.zona, 'Mulgore', 'el contexto es el de cuando sale');
  m.avanzar(200);
  assert.equal(enviados(m), 2, 'el pedido ya salió: no se repite solo');
  sinErrores(m);
});

test('los disparadores: subir de nivel, aceptar, entregar y una misión del registro que pasa a completa', () => {
  const m = preparar();
  m.disparar('PLAYER_LEVEL_UP', 2);
  assert.equal(enviados(m), 1);
  m.avanzar(61);
  m.disparar('QUEST_ACCEPTED', 1);
  m.avanzar(0.1);
  assert.equal(enviados(m), 2);
  m.avanzar(61);
  m.disparar('QUEST_TURNED_IN', 1, 0, 0);
  m.avanzar(0.1);
  assert.equal(enviados(m), 3);
  m.avanzar(61);
  // QUEST_LOG_UPDATE sin cambios en las completas no dispara; una que pasa a completa, sí.
  m.estadoMision(5, { enDiario: true, completa: false });
  m.estadoMision(6, { enDiario: true, completa: true });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.1);
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.1);
  const antes = enviados(m);
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.1);
  assert.equal(enviados(m), antes, 'sin cambios en las completas, nada');
  m.estadoMision(5, { completa: true });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.1);
  assert.equal(enviados(m), antes + 1, 'la 5 pasa a completa');
  m.avanzar(61);
  m.estadoMision(5, { enDiario: false, completa: false });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.1);
  assert.equal(enviados(m), antes + 1, 'que una se vaya del registro no dispara');
  sinErrores(m);
});

test('con la entrada del chat de SnetForever con el foco no sale hasta que la suelta', () => {
  const m = preparar(); // ya con el chat abierto
  assert.equal(m.lua('SnetForever.Chat.escribiendo()'), false);
  m.lua('SnetForever.Chat.marcos.entrada:SetFocus()');
  assert.equal(m.lua('SnetForever.Chat.escribiendo()'), true);
  zona(m);
  m.avanzar(30);
  assert.equal(enviados(m), 0);
  assert.equal(visible(m), false);
  m.lua('SnetForever.Chat.marcos.entrada:ClearFocus()');
  m.avanzar(2.1);
  assert.equal(enviados(m), 1, 'al soltarla, como mucho 2 s después');
  assert.equal(visible(m), true);
  sinErrores(m);
});

test('con una caja de chat del juego activa (ChatEdit_GetActiveWindow) tampoco sale', () => {
  const m = preparar();
  m.lua('rawset(_G, "CAJA_ACTIVA", {}); rawset(_G, "ChatEdit_GetActiveWindow", function() return rawget(_G, "CAJA_ACTIVA") end)');
  assert.equal(m.lua('SnetForever.Chat.escribiendo()'), true);
  zona(m);
  m.avanzar(10);
  assert.equal(enviados(m), 0);
  m.lua('rawset(_G, "CAJA_ACTIVA", nil)');
  assert.equal(m.lua('SnetForever.Chat.escribiendo()'), false);
  m.avanzar(2.1);
  assert.equal(enviados(m), 1);
  sinErrores(m);
});

test('con un mensaje en camino no sale, y un mensaje que empieza no ve su franja oculta por el latido', () => {
  const m = preparar();
  zona(m); // latido en t = 0
  m.avanzar(1);
  assert.equal(m.lua('{SnetForever.Envio.enviar("hola")}')[0], true);
  const id = m.lua('SnetForever.Envio.estado().id');
  assert.equal(m.lua('SnetForever.Envio.esperando()'), true);
  m.avanzar(2.5); // t = 3,5: el latido se habría ocultado a los 3 s
  assert.equal(visible(m), true, 'la franja del mensaje sigue');
  assert.equal(campos(leerTrama(m).carga).id, id, 'y es la del mensaje');
  // Pedido con el mensaje en camino (sin sonido: enviando y luego pensando hasta la respuesta).
  m.disparar('PLAYER_LEVEL_UP', 2);
  m.avanzar(100);
  assert.equal(enviados(m), 1, 'con el mensaje esperando respuesta, nada');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 2, pj = "x", msg = "${id}", t = "respuesta", texto = "ok"})`);
  assert.equal(fase(m), 'libre');
  m.avanzar(2.1);
  assert.equal(enviados(m), 2, 'con la respuesta ya puede salir (hace más de un minuto del mensaje)');
  sinErrores(m);
});

test('tras un mensaje enviado, el siguiente latido espera 60 s desde ese mensaje', () => {
  const m = preparar();
  assert.equal(m.lua('{SnetForever.Envio.enviar("hola")}')[0], true); // t = 0
  const id = m.lua('SnetForever.Envio.estado().id');
  m.avanzar(5);
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 2, pj = "x", msg = "${id}", t = "respuesta", texto = "ok"})`);
  assert.equal(fase(m), 'libre');
  m.avanzar(5);
  zona(m); // t = 10
  m.avanzar(49.6); // t = 59,6
  assert.equal(enviados(m), 0);
  m.avanzar(0.6);
  assert.equal(enviados(m), 1);
  sinErrores(m);
});

test('sin ranuras (proxima() > 20) el latido sale igual, con esa r, y no gasta ninguna', () => {
  const m = preparar();
  m.lua('SnetForever.Buzon.proxima = function() return 21 end');
  const cargas = m.llamadas('C_AddOns.LoadAddOn').length;
  zona(m);
  assert.equal(enviados(m), 1);
  assert.equal(leerMensaje(m).primera.r, 21);
  m.avanzar(5);
  assert.equal(m.llamadas('C_AddOns.LoadAddOn').length, cargas);
  sinErrores(m);
});

test('Latido.INTERVALO = 60 y los archivos tocados pasan comprobarLua51', () => {
  const m = preparar();
  assert.equal(m.lua('SnetForever.Latido.INTERVALO'), 60);
  for (const f of ['ia/latido.lua', 'ia/envio.lua', 'ia/franja.lua', 'ui/chat.lua']) {
    assert.deepEqual(comprobarLua51(readFileSync(join(ADDON, f), 'utf8'), f), [], f);
  }
  const lineas = readFileSync(join(ADDON, 'SnetForever.toc'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.equal(lineas[lineas.indexOf('ia\\envio.lua') + 1], 'ia\\latido.lua', 'en el .toc, justo después de ia\\envio.lua');
  sinErrores(m);
});

// --- Revisión de A1 ---

// Marcos sin nombre creados desde ahora (el del latido lo es) que tienen un OnUpdate puesto.
function contarOnUpdate(m) {
  m.lua(`rawset(_G, "MARCOS_NUEVOS", {})
    local original = CreateFrame
    rawset(_G, "CreateFrame", function(...) local f = original(...); MARCOS_NUEVOS[#MARCOS_NUEVOS + 1] = f; return f end)`);
  return () => m.lua(`(function()
    local n = 0
    for _, f in ipairs(MARCOS_NUEVOS) do
      if f:GetName() == nil and f:GetScript("OnUpdate") then n = n + 1 end
    end
    return n
  end)()`);
}

test('revisión 1: si otro quita la franja del latido antes de tiempo, el latido suelta su OnUpdate', () => {
  let conOnUpdate;
  const m = preparar(undefined, { antes: (n) => { conOnUpdate = contarOnUpdate(n); } });
  zona(m);
  assert.equal(conOnUpdate(), 1, 'con la franja a la vista, vigila');
  m.avanzar(0.5);
  m.lua('SnetForever.Franja.ocultar()'); // como la rama de fallo de Chat.enviar
  m.avanzar(10);
  assert.equal(conOnUpdate(), 0, 'sin franja que ocultar, nada por fotograma');
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('revisión 2: con el puente apagado se olvidan las completas; al volver, la primera vez solo se apuntan', () => {
  const m = preparar();
  m.estadoMision(5, { enDiario: true, completa: false });
  m.disparar('QUEST_LOG_UPDATE'); // se apunta: ninguna completa
  m.lua('SnetForever.Buzon.estadoApp = function() return {claude = "ok"} end');
  m.disparar('QUEST_LOG_UPDATE'); // puente apagado: se olvidan
  m.estadoMision(5, { completa: true });
  m.lua('SnetForever.Buzon.estadoApp = function() return {claude = "ok", latido = true} end');
  m.disparar('QUEST_LOG_UPDATE'); // otra vez la primera: solo se apunta
  m.avanzar(0.1);
  assert.equal(enviados(m), 0, 'la completada con el puente apagado no dispara');
  sinErrores(m);
});

test('revisión 3: con una cabecera del registro colapsada no se apuntan las completas (al desplegarla no hay latido falso)', () => {
  const m = preparar();
  m.estadoMision(7, { enDiario: true, completa: true });
  m.disparar('QUEST_LOG_UPDATE'); // se apunta la 7
  m.registroColapsado([7]);
  m.disparar('QUEST_LOG_UPDATE'); // incompleto: no se apunta nada
  m.registroColapsado([]);
  m.disparar('QUEST_LOG_UPDATE'); // la 7 vuelve a verse: ya estaba completa
  m.avanzar(0.1);
  assert.equal(enviados(m), 0);
  // Una que se completa de verdad, sí.
  m.estadoMision(8, { enDiario: true, completa: true });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.1);
  assert.equal(enviados(m), 1);
  sinErrores(m);
});

test('P14: la primera cabecera con latido = true manda un latido sin esperar a un cambio de zona, una sola vez', () => {
  const m = preparar(undefined, { calentar: false, todas: true });
  assert.equal(enviados(m), 1, 'nada más cargar la ranura');
  assert.equal(visible(m), true);
  const { mensaje } = leerMensaje(m);
  assert.equal(mensaje.tipo, 'latido');
  assert.equal(mensaje.ctx.lugar.zona, 'Durotar');
  m.avanzar(61);
  m.lua('SnetForever.Buzon.cargar("prueba")'); // otra ranura con la misma cabecera
  m.avanzar(61);
  assert.equal(enviados(m), 1, 'la cabecera repetida no vuelve a pedir');
  // Tras una cabecera sin latido (puente apagado) y otra con él, otra vez.
  m.lua('SnetForever.Eventos.emitir("SNF_IA_CABECERA", {claude = "ok"})');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_CABECERA", {claude = "ok", latido = true})');
  assert.equal(enviados(m), 2);
  sinErrores(m);
});

test('P14: el latido de la cabecera respeta las reglas: escribiendo, espera; sin latido en la cabecera, nada', () => {
  const m = crearMaquina({ addonsDir: carpeta({ v: 1, seq: 1, estado: { claude: 'ok', latido: true }, registros: [] }) });
  maquinas.push(m);
  m.lua('SnetForever.Timbres.appViva = function() return true end');
  m.lua('SnetForever.Chat.abrir()'); // sin el chat abierto no hay latidos (regla de interfaz)
  m.lua('rawset(_G, "CAJA_ACTIVA", {}); rawset(_G, "ChatEdit_GetActiveWindow", function() return rawget(_G, "CAJA_ACTIVA") end)');
  m.lua('SnetForever.Buzon.cargar("prueba")');
  m.avanzar(5);
  assert.equal(m.lua('SnetForever.Latido.enviados()'), 0, 'escribiendo, no sale');
  m.lua('rawset(_G, "CAJA_ACTIVA", nil)');
  m.avanzar(2.1);
  assert.equal(m.lua('SnetForever.Latido.enviados()'), 1);
  const n = preparar({ claude: 'ok' }, { calentar: false });
  n.avanzar(61);
  assert.equal(enviados(n), 0);
  sinErrores(m);
  sinErrores(n);
});

// --- Revisión final del puente (I1): la app que vuelve a estar viva ---

// La app que se cae (sin pulso de vida 25 s: SNF_IA_APP(false)) y vuelve (SNF_IA_APP(true)), como la emiten los timbres.
const caerApp = (m) => { m.lua('SnetForever.Timbres.appViva = function() return false end'); m.avanzar(2.1); };
const volverApp = (m) => { m.lua('SnetForever.Timbres.appViva = function() return true end'); m.avanzar(2.1); };

test('I1: la app que vuelve a estar viva (tras reiniciarse) recibe un latido sin esperar a un cambio de zona', () => {
  const m = preparar();
  caerApp(m);
  m.avanzar(30);
  assert.equal(enviados(m), 0, 'con la app caída, nada');
  volverApp(m);
  assert.equal(enviados(m), 1, 'en cuanto vuelve, un latido');
  assert.equal(leerMensaje(m).mensaje.tipo, 'latido');
  m.avanzar(120);
  assert.equal(enviados(m), 1, 'uno solo');
  sinErrores(m);
});

test('I1: el latido de la app que vuelve sigue las reglas: el minuto y sin escribir', () => {
  const m = preparar();
  zona(m); // un latido ahora
  assert.equal(enviados(m), 1);
  caerApp(m);
  volverApp(m); // a los ~4 s del anterior: espera al minuto
  assert.equal(enviados(m), 1);
  m.avanzar(50);
  assert.equal(enviados(m), 1, 'antes del minuto, nada');
  m.avanzar(6);
  assert.equal(enviados(m), 2, 'al minuto del anterior');
  // Escribiendo: espera a que suelte la caja.
  m.avanzar(61);
  m.lua('rawset(_G, "CAJA_ACTIVA", {}); rawset(_G, "ChatEdit_GetActiveWindow", function() return rawget(_G, "CAJA_ACTIVA") end)');
  caerApp(m);
  volverApp(m);
  m.avanzar(5);
  assert.equal(enviados(m), 2, 'escribiendo, no sale');
  m.lua('rawset(_G, "CAJA_ACTIVA", nil)');
  m.avanzar(2.1);
  assert.equal(enviados(m), 3);
  sinErrores(m);
});

test('I1: sin latido en la cabecera, la app que vuelve no pide nada; la primera vez que la app está viva no duplica', () => {
  const m = preparar({ claude: 'ok' });
  caerApp(m);
  volverApp(m);
  m.avanzar(61);
  assert.equal(enviados(m), 0);
  // Al entrar con la app viva: la cabecera manda su latido (P14) y el primer SNF_IA_APP(true) no añade otro.
  const n = preparar(undefined, { calentar: false });
  n.avanzar(200);
  assert.equal(enviados(n), 1);
  sinErrores(m);
  sinErrores(n);
});

test('I1: una cabecera con latido que llega con la app sin vida no se da por vista: la siguiente, con la app viva, pide', () => {
  const m = crearMaquina({ addonsDir: carpeta({ v: 1, seq: 1, estado: { claude: 'ok', latido: true }, registros: [] }, 4, true) });
  maquinas.push(m);
  m.lua('SnetForever.Timbres.appViva = function() return false end');
  m.lua('SnetForever.Chat.abrir()'); // sin el chat abierto no hay latidos (regla de interfaz)
  m.lua('SnetForever.Buzon.cargar("prueba")');
  m.avanzar(61);
  assert.equal(m.lua('SnetForever.Latido.enviados()'), 0, 'sin app viva, nada');
  // La app aparece: el primer SNF_IA_APP(true) carga otra ranura (vida) con la misma cabecera, y esta vez sí.
  volverApp(m);
  assert.equal(m.lua('SnetForever.Latido.enviados()'), 1);
  m.avanzar(120);
  assert.equal(m.lua('SnetForever.Latido.enviados()'), 1, 'uno solo');
  sinErrores(m);
});

// 16-nov, por diseño (regla de interfaz): con el chat de la IA cerrado, el latido enseñaba la franja suelta en
// una esquina de la pantalla, cambiando de colores. Regla: la franja solo se ve en el hueco del chat, y sin el chat
// abierto no hay latido.
const franjaEnPantalla = (m) => m.lua('rawget(_G, "SnetForeverFranja") ~= nil and SnetForeverFranja:IsVisible()') === true;

test('interfaz: con el chat de la IA cerrado, Latido.pedir no enseña nada (ni la franja ni un latido)', () => {
  const m = preparar(undefined, { chat: false });
  zona(m);
  m.disparar('PLAYER_LEVEL_UP', 2);
  m.lua('SnetForever.Latido.pedir("prueba")');
  m.avanzar(0.1);
  assert.equal(visible(m), false);
  assert.equal(franjaEnPantalla(m), false);
  m.avanzar(120);
  assert.equal(enviados(m), 0);
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('interfaz: al abrir el chat se manda un latido (en el hueco del chat); al cerrarlo, su franja se quita y no vuelve', () => {
  const m = preparar(undefined, { chat: false });
  m.avanzar(61);
  m.lua('SnetForever.Chat.abrir()');
  m.avanzar(0.1);
  assert.equal(enviados(m), 1, 'abrir el chat manda uno');
  assert.equal(visible(m), true);
  assert.equal(franjaEnPantalla(m), true);
  m.lua('SnetForever.Chat.cerrar()');
  m.avanzar(0.1);
  assert.equal(visible(m), false, 'cerrado el chat, nada en pantalla');
  assert.equal(franjaEnPantalla(m), false);
  m.lua('SnetForever.Chat.abrir()');
  m.avanzar(0.1);
  assert.equal(visible(m), false, 'el latido de antes no vuelve (y el minuto aún no ha pasado)');
  sinErrores(m);
});

test('interfaz: la franja nunca se enseña sin estar anclada; un mensaje sigue al volver a anclarla', () => {
  const m = crearMaquina();
  maquinas.push(m);
  m.lua('SnetForever.Franja.mostrar({"hola"}, 0)');
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
  assert.equal(franjaEnPantalla(m), false);
  assert.equal(m.lua('rawget(_G, "SnetForeverFranjaAviso") ~= nil and SnetForeverFranjaAviso:IsVisible()'), false, 'tampoco el aviso suelto');
  m.lua('BANCO_HUECO = CreateFrame("Frame", nil, UIParent); BANCO_HUECO:SetSize(100, 20); BANCO_HUECO:SetPoint("CENTER")');
  m.lua('SnetForever.Franja.anclar(BANCO_HUECO, "TOPLEFT", 2, -2)');
  assert.equal(m.lua('SnetForever.Franja.visible()'), true);
  m.lua('SnetForever.Franja.anclar(nil)');
  assert.equal(m.lua('SnetForever.Franja.visible()'), false, 'sin ancla, fuera');
  assert.equal(franjaEnPantalla(m), false);
  m.lua('SnetForever.Franja.anclar(BANCO_HUECO, "TOPLEFT", 2, -2)');
  assert.equal(m.lua('SnetForever.Franja.visible()'), true, 'el mensaje sigue en el hueco');
  sinErrores(m);
});

test('interfaz: la franja cambia como mucho dos veces por segundo (PERIODO = 0,5 s)', () => {
  const m = crearMaquina();
  maquinas.push(m);
  assert.equal(m.lua('SnetForever.Franja.PERIODO'), 0.5);
});

// --- Abrir el chat: latido enseguida ---
// Con el chat cerrado no hay latidos (regla de interfaz): tras reiniciar la app, TATI pide al jugador que abra el chat de SnetForever
// un momento. El latido de abrir el chat no espera el minuto (Latido.INTERVALO), pero sí las demás reglas, y como mucho
// sale uno cada Latido.ENTRE_CHAT segundos.

// Un latido por un cambio de zona y el chat cerrado justo después (ya se ocultó su franja); `segundos` desde ese latido.
function latidoYCerrar(m, segundos) {
  zona(m);
  assert.equal(enviados(m), 1);
  m.avanzar(4);
  m.lua('SnetForever.Chat.cerrar()');
  m.avanzar(segundos - 4);
}

test('abrir el chat manda el latido enseguida aunque el último envío fuera hace 10 s', () => {
  const m = preparar();
  latidoYCerrar(m, 10);
  m.lua('SnetForever.Chat.abrir()');
  m.avanzar(0.1);
  assert.equal(enviados(m), 2, 'sin esperar el minuto');
  assert.equal(visible(m), true);
  assert.equal(leerMensaje(m).mensaje.tipo, 'latido');
  // Los demás pedidos siguen con el minuto.
  m.avanzar(4);
  zona(m);
  m.avanzar(30);
  assert.equal(enviados(m), 2, 'un cambio de zona espera el minuto');
  sinErrores(m);
});

test('abrir-cerrar-abrir rápido no manda una ráfaga: como mucho uno cada ENTRE_CHAT segundos', () => {
  const entre = 5;
  const m = preparar();
  assert.equal(m.lua('SnetForever.Latido.ENTRE_CHAT'), entre);
  latidoYCerrar(m, 10);
  m.lua('SnetForever.Chat.abrir()');
  m.avanzar(0.1);
  assert.equal(enviados(m), 2);
  for (let k = 0; k < 3; k++) {
    m.lua('SnetForever.Chat.cerrar()');
    m.avanzar(0.2);
    m.lua('SnetForever.Chat.abrir()');
    m.avanzar(0.2);
  }
  assert.equal(enviados(m), 2, 'abrir otra vez enseguida no manda otro');
  m.avanzar(entre - 1.5);
  assert.equal(enviados(m), 2, 'ni antes de ENTRE_CHAT');
  sinErrores(m);
});

test('abrir el chat con el jugador escribiendo: el latido espera a que deje de escribir', () => {
  const m = preparar();
  latidoYCerrar(m, 10);
  m.lua('rawset(_G, "CAJA_ACTIVA", {}); rawset(_G, "ChatEdit_GetActiveWindow", function() return rawget(_G, "CAJA_ACTIVA") end)');
  m.lua('SnetForever.Chat.abrir()');
  m.avanzar(5);
  assert.equal(enviados(m), 1, 'escribiendo, espera');
  m.lua('rawset(_G, "CAJA_ACTIVA", nil)');
  m.avanzar(2.1);
  assert.equal(enviados(m), 2, 'al dejar de escribir, sale (sin esperar el minuto)');
  sinErrores(m);
});
