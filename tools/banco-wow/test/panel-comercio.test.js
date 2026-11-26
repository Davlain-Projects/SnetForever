// Ventana principal, parte 1, Task 10b: el comercio es un addon aparte, pero en el panel /snet se ve como un apartado más
// («Comercio», entre «Chat con la IA» y «Versión»). La tarjeta vive en el núcleo y funciona sin el addon de comercio,
// también sin su carpeta. Aquí también: «/snet c» escribe una sola línea mientras no exista la ventana de comercio, y el
// muestrario no lleva «⧉» en sus etiquetas (la letra no lo tiene y sale un cuadrado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aLua } from '../src/lua-js.js';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const EN = { ...JUGADOR, idioma: 'enUS' };
const P = 'SnetForever.Panel';
const M = `${P}.marcos`;
const K = `${M}.comercio`;
const DESACTIVADO = { ranurasDesactivadas: ['SnetForever_Comercio'] };

const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
// Lo que escribe una orden de /snet (solo lo nuevo).
function escribe(m, orden) {
  const antes = impresos(m).length;
  m.lua(`SlashCmdList.SNET(${aLua(orden)})`);
  return impresos(m).slice(antes);
}
const texto = (m, clave, ...args) => m.lua(`SnetForever.L.t(${aLua(clave)}${args.map((a) => ', ' + aLua(a)).join('')})`);
const abrir = (m) => m.lua(`${P}.abrir("comercio")`);
const lee = (m, expr) => m.lua(`${K}.${expr}`);
const visible = (m, marco) => m.lua(`${K}.${marco}:IsVisible()`);
const pj = (m) => m.lua('(UnitName("player"))');
const enableState = (m) => m.lua('C_AddOns.GetAddOnEnableState("SnetForever_Comercio", (UnitName("player")))');

function maquina(opciones = {}) {
  return nuevaMaquina({ jugador: JUGADOR, ...opciones });
}

// ---------------------------------------------------------------------------------------------------
// /snet c de una línea
// ---------------------------------------------------------------------------------------------------

// Task 12: con el comercio cargado ya existe SNF.Principal; estas dos pruebas la quitan para comprobar el aviso de reserva.
test('/snet c con el comercio cargado pero sin SNF.Principal escribe una sola línea', necesitaComercio, () => {
  const linea = 'SnetForever Comercio: la ventana de comercio todavía se está construyendo.';
  const m = maquina();
  assert.equal(m.lua('SnetForever.comercioCargado()'), true);
  assert.equal(m.lua('type(rawget(SnetForever, "Principal"))'), 'table', 'Task 12: el addon trae la ventana principal');
  m.lua('SnetForever.Principal = nil');
  assert.equal(texto(m, 'COMERCIO_EN_OBRAS'), linea);
  assert.deepEqual(escribe(m, 'c'), [linea]);
  assert.deepEqual(escribe(m, 'comercio'), [linea]);
  assert.deepEqual(escribe(m, 'C'), [linea], 'sin distinguir mayúsculas');
  const en = maquina({ jugador: EN });
  en.lua('SnetForever.Principal = nil');
  assert.equal(texto(en, 'COMERCIO_EN_OBRAS'), 'SnetForever Comercio: the trading window is still being built.');
  assert.deepEqual(escribe(en, 'trade'), [texto(en, 'COMERCIO_EN_OBRAS')]);
  sinErrores(m);
  sinErrores(en);
});

test('/snet c con SNF.Principal la alterna, y desactivado sigue el aviso de una línea', necesitaComercio, () => {
  const m = maquina();
  m.lua('SnetForever.Principal = {alternar = function() BANCO.alternado = (BANCO.alternado or 0) + 1 end}');
  assert.deepEqual(escribe(m, 'c'), []);
  assert.equal(m.lua('BANCO.alternado'), 1);
  const off = maquina(DESACTIVADO);
  assert.deepEqual(escribe(off, 'c'), [texto(off, 'COMERCIO_NO_CARGADO')]);
  sinErrores(m);
  sinErrores(off);
});

// ---------------------------------------------------------------------------------------------------
// La tarjeta en la columna
// ---------------------------------------------------------------------------------------------------

