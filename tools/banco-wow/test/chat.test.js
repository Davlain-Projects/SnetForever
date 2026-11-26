// Fase 4, tarea 11: ventana de chat con la IA (ui/chat.lua), /snet chat y /snet ia, y lo que el banco necesita para
// probarla (ScrollingMessageFrame creable, EditBox:Disable/Enable/Insert y ChatEdit_InsertLink). Las decisiones del
// controlador posteriores al brief (task-11-decisiones.md) mandan: 440 × 360, hueco libre para la mini franja, estados
// de Envio (F4-12), avisos sin repetir (F4-7), SNF.Ruta (F4-14) y motor Claude o Codex (F4-11).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEXTOS = join(RAIZ, 'addons', 'SnetForever', 'textos');

const CH = 'SnetForever.Chat';
const MC = `${CH}.marcos`;
const ES = { jugador: { idioma: 'esES' } };

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const sinColor = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');
const slash = (m, texto) => m.lua(`SlashCmdList.SNET(${aLua(texto)})`);
const visible = (m) => m.lua('rawget(_G, "SnetForeverChat") ~= nil and SnetForeverChat:IsVisible()') === true;
const L = (m, clave, ...args) => m.lua(`SnetForever.L.t(${[aLua(clave), ...args.map(aLua)].join(', ')})`);
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));

// Las líneas del historial, sin códigos de color.
const lineas = (m) => (m.lua(`(function()
  local s, t = ${MC}.mensajes, {}
  for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
  return t
end)()`) || []).map(sinColor).filter((l) => l !== " "); // 11-nov: sin las líneas en blanco entre mensajes
const ultima = (m) => { const l = lineas(m); return l[l.length - 1]; };

function abierto(opciones = {}) {
  const m = nuevaMaquina({ ...ES, ...opciones });
  slash(m, 'chat');
  return m;
}

// Escribe en la entrada y pulsa Intro.
function escribir(m, texto) {
  m.lua(`${MC}.entrada:SetText(${aLua(texto)})`);
  m.lua(`${MC}.entrada:GetScript("OnEnterPressed")(${MC}.entrada)`);
}

const estado = (m) => m.lua('SnetForever.Envio.estado()');
const pj = (m) => m.lua('SnetForever.Personaje.clave()');

// Un registro del buzón para el mensaje que se está esperando.
function registro(m, campos) {
  const id = estado(m).id;
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", ${aLua({ seq: 1, pj: pj(m), msg: id, ...campos })})`);
}

const textosVisibles = (m, raiz) => (m.lua(`(function()
  local salida = {}
  local function recorrer(o)
    if o:IsObjectType("FontString") then
      if o:IsVisible() and o:GetText() then salida[#salida + 1] = o:GetText() end
    elseif o:IsObjectType("Frame") then
      for _, r in ipairs({o:GetRegions()}) do recorrer(r) end
      for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
    end
  end
  recorrer(${raiz})
  return salida
end)()`) || []).map(sinColor);
const contiene = (lista, buscado) => lista.some((s) => s.includes(buscado));

// ---------------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------------

test('banco: ScrollingMessageFrame creable (AddMessage, SetMaxLines, SetFading, desplazamiento y GetMessageInfo)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local s = CreateFrame("ScrollingMessageFrame", nil, UIParent)
    s:SetMaxLines(3)
    s:SetFading(false)
    s:SetFont("Fonts\\\\FRIZQT__.TTF", 11, "")
    s:SetJustifyH("LEFT")
    for k = 1, 5 do s:AddMessage("linea " .. k, 1, 0.5, 0) end
    local t = {n = s:GetNumMessages(), primera = (s:GetMessageInfo(1)), ultima = (s:GetMessageInfo(3))}
    local _, r, g, b = s:GetMessageInfo(3)
    t.color = {r, g, b}
    t.max = s:GetMaxScrollRange()
    s:ScrollUp(); s:ScrollUp()
    t.subido = s:GetScrollOffset()
    s:ScrollDown()
    t.bajado = s:GetScrollOffset()
    s:ScrollUp(); s:ScrollUp(); s:ScrollUp(); s:ScrollUp()
    t.tope = s:GetScrollOffset()
    s:ScrollToBottom()
    t.abajo = s:GetScrollOffset()
    s:SetScrollOffset(1)
    t.puesto = s:GetScrollOffset()
    s:Clear()
    t.vacio = s:GetNumMessages()
    return t
  end)()`);
  assert.equal(r.n, 3);
  assert.equal(r.primera, 'linea 3');
  assert.equal(r.ultima, 'linea 5');
  assert.deepEqual(r.color, [1, 0.5, 0]);
  assert.equal(r.max, 2);
  assert.equal(r.subido, 2);
  assert.equal(r.bajado, 1);
  assert.equal(r.tope, 2, 'no sube más allá del primer mensaje');
  assert.equal(r.abajo, 0);
  assert.equal(r.puesto, 1);
  assert.equal(r.vacio, 0);
  // Los mensajes de un ScrollingMessageFrame propio no van al chat del sistema.
  assert.deepEqual(m.llamadas('AddMessage'), []);
  sinErrores(m);
});

test('banco: EditBox:Disable/Enable/IsEnabled e Insert; ChatEdit_InsertLink existe y se puede enganchar', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local e = CreateFrame("EditBox", nil, UIParent)
    e:SetMaxLetters(8)
    e:SetText("hola")
    local t = {activo = e:IsEnabled()}
    e:Disable()
    t.desactivado = e:IsEnabled()
    e:Enable()
    t.reactivado = e:IsEnabled()
    e:Insert(" mundo!")
    t.texto = e:GetText()
    local visto
    hooksecurefunc("ChatEdit_InsertLink", function(enlace) visto = enlace end)
    t.devuelve = ChatEdit_InsertLink("|cff9d9d9d|Hitem:2589|h[Lino]|h|r")
    t.visto = visto
    return t
  end)()`);
  assert.equal(r.activo, true);
  assert.equal(r.desactivado, false);
  assert.equal(r.reactivado, true);
  assert.equal(r.texto, 'hola mun', 'Insert respeta SetMaxLetters');
  assert.equal(r.devuelve, false);
  assert.equal(r.visto, '|cff9d9d9d|Hitem:2589|h[Lino]|h|r');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// /snet chat y /snet ia
// ---------------------------------------------------------------------------------------------------

test('/snet chat alterna SnetForeverChat, /snet ia también; /snet xyz enseña la línea de ayuda del chat', () => {
  const m = nuevaMaquina(ES);
  assert.equal(visible(m), false);
  slash(m, 'chat');
  assert.equal(visible(m), true);
  slash(m, 'chat');
  assert.equal(visible(m), false);
  slash(m, 'ia');
  assert.equal(visible(m), true);
  slash(m, 'IA');
  assert.equal(visible(m), false);
  slash(m, 'xyz');
  const ayuda = impresos(m).filter((l) => l.includes('/snet chat'));
  assert.equal(ayuda.length, 1);
  assert.ok(ayuda[0].includes('/snet ia'), ayuda[0]);
  sinErrores(m);
});

test('marco: SnetForeverChat de 440 × 360, movible, en UISpecialFrames, con el fondo y la posición de chat.pos', () => {
  const m = nuevaMaquina({ ...ES, guardado: { SnetForeverPJ: { ajustes: { 'chat.pos': { punto: 'TOPLEFT', relPunto: 'TOPLEFT', x: 100, y: -120 } } } } });
  slash(m, 'chat');
  const raiz = m.marco('SnetForeverChat');
  assert.equal(raiz.ancho, 440);
  assert.equal(raiz.alto, 360);
  assert.equal(m.lua('SnetForeverChat:IsMovable()'), true);
  assert.ok(m.lua('UISpecialFrames').includes('SnetForeverChat'));
  assert.equal(m.lua('SnetForeverChat:GetLeft()'), 100);
  assert.equal(m.lua('SnetForeverChat:GetTop()'), 768 - 120);
  // Tema activo: el fondo es el de Estilo (con el alfa de la ventana) y la cabecera y el pie, «fondoCabecera».
  const fondo = m.lua('{SnetForeverChat.snfFondo:GetVertexColor()}');
  const c = m.lua('SnetForever.Estilo.color("fondo")');
  assert.deepEqual(fondo.slice(0, 3), c.slice(0, 3));
  assert.equal(m.lua(`${MC}.cabecera.snfToken`), 'fondoCabecera');
  assert.equal(m.lua(`${MC}.pie.snfToken`), 'fondoCabecera');
  // Cabecera: emblema redondo, título y la X; pie con la versión.
  assert.equal(m.lua(`${MC}.titulo:GetText()`), 'Chat con la IA');
  assert.equal(m.lua(`${MC}.emblema.aro:GetTexture()`), 'Interface\\CharacterFrame\\TempPortraitAlphaMask');
  assert.equal(m.lua(`${MC}.pie.version:GetText()`), 'SnetForever v0.7.0');
  m.lua(`${MC}.cerrar:Click()`);
  assert.equal(visible(m), false);
  sinErrores(m);
});

test('marco: arrastrar la cabecera mueve la ventana y guarda chat.pos', () => {
  const m = abierto();
  m.lua('BANCO.arrastre = {x = 30, y = -10}');
  m.lua(`${MC}.cabecera:GetScript("OnMouseDown")(${MC}.cabecera, "LeftButton")`);
  m.lua(`${MC}.cabecera:GetScript("OnMouseUp")(${MC}.cabecera, "LeftButton")`);
  const pos = m.lua('SnetForever.Ajustes.get("chat.pos")');
  assert.equal(typeof pos.x, 'number');
  assert.ok(pos.punto && pos.relPunto);
  const r = m.recargar();
  slash(r, 'chat');
  const punto = r.marco('SnetForeverChat').puntos[0];
  assert.equal(punto.x, pos.x);
  assert.equal(punto.y, pos.y);
  sinErrores(r);
});

// ---------------------------------------------------------------------------------------------------
// Enviar y recibir
// ---------------------------------------------------------------------------------------------------

test('«hola» e Intro: Envio.enviar("hola"), la línea «Tú: hola», la entrada vacía y desactivada y el estado «Enviando…»', () => {
  const m = abierto();
  escribir(m, 'hola');
  assert.equal(estado(m).fase, 'enviando');
  assert.ok(lineas(m).includes('Tú: hola'), lineas(m).join(' | '));
  assert.equal(m.lua(`${MC}.entrada:GetText()`), '');
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), false);
  assert.equal(m.lua(`${MC}.enviar:IsEnabled()`), false);
  assert.equal(m.lua(`${MC}.entrada:HasFocus()`), false);
  assert.match(m.lua(`${MC}.estado:GetText()`), /^Enviando…/);
  // Solo vale el total de partes (F4-12): «Enviando… (N partes)» o «Enviando…» con una sola.
  const total = estado(m).detalle.total;
  const esperado = total > 1 ? L(m, 'CHAT_ENVIANDO', total) : L(m, 'CHAT_ENVIANDO_UNA');
  assert.equal(m.lua(`${MC}.estado:GetText()`), esperado);
  // El botón «Enviar» hace lo mismo que Intro.
  sinErrores(m);
});

