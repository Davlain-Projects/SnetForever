// Fase 4, tarea 8: envío de mensajes a la IA (ia/envio.lua), sus estados y plazos. El mensaje se lee como lo haría la app:
// franja → decodificador → reunidor de partes → JSON. Con el banco de pruebas (tiempo falso con m.avanzar).
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { sinErrores } from '../../tools/banco-wow/test/ayuda.js';
import { buscarYDecodificar } from '../src/franja/codec.mjs';
import { leerTrama, crearReunidor } from '../src/franja/mensajes.mjs';
import { franjaComoImagen } from './ayuda/franja-banco.mjs';

const maquinas = [];
const carpetas = [];
// Las máquinas de cada prueba se cierran al acabarla: guardarlas hasta el final del archivo agotaba el montón de Node.
afterEach(() => {
  maquinas.splice(0).forEach((m) => m.cerrar());
});
after(() => {
  carpetas.forEach((c) => rmSync(c, { recursive: true, force: true }));
});

// Máquina sin carpeta de AddOns: PlaySoundFile da false (sin sonido) y LoadAddOn «MISSING».
// regla de interfaz (16-nov): la franja solo se ve anclada al hueco del chat de la IA. Las pruebas abren el chat, como el
// jugador que escribe en él; con `chat: false` (o sin entrar al mundo) queda cerrado.
function nueva({ chat = true, ...opciones } = {}) {
  const m = crearMaquina({ codificacion: true, ...opciones });
  maquinas.push(m);
  if (chat && opciones.entrar !== false) m.lua('SnetForever.Chat.abrir()');
  return m;
}

const TIMBRES = ['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar', 'vivo_a', 'vivo_b', 'presente'];
const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;