test('la tarjeta Comercio sale entre Chat con la IA y Versión, con su icono, y las 12 caben en la columna', () => {
  for (const [jugador, nombre] of [[JUGADOR, 'Comercio'], [EN, 'Trading']]) {
    const m = maquina({ jugador });
    m.lua('SlashCmdList.SNET("")');
    const orden = m.lua(`${M}.orden`);
    assert.equal(orden.length, 12);
    assert.deepEqual(orden.slice(-3), ['ia', 'comercio', 'version']);
    assert.equal(m.lua(`${M}.tarjetas.comercio.texto:GetText()`), nombre);
    assert.equal(m.lua(`${M}.secciones.comercio.titulo:GetText()`), nombre);
    const icono = m.lua(`${M}.tarjetas.comercio.icono:GetTexture()`);
    assert.ok(icono.startsWith('Interface\\Icons\\'), icono);
    assert.equal(icono, 'Interface\\Icons\\INV_Misc_Coin_01');
    const iconos = orden.map((n) => m.lua(`${M}.tarjetas.${n}.icono:GetTexture()`));
    assert.equal(new Set(iconos).size, iconos.length, 'cada tarjeta lleva un icono distinto');
    // Medidas (Ruling): 12 tarjetas de 26 y 11 huecos de 4 = 356 ≤ 358 (el alto del cuerpo).
    const tops = orden.map((n) => m.lua(`${M}.tarjetas.${n}:GetTop()`));
    for (const n of orden) assert.equal(m.lua(`${M}.tarjetas.${n}:GetHeight()`), 26, n);
    for (let i = 1; i < tops.length; i++) assert.equal(tops[i - 1] - tops[i], 26 + 4, `hueco de 4 entre ${orden[i - 1]} y ${orden[i]}`);
    const ultima = orden[orden.length - 1];
    const suma = tops[0] - m.lua(`${M}.tarjetas.${ultima}:GetBottom()`);
    assert.equal(suma, 356, "12 de 26 y 11 huecos de 4: caben en los 358 del cuerpo");
    assert.ok(m.lua(`${M}.tarjetas.${ultima}:GetBottom()`) >= m.lua(`${M}.contenido:GetBottom()`), 'la última tarjeta queda dentro del cuerpo');
    assert.equal(m.lua(`${M}.raiz:GetWidth()`), 640);
    assert.equal(m.lua(`${M}.raiz:GetHeight()`), 420, 'el panel sigue midiendo 640×420');
    // El icono sigue centrado en la altura de la tarjeta.
    const ic = m.lua(`(function() local t = ${M}.tarjetas.comercio; local i = t.icono
      return {i:GetTop() - t:GetTop(), i:GetBottom() - t:GetBottom()} end)()`);
    assert.equal(ic[0], -(26 - 18) / 2);
    assert.equal(ic[1], (26 - 18) / 2);
    sinErrores(m);
  }
});