test('el botón «Enviar» envía lo escrito; sin sonido, el aviso CHAT_SIN_SONIDO sale una vez y después de «Tú:»', () => {
  const m = abierto();
  m.lua(`${MC}.entrada:SetText("¿dónde voy?")`);
  m.lua(`${MC}.enviar:Click()`);
  const l = lineas(m);
  const tu = l.indexOf('Tú: ¿dónde voy?');
  const aviso = l.indexOf(L(m, 'CHAT_SIN_SONIDO'));
  assert.ok(tu >= 0, l.join(' | '));
  assert.ok(aviso > tu, 'el aviso va después de la línea del jugador');
  sinErrores(m);
});

test('pensando: «La IA está pensando…» y la entrada sigue desactivada; la respuesta pinta «IA: …» y la activa', () => {
  const m = abierto();
  escribir(m, 'hola');
  m.avanzar(4); // sin sonido: tras 2 vueltas y 3 s pasa a pensando
  assert.equal(estado(m).fase, 'pensando');
  assert.equal(m.lua(`${MC}.estado:GetText()`), 'La IA está pensando…');
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), false);
  registro(m, { t: 'respuesta', texto: 'Ve al norte, a Villa Razor.', motor: 'codex' });
  assert.equal(estado(m).fase, 'libre');
  assert.equal(ultima(m), 'IA: Ve al norte, a Villa Razor.');
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  assert.equal(m.lua(`${MC}.enviar:IsEnabled()`), true);
  assert.equal(m.lua(`${MC}.estado:GetText()`) || '', '');
  // El motor del registro se guarda y se ve en la cabecera.
  assert.equal(m.lua('SnetForeverPJ.ia.motor'), 'codex');
  assert.ok(m.lua(`${MC}.subtitulo:GetText()`).includes('Motor: ChatGPT (Codex)'), m.lua(`${MC}.subtitulo:GetText()`));
  assert.ok(m.lua(`${MC}.subtitulo:GetText()`).includes('Rápido (Codex)'));
  sinErrores(m);
});

test('un error de la app pinta su texto (tal cual) como línea de sistema y vuelve a activar la entrada', () => {
  const m = abierto();
  escribir(m, 'hola');
  registro(m, { t: 'error', tipo: 'limite', texto: 'Has llegado al límite de uso de tu suscripción de Claude. Prueba más tarde.' });
  assert.equal(estado(m).fase, 'error');
  assert.equal(ultima(m), 'Has llegado al límite de uso de tu suscripción de Claude. Prueba más tarde.');
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  sinErrores(m);
});

test('un error propio (CHAT_SIN_RESPUESTA) es una línea de sistema; la respuesta tardía se pinta igual y activa la entrada', () => {
  const m = abierto();
  escribir(m, 'hola');
  m.avanzar(241);
  assert.notEqual(estado(m).fase, 'error', 'a los 241 s aún se espera');
  m.avanzar(180);
  assert.equal(estado(m).fase, 'error');
  assert.equal(ultima(m), L(m, 'CHAT_SIN_RESPUESTA'));
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  registro(m, { t: 'respuesta', texto: 'Perdona la tardanza.' });
  assert.equal(ultima(m), 'IA: Perdona la tardanza.');
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  sinErrores(m);
});

test('los avisos RANURAS_* no se repiten: una línea por tipo mientras no cambie el estado del buzón', () => {
  const m = abierto();
  escribir(m, 'hola');
  m.avanzar(130); // los repasos (5, 12, 25, 45, 75, 120 s) intentan cargar ranuras que no existen
  const faltan = lineas(m).filter((l) => l === L(m, 'RANURAS_FALTAN'));
  assert.equal(faltan.length, 1, lineas(m).join(' | '));
  // Otro tipo sí sale; y otra vez el primero, no.
  m.lua('SnetForever.Eventos.emitir("SNF_IA_AVISO", "RANURAS_DESACTIVADAS")');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_AVISO", "RANURAS_DESACTIVADAS")');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_AVISO", "RANURAS_FALTAN")');
  assert.equal(lineas(m).filter((l) => l === L(m, 'RANURAS_DESACTIVADAS')).length, 1);
  assert.equal(lineas(m).filter((l) => l === L(m, 'RANURAS_FALTAN')).length, 1);
  // Si el buzón avanza (se ha cargado una ranura), el aviso vuelve a valer.
  m.lua('local p = SnetForever.Buzon.proxima; SnetForever.Buzon.proxima = function() return p() + 1 end');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_AVISO", "RANURAS_FALTAN")');
  assert.equal(lineas(m).filter((l) => l === L(m, 'RANURAS_FALTAN')).length, 2);
  sinErrores(m);
});

test('cada motivo de Envio.enviar tiene su línea de sistema (vacío, ocupado, grande, sin ranuras)', () => {
  const m = abierto();
  escribir(m, '   ');
  assert.equal(ultima(m), L(m, 'CHAT_VACIO'));
  escribir(m, 'hola');
  m.lua(`${CH}.enviar("otra")`);
  assert.equal(ultima(m), L(m, 'CHAT_OCUPADO'));
  m.lua('SnetForever.Envio.cancelar()');
  m.lua('SnetForever.Envio.enviar = function() return false, "grande" end');
  escribir(m, 'muy grande');
  assert.equal(ultima(m), L(m, 'CHAT_GRANDE'));
  assert.equal(m.lua(`${MC}.entrada:GetText()`), 'muy grande', 'si no se envía, el texto se queda para corregirlo');
  m.lua('SnetForever.Envio.enviar = function() return false, "sin_ranuras" end');
  escribir(m, 'otra');
  assert.equal(ultima(m), 'Se han usado todos los huecos de respuesta de esta sesión (20). Escribe /reload para seguir.');
  // y el aviso del buzón, con el mismo texto
  m.lua('SnetForever.Buzon.proxima = function() return 21 end');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_AVISO", "RANURAS_AGOTADAS")');
  assert.equal(ultima(m), 'Se han usado todos los huecos de respuesta de esta sesión (20). Escribe /reload para seguir.');
  sinErrores(m);
});

test('un fallo interno al enseñar la franja: una sola línea CHAT_FALLO_INTERNO y sin «Tú:»', () => {
  const m = abierto();
  m.lua('SnetForever.Franja.mostrar = function() error("roto") end');
  escribir(m, 'hola');
  const l = lineas(m);
  assert.equal(l.filter((x) => x === L(m, 'CHAT_FALLO_INTERNO')).length, 1, l.join(' | '));
  assert.equal(l.includes('Tú: hola'), false);
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Propuestas de ruta y de guía
// ---------------------------------------------------------------------------------------------------

const P1 = { mapa: 1411, x: 40, y: 20, etiqueta: 'Habla con Garra', tipo: 'recoger', q: 4641, seguir: true };
const P2 = { mapa: 1411, x: 60, y: 30, etiqueta: 'Caza jabalíes', tipo: 'objetivo', q: 4641, obj: 'Jabalí', seguir: true };

function conRespuesta(m, campos) {
  escribir(m, 'hola');
  registro(m, { t: 'respuesta', texto: 'Mira la propuesta.', ...campos });
}

test('una propuesta de 2 paradas: fila «…ruta de 2 paradas…»; Aceptar pone 2 puntos en la capa «ia» y oculta la fila', () => {
  const m = abierto();
  conRespuesta(m, { propuesta: { titulo: 'Garra', puntos: [P1, P2] } });
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), true);
  const texto = m.lua(`${MC}.propuesta.texto:GetText()`);
  assert.ok(texto.includes('ruta de 2 paradas'), texto);
  assert.ok(texto.includes('Habla con Garra') && texto.includes('Caza jabalíes'), texto);
  m.lua(`${MC}.propuesta.aceptar:Click()`);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 2);
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), false);
  assert.equal(m.lua('SnetForever.Ruta.pendiente()'), undefined);
  sinErrores(m);
});

test('Descartar deja la capa «ia» vacía y oculta la fila; solo pines: «La IA propone 2 pines: …»', () => {
  const m = abierto();
  conRespuesta(m, { propuesta: { titulo: 'Garra', puntos: [P1, P2] } });
  m.lua(`${MC}.propuesta.descartar:Click()`);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 0);
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), false);
  assert.equal(m.lua('SnetForever.Ruta.pendiente()'), undefined);
  conRespuesta(m, { propuesta: { titulo: 'Pines', puntos: [{ ...P1, seguir: false }, { ...P2, seguir: false }] } });
  const texto = m.lua(`${MC}.propuesta.texto:GetText()`);
  assert.ok(texto.startsWith('La IA propone 2 pines:'), texto);
  sinErrores(m);
});

test('Aceptar una propuesta sin ningún punto con sitio: línea de sistema y la capa sin tocar', () => {
  const m = abierto();
  conRespuesta(m, { propuesta: { titulo: 'Nada', puntos: [{ etiqueta: 'sin sitio', tipo: 'lugar', seguir: true }] } });
  m.lua(`${MC}.propuesta.aceptar:Click()`);
  assert.equal(ultima(m), L(m, 'CHAT_RUTA_SIN_SITIO'));
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 0);
  sinErrores(m);
});