// Máquina con carpeta de AddOns de verdad: los 7 .wav y las ranuras vacías R001…R<ranuras>.
function conSonido(ranuras = 6, opciones = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-envio-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever', 'senales'), { recursive: true });
  for (const t of TIMBRES) writeFileSync(join(dir, 'SnetForever', 'senales', `${t}.wav`), '');
  for (let i = 1; i <= ranuras; i++) {
    mkdirSync(join(dir, nombreRanura(i)), { recursive: true });
    writeFileSync(join(dir, nombreRanura(i), `${nombreRanura(i)}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\nbuzon.lua\n`);
    writeFileSync(join(dir, nombreRanura(i), 'buzon.lua'), 'SNF_BUZON = nil\n');
  }
  return { m: nueva({ addonsDir: dir, ...opciones }), dir };
}
const wav = (dir, t) => join(dir, 'SnetForever', 'senales', `${t}.wav`);
const quitar = (dir, t) => renameSync(wav(dir, t), `${wav(dir, t)}.fuera`);

const E = 'SnetForever.Envio';
const enviar = (m, texto) => m.lua(`{${E}.enviar(${JSON.stringify(texto)})}`);
const estado = (m) => m.lua(`${E}.estado()`);
const fase = (m) => estado(m).fase;
const visible = (m) => m.lua('SnetForever.Franja.visible()');
const cargas = (m) => m.llamadas('C_AddOns.LoadAddOn').length;
const literalLua = (texto) => `"${[...Buffer.from(texto, 'utf8')].map((b) => `\\${String(b).padStart(3, '0')}`).join('')}"`;

// Anota los mensajes internos de la IA en EVT.
function anotar(m) {
  m.lua(`rawset(_G, "EVT", {})
    for _, e in ipairs({"SNF_IA_ESTADO", "SNF_IA_RESPUESTA", "SNF_IA_AVISO"}) do
      SnetForever.escuchar(e, function(a, b, c)
        if e == "SNF_IA_ESTADO" and type(c) == "table" then LASTREG = c end
        if type(a) == "table" then a = a.msg end
        if type(b) == "table" then b = "t" end
        EVT[#EVT + 1] = string.sub(e, 8) .. ":" .. tostring(a) .. (b ~= nil and (":" .. tostring(b)) or "")
      end)
    end`);
  return () => m.lua('EVT');
}

// Lee el mensaje que enseña la franja, como la app: una parte cada Franja.PERIODO (0,5 s) hasta reunir todas.
function leerMensaje(m) {
  const paso = m.lua('SnetForever.Franja.PERIODO') + 0.01;
  const reunidor = crearReunidor();
  let primera = null;
  for (let i = 0; i < 80; i++) {
    const imagen = franjaComoImagen(m);
    const r = buscarYDecodificar(imagen);
    if (r.tipo === 'decodificada') {
      const trama = leerTrama(r.bytes);
      assert.ok(trama, 'trama P1 válida');
      primera ??= trama;
      const fin = reunidor.anadir(trama);
      if (fin) {
        assert.ok(!fin.error, `error al reunir: ${fin.error}`);
        return { ...fin, primera };
      }
    }
    m.avanzar(paso);
  }
  assert.fail('no se pudo leer el mensaje entero de la franja');
}

// ---------------------------------------------------------------------------------------------------
// Envío y mensaje
// ---------------------------------------------------------------------------------------------------

test('enviar("hola"): enviando, franja visible, ia.n = 1, id con 4 hex y el mensaje se lee en JS', () => {
  const m = nueva();
  const eventos = anotar(m);
  assert.deepEqual(enviar(m, 'hola'), [true]);
  const e = estado(m);
  assert.equal(e.fase, 'enviando');
  assert.match(e.id, /^[0-9a-f]{4}-1$/);
  assert.equal(visible(m), true);
  assert.equal(m.lua('SnetForeverPJ.ia.n'), 1);
  assert.equal(eventos()[0].startsWith('ESTADO:enviando'), true);

  const { mensaje, primera } = leerMensaje(m);
  assert.equal(mensaje.v, 1);
  assert.equal(mensaje.id, e.id);
  assert.equal(mensaje.pj, m.lua('SnetForever.Personaje.clave()'));
  assert.equal(mensaje.idioma, 'es');
  assert.equal(mensaje.modelo, 'haiku');
  assert.equal(mensaje.texto, 'hola');
  assert.equal(mensaje.nueva, undefined);
  assert.equal(mensaje.refs, undefined);
  assert.equal(typeof mensaje.ctx, 'object');
  assert.equal(mensaje.ctx.inv, undefined);
  assert.equal(primera.id, e.id);
  sinErrores(m);
});

test('la cabecera de la trama lleva r = Buzon.proxima() y c = el cursor del personaje', () => {
  const { m } = conSonido(6);
  m.lua('SnetForeverPJ.ia.cursor = 37');
  m.lua('SnetForever.Buzon.cargar("prueba")'); // gasta la ranura 1: la próxima es la 2
  assert.equal(m.lua('SnetForever.Buzon.proxima()'), 2);
  enviar(m, 'hola');
  const { primera, r, c } = leerMensaje(m);
  assert.equal(primera.r, 2);
  assert.equal(r, 2);
  assert.equal(primera.c, 37);
  assert.equal(c, 37);
  sinErrores(m);
});

test('con ia.modelo en opus («El más capaz») el modelo es opus; un valor guardado raro sigue cayendo en haiku', () => {
  for (const [guardado, esperado] of [['opus', 'opus'], ['fable', 'haiku'], ['OPUS', 'haiku']]) {
    const m = nueva();
    m.lua(`SnetForever.Ajustes.set("ia.modelo", ${JSON.stringify(guardado)})`);
    enviar(m, 'hola');
    assert.equal(leerMensaje(m).mensaje.modelo, esperado, guardado);
    sinErrores(m);
  }
});

test('con ia.inventario hay ctx.inv; con ia.modelo en sonnet, el modelo es sonnet; en inglés, idioma en', () => {
  const m = nueva({ jugador: { idioma: 'enUS' } });
  m.lua('SnetForever.Ajustes.set("ia.inventario", true)');
  m.lua('SnetForever.Ajustes.set("ia.modelo", "sonnet")');
  enviar(m, 'hi');
  const { mensaje } = leerMensaje(m);
  assert.equal(mensaje.modelo, 'sonnet');
  assert.equal(mensaje.idioma, 'en');
  assert.equal(typeof mensaje.ctx.inv, 'object');
  assert.equal(typeof mensaje.ctx.inv.libres, 'number');
  sinErrores(m);
});

test('otro enviar mientras espera da «ocupado»; la cadena vacía da «vacio»; 600 bytes se cortan a 500', () => {
  const m = nueva();
  assert.deepEqual(enviar(m, ''), [false, 'vacio']);
  assert.deepEqual(enviar(m, '   '), [false, 'vacio']);
  assert.equal(fase(m), 'libre');
  assert.deepEqual(enviar(m, 'x'.repeat(600)), [true]);
  assert.deepEqual(enviar(m, 'otra'), [false, 'ocupado']);
  assert.equal(m.lua('SnetForeverPJ.ia.n'), 1);
  const { mensaje } = leerMensaje(m);
  assert.equal(mensaje.texto, 'x'.repeat(500));
  sinErrores(m);
});

test('el corte a 500 bytes no deja medio carácter UTF-8', () => {
  const m = nueva();
  enviar(m, `${'a'.repeat(499)}ñññ`);
  const { mensaje } = leerMensaje(m);
  assert.equal(mensaje.texto, 'a'.repeat(499));
  sinErrores(m);
});

test('un enlace de misión 4641 pasa a refs.q y al texto como «[Tu lugar en el mundo]»; el de objeto, a refs.i', () => {
  const m = nueva();
  const enlaceQ = '|cffffff00|Hquest:4641:60|h[Tu lugar en el mundo]|h|r';
  const enlaceI = '|cff1eff00|Hitem:2589::::::::60|h[Tela de lino]|h|r';
  assert.deepEqual(enviar(m, `¿Dónde empiezo ${enlaceQ}? Tengo ${enlaceI} y otra ${enlaceQ}`), [true]);
  const { mensaje } = leerMensaje(m);
  assert.deepEqual(mensaje.refs, { q: [4641], i: [2589] });
  assert.equal(mensaje.texto, '¿Dónde empiezo [Tu lugar en el mundo]? Tengo [Tela de lino] y otra [Tu lugar en el mundo]');
  sinErrores(m);
});

test('nueva(): el siguiente mensaje lleva nueva = true y el otro ya no', () => {
  const m = nueva();
  m.lua(`${E}.nueva()`);
  enviar(m, 'uno');
  assert.equal(leerMensaje(m).mensaje.nueva, true);
  m.lua(`${E}.cancelar()`);
  enviar(m, 'dos');
  assert.equal(leerMensaje(m).mensaje.nueva, undefined);
  sinErrores(m);
});

test('con proxima() == 21 (las 20 ranuras agotadas) enviar da «sin_ranuras» y no gasta número', () => {
  const m = nueva();
  assert.equal(m.lua('SnetForever.Buzon.RANURAS'), 20);
  m.lua('SnetForever.Buzon.proxima = function() return 21 end');
  assert.deepEqual(enviar(m, 'hola'), [false, 'sin_ranuras']);
  assert.equal(fase(m), 'libre');
  assert.equal(visible(m), false);
  assert.equal(m.lua('SnetForeverPJ.ia.n'), 0);
  sinErrores(m);
});

test('si recortar dice que no cabe (o las partes pasan de 16), «grande», sin franja y sin gastar número', () => {
  const m = nueva();
  m.lua('SnetForever.Contexto.recortar = function(mensaje) return mensaje, false end');
  assert.deepEqual(enviar(m, 'hola'), [false, 'grande']);
  assert.equal(visible(m), false);
  assert.equal(fase(m), 'libre');
  assert.equal(m.lua('SnetForeverPJ.ia.n'), 0);

  const n = nueva();
  n.lua('SnetForever.Envio.partes = function() return nil, "grande" end');
  assert.deepEqual(enviar(n, 'hola'), [false, 'grande']);
  assert.equal(visible(n), false);
  assert.equal(fase(n), 'libre');
  assert.equal(n.lua('SnetForeverPJ.ia.n'), 0);
  sinErrores(m);
  sinErrores(n);
});

test('el contexto con registroIncompleto viaja tal cual', () => {
  const m = nueva({ jugador: { nivel: 18 } });
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true });
  m.registroColapsado([788]);
  enviar(m, 'hola');
  const { mensaje } = leerMensaje(m);
  assert.equal(mensaje.ctx.registroIncompleto, true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Cabecera con pj largo y c grande
// ---------------------------------------------------------------------------------------------------

test('una trama con pj de 60 bytes, id de 5 dígitos, r = 101 y c grande cabe en la franja con 1.300 bytes de datos', () => {
  const m = nueva();
  const pj = `${'ñ'.repeat(28)}-Abc`; // 28 «ñ» (56 bytes) + 4 = 60 bytes
  assert.equal(Buffer.byteLength(pj, 'utf8'), 60);
  const ok = m.lua(`(function()
    local partes, err = SnetForever.Envio.partes(${literalLua(pj)}, "a3f1-99999", string.rep("x", 1300 * 3), 1, 101, 2000000000)
    if not partes then return err end
    local mayor = 0
    for _, p in ipairs(partes) do if #p > mayor then mayor = #p end end
    local mostrado, e = pcall(SnetForever.Franja.mostrar, partes, 65535)
    SnetForever.Franja.ocultar()
    return {total = #partes, mayor = mayor, mostrado = mostrado, e = tostring(e)}
  end)()`);
  assert.equal(ok.total, 3);
  assert.ok(ok.mayor <= 1400, `carga de ${ok.mayor} bytes`);
  assert.equal(ok.mostrado, true, ok.e);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------------------------------

// Un pulso con la franja aún sin ninguna vuelta queda como acuse pendiente: vale al acabar la primera.
function darVuelta(m) {
  for (let i = 0; i < 8 && fase(m) === 'enviando'; i++) m.avanzar(0.6);
}

test('SNF_IA_RECIBIDO de la otra paridad se ignora; el de la buena oculta la franja y pasa a pensando', () => {
  const m = nueva();
  const eventos = anotar(m);
  enviar(m, 'hola'); // n = 1: impar
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "par")');
  assert.equal(fase(m), 'enviando');
  assert.equal(visible(m), true);
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  assert.equal(fase(m), 'enviando', 'con 0 vueltas queda pendiente');
  assert.equal(visible(m), true);
  darVuelta(m);
  assert.equal(fase(m), 'pensando');
  assert.equal(visible(m), false);
  assert.deepEqual(eventos().filter((x) => x.startsWith('ESTADO')), ['ESTADO:enviando:t', 'ESTADO:pensando']);
  sinErrores(m);
});

test('el segundo mensaje es de n = 2: solo vale «par»', () => {
  const m = nueva();
  enviar(m, 'uno');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  m.lua(`${E}.cancelar()`);
  enviar(m, 'dos');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  assert.equal(fase(m), 'enviando');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "par")');
  darVuelta(m);
  assert.equal(fase(m), 'pensando');
  sinErrores(m);
});

test('SNF_IA_RECIBIDO_ID: el id propio vale una vez, los repetidos y los ajenos se ignoran', () => {
  const m = nueva();
  const eventos = anotar(m);
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO_ID", "0000-9")');
  assert.equal(fase(m), 'enviando');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RECIBIDO_ID", "${id}")`);
  assert.equal(fase(m), 'pensando');
  m.lua(`${E}.cancelar()`);
  assert.equal(fase(m), 'libre');
  // Mismo id otra vez (la ranura siguiente lo repite): no cuenta.
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RECIBIDO_ID", "${id}")`);
  assert.equal(fase(m), 'libre');
  assert.equal(eventos().filter((x) => x.startsWith('ESTADO')).length, 3);
  sinErrores(m);
});

test('un registro de respuesta pasa a libre y emite SNF_IA_RESPUESTA; uno de otro mensaje se ignora', () => {
  const m = nueva();
  const eventos = anotar(m);
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  darVuelta(m);
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "0000-5", t = "respuesta", texto = "no"})`);
  assert.equal(fase(m), 'pensando');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 2, pj = "x", msg = "${id}", t = "respuesta", texto = "Hola"})`);
  assert.equal(fase(m), 'libre');
  assert.ok(eventos().includes(`RESPUESTA:${id}`));
  assert.equal(estado(m).id, undefined);
  sinErrores(m);
});