test('Panel.abrir("comercio") abre esa tarjeta y Chat con la IA ya no lleva la nota del comercio', () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(m.lua(`${M}.elegido`), 'comercio');
  assert.equal(m.lua(`${M}.secciones.comercio:IsVisible()`), true);
  assert.equal(m.lua(`${M}.secciones.ia:IsVisible()`), false);
  assert.equal(m.lua(`${M}.ia.comercio`), undefined, 'marcos.ia.comercio se ha ido');
  assert.equal(texto(m, 'PANEL_COMERCIO_ADDON'), 'PANEL_COMERCIO_ADDON', 'y su texto también');
  m.lua(`${M}.tarjetas.ia:Click()`);
  const textos = m.lua(`(function()
    local salida = {}
    local function recorrer(o)
      if o:IsObjectType("FontString") then
        if o:IsVisible() and o:GetText() then salida[#salida + 1] = o:GetText() end
      elseif o:IsObjectType("Frame") then
        for _, r in ipairs({o:GetRegions()}) do recorrer(r) end
        for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
      end
    end
    recorrer(${M}.secciones.ia)
    return salida
  end)()`);
  assert.ok(textos.length > 0);
  assert.ok(!textos.some((t) => /comercio|SnetForever Comercio/i.test(t)), `sin nota del comercio: ${textos.join(' | ')}`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Con el comercio cargado
// ---------------------------------------------------------------------------------------------------

test('con el comercio cargado: desmarcar la casilla llama a DisableAddOn, avisa de /reload y volver a marcar lo deshace', necesitaComercio, () => {
  for (const [jugador, usar, seApaga] of [
    [JUGADOR, 'Usar el comercio', 'Se apagará al recargar: escribe /reload.'],
    [EN, 'Use trading', 'It will turn off when you reload: type /reload.'],
  ]) {
    const m = maquina({ jugador });
    m.lua('SlashCmdList.SNET("")');
    abrir(m);
    assert.equal(m.lua('SnetForever.estadoComercio()'), 'cargado');
    assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
    assert.equal(visible(m, 'casilla'), true);
    assert.equal(lee(m, 'casilla.texto:GetText()'), usar);
    assert.equal(lee(m, 'casilla.marca:IsShown()'), true, 'marcada');
    assert.equal(visible(m, 'estado'), false, 'sin línea de aviso');
    assert.equal(visible(m, 'activar'), false, 'no hay botón Activar');
    assert.equal(m.lua('SnetForever.Ajustes.DEFECTO["comercioActivo"]'), undefined, 'no es un ajuste');

    m.lua(`${K}.casilla:Click()`);
    assert.deepEqual(m.llamadas('C_AddOns.DisableAddOn'), [['SnetForever_Comercio', pj(m)]], 'para este personaje');
    assert.equal(enableState(m), 0);
    assert.equal(m.lua('SnetForever.comercioPendiente()'), 'seApaga');
    assert.equal(lee(m, 'casilla.marca:IsShown()'), false, 'desmarcada');
    assert.equal(visible(m, 'estado'), true);
    assert.equal(lee(m, 'estado:GetText()'), seApaga);
    assert.equal(m.lua('SnetForever.comercioCargado()'), true, 'sigue cargado hasta el /reload');

    m.lua(`${K}.casilla:Click()`);
    assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), [['SnetForever_Comercio', pj(m)]]);
    assert.equal(enableState(m), 2, 'como estaba');
    assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
    assert.equal(lee(m, 'casilla.marca:IsShown()'), true, 'marcada otra vez');
    assert.equal(visible(m, 'estado'), false, 'la línea desaparece');

    // Desmarcada y con /reload: el comercio no carga, y la tarjeta dice que está apagado.
    m.lua(`${K}.casilla:Click()`);
    sinErrores(m);
    const n = m.recargar();
    n.lua('SlashCmdList.SNET("")');
    n.lua(`${P}.abrir("comercio")`);
    assert.equal(n.lua('SnetForever.estadoComercio()'), 'apagado');
    assert.equal(n.lua(`${K}.activar:IsVisible()`), true);
    sinErrores(n);
  }
});

test('con el comercio cargado: si el cliente no deja apagarlo, sale el aviso y la casilla sigue marcada', necesitaComercio, () => {
  const m = maquina({ previo: 'rawset(C_AddOns, "DisableAddOn", function() end)' });
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  m.lua(`${K}.casilla:Click()`);
  assert.equal(enableState(m), 2);
  assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
  assert.equal(lee(m, 'casilla.marca:IsShown()'), true, 'pinta el estado real');
  assert.equal(visible(m, 'estado'), true);
  assert.equal(lee(m, 'estado:GetText()'), texto(m, 'COMERCIO_NO_APAGADO'));
  assert.match(texto(m, 'COMERCIO_NO_APAGADO'), /lista de addons/);
  assert.match(texto(maquina({ jugador: EN }), 'COMERCIO_NO_APAGADO'), /AddOns list/);
  sinErrores(m);
});

test('con el comercio cargado pero sin SNF.Principal: «Abrir comercio» está apagado y dice en construcción', necesitaComercio, () => {
  for (const [jugador, texto1, ordenes] of [
    [JUGADOR, 'Abrir comercio (en construcción)', '/snet c abre el comercio; /snet c activar lo enciende si estaba apagado.'],
    [EN, 'Open trading (under construction)', '/snet c opens trading; /snet c activate turns it on if it was off.'],
  ]) {
    const m = maquina({ jugador });
    m.lua('SnetForever.Principal = nil');
    m.lua('SlashCmdList.SNET("")');
    abrir(m);
    assert.equal(visible(m, 'abrir'), true);
    assert.equal(lee(m, 'abrir.texto:GetText()'), texto1);
    assert.equal(lee(m, 'abrir:IsEnabled()'), false);
    assert.equal(lee(m, 'abrir:GetAlpha()') < 1, true, 'se ve apagado');
    assert.equal(lee(m, 'ordenes:GetText()'), ordenes);
    const antes = impresos(m).length;
    m.lua(`${K}.abrir:Click()`);
    assert.equal(impresos(m).length, antes, 'pulsarlo no hace nada');
    sinErrores(m);
  }
});