test('guía propuesta: una que no existe no da fila; una que existe, con Cambiar, carga esa guía', () => {
  const m = abierto();
  conRespuesta(m, { guia: { clave: 'No\\Existe', titulo: 'Inventada' } });
  assert.equal(m.lua(`${MC}.guia:IsVisible()`), false);
  const clave = 'Prueba (H)\\02-03 Sigue';
  conRespuesta(m, { guia: { clave, titulo: 'lo que diga la app' } });
  assert.equal(m.lua(`${MC}.guia:IsVisible()`), true);
  assert.equal(m.lua(`${MC}.guia.texto:GetText()`), 'La IA propone cambiar a la guía «2-3 Sigue»');
  m.lua(`${MC}.guia.cambiar:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), clave);
  assert.equal(m.lua(`${MC}.guia:IsVisible()`), false);
  // «No» la quita sin cargar nada.
  conRespuesta(m, { guia: { clave: 'Prueba (H)\\01-02 Inicio' } });
  m.lua(`${MC}.guia.no:Click()`);
  assert.equal(m.lua(`${MC}.guia:IsVisible()`), false);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), clave);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Recomendaciones, botones y fin de ruta
// ---------------------------------------------------------------------------------------------------

test('marcas de vender 2589: «Vender: Linen Cloth ×15 (bolsa 0, hueco 1)»; «Quitar marcas» las quita', () => {
  const m = nuevaMaquina(ES);
  m.itemInfo(2589, { nombre: 'Linen Cloth', calidad: 1, nivel: 5, precio: 13 });
  m.itemInfo(118, { nombre: 'Minor Healing Potion', calidad: 1, nivel: 1, precio: 5 });
  m.bolsa(0, 1, { id: 2589, n: 12 });
  m.bolsa(0, 2, { id: 2589, n: 3 });
  m.bolsa(0, 3, { id: 118, n: 1 });
  slash(m, 'chat');
  conRespuesta(m, { marcas: { vender: [2589], usar: [118] } });
  assert.equal(m.lua('SnetForever.Marcas.de(2589)'), 'vender');
  assert.equal(m.lua(`${MC}.recomendaciones:IsVisible()`), true);
  const t = textosVisibles(m, `${MC}.recomendaciones`);
  assert.ok(t.includes('Vender: Linen Cloth ×15 (bolsa 0, hueco 1)'), t.join(' | '));
  assert.ok(t.includes('Usar: Minor Healing Potion ×1 (bolsa 0, hueco 3)'), t.join(' | '));
  // Van en el hueco de la franja: al enviar se ocultan y vuelven con la respuesta.
  assert.equal(m.lua(`${MC}.zonaFranja.pista:IsVisible()`), false);
  escribir(m, 'otra');
  assert.equal(m.lua(`${MC}.recomendaciones:IsVisible()`), false);
  registro(m, { t: 'respuesta', texto: 'Vale.' });
  assert.equal(m.lua(`${MC}.recomendaciones:IsVisible()`), true);
  m.lua(`${MC}.quitarMarcas:Click()`);
  assert.equal(m.lua('SnetForever.Marcas.de(2589)'), undefined);
  assert.equal(m.lua(`${MC}.recomendaciones:IsVisible()`), false);
  assert.equal(m.lua(`${MC}.zonaFranja.pista:IsVisible()`), true);
  assert.equal(ultima(m), L(m, 'CHAT_MARCAS_QUITADAS'));
  sinErrores(m);
});

test('muchas marcas: caben 3 renglones en el hueco: 2 objetos y «y N más»', () => {
  const m = nuevaMaquina(ES);
  const ids = [2589, 2592, 4306, 4338, 14047, 118];
  ids.forEach((id, k) => m.bolsa(0, k + 1, { id, n: 2 }));
  slash(m, 'chat');
  conRespuesta(m, { marcas: { vender: ids.slice(0, 5), usar: [118] } });
  const t = textosVisibles(m, `${MC}.recomendaciones`);
  assert.equal(t.filter((x) => /^(Vender|Usar):/.test(x)).length, 2, t.join(' | '));
  assert.ok(t.includes(L(m, 'CHAT_RECOMENDACIONES_MAS', 4)), t.join(' | '));
  // Primero lo de vender.
  assert.ok(t[0].startsWith('Vender:'), t[0]);
  sinErrores(m);
});

test('«Quitar pines» llama a Ruta.quitar (capa vacía y nada guardado); «Nueva conversación» llama a Envio.nueva', () => {
  const m = abierto();
  conRespuesta(m, { propuesta: { titulo: 'Garra', puntos: [P1, P2] } });
  m.lua(`${MC}.propuesta.aceptar:Click()`);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 2);
  m.lua('local q = SnetForever.Ruta.quitar; SnetForever.Ruta.quitar = function() QUITADA = true; q() end');
  m.lua(`${MC}.quitarPines:Click()`);
  assert.equal(m.lua('QUITADA'), true);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 0);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta'), undefined);
  assert.equal(ultima(m), L(m, 'CHAT_PINES_QUITADOS'));
  m.lua('local n = SnetForever.Envio.nueva; SnetForever.Envio.nueva = function() NUEVA = true; n() end');
  m.lua(`${MC}.nueva:Click()`);
  assert.equal(m.lua('NUEVA'), true);
  assert.equal(ultima(m), L(m, 'CHAT_CONVERSACION_NUEVA'));
  sinErrores(m);
});

test('SNF_IA_RUTA_TERMINADA: la línea de sistema «Ruta terminada»', () => {
  const m = abierto();
  m.lua('SnetForever.Eventos.emitir("SNF_IA_RUTA_TERMINADA")');
  assert.equal(ultima(m), 'Ruta terminada');
  sinErrores(m);
});

test('ChatEdit_InsertLink mete el enlace en la entrada solo si tiene el foco', () => {
  const m = abierto();
  const enlace = '|cff9d9d9d|Hitem:2589::::::::1:::::::|h[Linen Cloth]|h|r';
  m.lua(`ChatEdit_InsertLink(${aLua(enlace)})`);
  assert.equal(m.lua(`${MC}.entrada:GetText()`), '');
  m.lua(`${MC}.entrada:SetText("¿vendo ")`);
  m.lua(`${MC}.entrada:SetFocus()`);
  m.lua(`ChatEdit_InsertLink(${aLua(enlace)})`);
  assert.equal(m.lua(`${MC}.entrada:GetText()`), `¿vendo ${enlace}`);
  assert.equal(m.lua(`${MC}.entrada:GetMaxLetters()`), 500);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Cabecera: app, motor y estado de la IA
// ---------------------------------------------------------------------------------------------------

const TIMBRES = ['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar', 'vivo_a', 'vivo_b', 'presente'];
const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;

// Carpeta de AddOns con los .wav y la ranura R001 con el buzón dado.
function carpetaConBuzon(buzon) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-chat-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever', 'senales'), { recursive: true });
  for (const t of TIMBRES) writeFileSync(join(dir, 'SnetForever', 'senales', `${t}.wav`), '');
  const r = nombreRanura(1);
  mkdirSync(join(dir, r), { recursive: true });
  writeFileSync(join(dir, r, `${r}.toc`), `## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\nbuzon.lua\n`);
  writeFileSync(join(dir, r, 'buzon.lua'), `SNF_BUZON = ${aLua(buzon)}\n`);
  return dir;
}
const wav = (dir, t) => join(dir, 'SnetForever', 'senales', `${t}.wav`);

test('appViva → «App conectada»; con estadoApp().claude = "sin_sesion" la cabecera lleva el texto de sin_sesion', () => {
  const dir = carpetaConBuzon({ v: 1, app: '0.4.2', seq: 1, ahora: 1790000000, estado: { claude: 'sin_sesion' }, registros: [] });
  const m = crearMaquina({ ...ES, addonsDir: dir });
  slash(m, 'chat');
  assert.ok(m.lua(`${MC}.app.texto:GetText()`).includes('App sin conexión'));
  assert.equal(m.lua(`${MC}.aviso:IsVisible()`), false);
  assert.ok(m.lua(`${MC}.subtitulo:GetText()`).includes('Motor: sin conexión todavía'));
  // Un pulso de vivo_a: la app está viva, se carga la ranura con el estado (primer SNF_IA_APP) y se repinta.
  renameSync(wav(dir, 'vivo_a'), `${wav(dir, 'vivo_a')}.fuera`);
  m.avanzar(2.1); // en reposo los vivo_* se miran cada 2 s (el pulso dura 2,5 s)
  renameSync(`${wav(dir, 'vivo_a')}.fuera`, wav(dir, 'vivo_a'));
  assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
  assert.equal(m.lua(`${MC}.app.texto:GetText()`), 'App conectada');
  assert.equal(m.lua(`${MC}.aviso:IsVisible()`), true);
  assert.equal(m.lua(`${MC}.aviso.texto:GetText()`), L(m, 'CHAT_APP_SIN_SESION'));
  assert.ok(L(m, 'CHAT_APP_SIN_SESION').startsWith('Claude Code no tiene la sesión iniciada.'));
  m.cerrar();
});

test('estado de la IA: se lee estadoApp().motor o .claude; con motor Codex, los textos de Codex; con ok, sin aviso', () => {
  const m = abierto();
  const ponerEstado = (lua) => {
    m.lua(`SnetForever.Buzon.estadoApp = function() return ${lua} end`);
    m.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
  };
  ponerEstado('{motor = "pago_por_uso"}');
  assert.equal(m.lua(`${MC}.aviso.texto:GetText()`), L(m, 'CHAT_APP_PAGO_POR_USO'));
  ponerEstado('{claude = "sin_instalar"}');
  assert.equal(m.lua(`${MC}.aviso.texto:GetText()`), L(m, 'CHAT_APP_SIN_INSTALAR'));
  m.lua('SnetForeverPJ.ia.motor = "codex"');
  ponerEstado('{claude = "sin_sesion"}');
  assert.equal(m.lua(`${MC}.aviso.texto:GetText()`), L(m, 'CHAT_APP_SIN_SESION_CODEX'));
  ponerEstado('{claude = "ok"}');
  assert.equal(m.lua(`${MC}.aviso:IsVisible()`), false);
  ponerEstado('{claude = "desconocido"}');
  assert.equal(m.lua(`${MC}.aviso.texto:GetText()`), L(m, 'CHAT_APP_DESCONOCIDO'));
  sinErrores(m);
});

test('el modelo se ve como «Rápido» o «Más listo» con el motor entre paréntesis si se conoce', () => {
  const m = abierto();
  const sub = () => m.lua(`${MC}.subtitulo:GetText()`);
  assert.ok(sub().includes('Rápido') && !sub().includes('('), sub());
  m.lua('SnetForever.Ajustes.set("ia.modelo", "sonnet")');
  assert.ok(sub().includes('Más listo'), sub());
  m.lua('SnetForeverPJ.ia.motor = "claude"');
  m.lua('SnetForever.Ajustes.set("ia.modelo", "sonnet")');
  assert.ok(sub().includes('Más listo (Sonnet)'), sub());
  assert.ok(sub().includes('Motor: Claude'), sub());
  m.lua('SnetForever.Ajustes.set("ia.modelo", "haiku")');
  assert.ok(sub().includes('Rápido (Haiku)'), sub());
  m.lua('SnetForever.Ajustes.set("ia.modelo", "opus")');
  assert.ok(sub().includes('El más capaz (Opus)'), sub());
  // Un valor guardado raro se enseña como el rápido, que es lo que se manda.
  m.lua('SnetForever.Ajustes.set("ia.modelo", "fable")');
  assert.ok(sub().includes('Rápido (Haiku)'), sub());
  sinErrores(m);
});

test('en inglés, «El más capaz» es «Most capable» y con Claude «Most capable (Opus)»', () => {
  const m = abierto({ jugador: { idioma: 'enUS' } });
  const sub = () => m.lua(`${MC}.subtitulo:GetText()`);
  m.lua('SnetForeverPJ.ia.motor = "claude"');
  m.lua('SnetForever.Ajustes.set("ia.modelo", "opus")');
  assert.ok(sub().includes('Most capable (Opus)'), sub());
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Historial guardado
// ---------------------------------------------------------------------------------------------------

test('tras recargar(), el chat enseña las líneas guardadas (100 como mucho, cada una de 500 bytes como mucho)', () => {
  let m = abierto();
  for (let k = 1; k <= 120; k++) m.lua(`${CH}.anadir("ia", "respuesta ${k}")`);
  const largo = 'á'.repeat(400); // 800 bytes: se guarda en dos líneas
  m.lua(`${CH}.anadir("jugador", ${aLua(largo)})`);
  const guardadas = m.lua('SnetForeverPJ.ia.chat');
  assert.equal(guardadas.length, 100);
  for (const g of guardadas) assert.ok(Buffer.byteLength(g.t, 'utf8') <= 500, `${Buffer.byteLength(g.t, 'utf8')} bytes`);
  m = m.recargar();
  slash(m, 'chat');
  const l = lineas(m);
  assert.equal(l.length, 100);
  assert.equal(l[0], 'IA: respuesta 23');
  assert.ok(l[l.length - 2].startsWith('Tú: á'), l[l.length - 2]);
  assert.equal(l[l.length - 2].length + l[l.length - 1].length, 'Tú: '.length + 400, 'el texto largo sigue entero en dos líneas');
  sinErrores(m);
});

test('guardado: si SnetForeverPJ.ia no trae chat (otra pieza creó ia vacía) se crea; basura en el historial se ignora', () => {
  const m = nuevaMaquina({ ...ES, guardado: { SnetForeverPJ: { ia: { chat: [{ q: 'ia', t: 'vale' }, 'basura', { q: 'otro', t: 'x' }, { q: 'jugador' }] } } } });
  slash(m, 'chat');
  assert.deepEqual(lineas(m), ['IA: vale']);
  m.lua('SnetForeverPJ.ia.chat = nil');
  m.lua(`${CH}.anadir("sistema", "hola")`);
  assert.deepEqual(m.lua('SnetForeverPJ.ia.chat'), [{ q: 'sistema', t: 'hola' }]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Disposición (sin imágenes: con GetLeft/GetRight/GetBottom/GetTop)
// ---------------------------------------------------------------------------------------------------

// Rectángulo de una región en unidades absolutas de la pantalla (unidades × escala efectiva).
const RECT = (expr) => `(function()
  local o = ${expr}
  local l, r, b, t = o:GetLeft(), o:GetRight(), o:GetBottom(), o:GetTop()
  if not l then return nil end
  local s = o:GetEffectiveScale()
  return {l * s, r * s, b * s, t * s}
end)()`;

const EPS = 0.5;
const solapan = (a, b) => a[0] < b[1] - EPS && b[0] < a[1] - EPS && a[2] < b[3] - EPS && b[2] < a[3] - EPS;
const dentro = (a, b) => a[0] >= b[0] - EPS && a[1] <= b[1] + EPS && a[2] >= b[2] - EPS && a[3] <= b[3] + EPS;

// Todas las regiones y marcos visibles de la ventana con su rectángulo (los que no tienen posición, en sinCaja).
const TODO = `(function()
  local salida, sinCaja = {}, {}
  local function nombre(o)
    if o:IsObjectType("FontString") then return "texto «" .. tostring(o:GetText()) .. "»" end
    if o:IsObjectType("Texture") then return "textura " .. tostring(o:GetTexture()) end
    return o:GetObjectType() .. (o.texto and o.texto.GetText and (" «" .. tostring(o.texto:GetText()) .. "»") or "")
  end
  local function caja(o)
    local l, r, b, t = o:GetLeft(), o:GetRight(), o:GetBottom(), o:GetTop()
    if not l then return nil end
    local s = o:GetEffectiveScale()
    return {l * s, r * s, b * s, t * s}
  end
  local function recorrer(o)
    for _, r in ipairs({o:GetRegions()}) do
      local conTexto = not r:IsObjectType("FontString") or (r:GetText() or "") ~= ""
      if r:IsVisible() and conTexto then
        local q = caja(r)
        if q then salida[#salida + 1] = {que = nombre(r), r = q} else sinCaja[#sinCaja + 1] = nombre(r) end
      end
    end
    for _, h in ipairs({o:GetChildren()}) do
      if h:IsVisible() then
        local q = caja(h)
        if q then salida[#salida + 1] = {que = nombre(h), r = q} else sinCaja[#sinCaja + 1] = nombre(h) end
        recorrer(h)
      end
    end
  end
  recorrer(SnetForeverChat)
  return {todo = salida, sinCaja = sinCaja}
end)()`;

// Los bloques de la ventana, de arriba abajo; los que no se ven no cuentan.
// Las recomendaciones van DENTRO del hueco de la franja (que en reposo no se desperdicia) y se ocultan mientras se envía.
const BLOQUES = ['cabecera', 'aviso', 'cajaMensajes', 'propuesta', 'guia', 'cajaEntrada', 'enviar',
  'nueva', 'quitarPines', 'quitarMarcas', 'quitarDibujos', 'estado', 'zonaFranja', 'pie'];

function comprobarDisposicion(m, etiqueta) {
  const raiz = m.lua(RECT('SnetForeverChat'));
  const escala = m.lua('SnetForeverChat:GetEffectiveScale()');
  const d = m.lua(TODO);
  assert.deepEqual(d.sinCaja || [], [], `${etiqueta}: sin colocar`);
  for (const r of d.todo) assert.ok(dentro(r.r, raiz), `${etiqueta}: «${r.que}» ${r.r} se sale de la ventana ${raiz}`);
  const bloques = [];
  for (const b of BLOQUES) {
    const ve = m.lua(`${MC}.${b}:IsVisible() and (not ${MC}.${b}:IsObjectType("FontString") or (${MC}.${b}:GetText() or "") ~= "")`);
    if (ve) bloques.push({ b, r: m.lua(RECT(`${MC}.${b}`)) });
  }
  for (let i = 0; i < bloques.length; i++) {
    for (let j = i + 1; j < bloques.length; j++) {
      assert.ok(!solapan(bloques[i].r, bloques[j].r), `${etiqueta}: «${bloques[i].b}» ${bloques[i].r} se cruza con «${bloques[j].b}» ${bloques[j].r}`);
    }
  }
  // El hueco de la franja: al menos 404 × 44 de la ventana. Dentro solo van su pista o las recomendaciones, y al enviar
  // ninguna de las dos.
  const zona = m.lua(RECT(`${MC}.zonaFranja`));
  assert.ok((zona[1] - zona[0]) / escala >= 404 - EPS && (zona[3] - zona[2]) / escala >= 44 - EPS, `${etiqueta}: hueco ${zona}`);
  const enviando = m.lua('SnetForever.Envio.estado().fase') === 'enviando';
  const recs = m.lua(`${MC}.recomendaciones:IsVisible()`);
  const pista = m.lua(`${MC}.zonaFranja.pista:IsVisible()`);
  if (enviando) {
    assert.equal(recs, false, `${etiqueta}: recomendaciones a la vista al enviar`);
    assert.equal(pista, false, `${etiqueta}: pista a la vista al enviar`);
  } else {
    assert.ok(recs !== pista, `${etiqueta}: en reposo, o la pista o las recomendaciones`);
    if (recs) assert.ok(dentro(m.lua(RECT(`${MC}.recomendaciones`)), zona), `${etiqueta}: recomendaciones fuera del hueco`);
  }
  // Los mensajes siempre tienen sitio para varias líneas.
  const mensajes = m.lua(RECT(`${MC}.cajaMensajes`));
  assert.ok((mensajes[3] - mensajes[2]) / escala >= 60, `${etiqueta}: mensajes de ${(mensajes[3] - mensajes[2]) / escala}`);
  // Los botones de abajo, pequeños y alineados.
  const fila = ['nueva', 'quitarPines', 'quitarMarcas', 'quitarDibujos'].map((b) => m.lua(RECT(`${MC}.${b}`)));
  for (const r of fila) {
    assert.equal(Math.round((r[3] - r[2]) / escala), 18, `${etiqueta}: alto de botón`);
    assert.equal(Math.round(r[2]), Math.round(fila[0][2]), `${etiqueta}: botones sin alinear`);
  }
  return { raiz, zona, bloques };
}

function peorCaso(idioma) {
  const m = nuevaMaquina({ jugador: { idioma } });
  [2589, 2592, 4306, 4338, 14047].forEach((id, k) => m.bolsa(0, k + 1, { id, n: 2 }));
  slash(m, 'chat');
  m.lua('SnetForever.Buzon.estadoApp = function() return {claude = "sin_sesion"} end');
  escribir(m, 'hola');
  registro(m, {
    t: 'respuesta', texto: 'Una respuesta larga '.repeat(30),
    propuesta: { titulo: 'Garra', puntos: [P1, P2, { ...P1, etiqueta: 'Una etiqueta bastante larga para la parada número tres' }] },
    guia: { clave: 'Prueba (H)\\02-03 Sigue' },
    marcas: { vender: [2589, 2592, 4306, 4338, 14047] },
  });
  return m;
}

test('disposición: en reposo, con la franja enviando y en el peor caso (aviso, ruta, guía y marcas), nada se sale ni se cruza (es y en)', () => {
  for (const idioma of ['esES', 'enUS']) {
    const m = nuevaMaquina({ jugador: { idioma } });
    slash(m, 'chat');
    comprobarDisposicion(m, `${idioma} reposo`);
    // Con la franja a la vista: está dentro del hueco y la pista del hueco se oculta.
    escribir(m, 'hola');
    assert.equal(m.lua('SnetForever.Franja.visible()'), true);
    m.avanzar(0.1);
    const { zona } = comprobarDisposicion(m, `${idioma} enviando`);
    const franja = m.lua(RECT('SnetForeverFranja'));
    assert.ok(dentro(franja, zona), `${idioma}: franja ${franja} fuera del hueco ${zona}`);
    assert.equal(m.lua(`${MC}.zonaFranja.pista:IsVisible()`), false);
    assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false, 'anclada, la franja no saca su aviso');
    m.cerrar();

    const p = peorCaso(idioma);
    for (const b of ['aviso', 'propuesta', 'guia', 'recomendaciones']) assert.equal(p.lua(`${MC}.${b}:IsVisible()`), true, `${idioma}: ${b}`);
    comprobarDisposicion(p, `${idioma} peor caso`);
    sinErrores(p);
    p.cerrar();
  }
});

// 16-nov, regla de interfaz (regla de interfaz): la franja nunca sale suelta en la pantalla.
test('disposición: con el chat oculto la franja se esconde (ni suelta ni con su aviso) y al abrirlo vuelve al hueco', () => {
  const m = abierto();
  escribir(m, 'hola');
  m.avanzar(0.1);
  slash(m, 'chat');
  m.avanzar(0.1);
  assert.equal(m.lua('SnetForeverFranja:IsVisible()'), false, 'sin ancla, la franja no se ve');
  assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false, 'ni su aviso');
  slash(m, 'chat');
  m.avanzar(0.1);
  const zona = m.lua(RECT(`${MC}.zonaFranja`));
  assert.ok(dentro(m.lua(RECT('SnetForeverFranja')), zona));
  sinErrores(m);
});

test('el historial se desplaza con la rueda y con la barra fina; en reposo va abajo del todo', () => {
  const m = abierto();
  for (let k = 1; k <= 40; k++) m.lua(`${CH}.anadir("ia", "línea ${k}")`);
  const offset = () => m.lua(`${MC}.mensajes:GetScrollOffset()`);
  assert.equal(offset(), 0);
  m.lua(`${MC}.mensajes:GetScript("OnMouseWheel")(${MC}.mensajes, 1)`);
  assert.ok(offset() > 0);
  const barra = m.lua(`{${MC}.barra.deslizador:GetValue(), ${MC}.barra.deslizador:GetMinMaxValues()}`);
  assert.equal(barra[0], barra[2] - offset(), 'el pulgar sigue al desplazamiento');
  m.lua(`${MC}.barra.abajo:Click()`);
  m.lua(`${MC}.barra.abajo:Click()`);
  m.lua(`${MC}.barra.abajo:Click()`);
  assert.equal(offset(), 0);
  m.lua(`${MC}.barra.deslizador:SetValue(0)`);
  assert.equal(offset(), m.lua(`${MC}.mensajes:GetMaxScrollRange()`), 'el pulgar arriba enseña lo más antiguo');
  // No es un ScrollFrame: ni desplazamiento eterno en el resto de la ventana.
  const tipos = m.lua(`(function()
    local t = {}
    local function recorrer(o) t[#t + 1] = o:GetObjectType(); for _, h in ipairs({o:GetChildren()}) do recorrer(h) end end
    recorrer(SnetForeverChat)
    return t
  end)()`);
  assert.equal(tipos.includes('ScrollFrame'), false);
  assert.equal(tipos.filter((t) => t === 'ScrollingMessageFrame').length, 1);
  sinErrores(m);
});

test('BAG_UPDATE_DELAYED solo se escucha con el chat a la vista (como ia/inventario.lua)', () => {
  const m = nuevaMaquina(ES);
  const registrados = () => m.lua('#(BANCO.eventos.BAG_UPDATE_DELAYED or {})');
  const antes = registrados();
  slash(m, 'chat');
  assert.equal(registrados(), antes + 1);
  slash(m, 'chat');
  assert.equal(registrados(), antes);
  sinErrores(m);
});

test('el chat no hace trabajo por fotograma: ningún OnUpdate en sus marcos', () => {
  const m = abierto();
  escribir(m, 'hola');
  const conOnUpdate = m.lua(`(function()
    local n = 0
    local function recorrer(o)
      if o:GetScript("OnUpdate") then n = n + 1 end
      for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
    end
    recorrer(SnetForeverChat)
    return n
  end)()`);
  assert.equal(conOnUpdate, 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------

const claves = (archivo, prefijo) => new Set([...readFileSync(join(TEXTOS, archivo), 'utf8').matchAll(new RegExp(`^${prefijo}\\.([A-Z0-9_]+)\\s*=`, 'gm'))].map((x) => x[1]));

test('todas las claves de es están en en y al revés; los textos del chat existen', () => {
  const es = claves('es.lua', 'es');
  const en = claves('en.lua', 'en');
  assert.deepEqual([...es].filter((k) => !en.has(k)), []);
  assert.deepEqual([...en].filter((k) => !es.has(k)), []);
  for (const k of ['CHAT_TITULO', 'CHAT_ENVIAR', 'CHAT_NUEVA', 'CHAT_QUITAR_PINES', 'CHAT_QUITAR_MARCAS', 'CHAT_PENSANDO',
    'CHAT_ENVIANDO', 'CHAT_PROPUESTA_RUTA', 'CHAT_PROPUESTA_PINES', 'CHAT_PROPUESTA_GUIA', 'CHAT_VENDER', 'CHAT_USAR',
    'CHAT_RUTA_TERMINADA', 'CHAT_APP_SIN_INSTALAR', 'CHAT_APP_SIN_SESION', 'CHAT_APP_PAGO_POR_USO', 'PANEL_IA_REQUISITO',
    'AYUDA_CHAT']) {
    assert.ok(es.has(k), k);
  }
  assert.equal(es.has('PANEL_IA_NOTA'), false, 'PANEL_IA_REQUISITO sustituye a PANEL_IA_NOTA');
});

test('los textos de P6 en español son los del plan', () => {
  const m = nuevaMaquina(ES);
  assert.equal(L(m, 'CHAT_APP_SIN_INSTALAR'), 'Claude Code no está instalado en este PC. Instálalo desde claude.com/claude-code, inicia sesión con tu cuenta de Claude y vuelve a abrir SnetForever.');
  assert.equal(L(m, 'CHAT_APP_SIN_SESION'), 'Claude Code no tiene la sesión iniciada. Abre Terminal, escribe claude y pulsa Intro; luego escribe /login y sigue los pasos con tu cuenta de Claude. Después pulsa «Comprobar Claude Code» en el icono de SnetForever.');
  assert.equal(L(m, 'CHAT_APP_PAGO_POR_USO'), 'Tu Claude Code usa una cuenta de pago por uso (Console). SnetForever solo funciona con una suscripción Pro o Max: cierra esa sesión con /logout e inicia otra con tu suscripción.');
  assert.equal(L(m, 'PANEL_IA_REQUISITO'), 'Necesita la app SnetForever abierta y el juego en modo ventana o ventana a pantalla completa');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1 de la revisión
// ---------------------------------------------------------------------------------------------------

// Píxeles físicos por unidad de la ventana de chat.
const pxPorUnidad = (m, alto) => m.lua('SnetForeverChat:GetEffectiveScale()') * alto / 768;

test('ronda 1 (F4-18): con escalas de interfaz bajas la ventana no baja de 1 unidad = 1 px; la franja cabe en el hueco y la ventana en la pantalla', () => {
  const casos = [[{ ancho: 1920, alto: 1080 }, 0.64], [{ ancho: 1366, alto: 768 }, 0.9], [{ ancho: 2560, alto: 1440 }, 0.64]];
  for (const [pantalla, escala] of casos) {
    const e = `${pantalla.alto}p a ${escala}`;
    const m = nuevaMaquina({ ...ES, pantalla });
    m.lua(`UIParent:SetScale(${escala})`);
    m.disparar('UI_SCALE_CHANGED');
    slash(m, 'chat');
    const k = pxPorUnidad(m, pantalla.alto);
    assert.ok(k >= 1 - 1e-6, `${e}: ${k} px por unidad`);
    // Sin escalar de más: si la interfaz ya da 1 px por unidad o más, la ventana queda a escala 1.
    if (escala * pantalla.alto / 768 >= 1) assert.ok(Math.abs(m.lua('SnetForeverChat:GetScale()') - 1) < 1e-6, e);
    escribir(m, 'hola');
    m.avanzar(0.1);
    const { zona } = comprobarDisposicion(m, e);
    assert.ok(dentro(m.lua(RECT('SnetForeverFranja')), zona), `${e}: la franja se sale del hueco`);
    const ventana = m.lua(RECT('SnetForeverChat'));
    assert.ok(dentro(ventana, [0, pantalla.ancho * 768 / pantalla.alto, 0, 768]), `${e}: la ventana ${ventana} se sale de la pantalla`);
    sinErrores(m);
    m.cerrar();
  }
});

test('ronda 1 (F4-18): al cambiar la escala o la pantalla con la ventana abierta se reescala y no salta de sitio (chat.pos en unidades de UIParent)', () => {
  const m = nuevaMaquina({ ...ES, pantalla: { ancho: 2560, alto: 1440 },
    guardado: { SnetForeverPJ: { ajustes: { 'chat.pos': { punto: 'TOPLEFT', relPunto: 'TOPLEFT', x: 100, y: -120 } } } } });
  slash(m, 'chat');
  const sitio = () => m.lua(`(function()
    local s, u = SnetForeverChat:GetEffectiveScale(), UIParent:GetEffectiveScale()
    return {SnetForeverChat:GetLeft() * s / u, (768 - SnetForeverChat:GetTop() * s) / u}
  end)()`);
  assert.deepEqual(sitio().map(Math.round), [100, 120]);
  m.lua('UIParent:SetScale(0.64)');
  m.disparar('UI_SCALE_CHANGED');
  assert.ok(pxPorUnidad(m, 1440) >= 1 - 1e-6);
  assert.deepEqual(sitio().map(Math.round), [100, 120]);
  m.pantalla({ ancho: 1920, alto: 1080 });
  m.disparar('DISPLAY_SIZE_CHANGED');
  assert.ok(pxPorUnidad(m, 1080) >= 1 - 1e-6, `${pxPorUnidad(m, 1080)}`);
  assert.ok(m.lua('SnetForeverChat:GetScale()') > 1);
  assert.deepEqual(sitio().map(Math.round), [100, 120]);
  // Arrastrar con la ventana escalada guarda la posición en unidades de UIParent.
  const s = m.lua('SnetForeverChat:GetScale()');
  m.lua('BANCO.arrastre = {x = 30, y = -10}');
  m.lua(`${MC}.cabecera:GetScript("OnMouseDown")(${MC}.cabecera, "LeftButton")`);
  m.lua(`${MC}.cabecera:GetScript("OnMouseUp")(${MC}.cabecera, "LeftButton")`);
  const pos = m.lua('SnetForever.Ajustes.get("chat.pos")');
  assert.ok(Math.abs(pos.x - (100 + 30 * s)) < 1e-6, `${pos.x}`);
  assert.ok(Math.abs(pos.y - (-120 - 10 * s)) < 1e-6, `${pos.y}`);
  assert.deepEqual(sitio().map(Math.round), [Math.round(100 + 30 * s), Math.round(120 + 10 * s)]);
  sinErrores(m);
});

// F3, ronda 1: Personaje.clave() da nil si UnitName falla o da un valor secreto. Sin pj la trama no se puede armar
// (table.concat con un nil falla): no se envía nada, sin error ni aviso.
test('F3: sin el nombre del personaje (Personaje.clave() da nil) Envio.enviar no envía, sin error ni aviso', () => {
  const m = abierto();
  m.lua('SnetForever.Personaje.clave = function() return nil end');
  const proxima = m.lua('SnetForever.Buzon.proxima()');
  assert.deepEqual(m.lua('{SnetForever.Envio.enviar("hola")}'), [false, 'sin_pj']);
  assert.equal(estado(m).fase, 'libre');
  assert.equal(m.lua('SnetForever.Franja.visible()'), false, 'sin franja');
  assert.equal(m.lua('SnetForever.Buzon.proxima()'), proxima, 'no gasta ranura');
  // Desde el chat: ni «Tú: hola» ni el aviso de fallo interno.
  escribir(m, 'hola');
  assert.equal(estado(m).fase, 'libre');
  assert.ok(!lineas(m).includes('Tú: hola'), lineas(m).join(' | '));
  assert.ok(!lineas(m).some((l) => l.includes(L(m, 'CHAT_FALLO_INTERNO'))), lineas(m).join(' | '));
  sinErrores(m);
});

test('ronda 1: si Envio.enviar falla de forma inesperada, se cancela el envío y se quita la franja', () => {
  const m = abierto();
  m.lua('local o = SnetForever.Envio.enviar; SnetForever.Envio.enviar = function(t) o(t); error("roto") end');
  escribir(m, 'hola');
  assert.equal(m.lua('SnetForever.Envio.estado().fase'), 'libre');
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
  assert.equal(ultima(m), L(m, 'CHAT_FALLO_INTERNO'));
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  assert.equal(m.errores().length, 1, 'el error se informa');
});

test('ronda 1: un texto con UTF-8 roto (600 bytes de continuación) se parte en trozos de 500 sin colgarse', () => {
  const m = abierto();
  m.lua(`${CH}.anadir("ia", string.rep("\\128", 600))`);
  const g = m.lua('SnetForeverPJ.ia.chat');
  assert.equal(g.length, 2);
  assert.deepEqual(m.lua('{#SnetForeverPJ.ia.chat[1].t, #SnetForeverPJ.ia.chat[2].t}'), [500, 100]);
  sinErrores(m);
});

test('ronda 1: un error de la app sin texto usa el de P6 de su tipo o, si no lo hay, el de «fallo» (nunca el tipo en crudo)', () => {
  const m = abierto();
  escribir(m, 'hola');
  registro(m, { t: 'error', tipo: 'limite' });
  assert.equal(ultima(m), L(m, 'CHAT_APP_LIMITE'));
  assert.equal(L(m, 'CHAT_APP_LIMITE'), 'Has llegado al límite de uso de tu suscripción de Claude. Prueba más tarde.');
  m.lua('SnetForever.Envio.cancelar()');
  escribir(m, 'otra');
  registro(m, { t: 'error', tipo: 'tipo_raro_nuevo' });
  assert.equal(ultima(m), L(m, 'CHAT_APP_FALLO', L(m, 'CHAT_SIN_DETALLE')));
  assert.ok(!ultima(m).includes('tipo_raro_nuevo'));
  assert.equal(L(m, 'CHAT_APP_FALLO', 'x'), 'La IA no ha podido contestar (x).');
  for (const tipo of ['TIEMPO', 'OCUPADO']) assert.notEqual(L(m, `CHAT_APP_${tipo}`), `CHAT_APP_${tipo}`);
  sinErrores(m);
});

test('ronda 1: singular en las propuestas («una ruta de 1 parada», «1 pin», «(y 1 pin)») en español e inglés', () => {
  for (const [idioma, ruta, pin, yPin] of [
    ['esES', 'La IA propone una ruta de 1 parada: Habla con Garra', 'La IA propone 1 pin: Habla con Garra', '(y 1 pin)'],
    ['enUS', 'The AI suggests a 1-stop route: Habla con Garra', 'The AI suggests 1 pin: Habla con Garra', '(and 1 pin)'],
  ]) {
    const m = nuevaMaquina({ jugador: { idioma } });
    slash(m, 'chat');
    const texto = () => m.lua(`${MC}.propuesta.texto:GetText()`);
    conRespuesta(m, { propuesta: { titulo: 'a', puntos: [P1] } });
    assert.equal(texto(), ruta);
    conRespuesta(m, { propuesta: { titulo: 'b', puntos: [{ ...P1, seguir: false }] } });
    assert.equal(texto(), pin);
    conRespuesta(m, { propuesta: { titulo: 'c', puntos: [P1, P2, { ...P1, seguir: false }] } });
    assert.ok(texto().endsWith(yPin), texto());
    sinErrores(m);
    m.cerrar();
  }
});

test('ronda 1: el inglés usa comillas “ ” (sin «»)', () => {
  const en = readFileSync(join(TEXTOS, 'en.lua'), 'utf8');
  assert.equal(/[«»]/.test(en), false);
  const m = nuevaMaquina({ jugador: { idioma: 'enUS' } });
  assert.equal(L(m, 'CHAT_ZONA_ENVIO'), 'The sending bar appears here while your question is sent');
  sinErrores(m);
});

test('ronda 1: la franja no se ancla al crear la ventana oculta, solo al enseñarla; al ocultarla vuelve al respaldo', () => {
  const m = nuevaMaquina(ES);
  m.lua('local o = SnetForever.Franja.anclar; ANCLAS = {}; SnetForever.Franja.anclar = function(f, ...) ANCLAS[#ANCLAS + 1] = f and "chat" or "nada"; return o(f, ...) end');
  m.lua(`${CH}.crear()`);
  assert.deepEqual(m.lua('ANCLAS'), []);
  slash(m, 'chat');
  assert.deepEqual(m.lua('ANCLAS'), ['chat']);
  slash(m, 'chat');
  assert.deepEqual(m.lua('ANCLAS'), ['chat', 'nada']);
  sinErrores(m);
});

test('ronda 1: alternar mira IsShown (con UIParent oculto, alternar la cierra igual)', () => {
  const m = abierto();
  m.lua('UIParent:Hide()');
  m.lua(`${CH}.alternar()`);
  assert.equal(m.lua('SnetForeverChat:IsShown()'), false);
  m.lua('UIParent:Show()');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F4-34: la app es la única capa que escapa; el addon solo se defiende si el texto no está bien formado
// ---------------------------------------------------------------------------------------------------

// Las líneas del historial tal como se pintan (con los códigos de color y las barras sin tocar).
const crudas = (m) => (m.lua(`(function()
  local s, t = ${MC}.mensajes, {}
  for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
  return t
end)()`) || []).filter((l) => l !== " "); // 11-nov: sin las líneas en blanco entre mensajes
const responder = (m, texto) => m.lua(`SnetForever.Eventos.emitir("SNF_IA_RESPUESTA", ${aLua({ texto })})`);

test('F4-34: una respuesta ya escapada por la app («||» y colores válidos) se pinta tal cual, y tras recargar() igual', () => {
  let m = abierto();
  const texto = '|cFFFFD100Título|r con || barra';
  responder(m, texto);
  assert.ok(ultima(m).includes('Título con || barra'), ultima(m));
  assert.ok(crudas(m).pop().endsWith(`|r ${texto}`), crudas(m).pop());
  m = m.recargar();
  slash(m, 'chat');
  assert.ok(crudas(m).pop().endsWith(`|r ${texto}`), crudas(m).pop());
  sinErrores(m);
});

test('F4-34: una respuesta mal formada (|H, «|» suelta, |c sin cerrar) se escapa entera, también tras recargar()', () => {
  let m = abierto();
  const malas = ['mira |Hitem:1|h[x]|h', 'una | suelta', '|cFFFFD100 sin cerrar', 'cierra |r sin abrir'];
  for (const t of malas) responder(m, t);
  const esperado = malas.map((t) => t.replace(/\|/g, '||'));
  const comprobar = (mm) => {
    const c = crudas(mm);
    esperado.forEach((e, k) => assert.ok(c[c.length - esperado.length + k].endsWith(`|r ${e}`), c[c.length - esperado.length + k]));
  };
  comprobar(m);
  m = m.recargar();
  slash(m, 'chat');
  comprobar(m);
  sinErrores(m);
});

test('F4-34: el texto de un error de la app sigue el mismo criterio; las líneas del jugador y del addon, como antes', () => {
  const m = abierto();
  escribir(m, 'hola');
  registro(m, { t: 'error', tipo: 'fallo', texto: '|cFFFF0000Falló|r todo' });
  assert.equal(crudas(m).pop().replace(/^\|c[0-9a-fA-F]{8}/, '').replace(/\|r$/, ''), '|cFFFF0000Falló|r todo');
  escribir(m, 'otra');
  registro(m, { t: 'error', tipo: 'fallo', texto: 'roto |Hx|h' });
  assert.ok(crudas(m).pop().includes('roto ||Hx||h'), crudas(m).pop());
  m.lua(`${CH}.anadir("sistema", "|cFFFF0000hola|r")`);
  assert.ok(crudas(m).pop().includes('||cFFFF0000hola||r'), crudas(m).pop());
  m.lua(`${CH}.anadir("jugador", "a|b")`);
  assert.ok(crudas(m).pop().endsWith('Tú: a|b|r'), crudas(m).pop()); // 11-nov: entero en el color del jugador, sin escapar
  sinErrores(m);
});

test('F4-34: con estado.motorNombre = "codex" y sin respuestas, la cabecera dice «Motor: ChatGPT (Codex)» sin aviso de no instalado', () => {
  const m = abierto();
  m.lua('SnetForever.Buzon.estadoApp = function() return {motor = "ok", motorNombre = "codex", claude = "sin_instalar", codex = "ok"} end');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_APP", false)');
  assert.ok(m.lua(`${MC}.subtitulo:GetText()`).includes('Motor: ChatGPT (Codex)'), m.lua(`${MC}.subtitulo:GetText()`));
  assert.equal(m.lua(`${MC}.aviso:IsVisible()`), false);
  assert.equal(m.lua('SnetForever.Chat.textoAvisoApp()') ?? null, null);
  // Con una respuesta que trae motor, manda la respuesta.
  m.lua('SnetForeverPJ.ia.motor = "claude"');
  assert.equal(m.lua('SnetForever.Chat.textoMotor()'), 'Motor: Claude');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Revisión final, Important 2: el chat parte la respuesta por líneas antes de trocearla
// ---------------------------------------------------------------------------------------------------

// Lo que se ve de las líneas pintadas, sin el prefijo «IA: » de la primera.
const visibleDe = (lista, prefijo) => lista.map((l, k) => (k === 0 ? sinColor(l).slice(prefijo.length) : sinColor(l)));

test('final I2: un título de la app a caballo del byte 490 no se parte: ninguna línea pintada lleva ||c ni ||r', () => {
  let m = abierto();
  const primera = `${'palabra '.repeat(58)}hola!`; // 469 bytes
  assert.equal(Buffer.byteLength(primera, 'utf8'), 469);
  const texto = `${primera}\n|cFFFFD100Consejos de equipo|r\n${'Segunda parte del texto. '.repeat(10)}fin.`;
  const inicio = Buffer.byteLength(primera, 'utf8') + 2; // el título empieza en el byte 471 y cruza el 490
  assert.ok(inicio < 490 && inicio + 30 > 490);
  const antes = crudas(m).length;
  responder(m, texto);
  const comprobar = (mm, desde) => {
    const nuevas = crudas(mm).slice(desde);
    for (const l of nuevas) {
      assert.ok(!l.includes('||c') && !l.includes('||r'), l);
    }
    assert.equal(visibleDe(nuevas, 'IA: ').join('\n'), sinColor(texto), 'el texto visible es el mismo');
  };
  comprobar(m, antes);
  for (const g of m.lua('SnetForeverPJ.ia.chat')) assert.ok(Buffer.byteLength(g.t, 'utf8') <= 500);
  m = m.recargar();
  slash(m, 'chat');
  comprobar(m, crudas(m).length - m.lua('#SnetForeverPJ.ia.chat'));
  sinErrores(m);
});

test('final I2: el título queda entero también si cae justo después del corte de 500 bytes', () => {
  const m = abierto();
  const primera = `${'palabra '.repeat(61)}fin`; // 491 bytes: el título ya no cabe con ella
  const texto = `${primera}\n|cFFFFD100Consejos de equipo|r\nY sigue.`;
  const antes = crudas(m).length;
  responder(m, texto);
  const nuevas = crudas(m).slice(antes);
  assert.ok(nuevas.length >= 2, nuevas.join(' / '));
  for (const l of nuevas) assert.ok(!l.includes('||'), l);
  assert.ok(nuevas.some((l) => l.startsWith('|cFFFFD100Consejos de equipo|r')), nuevas.join(' / '));
  assert.equal(visibleDe(nuevas, 'IA: ').join('\n'), sinColor(texto));
  sinErrores(m);
});

test('final I2: una línea de la app de más de 500 bytes con un color que cruza el corte se cierra con |r y se reabre', () => {
  const m = abierto();
  const texto = `|cFFFFD100${'palabra '.repeat(70)}fin|r y cola`;
  assert.ok(Buffer.byteLength(texto, 'utf8') > 500);
  const antes = crudas(m).length;
  responder(m, texto);
  const nuevas = crudas(m).slice(antes);
  assert.equal(nuevas.length, 2, nuevas.join(' / '));
  for (const l of nuevas) assert.ok(!l.includes('||'), l);
  const guardadas = m.lua('SnetForeverPJ.ia.chat').slice(-2).map((g) => g.t);
  for (const g of guardadas) assert.ok(Buffer.byteLength(g, 'utf8') <= 500, `${Buffer.byteLength(g, 'utf8')} bytes`);
  assert.ok(guardadas[0].endsWith('|r'), guardadas[0].slice(-20));
  assert.ok(guardadas[1].startsWith('|cFFFFD100'), guardadas[1].slice(0, 20));
  assert.equal(visibleDe(nuevas, 'IA: ').join(''), sinColor(texto), 'el texto visible es el mismo');
  sinErrores(m);
});

test('final Minor 6: un registro con guiaIAQuitada o textoRecortado añade una línea de sistema (es y en)', () => {
  for (const idioma of ['esES', 'enUS']) {
    const m = nuevaMaquina({ jugador: { idioma } });
    slash(m, 'chat');
    escribir(m, 'hola');
    registro(m, { t: 'respuesta', texto: 'Respuesta corta', textoRecortado: true });
    const l = lineas(m);
    assert.equal(l[l.length - 1], L(m, 'CHAT_TEXTO_RECORTADO'));
    assert.ok(l[l.length - 2].endsWith('Respuesta corta'), l[l.length - 2]);
    escribir(m, 'otra');
    registro(m, { t: 'respuesta', texto: 'Sin ruta', guiaIAQuitada: true });
    assert.equal(ultima(m), L(m, 'CHAT_GUIA_QUITADA'));
    escribir(m, 'y otra');
    registro(m, { t: 'respuesta', texto: 'Normal' });
    assert.ok(ultima(m).endsWith('Normal'), ultima(m));
    for (const clave of ['CHAT_TEXTO_RECORTADO', 'CHAT_GUIA_QUITADA']) assert.notEqual(L(m, clave), clave);
    sinErrores(m);
    m.cerrar();
  }
});

// ---------------------------------------------------------------------------------------------------
// T3-addon: una guía de la IA con abrirGuiaIA no se pone sola encima de una guía a medias
// ---------------------------------------------------------------------------------------------------

const FIXTURES_T3 = join(RAIZ, 'tools', 'banco-wow', 'fixtures');
const DATOS_T3 = ['rutas-mini.lua', 'misiones-mini.lua', 'laterales-mini.lua'].map((f) => join(FIXTURES_T3, f));
const INICIO_T3 = 'Prueba (H)\\01-02 Inicio';
const CLAVE_T3 = 'IA\\Ruta de prueba (Horda)';
const JUGADOR_T3 = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 };
const guiaIAT3 = () => ({
  clave: CLAVE_T3, tipo: 'ia', sinVerificar: true, grupo: 'IA', nombre: 'Ruta de prueba (Horda)',
  titulo: { es: 'Ruta de prueba (Horda)', en: 'Test route (Horde)' }, faccion: 'Horde',
  niveles: { min: 5, max: 12 }, siguientes: [], mazmorras: {}, fuente: { archivo: 'ia', linea: 0 },
  resumen: { misiones: 2, pasos: 2, elites: 0, grupo: 0 },
  pasos: [
    { id: 'ia1', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [
      { t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' }, { t: 'accept', q: 7001 }] },
    { id: 'ia2', n: 2, etiquetas: {}, requisitos: [], linea: 0, elementos: [
      { t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'flecha' }, { t: 'turnin', q: 7001 }] },
  ],
});
const claveCargada = (m) => m.lua('SnetForever.Motor.estado().clave');
const totalNumerados = (m) => m.lua(`(function() local t, i = 0, 1
  while SnetForever.Motor.paso(i) do if SnetForever.Motor.paso(i).numero then t = SnetForever.Motor.paso(i).numero end; i = i + 1 end
  return t end)()`);

function chatT3(idioma = 'esES') {
  const m = nuevaMaquina({ datos: DATOS_T3, jugador: { ...JUGADOR_T3, idioma } });
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO_T3)})`);
  slash(m, 'chat');
  escribir(m, 'hola');
  return m;
}

test('T3: con una guía a medias, una guiaIA con abrirGuiaIA no se abre sola: sale la tarjeta y al pulsarla se abre', () => {
  for (const [idioma, pregunta, seQueda] of [
    ['esES', (n, t) => `Tu guía actual va por el paso ${n} de ${t}. ¿Abrir esta otra?`,
      (n) => `Tu guía «1-2 Inicio» se queda en el paso ${n}: pulsa Volver para seguirla.`],
    ['enUS', (n, t) => `Your current guide is on step ${n} of ${t}. Open this one instead?`,
      (n) => `Your guide “1-2 Start” stays on step ${n}: press Back to continue it.`],
  ]) {
    const m = chatT3(idioma);
    const n = m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).numero');
    const total = totalNumerados(m);
    assert.ok(n >= 1 && total > n, `${n} de ${total}`);
    registro(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIAT3(), abrirGuiaIA: true });
    // Nada se abre sin que el jugador pulse.
    assert.equal(claveCargada(m), INICIO_T3, idioma);
    assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), true, idioma);
    assert.ok(sinColor(m.lua(`${MC}.rutaZona.texto:GetText()`)).endsWith(pregunta(n, total)), m.lua(`${MC}.rutaZona.texto:GetText()`));
    assert.ok(!lineas(m).some((l) => l.includes('Ruta de prueba') || l.includes('Test route')), lineas(m).join(' | '));
    m.lua(`${MC}.rutaZona.abrir:Click()`);
    assert.equal(claveCargada(m), CLAVE_T3, idioma);
    assert.equal(m.lua('SnetForeverPJ.volverA'), INICIO_T3);
    assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), false);
    // Una sola línea que dice dónde se queda la de antes.
    assert.equal(lineas(m).filter((l) => l === seQueda(n)).length, 1, lineas(m).join(' | '));
    sinErrores(m);
    m.cerrar();
  }
});

test('T3: con la guía cargada acabada, o sin guía, la guiaIA con abrirGuiaIA se abre sola como hoy', () => {
  // Acabada: una guía de un paso cuya misión ya está en el diario.
  const m = nuevaMaquina({ datos: DATOS_T3, jugador: { ...JUGADOR_T3, idioma: 'esES' } });
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 4641 }] }]));
  m.estadoMision(4641, { enDiario: true });
  m.lua(`SnetForever.Guias.cargar(${aLua(guiaDePrueba([]).clave)})`);
  m.lua('SnetForever.Motor.actualizar()');
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
  slash(m, 'chat');
  escribir(m, 'hola');
  registro(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIAT3(), abrirGuiaIA: true });
  assert.equal(claveCargada(m), CLAVE_T3);
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), false);
  assert.ok(lineas(m).includes('Guía de la IA abierta: Ruta de prueba (Horda)'), lineas(m).join(' | '));
  assert.ok(!lineas(m).some((l) => l.includes('se queda en el paso')), lineas(m).join(' | '));
  sinErrores(m);
  m.cerrar();
  // Sin guía cargada: sin guías en los datos no hay ninguna por defecto.
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-t3-'));
  carpetas.push(carpeta);
  const vacias = join(carpeta, 'rutas-vacias.lua');
  writeFileSync(vacias, 'SNF_RUTAS = {version="2026.11.09.1",esquema=1,guias={},grupos={},alias={}}\n');
  const s = nuevaMaquina({ datos: [vacias, DATOS_T3[1]], jugador: { ...JUGADOR_T3, idioma: 'esES' } });
  slash(s, 'chat');
  escribir(s, 'hola');
  assert.equal(s.lua('SnetForever.Motor.estado().sinGuia'), true);
  registro(s, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIAT3(), abrirGuiaIA: true });
  assert.equal(claveCargada(s), CLAVE_T3);
  assert.equal(s.lua(`${MC}.rutaZona:IsVisible()`), false);
  sinErrores(s);
  s.cerrar();
});

test('T3: aceptar una ruta encima de una guía de la IA a medias la deja para volver y lo dice una vez en el chat', () => {
  const m = chatT3();
  registro(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIAT3(), abrirGuiaIA: true });
  m.lua(`${MC}.rutaZona.abrir:Click()`);
  assert.equal(claveCargada(m), CLAVE_T3);
  const n = m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).numero');
  const titulo = m.lua(`SnetForever.Guias.titulo(SnetForever.Motor.estado().clave)`);
  escribir(m, 'y ahora una ruta');
  registro(m, { t: 'respuesta', texto: 'Esta ruta.', propuesta: { titulo: 'Ruta corta', tipo: 'ruta', puntos: [
    { mapa: 1411, x: 80, y: 30, etiqueta: 'Mirador del este', tipo: 'lugar', seguir: true }] } });
  assert.equal(claveCargada(m), CLAVE_T3, 'sin pulsar Aceptar no cambia nada');
  m.lua(`${MC}.propuesta.aceptar:Click()`);
  assert.notEqual(claveCargada(m), CLAVE_T3);
  assert.equal(m.lua('SnetForeverPJ.volverA'), CLAVE_T3);
  const linea = `Tu guía «${titulo}» se queda en el paso ${n}: pulsa Volver para seguirla.`;
  assert.equal(lineas(m).filter((l) => l === linea).length, 1, lineas(m).join(' | '));
  m.avanzar(2);
  assert.equal(lineas(m).filter((l) => l === linea).length, 1, 'una sola vez');
  sinErrores(m);
  m.cerrar();
});

// Ronda 1 (Menor 1): «pulsa Volver» solo si el botón sale (la regla del 16-nov: la guía de antes tiene algo que hacer).
test('ronda 1: con la guía de antes a medias pero sin nada que hacer ahora, el chat no promete el botón Volver', () => {
  const m = nuevaMaquina({ datos: DATOS_T3, jugador: { ...JUGADOR_T3, idioma: 'esES' } });
  const mision = (nombre, extra = {}) => ({ name: nombre, startedBy: [[3143]], finishedBy: [[3143]], requiredLevel: 1,
    questLevel: 5, requiredRaces: 0, requiredClasses: 0, objectivesText: [`Haz ${nombre}`], ...extra });
  m.datoMision(9101, mision('La previa de prueba'));
  m.datoMision(9102, mision('La que pide la previa', { preQuestSingle: [9101] }));
  m.datoMision(9103, mision('Otra de prueba'));
  m.estadoMision(9103, { enDiario: true });
  m.ponerGuia(guiaDePrueba([
    { elementos: [{ t: 'goto', mapa: 1411, x: 50, y: 50, modo: 'flecha' }, { t: 'accept', q: 9102 }] },
    { elementos: [{ t: 'turnin', q: 9102 }] },
  ]));
  const principal = guiaDePrueba([]).clave;
  m.lua(`SnetForever.Guias.cargar(${aLua(principal)})`);
  slash(m, 'chat');
  escribir(m, 'hola');
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), false);
  assert.equal(m.lua(`SnetForever.Guias.algoQueHacer(${aLua(principal)})`), false);
  registro(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIAT3(), abrirGuiaIA: true });
  m.lua(`${MC}.rutaZona.abrir:Click()`);
  assert.equal(claveCargada(m), CLAVE_T3);
  assert.equal(m.lua('SnetForeverPJ.volverA'), principal);
  assert.equal(m.lua('SnetForever.Avisos.botonVolver()'), undefined);
  assert.ok(!lineas(m).some((l) => l.includes('pulsa Volver')), lineas(m).join(' | '));
  sinErrores(m);
  m.cerrar();
});

// Ronda 1 (Menor 6): con una ruta de pines a medias, la tarjeta avisa de que esa ruta se quita al abrir la otra.
test('ronda 1: con una ruta de pines a medias, la tarjeta dice que se quitará (es y en)', () => {
  for (const [idioma, esperado] of [
    ['esES', (n, t) => `Tu ruta va por la parada ${n} de ${t} y se quitará. ¿Abrir esta otra?`],
    ['enUS', (n, t) => `Your route (stop ${n} of ${t}) will be removed. Open this one?`],
  ]) {
    const m = chatT3(idioma);
    m.lua(`SnetForever.Ruta.proponer(${aLua({ titulo: 'Ruta corta', tipo: 'ruta', puntos: [
      { mapa: 1411, x: 80, y: 30, etiqueta: 'Mirador del este', tipo: 'lugar', seguir: true },
      { mapa: 1411, x: 20, y: 30, etiqueta: 'Mirador del oeste', tipo: 'lugar', seguir: true }] })})`);
    assert.equal(m.lua('SnetForever.Ruta.aceptar()'), true);
    assert.ok(claveCargada(m).startsWith('IA\\Paradas'), claveCargada(m));
    registro(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIAT3(), abrirGuiaIA: true });
    assert.ok(sinColor(m.lua(`${MC}.rutaZona.texto:GetText()`)).endsWith(esperado(1, 2)), m.lua(`${MC}.rutaZona.texto:GetText()`));
    sinErrores(m);
    m.cerrar();
  }
});

// ---------------------------------------------------------------------------------------------------
// Turno largo con TATI: el botón «Parar», la barra y la línea «Parado». Sin animaciones: regla de interfaz.
// ---------------------------------------------------------------------------------------------------

const textoBoton = (m) => m.lua(`${MC}.enviar.texto:GetText()`);
const botonActivo = (m) => m.lua(`${MC}.enviar:IsEnabled()`);
const pulsarBoton = (m) => m.lua(`${MC}.enviar:GetScript("OnClick")(${MC}.enviar)`);
const conMotor = (m, nombre) => m.lua(`SnetForever.Buzon.estadoApp = function() return {motorNombre = ${aLua(nombre)}, sabeParar = true} end`);
const pulsoDelMensaje = (m) => {
  const paridad = Number(estado(m).id.split('-')[1]) % 2 === 0 ? 'par' : 'impar';
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RECIBIDO", "${paridad}")`);
  // Con 0 vueltas el acuse queda pendiente hasta que la franja da la primera.
  for (let i = 0; i < 4 && estado(m).fase === 'enviando'; i++) m.avanzar(0.6);
};

test('con TATI, «Enviar» pasa a «Parar» en pensando; al pulsarlo queda inactivo y «Parado» es una línea normal', () => {
  const m = abierto();
  conMotor(m, 'tati');
  assert.equal(textoBoton(m), L(m, 'CHAT_ENVIAR'));
  escribir(m, 'hola');
  assert.equal(textoBoton(m), L(m, 'CHAT_ENVIAR'), 'enviando aún no se puede parar');
  pulsoDelMensaje(m);
  assert.equal(estado(m).fase, 'pensando');
  assert.equal(textoBoton(m), 'Parar');
  assert.equal(botonActivo(m), true);
  const antes = lineas(m).length;
  pulsarBoton(m);
  assert.equal(estado(m).parando, true);
  assert.equal(textoBoton(m), 'Parar');
  assert.equal(botonActivo(m), false, 'inactivo mientras para');
  assert.equal(sinColor(m.lua(`${MC}.estado:GetText()`)), 'Parando…');
  assert.equal(lineas(m).length, antes, 'pulsar no escribe nada en el chat');
  registro(m, { t: 'error', tipo: 'detenido', texto: 'Parado' });
  assert.equal(estado(m).fase, 'libre', 'no es un error');
  assert.equal(estado(m).detalle, undefined);
  assert.equal(ultima(m), 'Parado');
  assert.equal(lineas(m).filter((l) => l === 'Parado').length, 1);
  assert.equal(textoBoton(m), L(m, 'CHAT_ENVIAR'));
  assert.equal(botonActivo(m), true);
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  sinErrores(m);
});

test('«Parado» sale en inglés como «Stopped»', () => {
  const m = abierto({ jugador: { idioma: 'enUS' } });
  conMotor(m, 'tati');
  escribir(m, 'hello');
  pulsoDelMensaje(m);
  assert.equal(textoBoton(m), 'Stop');
  pulsarBoton(m);
  registro(m, { t: 'error', tipo: 'detenido', texto: 'Stopped' });
  assert.equal(ultima(m), 'Stopped');
  sinErrores(m);
});

test('con Claude o Codex el botón no cambia: sigue «Enviar» e inactivo mientras se espera', () => {
  for (const motor of ['claude', 'codex']) {
    const m = abierto();
    conMotor(m, motor);
    escribir(m, 'hola');
    pulsoDelMensaje(m);
    assert.equal(estado(m).fase, 'pensando');
    assert.equal(textoBoton(m), L(m, 'CHAT_ENVIAR'), motor);
    assert.equal(botonActivo(m), false, motor);
    sinErrores(m);
  }
});

test('una cabecera con el turno de este mensaje, ya pensando, trae el botón de parar; sin él, no', () => {
  const m = abierto();
  escribir(m, 'hola');
  pulsoDelMensaje(m);
  assert.equal(textoBoton(m), L(m, 'CHAT_ENVIAR'));
  conMotor(m, 'tati');
  m.lua('SnetForever.Eventos.emitir("SNF_IA_CABECERA", {motorNombre = "tati", sabeParar = true})');
  assert.equal(textoBoton(m), L(m, 'CHAT_ENVIAR'), 'el mensaje no se mandó a TATI');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_CABECERA", {motorNombre = "tati", sabeParar = true, turno = ${aLua(estado(m).id)}})`);
  assert.equal(textoBoton(m), 'Parar');
  sinErrores(m);
});

test('la barra dice «TATI sigue trabajando… (N min)» con pulsos', () => {
  const m = abierto();
  conMotor(m, 'tati');
  escribir(m, 'hola');
  pulsoDelMensaje(m);
  assert.equal(sinColor(m.lua(`${MC}.estado:GetText()`)), L(m, 'CHAT_PENSANDO'));
  m.avanzar(30);
  pulsoDelMensaje(m);
  m.avanzar(0.1);
  assert.equal(sinColor(m.lua(`${MC}.estado:GetText()`)), 'TATI sigue trabajando… (1 min)');
  m.avanzar(30);
  pulsoDelMensaje(m);
  m.avanzar(30);
  pulsoDelMensaje(m);
  m.avanzar(0.1);
  assert.equal(sinColor(m.lua(`${MC}.estado:GetText()`)), 'TATI sigue trabajando… (1 min)');
  m.avanzar(30);
  pulsoDelMensaje(m);
  m.avanzar(0.1);
  assert.equal(sinColor(m.lua(`${MC}.estado:GetText()`)), 'TATI sigue trabajando… (2 min)');
  sinErrores(m);
});

test('el botón de parar no anima ni cambia de color: sin AnimationGroup ni UIFrameFlash', () => {
  for (const archivo of [join('ui', 'chat.lua'), join('ia', 'envio.lua')]) {
    const fuente = readFileSync(join(RAIZ, 'addons', 'SnetForever', archivo), 'utf8');
    assert.ok(!/CreateAnimationGroup|UIFrameFlash/.test(fuente), archivo);
  }
  const m = abierto();
  m.lua(`rawset(_G, "DESTELLOS", 0)
    rawset(_G, "UIFrameFlash", function() DESTELLOS = DESTELLOS + 1 end)
    local b = ${MC}.enviar
    rawset(_G, "ANIMADOS", 0)
    b.CreateAnimationGroup = function() ANIMADOS = ANIMADOS + 1 end`);
  conMotor(m, 'tati');
  const color = () => m.lua(`{${MC}.enviar.texto:GetTextColor()}`);
  const antes = color();
  escribir(m, 'hola');
  pulsoDelMensaje(m);
  assert.equal(textoBoton(m), 'Parar');
  assert.deepEqual(color(), antes, 'el mismo color');
  pulsarBoton(m);
  m.avanzar(5);
  assert.equal(m.lua('DESTELLOS'), 0);
  assert.equal(m.lua('ANIMADOS'), 0);
  sinErrores(m);
});

test('ronda1 p6: con una app vieja (sin sabeParar) el botón sigue «Enviar» e inactivo', () => {
  const m = abierto();
  m.lua('SnetForever.Buzon.estadoApp = function() return {motorNombre = "tati"} end');
  escribir(m, 'hola');
  pulsoDelMensaje(m);
  assert.equal(estado(m).fase, 'pensando');
  assert.equal(m.lua('SnetForever.Envio.puedeParar()'), false);
  assert.equal(m.lua('SnetForever.Envio.parar()'), false);
  assert.equal(textoBoton(m), L(m, 'CHAT_ENVIAR'));
  assert.equal(botonActivo(m), false);
  sinErrores(m);
});