test('un registro de respuesta que llega antes del «recibido» también cierra el turno y quita la franja', () => {
  const m = nueva();
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", t = "respuesta", texto = "Hola"})`);
  assert.equal(fase(m), 'libre');
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('un registro de error pasa a error con su tipo y su texto', () => {
  const m = nueva();
  anotar(m);
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", t = "error", tipo = "sin_sesion", texto = "Sin sesión"})`);
  const e = estado(m);
  assert.equal(e.fase, 'error');
  assert.equal(e.tipo, 'sin_sesion');
  assert.equal(e.texto, 'Sin sesión');
  assert.equal(e.detalle, undefined); // `detalle` es solo la clave de L de los errores propios
  assert.equal(e.id, id);
  assert.equal(m.lua('LASTREG.tipo'), 'sin_sesion'); // SNF_IA_ESTADO lleva el registro como tercer argumento
  assert.equal(m.lua('LASTREG.texto'), 'Sin sesión');
  assert.equal(visible(m), false);
  // Desde el error se puede volver a enviar.
  assert.deepEqual(enviar(m, 'otra vez'), [true]);
  assert.equal(fase(m), 'enviando');
  sinErrores(m);
});

test('cancelar() deja libre y quita la franja', () => {
  const m = nueva();
  enviar(m, 'hola');
  m.lua(`${E}.cancelar()`);
  assert.equal(fase(m), 'libre');
  assert.equal(visible(m), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// regla de interfaz: con el chat cerrado no se ve nada
// ---------------------------------------------------------------------------------------------------

// Ni la franja (en ningún sitio de la pantalla) ni el aviso «Enviando a SnetForever…».
function nadaEnPantalla(m, mensaje = '') {
  assert.equal(visible(m), false, `franja visible ${mensaje}`);
  const imagen = franjaComoImagen(m);
  assert.equal(imagen.texturas, 0, `celdas a la vista ${mensaje}`);
  assert.equal(buscarYDecodificar(imagen).tipo, 'nada', `se decodifica algo ${mensaje}`);
  assert.equal(m.lua('SnetForeverFranjaAviso ~= nil and SnetForeverFranjaAviso:IsVisible()'), false, `aviso visible ${mensaje}`);
}

test('con el chat cerrado el mensaje espera escondido (sin franja ni aviso); al abrir el chat se lee entero', () => {
  const m = nueva({ chat: false });
  assert.deepEqual(enviar(m, 'hola'), [true]);
  assert.equal(fase(m), 'enviando');
  nadaEnPantalla(m, 'al enviar con el chat cerrado');
  m.avanzar(5);
  nadaEnPantalla(m, 'a los 5 s con el chat cerrado');
  assert.equal(fase(m), 'enviando');
  m.lua('SnetForever.Chat.abrir()');
  assert.equal(visible(m), true);
  assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false, 'anclada tampoco hay aviso suelto');
  assert.equal(leerMensaje(m).mensaje.texto, 'hola');
  sinErrores(m);
});

test('cerrar el chat a mitad del envío esconde la franja; al abrirlo otra vez sigue y se lee', () => {
  const m = nueva();
  enviar(m, 'hola');
  assert.equal(visible(m), true);
  m.lua('SnetForever.Chat.cerrar()');
  nadaEnPantalla(m, 'con el chat cerrado');
  m.avanzar(2);
  nadaEnPantalla(m, 'a los 2 s con el chat cerrado');
  m.lua('SnetForever.Chat.abrir()');
  assert.equal(visible(m), true);
  assert.equal(leerMensaje(m).mensaje.texto, 'hola');
  sinErrores(m);
});

test('sin sonido y con el chat cerrado no pasa a pensando (la franja no da vueltas); al abrirlo, sí', () => {
  const m = nueva({ chat: false, sonido: false });
  enviar(m, 'hola');
  m.avanzar(10);
  assert.equal(fase(m), 'enviando');
  assert.equal(m.lua('SnetForever.Franja.vueltas()'), 0);
  nadaEnPantalla(m, 'sin sonido y con el chat cerrado');
  m.lua('SnetForever.Chat.abrir()');
  m.avanzar(2 * m.lua('SnetForever.Franja.PERIODO') + 0.2); // 1 parte: 2 vueltas
  assert.equal(fase(m), 'pensando');
  assert.equal(visible(m), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Plazos
// ---------------------------------------------------------------------------------------------------

test('con sonido: a los 45 s en enviando, error CHAT_SIN_APP', () => {
  const { m } = conSonido();
  const eventos = anotar(m);
  enviar(m, 'hola');
  assert.equal(eventos().some((x) => x.startsWith('AVISO')), false);
  m.avanzar(44);
  assert.equal(fase(m), 'enviando');
  assert.equal(visible(m), true);
  m.avanzar(1.5);
  const e = estado(m);
  assert.equal(e.fase, 'error');
  assert.equal(e.detalle, 'CHAT_SIN_APP');
  assert.equal(visible(m), false);
  assert.match(m.lua('SnetForever.L.t("CHAT_SIN_APP")'), /La app SnetForever no ha leído el mensaje/);
  sinErrores(m);
});

test('con sonido, en pensando se carga una ranura a los 60 y a los 150 s; a los 420 s, CHAT_SIN_RESPUESTA', () => {
  const { m } = conSonido();
  enviar(m, 'hola');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  const base = cargas(m);
  m.avanzar(59);
  assert.equal(cargas(m), base);
  m.avanzar(2);
  assert.equal(cargas(m), base + 1);
  m.avanzar(88);
  assert.equal(cargas(m), base + 1);
  m.avanzar(2);
  assert.equal(cargas(m), base + 2);
  m.avanzar(88);
  assert.equal(fase(m), 'pensando');
  m.avanzar(179); // 418 s: aún se espera
  assert.equal(fase(m), 'pensando');
  m.avanzar(3);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  assert.equal(cargas(m), base + 2);
  sinErrores(m);
});

test('Vigilancia 3, sin sonido: aviso CHAT_SIN_SONIDO, la franja se oculta a los 3 s con ≥2 vueltas, repasos a los 5, 12, 25, 45, 75, 120, 210, 330 y 405 s y error a los 420 s', () => {
  const m = nueva({ sonido: false });
  const eventos = anotar(m);
  const base = cargas(m);
  enviar(m, 'hola');
  assert.deepEqual(eventos().filter((x) => x.startsWith('AVISO')), ['AVISO:CHAT_SIN_SONIDO']);
  assert.match(m.lua('SnetForever.L.t("CHAT_SIN_SONIDO")'), /El sonido del juego está apagado/);

  m.avanzar(2.8); // 1 parte: ya hay 2 vueltas, pero no han pasado 3 s
  assert.equal(m.lua('SnetForever.Franja.vueltas() >= 2'), true);
  assert.equal(fase(m), 'enviando');
  assert.equal(visible(m), true);
  m.avanzar(0.4);
  assert.equal(fase(m), 'pensando');
  assert.equal(visible(m), false);

  let t = 3.2;
  const plazos = [5, 12, 25, 45, 75, 120, 210, 330, 405];
  plazos.forEach((p, i) => {
    m.avanzar(p - 0.3 - t);
    assert.equal(cargas(m) - base, i, `antes de los ${p} s`);
    m.avanzar(0.6);
    assert.equal(cargas(m) - base, i + 1, `a los ${p} s`);
    t = p + 0.3;
  });
  m.avanzar(419.7 - t);
  assert.equal(fase(m), 'pensando');
  assert.equal(cargas(m) - base, 9);
  m.avanzar(0.6);
  assert.equal(estado(m).fase, 'error');
  assert.equal(estado(m).detalle, 'CHAT_SIN_RESPUESTA');
  assert.equal(cargas(m) - base, 9);
  sinErrores(m);
});

test('sin sonido la franja no se oculta mientras falten vueltas, aunque hayan pasado 3 s', () => {
  const m = nueva({ sonido: false });
  enviar(m, 'hola');
  m.lua('SnetForever.Franja.vueltas = function() return 1 end');
  m.avanzar(4);
  assert.equal(fase(m), 'enviando');
  assert.equal(visible(m), true);
  m.lua('SnetForever.Franja.vueltas = function() return 2 end');
  m.avanzar(0.2);
  assert.equal(fase(m), 'pensando');
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('una respuesta que llega en una carga de repaso corta los plazos', () => {
  const m = nueva({ sonido: false });
  const eventos = anotar(m);
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua(`SnetForever.Buzon.cargar = function()
    SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", t = "respuesta", texto = "ok"})
  end`);
  m.avanzar(5.5);
  assert.equal(fase(m), 'libre');
  assert.ok(eventos().includes(`RESPUESTA:${id}`));
  m.avanzar(250);
  assert.equal(fase(m), 'libre');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Huecos de la tarea 5 (timbres y buzón)
// ---------------------------------------------------------------------------------------------------

test('SNF_IA_TIMBRE carga la siguiente ranura (motivo «timbre»); también con un pulso real de timbre_a', () => {
  const { m, dir } = conSonido(4);
  m.lua('SnetForever.Eventos.emitir("SNF_IA_TIMBRE")');
  assert.equal(cargas(m), 1);
  assert.equal(m.lua('SnetForever.Buzon.proxima()'), 2);
  // Lote C (52-M2): sin app viva, en reposo solo se miran presente y vivo_a/b; con un mensaje en curso, timbre_a también.
  m.lua('SnetForever.Timbres.atento(true)');
  quitar(dir, 'timbre_a');
  m.avanzar(1.2);
  assert.equal(cargas(m), 2);
  assert.equal(m.lua('SnetForever.Buzon.proxima()'), 3);
  sinErrores(m);
});

test('el OnUpdate de timbres no lee nada antes de entrar al mundo', () => {
  const { m } = conSonido(2, { entrar: false });
  m.avanzar(3);
  assert.equal(m.llamadas('PlaySoundFile').length, 0);
  m.disparar('PLAYER_ENTERING_WORLD');
  m.avanzar(1.2);
  assert.ok(m.llamadas('PlaySoundFile').length > 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Inventario lleno
// ---------------------------------------------------------------------------------------------------

test('un inventario lleno (bolsas, equipo con tt y banco) se recorta a ≤ 20.000 bytes y no toca la tabla guardada del banco', () => {
  const m = nueva();
  m.lua('SnetForever.Ajustes.set("ia.inventario", true)');
  // Bolsas: 4 de 20 huecos con 80 objetos distintos.
  for (let b = 1; b <= 4; b++) m.huecos(b, 20);
  for (let i = 1; i <= 80; i++) {
    const id = 1000 + i;
    m.itemInfo(id, { nombre: `Objeto de prueba largo número ${i}`, calidad: i % 5, nivel: i % 60, precio: i * 7, equipa: 'INVTYPE_CHEST' });
    m.bolsa(1 + ((i - 1) % 4), 1 + Math.floor((i - 1) / 4), { id, n: 1 + (i % 7) });
  }
  // Equipo: 19 piezas con 12 líneas de tooltip de 60 bytes (sin estadísticas: llevan tt).
  for (let s = 1; s <= 19; s++) {
    m.itemInfo(5000 + s, { nombre: `Pieza ${s}`, nivel: 20, tooltip: Array.from({ length: 12 }, (_, k) => `Línea ${k + 1} de la pieza ${s} ${'ñ'.repeat(20)}`) });
    m.equipar(s, 5000 + s);
  }
  // Banco apuntado: 300 objetos.
  m.lua(`(function()
    local objetos = {}
    for i = 1, 300 do
      objetos[i] = {id = 20000 + i, n = 3, ca = 2, pv = 100 + i, nv = 30, h = "INVTYPE_CHEST", l = 0, b = {{-1, (i % 28) + 1}}}
    end
    SnetForeverPJ.ia.banco = {fecha = 1790000000, objetos = objetos}
  end)()`);

  // Copia superficial: el mensaje no comparte la tabla del banco con las SavedVariables.
  assert.equal(m.lua('rawequal(SnetForever.Inventario.leer().banco, SnetForeverPJ.ia.banco)'), false);

  // Sin recortar, el JSON pasa de 20.000 bytes (la prueba solo vale si hace falta recortar).
  const sinRecortar = m.lua(`#SnetForever.JSON.codificar({ctx = {inv = SnetForever.Inventario.leer()}})`);
  assert.ok(sinRecortar > 20000, `el inventario de prueba mide ${sinRecortar} bytes`);

  assert.deepEqual(enviar(m, 'hola'), [true]);
  const { mensaje } = leerMensaje(m);
  const bytes = Buffer.byteLength(JSON.stringify(mensaje), 'utf8');
  assert.ok(bytes <= 20000, `mensaje de ${bytes} bytes`);
  assert.ok(mensaje.ctx.recorte.includes('inv.banco'));
  assert.equal(mensaje.ctx.inv.banco, undefined);
  assert.ok(mensaje.ctx.inv.bolsas.length > 0);
  // El banco guardado sigue entero (la prueba que distingue la copia es la de rawequal de arriba).
  assert.equal(m.lua('#SnetForeverPJ.ia.banco.objetos'), 300);
  sinErrores(m);
});

test('envio.lua no menciona C_EncodingUtil ni Enum fuera de los comentarios: el cliente se toca solo con SNF.API.codificacion', async () => {
  const { readFileSync } = await import('node:fs');
  const fuente = readFileSync(new URL('../../addons/SnetForever/ia/envio.lua', import.meta.url), 'utf8');
  assert.equal(/\bC_EncodingUtil\b|\bEnum\./.test(fuente.replace(/^\s*--.*$/gm, '')), false);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1
// ---------------------------------------------------------------------------------------------------

test('texto con enlaces ajenos: «|Hplayer…|h[Nombre]|h» queda como su texto visible, sin refs y sin códigos de color', () => {
  const m = nueva();
  assert.deepEqual(enviar(m, '|cffffd200|Hplayer:Juan-Reino:1|h[Juan]|h|r dice |cff00ff00|Hspell:133|h[Bola de fuego]|h|r'), [true]);
  const { mensaje } = leerMensaje(m);
  assert.equal(mensaje.texto, '[Juan] dice [Bola de fuego]');
  assert.equal(mensaje.refs, undefined);
  sinErrores(m);
});

test('un texto hecho solo de códigos de color da «vacio» (se comprueba después de limpiar)', () => {
  const m = nueva();
  assert.deepEqual(enviar(m, '|cffff0000|r'), [false, 'vacio']);
  assert.deepEqual(enviar(m, ' |cffff0000|r |r '), [false, 'vacio']);
  assert.equal(fase(m), 'libre');
  assert.equal(m.lua('SnetForeverPJ.ia.n'), 0);
  sinErrores(m);
});

test('un fallo de Franja.mostrar no es «grande»: va a error con CHAT_FALLO_INTERNO y se guarda el error real', () => {
  const m = nueva();
  m.lua('SnetForever.Franja.mostrar = function() error("explotó la franja", 0) end');
  assert.deepEqual(enviar(m, 'hola'), [false, 'interno']);
  const e = estado(m);
  assert.equal(e.fase, 'error');
  assert.equal(e.detalle, 'CHAT_FALLO_INTERNO');
  assert.match(m.lua(`${E}.ultimoError()`), /explotó la franja/);
  assert.match(m.lua('SnetForever.L.t("CHAT_FALLO_INTERNO")'), /Error interno del addon al enviar\. Prueba \/reload\./);
  assert.equal(m.lua('SnetForever.L.tablas.en.CHAT_FALLO_INTERNO'), 'Internal addon error while sending. Try /reload.');
  assert.equal(m.lua('SnetForeverPJ.ia.n'), 0);
  sinErrores(m);
});

test('una carga que no cabe en la franja sí es «grande», sin pasar por Franja.mostrar', () => {
  const m = nueva();
  m.lua(`local orig = SnetForever.Envio.partes
    SnetForever.Envio.partes = function(...) local p = orig(...); p[1] = p[1] .. string.rep("x", 2000); return p end`);
  assert.deepEqual(enviar(m, 'hola'), [false, 'grande']);
  assert.equal(fase(m), 'libre');
  sinErrores(m);
});

test('CHAT_SIN_SONIDO: una vez por sesión, y otra si el sonido vuelve y se va', () => {
  const m = nueva();
  const eventos = anotar(m);
  const avisos = () => eventos().filter((x) => x.startsWith('AVISO')).length;
  m.lua('SONIDO = false; SnetForever.Timbres.sonido = function() return SONIDO end');
  enviar(m, 'uno');
  assert.equal(avisos(), 1);
  m.lua(`${E}.cancelar()`);
  enviar(m, 'dos');
  assert.equal(avisos(), 1);
  m.lua(`${E}.cancelar(); SONIDO = true`);
  enviar(m, 'tres');
  assert.equal(avisos(), 1);
  m.lua(`${E}.cancelar(); SONIDO = false`);
  enviar(m, 'cuatro');
  assert.equal(avisos(), 2);
  sinErrores(m);
});

test('sin sonido y con 10 partes no se cargan repasos en enviando: el primero toca al entrar en pensando, una sola vez', () => {
  const m = nueva({ sonido: false });
  m.lua(`local orig = SnetForever.Envio.partes
    SnetForever.Envio.partes = function(pj, id, cuerpo, z, r, c) return orig(pj, id, string.rep("x", 13000), 0, r, c) end`);
  const base = cargas(m);
  enviar(m, 'hola');
  assert.equal(estado(m).detalle.total, 10);
  const vueltas2 = 10 * m.lua('SnetForever.Franja.PERIODO') * 2; // 10 partes × 0,5 s × 2 vueltas = 10 s
  assert.equal(vueltas2, 10);
  m.avanzar(5.5); // el plazo de 5 s ya venció, pero la franja sigue mostrándose
  assert.equal(fase(m), 'enviando');
  assert.equal(cargas(m) - base, 0);
  m.avanzar(vueltas2 - 5.5 - 0.3); // 9,7 s: aún falta un poco para las 2 vueltas
  assert.equal(fase(m), 'enviando');
  assert.equal(cargas(m) - base, 0);
  m.avanzar(0.6); // 10,3 s
  assert.equal(fase(m), 'pensando');
  assert.equal(cargas(m) - base, 1);
  m.avanzar(1.4); // 11,7 s: el siguiente plazo es el de 12 s
  assert.equal(cargas(m) - base, 1);
  m.avanzar(0.6); // 12,3 s
  assert.equal(cargas(m) - base, 2);
  sinErrores(m);
});

test('reentrada: un oyente de SNF_IA_ESTADO("libre") que envía otro mensaje en la carga de repaso no gasta más ranuras', () => {
  const m = nueva({ sonido: false });
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua(`CARGAS = 0; OTRO = false
    SnetForever.Buzon.cargar = function()
      CARGAS = CARGAS + 1
      SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", t = "respuesta", texto = "ok"})
    end
    SnetForever.escuchar("SNF_IA_ESTADO", function(f) if f == "libre" and not OTRO then OTRO = true; ${E}.enviar("segundo") end end)`);
  m.avanzar(5.2);
  assert.equal(m.lua('CARGAS'), 1);
  assert.equal(fase(m), 'enviando');
  assert.notEqual(estado(m).id, id);
  m.avanzar(0.3);
  assert.equal(m.lua('CARGAS'), 1);
  sinErrores(m);
});

test('respuesta tardía: tras CHAT_SIN_APP o CHAT_SIN_RESPUESTA el registro del mismo id pasa a libre y emite RESPUESTA', () => {
  const { m } = conSonido();
  const eventos = anotar(m);
  enviar(m, 'hola');
  const id = estado(m).id;
  m.avanzar(46);
  assert.equal(estado(m).detalle, 'CHAT_SIN_APP');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", t = "respuesta", texto = "tarde"})`);
  assert.equal(fase(m), 'libre');
  assert.ok(eventos().includes(`RESPUESTA:${id}`));

  const { m: n } = conSonido();
  const eventosN = anotar(n);
  enviar(n, 'hola');
  const idN = estado(n).id;
  n.lua('SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "impar")');
  n.avanzar(421);
  assert.equal(estado(n).detalle, 'CHAT_SIN_RESPUESTA');
  n.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${idN}", t = "respuesta", texto = "tarde"})`);
  assert.equal(fase(n), 'libre');
  assert.ok(eventosN().includes(`RESPUESTA:${idN}`));
  sinErrores(m);
  sinErrores(n);
});

test('respuesta tardía: si el id se canceló con cancelar(), el registro se ignora y no hay RESPUESTA', () => {
  const m = nueva();
  const eventos = anotar(m);
  enviar(m, 'hola');
  const id = estado(m).id;
  m.lua(`${E}.cancelar()`);
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 1, pj = "x", msg = "${id}", t = "respuesta", texto = "tarde"})`);
  assert.equal(fase(m), 'libre');
  assert.equal(eventos().some((x) => x.startsWith('RESPUESTA')), false);
  // Un error de la app tampoco revive un id cancelado.
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", {seq = 2, pj = "x", msg = "${id}", t = "error", tipo = "fallo", texto = "x"})`);
  assert.equal(fase(m), 'libre');
  sinErrores(m);
});

// Escribe la ranura i con el contenido dado (tabla de Lua en texto).
function ponerBuzon(dir, i, contenido) {
  writeFileSync(join(dir, nombreRanura(i), 'buzon.lua'), `SNF_BUZON = ${contenido}\n`);
}

test('por una carga real de buzón en enviando: recibidos[pj] pasa a pensando', () => {
  const { m, dir } = conSonido(3);
  enviar(m, 'hola');
  const { id } = estado(m);
  const pj = m.lua('SnetForever.Personaje.clave()');
  ponerBuzon(dir, 1, `{v = 1, seq = 5, recibidos = {[${JSON.stringify(pj)}] = ${JSON.stringify(id)}}, registros = {}}`);
  assert.ok(m.lua('SnetForever.Buzon.cargar("prueba")'));
  assert.equal(fase(m), 'pensando');
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('por una carga real de buzón en enviando: un registro de respuesta cierra el turno y uno de error trae su texto', () => {
  const { m, dir } = conSonido(3);
  const eventos = anotar(m);
  enviar(m, 'hola');
  const { id } = estado(m);
  const pj = JSON.stringify(m.lua('SnetForever.Personaje.clave()'));
  ponerBuzon(dir, 1, `{v = 1, seq = 5, recibidos = {[${pj}] = "${id}"}, registros = {{seq = 5, pj = ${pj}, msg = "${id}", t = "respuesta", texto = "Hola"}}}`);
  m.lua('SnetForever.Buzon.cargar("prueba")');
  assert.equal(fase(m), 'libre');
  assert.ok(eventos().includes(`RESPUESTA:${id}`));

  enviar(m, 'otra');
  const e2 = estado(m);
  ponerBuzon(dir, 2, `{v = 1, seq = 6, recibidos = {[${pj}] = "${e2.id}"}, registros = {{seq = 6, pj = ${pj}, msg = "${e2.id}", t = "error", tipo = "limite", texto = "Has llegado al límite."}}}`);
  m.lua('SnetForever.Buzon.cargar("prueba")');
  const e3 = estado(m);
  assert.equal(e3.fase, 'error');
  assert.equal(e3.tipo, 'limite');
  assert.equal(e3.texto, 'Has llegado al límite.');
  sinErrores(m);
});