test('con el comercio cargado (la ventana real de la Task 12): «Abrir comercio» está encendido y abre la ventana', necesitaComercio, () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(lee(m, 'abrir.texto:GetText()'), 'Abrir comercio');
  assert.equal(lee(m, 'abrir:IsEnabled()'), true);
  m.lua(`${K}.abrir:Click()`);
  assert.equal(m.lua('SnetForever.Principal.estaAbierta()'), true);
  sinErrores(m);
});

test('con el comercio cargado y un SNF.Principal falso: «Abrir comercio» se enciende y llama a abrir() (o a alternar())', necesitaComercio, () => {
  // La marca se llama «alternado» y no «alt»: BANCO.alt es la tecla Alt del banco (false si no está pulsada).
  const m = maquina();
  m.lua('SnetForever.Principal = {abrir = function() BANCO.abierto = (BANCO.abierto or 0) + 1 end, alternar = function() BANCO.alternado = 1 end}');
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(lee(m, 'abrir.texto:GetText()'), 'Abrir comercio');
  assert.equal(lee(m, 'abrir:IsEnabled()'), true);
  m.lua(`${K}.abrir:Click()`);
  assert.equal(m.lua('BANCO.abierto'), 1);
  assert.equal(m.lua('BANCO.alternado'), undefined);
  const b = maquina();
  b.lua('SnetForever.Principal = {alternar = function() BANCO.alternado = 1 end}');
  b.lua('SlashCmdList.SNET("")');
  abrir(b);
  b.lua(`${K}.abrir:Click()`);
  assert.equal(b.lua('BANCO.alternado'), 1, 'sin abrir, usa alternar');
  sinErrores(m);
  sinErrores(b);
});

// ---------------------------------------------------------------------------------------------------
// Apagado e sin instalar
// ---------------------------------------------------------------------------------------------------

test('con el comercio desactivado: la tarjeta dice que está apagado y «Activar» hace EnableAddOn y pide /reload', necesitaComercio, () => {
  for (const [jugador, apagado, activar, recargar] of [
    [JUGADOR, 'El comercio está apagado.', 'Activar', 'SnetForever Comercio se encenderá al recargar: escribe /reload.'],
    [EN, 'Trading is off.', 'Turn on', 'SnetForever Comercio will turn on when you reload: type /reload.'],
  ]) {
    const m = maquina({ jugador, ...DESACTIVADO });
    assert.equal(m.lua('SnetForever.estadoComercio()'), 'apagado');
    m.lua('SlashCmdList.SNET("")');
    abrir(m);
    assert.equal(visible(m, 'casilla'), false, 'sin casilla');
    assert.equal(lee(m, 'estado:GetText()'), apagado);
    assert.equal(visible(m, 'estado'), true);
    assert.equal(visible(m, 'activar'), true);
    assert.equal(lee(m, 'activar.texto:GetText()'), activar);
    assert.equal(lee(m, 'abrir:IsEnabled()'), false, 'sin el comercio cargado, siempre apagado');
    assert.equal(texto(m, 'COMERCIO_ACTIVAR_RECARGAR'), recargar);

    m.lua(`${K}.activar:Click()`);
    assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), [['SnetForever_Comercio', pj(m)]]);
    assert.equal(enableState(m), 2);
    assert.equal(m.lua('SnetForever.comercioPendiente()'), 'seEnciende');
    assert.equal(lee(m, 'estado:GetText()'), recargar, 'la línea repite el aviso');
    assert.equal(m.lua('SnetForever.comercioCargado()'), false, 'carga tras el /reload');
    sinErrores(m);
    const n = m.recargar();
    assert.equal(n.lua('SnetForever.comercioCargado()'), true);
    assert.equal(n.lua('SnetForever.estadoComercio()'), 'cargado');
    sinErrores(n);
  }
});

test('con el comercio desactivado: si EnableAddOn no lo activa, la tarjeta dice que no se pudo', necesitaComercio, () => {
  const m = maquina({ ...DESACTIVADO, previo: 'rawset(C_AddOns, "EnableAddOn", function() end)' });
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  m.lua(`${K}.activar:Click()`);
  assert.equal(lee(m, 'estado:GetText()'), texto(m, 'COMERCIO_NO_REACTIVADO'));
  assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
  sinErrores(m);
});

test('/snet c activar con el comercio apagado en la lista lo activa para el próximo /reload', necesitaComercio, () => {
  const m = maquina(DESACTIVADO);
  const aviso = 'SnetForever Comercio se encenderá al recargar: escribe /reload.';
  assert.deepEqual(escribe(m, 'c activar'), [aviso]);
  assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), [['SnetForever_Comercio', pj(m)]]);
  assert.equal(enableState(m), 2);
  assert.equal(m.lua('SnetForever.activarComercio()'), 'recargar');
  assert.equal(m.lua('SnetForever.comercioCargado()'), false);
  sinErrores(m);
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), true, 'tras /reload carga');
  // En inglés también.
  const en = maquina({ jugador: EN, ...DESACTIVADO });
  assert.deepEqual(escribe(en, 'trade activate'), [texto(en, 'COMERCIO_ACTIVAR_RECARGAR')]);
  // Si el cliente no lo activa, el aviso de siempre.
  const mal = maquina({ ...DESACTIVADO, previo: 'rawset(C_AddOns, "EnableAddOn", function() end)' });
  assert.deepEqual(escribe(mal, 'c activar'), [texto(mal, 'COMERCIO_NO_REACTIVADO')]);
  sinErrores(n);
  sinErrores(en);
  sinErrores(mal);
});

test('sin la carpeta del comercio: la tarjeta lo dice, no hay botón Activar y no rompe', () => {
  for (const jugador of [JUGADOR, EN]) {
    const m = maquina({ jugador, sinComercio: true });
    assert.equal(m.lua('SnetForever.estadoComercio()'), 'noInstalado');
    assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
    m.lua('SlashCmdList.SNET("")');
    abrir(m);
    assert.equal(m.lua(`${M}.elegido`), 'comercio');
    assert.equal(visible(m, 'casilla'), false);
    assert.equal(visible(m, 'activar'), false, 'sin botón Activar');
    assert.equal(visible(m, 'estado'), true);
    assert.equal(lee(m, 'estado:GetText()'), texto(m, 'COMERCIO_NO_INSTALADO'));
    assert.equal(lee(m, 'abrir:IsEnabled()'), false);
    assert.equal(lee(m, 'ordenes:IsVisible()'), true);
    m.lua(`${K}.abrir:Click()`);
    assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), []);
    assert.deepEqual(m.llamadas('C_AddOns.DisableAddOn'), []);
    sinErrores(m);
  }
});

test('sin forma de preguntar al cliente por los addons: la tarjeta dice «no instalado» y no rompe', () => {
  const m = maquina({ sinComercio: true, sinApi: ['C_AddOns.DoesAddOnExist', 'C_AddOns.GetAddOnInfo', 'C_AddOns.GetAddOnEnableState'] });
  assert.equal(m.lua('SnetForever.estadoComercio()'), 'noInstalado');
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(lee(m, 'estado:GetText()'), texto(m, 'COMERCIO_NO_INSTALADO'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Muestrario
// ---------------------------------------------------------------------------------------------------

test('el muestrario no usa ⧉ en sus etiquetas y lleva la línea gris debajo del título', necesitaComercio, () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("muestrario")');
  const r = m.lua(`(function()
    local etiquetas, vistos = {}, {}
    local titulo, gris
    local function recorrer(o)
      if o:IsObjectType("FontString") then
        local t = o:GetText()
        if t then
          etiquetas[#etiquetas + 1] = t
          if t == "Muestrario de piezas (prueba)" then titulo = o end
          if t == "Hoja de pruebas para comparar con TSM. No hace falta usarla." then gris = o end
        end
      elseif o:IsObjectType("Frame") then
        for _, r in ipairs({o:GetRegions()}) do recorrer(r) end
        for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
      end
    end
    recorrer(SnetForeverMuestrario)
    local c = gris and {gris:GetTextColor()}
    local ct = titulo and {titulo:GetTextColor()}
    return {
      etiquetas = etiquetas, hayGris = gris ~= nil, y = gris and gris:GetTop(), yTitulo = titulo and titulo:GetBottom(),
      color = c, colorTitulo = ct,
    }
  end)()`);
  const con = r.etiquetas.filter((t) => t.includes('⧉'));
  assert.deepEqual(con, [], 'ningún texto lleva ⧉ (sale un cuadrado)');
  assert.ok(r.etiquetas.includes('Con fórmula'));
  assert.ok(r.etiquetas.includes('Con fórmula, apagado'));
  assert.equal(r.hayGris, true, 'la línea gris está');
  assert.ok(r.y <= r.yTitulo, 'va debajo del título');
  assert.notDeepEqual(r.color, r.colorTitulo, 'y es gris (otro color que el título)');
  // El icono ⧉ de los campos es del atlas, no una letra: se queda (lo comprueba piezas.test.js).
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1 de la Task 10b
// ---------------------------------------------------------------------------------------------------

const APAGADO_064 = { guardado: { SnetForeverPJ: { esquema: 1, ajustes: { comercioActivo: false } } } };

test('ronda 1: desmarcar la casilla y «/snet c activar» deshace el apagado (EnableAddOn) y tras /reload carga', necesitaComercio, () => {
  const m = maquina();
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  m.lua(`${K}.casilla:Click()`);
  assert.equal(m.lua('SnetForever.comercioPendiente()'), 'seApaga');
  assert.deepEqual(escribe(m, 'c activar'), [texto(m, 'COMERCIO_ACTIVADO')]);
  assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), [['SnetForever_Comercio', pj(m)]]);
  assert.equal(enableState(m), 2);
  assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
  assert.equal(lee(m, 'casilla.marca:IsShown()'), true);
  sinErrores(m);
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), true, 'tras /reload sigue cargado');
  sinErrores(n);
});

test('ronda 1: con el comercio dormido «a mano» la casilla sale desmarcada y marcarla hace EnableAddOn y lo despierta', necesitaComercio, () => {
  const m = maquina({ ...APAGADO_064, sinApi: ['C_AddOns.DisableAddOn'] });
  assert.equal(m.lua('SnetForever.comercioDormido()'), true);
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(lee(m, 'casilla.marca:IsShown()'), false, 'dormido: no se usa, desmarcada');
  m.lua(`${K}.casilla:Click()`);
  assert.equal(lee(m, 'casilla.marca:IsShown()'), true);
  assert.equal(m.lua('SnetForever.comercioDormido()'), false);
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined);
  sinErrores(m);
});

test('ronda 1: dormido por la migración, desmarcar y volver a marcar hace EnableAddOn y tras /reload carga', necesitaComercio, () => {
  const m = maquina(APAGADO_064);
  assert.equal(enableState(m), 0, 'la migración lo desactivó');
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(lee(m, 'casilla.marca:IsShown()'), false);
  m.lua(`${K}.casilla:Click()`);
  assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), [['SnetForever_Comercio', pj(m)]]);
  assert.equal(enableState(m), 2);
  assert.equal(lee(m, 'casilla.marca:IsShown()'), true);
  // Desmarcar y volver a marcar otra vez.
  m.lua(`${K}.casilla:Click()`);
  assert.equal(lee(m, 'casilla.marca:IsShown()'), false);
  m.lua(`${K}.casilla:Click()`);
  assert.equal(enableState(m), 2);
  assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
  sinErrores(m);
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), true);
  sinErrores(n);
});

test('ronda 1: un DisableAddOn hecho por fuera (en la lista de addons) sale en la tarjeta sin recargar', necesitaComercio, () => {
  const m = maquina();
  m.lua('C_AddOns.DisableAddOn("SnetForever_Comercio", (UnitName("player")))');
  assert.equal(m.lua('SnetForever.comercioPendiente()'), 'seApaga');
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(lee(m, 'estado:GetText()'), texto(m, 'PANEL_COMERCIO_SE_APAGA'));
  assert.equal(lee(m, 'casilla.marca:IsShown()'), false, 'desmarcada');
  // Y al revés: apagado y activado por fuera sin recargar.
  const n = maquina(DESACTIVADO);
  n.lua('C_AddOns.EnableAddOn("SnetForever_Comercio", (UnitName("player")))');
  assert.equal(n.lua('SnetForever.comercioPendiente()'), 'seEnciende');
  n.lua('SlashCmdList.SNET("")');
  abrir(n);
  assert.equal(lee(n, 'estado:GetText()'), texto(n, 'COMERCIO_ACTIVAR_RECARGAR'));
  sinErrores(m);
  sinErrores(n);
});

// F3: DisableAddOn, EnableAddOn y GetAddOnEnableState reciben el personaje. Qué espera el cliente de Forever (el primer
// nombre, «Nombre Apellido» o el GUID) está por mirar en el juego; hasta entonces se pasa lo de siempre (el primer valor
// de UnitName), pero desde una sola función, para que el cambio sea de una línea.
test('los tres sitios del arranque piden el personaje a una sola función', necesitaComercio, () => {
  // El código de arranque.lua sin los comentarios de línea.
  const fuente = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'addons', 'SnetForever', 'arranque.lua'), 'utf8')
    .replace(/--[^\n]*/g, '');
  const funcion = fuente.match(/\nlocal function personajeParaAddons\(\)\r?\n([\s\S]*?)\r?\nend\r?\n/);
  assert.ok(funcion, 'existe local function personajeParaAddons()');
  assert.equal((fuente.match(/UnitName\(/g) || []).length, 1, 'UnitName solo una vez');
  assert.ok(funcion[1].includes('UnitName("player")'), 'y es dentro de personajeParaAddons');
  const usos = (fuente.match(/personajeParaAddons\(\)/g) || []).length - 1;
  assert.equal(usos, 3, 'desactivarComercio, reactivarComercio y comercioPendiente');
  for (const api of ['DisableAddOn', 'EnableAddOn']) {
    const sitio = fuente.slice(fuente.indexOf(`delCliente("${api}")`), fuente.indexOf(`delCliente("${api}")`) + 160);
    assert.ok(sitio.includes('local personaje = personajeParaAddons()'), api);
  }
  assert.match(fuente, /quedoDesactivado\(personajeParaAddons\(\)\)/, 'comercioPendiente');
  // Hoy, el primer valor de UnitName, también con apellido («Nombre Uno» y «Nombre Dos» dan los dos «Nombre»).
  for (const apellido of ['Uno', 'Dos']) {
    const m = maquina({ jugador: { ...JUGADOR, nombre: 'Nombre', apellido } });
    m.lua('SlashCmdList.SNET("")');
    abrir(m);
    m.lua(`${K}.casilla:Click()`);
    assert.deepEqual(m.llamadas('C_AddOns.DisableAddOn'), [['SnetForever_Comercio', 'Nombre']]);
    m.lua(`${K}.casilla:Click()`);
    assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), [['SnetForever_Comercio', 'Nombre']]);
    m.lua('SnetForever.comercioPendiente()');
    const estados = m.llamadas('C_AddOns.GetAddOnEnableState');
    assert.ok(estados.length > 0 && estados.every((a) => a[1] === 'Nombre'), JSON.stringify(estados));
    sinErrores(m);
  }
});

test('ronda 1: sin GetAddOnEnableState, la tarjeta sigue la variable de la sesión', necesitaComercio, () => {
  const m = maquina({ sinApi: ['C_AddOns.GetAddOnEnableState'] });
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  m.lua(`${K}.casilla:Click()`);
  assert.equal(m.lua('SnetForever.comercioPendiente()'), 'seApaga');
  assert.equal(lee(m, 'estado:GetText()'), texto(m, 'PANEL_COMERCIO_SE_APAGA'));
  m.lua(`${K}.casilla:Click()`);
  assert.equal(m.lua('SnetForever.comercioPendiente()'), undefined);
  sinErrores(m);
});

test('ronda 1: «Activar» se esconde cuando ya está pulsado (queda la línea de /reload)', necesitaComercio, () => {
  const m = maquina(DESACTIVADO);
  m.lua('SlashCmdList.SNET("")');
  abrir(m);
  assert.equal(visible(m, 'activar'), true);
  m.lua(`${K}.activar:Click()`);
  assert.equal(visible(m, 'activar'), false);
  assert.equal(lee(m, 'estado:GetText()'), texto(m, 'COMERCIO_ACTIVAR_RECARGAR'));
  sinErrores(m);
});
