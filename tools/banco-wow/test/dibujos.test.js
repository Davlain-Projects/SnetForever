// Dibujos de la IA en el mapa del mundo (mapa/dibujos.lua, SNF.Dibujos): línea, flecha, círculo y marca, con 6 tintas y
// 3 grosores, propios de SnetForever (sin OpenMap ni arte de terceros). Mapas del banco (src/wow-falso.lua): Durotar 1411
// dentro de Kalimdor 1414; Ventormenta 1453 en otra instancia. Lienzo de 1000x667 y escala 1 por defecto.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nuevaMaquina as maquinaEntera, sinErrores, guiaDePrueba } from './ayuda.js';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';

const D = 'SnetForever.Dibujos';
const MC = 'SnetForever.Chat.marcos';
const ES = { jugador: { idioma: 'esES' } };
const CLAVE = 'Prueba\\01-60 Guía de prueba';

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const sinColor = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');

// Sin entrar al mundo: no hay guía cargada (la capa de la guía está vacía).
function nuevaMaquina(opciones = {}) {
  const m = maquinaEntera({ entrar: false, ...ES, ...opciones });
  m.lua(`${D}.crear()`);
  return m;
}

// Un trazo de la IA como lo manda la app (con su mapa).
const T = (campos = {}) => ({ mapa: 1411, tipo: 'linea', tinta: 2, grosor: 1, puntos: [10, 30, 50, 60], ...campos });

const poner = (m, lista, opciones) => m.lua(`${D}.poner(${aLua(lista)}${opciones ? `, ${aLua(opciones)}` : ''})`);
const abrir = (m, mapa = 1411, escala = 1) => {
  m.lua(`BANCO.mapaMundo = ${mapa}; BANCO.escalaLienzo = ${escala}`);
  if (m.lua('WorldMapFrame:IsShown()')) m.lua('WorldMapFrame:OnMapChanged()');
  else m.lua('WorldMapFrame:Show()');
};
const guardados = (m, mapa = 1411) => m.lua(`SnetForeverPJ.dibujos.porMapa[${mapa}]`) || [];

// Segmentos a la vista: {x1, y1, x2, y2, grosor, color}.
const segmentos = (m) => m.lua(`(function()
  local salida = {}
  for _, l in ipairs(${D}.marcos.lineas) do
    if l:IsShown() then
      local _, r1, x1, y1 = l:GetStartPoint()
      local _, r2, x2, y2 = l:GetEndPoint()
      salida[#salida + 1] = {x1 = x1, y1 = y1, x2 = x2, y2 = y2, grosor = l:GetThickness(), color = {l:GetVertexColor()},
        enCapa = r1 == ${D}.marcos.capa and r2 == ${D}.marcos.capa}
    end
  end
  return salida
end)()`) || [];
const iconos = (m) => m.lua(`(function()
  local salida = {}
  for _, f in ipairs(${D}.marcos.marcas) do
    if f:IsShown() then
      local _, rel, _, x, y = f:GetPoint(1)
      salida[#salida + 1] = {x = x, y = y, textura = f.icono:GetTexture(), escala = f:GetScale(),
        lienzo = rel == WorldMapFrame:GetCanvas()}
    end
  end
  return salida
end)()`) || [];
const totalLineas = (m) => m.lua(`#${D}.marcos.lineas`);
const botonMapa = (m) => m.lua(`${D}.marcos.boton ~= nil and ${D}.marcos.boton:IsShown()`);

const contar = (m, evento) => {
  m.lua(`CUENTA_${evento} = 0; SnetForever.Eventos.escuchar("${evento}", function() CUENTA_${evento} = CUENTA_${evento} + 1 end)`);
  return () => m.lua(`CUENTA_${evento}`);
};

// ---------------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------------

test('banco: Frame:SetMouseClickEnabled / SetMouseMotionEnabled y sus Is…', () => {
  const m = nuevaMaquina();
  m.lua('F = CreateFrame("Frame", nil, UIParent)');
  assert.equal(m.lua('F:IsMouseClickEnabled()'), false);
  assert.equal(m.lua('F:IsMouseMotionEnabled()'), false);
  m.lua('F:EnableMouse(true)');
  assert.equal(m.lua('F:IsMouseClickEnabled()'), true);
  assert.equal(m.lua('F:IsMouseMotionEnabled()'), true);
  m.lua('F:SetMouseClickEnabled(false)');
  assert.equal(m.lua('F:IsMouseClickEnabled()'), false);
  assert.equal(m.lua('F:IsMouseMotionEnabled()'), true);
  m.lua('F:SetMouseMotionEnabled(false)');
  assert.equal(m.lua('F:IsMouseMotionEnabled()'), false);
  assert.equal(m.lua('F:IsMouseEnabled()'), false);
  // BANCO.sinMetodo: los marcos nuevos no lo tienen (como un cliente sin él); los de antes, sí.
  m.lua('BANCO.sinMetodo("SetMouseClickEnabled"); G = CreateFrame("Frame", nil, UIParent)');
  assert.equal(m.lua('type(G.SetMouseClickEnabled)'), 'nil');
  assert.equal(m.lua('type(F.SetMouseClickEnabled)'), 'function');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// poner, topes y saneado
// ---------------------------------------------------------------------------------------------------

test('poner: se guardan por mapa en SnetForeverPJ.dibujos, de la IA y con fecha; emite SNF_DIBUJOS_CAMBIADOS', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForeverPJ.dibujos'), { v: 1, porMapa: [] });
  const avisos = contar(m, 'SNF_DIBUJOS_CAMBIADOS');
  const r = poner(m, [T(), T({ mapa: 1453, tipo: 'marca', marca: 3, puntos: [40, 40], texto: 'Aquí' })]);
  assert.deepEqual(r, { puestos: 2, descartados: 0, sinGuia: 0 });
  assert.equal(avisos(), 1);
  const [a] = guardados(m);
  assert.equal(a.dueno, 'IA');
  assert.equal(a.tipo, 'linea');
  assert.equal(a.tinta, 2);
  assert.equal(a.grosor, 1);
  assert.deepEqual(a.puntos, [10, 30, 50, 60]);
  assert.equal(typeof a.fecha, 'number');
  const [b] = guardados(m, 1453);
  assert.equal(b.marca, 3);
  assert.equal(b.texto, 'Aquí');
  assert.equal(m.lua(`${D}.cuantos()`), 2);
  sinErrores(m);
});

test('saneado: lo raro se normaliza o se descarta, nunca da error', () => {
  const m = nuevaMaquina();
  const largo = 'ñ'.repeat(60); // 120 bytes
  const r = poner(m, [
    T({ tipo: 'espiral' }), // tipo desconocido
    T({ mapa: 'Durotar' }), // mapa raro
    T({ puntos: [10, 10, 200, 20] }), // una línea que se queda con un punto
    T({ tipo: 'circulo', puntos: [50, 50] }), // círculo sin radio
    T({ tipo: 'circulo', puntos: [50, 50], radio: 500 }), // radio fuera de 0-100
    'no es una tabla',
    T({ tinta: 9, grosor: 0, puntos: [10, 10, -5, 50, 20, 20, 'x', 3, 30, 30] }),
    T({ tipo: 'marca', marca: 12, puntos: [10, 10], texto: largo }),
    T({ tipo: 'flecha', tinta: 6, grosor: 3, texto: 42 }),
  ]);
  assert.deepEqual(r, { puestos: 3, descartados: 6, sinGuia: 0 });
  const [a, b, c] = guardados(m);
  assert.equal(a.tinta, 2, 'tinta rara: la roja');
  assert.equal(a.grosor, 2, 'grosor raro: el medio');
  assert.deepEqual(a.puntos, [10, 10, 20, 20, 30, 30], 'los pares fuera de 0-100 o sin número se quitan');
  assert.equal(b.marca, 1);
  assert.ok(Buffer.byteLength(b.texto) <= 80 && b.texto.startsWith('ñ') && !b.texto.includes('�'), b.texto);
  assert.equal(c.tinta, 6);
  assert.equal(c.grosor, 3);
  assert.equal(c.texto, undefined);
  assert.deepEqual(poner(m, 'nada'), { puestos: 0, descartados: 0, sinGuia: 0 });
  assert.deepEqual(poner(m, []), { puestos: 0, descartados: 0, sinGuia: 0 });
  sinErrores(m);
});

test('topes: 20 puntos por trazo (se cortan) y 40 trazos por personaje (se van los más viejos)', () => {
  const m = nuevaMaquina();
  const puntos = [];
  for (let i = 0; i < 25; i++) puntos.push(i, i);
  poner(m, [T({ puntos })]);
  assert.equal(guardados(m)[0].puntos.length, 40);
  m.lua(`${D}.quitar()`);
  const tanda = (desde, n) => Array.from({ length: n }, (_, i) => T({ puntos: [desde + i, 1, desde + i, 2] }));
  poner(m, tanda(0, 30));
  poner(m, tanda(30, 15).map((t, i) => (i % 2 ? { ...t, mapa: 1453 } : t)));
  assert.equal(m.lua(`${D}.cuantos()`), 40);
  const primeros = [...guardados(m), ...guardados(m, 1453)].map((t) => t.puntos[0]).sort((a, b) => a - b);
  assert.equal(primeros[0], 5, 'los 5 más viejos se han ido');
  assert.equal(primeros[39], 44);
  sinErrores(m);
});

test('reemplazar: quita los de antes de la IA y pone los nuevos', () => {
  const m = nuevaMaquina();
  poner(m, [T(), T()]);
  poner(m, [T({ tipo: 'flecha' })], { reemplazar: true });
  assert.equal(m.lua(`${D}.cuantos()`), 1);
  assert.equal(guardados(m)[0].tipo, 'flecha');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Pintar
// ---------------------------------------------------------------------------------------------------

test('con el mapa cerrado no se crea ni se toca ninguna textura; al abrirlo en ese mapa, los segmentos; en otro, no', () => {
  const m = nuevaMaquina();
  const antes = m.llamadas('Line:SetStartPoint').length;
  const crear = m.llamadas('CreateLine').length;
  poner(m, [T()]);
  assert.equal(m.llamadas('Line:SetStartPoint').length, antes);
  assert.equal(totalLineas(m), 0);
  assert.equal(m.lua(`${D}.marcos.capa`), undefined);
  abrir(m, 1411);
  const s = segmentos(m);
  assert.equal(s.length, 1);
  assert.ok(s[0].enCapa);
  assert.ok(cerca(s[0].x1, 100) && cerca(s[0].y1, -0.3 * 667) && cerca(s[0].x2, 500) && cerca(s[0].y2, -0.6 * 667), JSON.stringify(s[0]));
  assert.ok(cerca(s[0].grosor, 2));
  assert.deepEqual(s[0].color.slice(0, 3), m.lua(`${D}.TINTAS[2]`));
  assert.equal(m.lua(`${D}.marcos.capa:GetParent() == WorldMapFrame:GetCanvas()`), true);
  assert.equal(botonMapa(m), true);
  abrir(m, 1453);
  assert.equal(segmentos(m).length, 0);
  assert.equal(botonMapa(m), false);
  assert.ok(m.llamadas('CreateLine').length - crear <= 1, 'un Line por segmento a la vista');
  sinErrores(m);
});

test('en el continente se ven los de sus zonas; con zoom, el grosor se divide por la escala', () => {
  const m = nuevaMaquina();
  poner(m, [T({ grosor: 3 })]);
  abrir(m, 1414);
  assert.equal(segmentos(m).length, 1);
  abrir(m, 1411, 2);
  assert.ok(cerca(segmentos(m)[0].grosor, 3), `${segmentos(m)[0].grosor}`); // 6 px / 2
  sinErrores(m);
});

test('flecha: 3 segmentos para 2 puntos; línea de 4 puntos: 3; círculo: 32; marca: el icono de banda, sin líneas', () => {
  const m = nuevaMaquina();
  abrir(m, 1411);
  poner(m, [T({ tipo: 'flecha' })]);
  const f = segmentos(m);
  assert.equal(f.length, 3);
  // Las dos puntas salen del último punto.
  for (const p of f.slice(1)) assert.ok(cerca(p.x1, 500) && cerca(p.y1, -0.6 * 667), JSON.stringify(p));
  poner(m, [T({ puntos: [10, 10, 20, 20, 30, 10, 40, 20] })], { reemplazar: true });
  assert.equal(segmentos(m).length, 3);
  poner(m, [T({ tipo: 'circulo', puntos: [50, 50], radio: 10 })], { reemplazar: true });
  const c = segmentos(m);
  assert.equal(c.length, 32);
  // Centro (500, -333,5); radio 10 % del ancho (100 px) en x y lo mismo en píxeles en y (aspecto del lienzo).
  assert.ok(cerca(c[0].x1, 600) && cerca(c[0].y1, -333.5), JSON.stringify(c[0]));
  assert.ok(cerca(c[8].x1, 500, 1e-3) && cerca(Math.abs(c[8].y1 + 333.5), 100, 1e-3), JSON.stringify(c[8]));
  poner(m, [T({ tipo: 'marca', marca: 3, puntos: [40, 40] })], { reemplazar: true });
  assert.equal(segmentos(m).length, 0);
  const i = iconos(m);
  assert.equal(i.length, 1);
  assert.equal(i[0].textura, 'Interface\\TargetingFrame\\UI-RaidTargetingIcon_3');
  assert.ok(i[0].lienzo && cerca(i[0].x, 400) && cerca(i[0].y, -0.4 * 667), JSON.stringify(i[0]));
  sinErrores(m);
});

test('los marcos se reciclan: nunca más Lines que segmentos a la vista a la vez', () => {
  const m = nuevaMaquina();
  abrir(m, 1411);
  poner(m, [T(), T(), T()]);
  assert.equal(totalLineas(m), 3);
  poner(m, [T()], { reemplazar: true });
  assert.equal(totalLineas(m), 3);
  assert.equal(segmentos(m).length, 1);
  sinErrores(m);
});

test('se repinta al abrir, al cambiar de mapa y de zoom y con SNF_DIBUJOS_CAMBIADOS; con otros avisos, no', () => {
  const m = nuevaMaquina();
  poner(m, [T()]);
  abrir(m, 1411);
  const n = () => m.llamadas('Line:SetStartPoint').length;
  let antes = n();
  m.lua('SnetForever.Eventos.emitir("SNF_PUNTOS_CAMBIADOS", "guia")');
  m.lua('SnetForever.Eventos.emitir("SNF_PASOS_CAMBIADOS")');
  assert.equal(n(), antes);
  m.lua('WorldMapFrame:OnCanvasScaleChanged()');
  assert.ok(n() > antes);
  antes = n();
  m.lua('WorldMapFrame:OnMapChanged()');
  assert.ok(n() > antes);
  antes = n();
  m.lua('SnetForever.Eventos.emitir("SNF_DIBUJOS_CAMBIADOS")');
  assert.ok(n() > antes);
  // Cerrado: nada.
  m.lua('WorldMapFrame:Hide()');
  antes = n();
  poner(m, [T()]);
  m.lua('WorldMapFrame:OnMapChanged()');
  assert.equal(n(), antes);
  sinErrores(m);
});

test('dentro de una instancia no se dibuja nada; en combate sí, sin bloqueos', () => {
  const m = nuevaMaquina();
  poner(m, [T()]);
  m.jugador({ enInstancia: true });
  abrir(m, 1411);
  assert.equal(segmentos(m).length, 0);
  assert.equal(botonMapa(m), false);
  m.jugador({ enInstancia: false, enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.lua('WorldMapFrame:OnMapChanged()');
  assert.equal(segmentos(m).length, 1);
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});

test('texto: tooltip al pasar por la marca o por el primer punto; las líneas no son marcos y no roban clics', () => {
  const m = nuevaMaquina();
  abrir(m, 1411);
  poner(m, [T({ texto: 'Por aquí' }), T({ tipo: 'marca', marca: 1, puntos: [70, 70], texto: 'El jefe' }), T({ tipo: 'marca', puntos: [80, 80] })]);
  const zonas = m.lua(`(function()
    local s = {}
    for _, z in ipairs(${D}.marcos.zonas) do
      if z:IsShown() then
        local _, _, _, x, y = z:GetPoint(1)
        s[#s + 1] = {x = x, y = y, clic = z:IsMouseClickEnabled(), raton = z:IsMouseMotionEnabled()}
      end
    end
    return s
  end)()`) || [];
  assert.equal(zonas.length, 1);
  assert.ok(cerca(zonas[0].x, 100) && cerca(zonas[0].y, -0.3 * 667));
  assert.equal(zonas[0].clic, false);
  assert.equal(zonas[0].raton, true);
  m.lua(`local z = ${D}.marcos.zonas[1]; z:GetScript("OnEnter")(z)`);
  assert.ok(m.lua('BANCO.lineasTooltip()').map(sinColor).some((l) => l.includes('Por aquí')));
  m.lua(`local z = ${D}.marcos.zonas[1]; z:GetScript("OnLeave")(z)`);
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  const marcas = m.lua(`(function()
    local s = {}
    for _, f in ipairs(${D}.marcos.marcas) do
      if f:IsShown() then s[#s + 1] = {clic = f:IsMouseClickEnabled(), raton = f:IsMouseMotionEnabled()} end
    end
    return s
  end)()`);
  assert.deepEqual(marcas, [{ clic: false, raton: true }, { clic: false, raton: false }]);
  m.lua(`local f = ${D}.marcos.marcas[1]; f:GetScript("OnEnter")(f)`);
  assert.ok(m.lua('BANCO.lineasTooltip()').map(sinColor).some((l) => l.includes('El jefe')));
  assert.equal(m.lua(`${D}.marcos.lineas[1]:IsObjectType("Frame")`), false);
  sinErrores(m);
});

test('capa propia: por debajo de los pines y por encima del lienzo', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.PinesMundo.crear()');
  m.lua(`SnetForever.Capa.poner("jugador", ${aLua([{ mapa: 1411, x: 50, y: 25, orden: 1 }])})`);
  poner(m, [T()]);
  abrir(m, 1411);
  const capa = m.lua(`${D}.marcos.capa:GetFrameLevel()`);
  const pin = m.lua('SnetForever.PinesMundo.marcos.pines[1]:GetFrameLevel()');
  const lienzo = m.lua('WorldMapFrame:GetCanvas():GetFrameLevel()');
  assert.ok(capa < pin && capa > lienzo, `${lienzo} < ${capa} < ${pin}`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// ruta = true
// ---------------------------------------------------------------------------------------------------

// Ronda 1 de T1: goto objetivo (un paso de solo goto flecha ya está hecho y se pasa al cargar).
const IR = (mapa, x, y) => ({ t: 'goto', mapa, x, y, modo: 'objetivo' });

test('ruta = true con una guía: una línea por mapa por los próximos pasos; sin guía, descartado', () => {
  const sinGuia = nuevaMaquina();
  assert.deepEqual(poner(sinGuia, [{ ruta: true, tipo: 'linea', tinta: 3, grosor: 2 }]), { puestos: 0, descartados: 1, sinGuia: 1 });
  assert.equal(sinGuia.lua(`${D}.cuantos()`), 0);
  sinErrores(sinGuia);

  const m = nuevaMaquina();
  m.ponerGuia(guiaDePrueba([
    { elementos: [IR(1411, 40, 20)] },
    { elementos: [IR(1411, 50, 30), IR(1411, 60, 40)] },
    { elementos: [IR(1453, 10, 10), IR(1453, 20, 20)] },
  ]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(poner(m, [{ ruta: true, tipo: 'linea', tinta: 3, grosor: 2, texto: 'Tu camino' }]), { puestos: 2, descartados: 0, sinGuia: 0 });
  const [a] = guardados(m);
  assert.deepEqual(a.puntos, [40, 20, 50, 30, 60, 40]);
  assert.equal(a.tinta, 3);
  assert.equal(a.texto, 'Tu camino');
  assert.deepEqual(guardados(m, 1453)[0].puntos, [10, 10, 20, 20]);
  abrir(m, 1411);
  assert.equal(segmentos(m).length, 2);
  sinErrores(m);
});

// 16-nov (en el juego, en Las Mil Agujas; regla del jugador: «mejor sin línea que una por donde no se puede ir»): la línea
// de la ruta va por el camino a pie (RutaPie.tramos) y los tramos sin camino conocido no se dibujan y se cuentan. Durotar
// del banco: wx = -2000 - 50·x, wy = 1800 - 35·y (cada 1 % de x son 50 yd y de y, 35 yd).
const ACEPTA = (q) => ({ t: 'accept', q });
const lineasChat = (m) => (m.lua(`(function()
  local s, t = ${MC}.mensajes, {}
  for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
  return t
end)()`) || []).map(sinColor);

test('16-nov: ruta = true entre dos sitios de misión sin camino conocido: ninguna línea y el chat cuenta el tramo', () => {
  const m = nuevaMaquina();
  // A 800 yd y sin nada entre medias.
  m.ponerGuia(guiaDePrueba([{ elementos: [IR(1411, 10, 10), ACEPTA(7001)] }, { elementos: [IR(1411, 26, 10), ACEPTA(7002)] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(poner(m, [{ ruta: true, tipo: 'linea' }]), { puestos: 0, descartados: 0, sinGuia: 0, sinCamino: 1 });
  assert.equal(m.lua(`${D}.cuantos()`), 0);
  // El aviso del chat lo dice.
  m.lua('SlashCmdList.SNET("chat")');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RESPUESTA", ${aLua({ t: 'respuesta', texto: 'La ruta.', dibujos: [{ ruta: true, tipo: 'linea' }] })})`);
  const nada = lineasChat(m).find((l) => l.startsWith('Nada dibujado en el mapa'));
  assert.ok(nada && nada.includes('1 tramo(s) sin camino conocido'), lineasChat(m).join(' | '));
  sinErrores(m);
});

test('16-nov: ruta = true va por el camino de las guías (no en recta) y un camino de más de 20 puntos sale en varios trazos seguidos', () => {
  const m = nuevaMaquina();
  // Los dos sitios, a 560 yd en vertical; el único camino es un rodeo por (18, 10) y (18, 26) de otra guía de solo ir.
  m.ponerGuia(guiaDePrueba([{ elementos: [IR(1411, 10, 10), ACEPTA(7001)] }, { elementos: [IR(1411, 10, 26), ACEPTA(7002)] }]));
  m.ponerGuia({ ...guiaDePrueba([{ elementos: [IR(1411, 10, 10), IR(1411, 18, 10), IR(1411, 18, 26), IR(1411, 10, 26)] }]), clave: 'Prueba\\rodeo' });
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(poner(m, [{ ruta: true, tipo: 'linea' }]), { puestos: 1, descartados: 0, sinGuia: 0 });
  assert.deepEqual(guardados(m).map((t) => t.puntos), [[10, 10, 18, 10, 18, 26, 10, 26]]);

  // Un camino en zigzag de 51 puntos de paso (de 102 yd cada tramo, sin atajos): varios trazos, cada uno empieza donde acaba el anterior.
  const z = nuevaMaquina();
  const zigzag = Array.from({ length: 51 }, (_, i) => IR(1411, 30 + 2 * (i % 2), 10 + i * 0.6));
  z.ponerGuia(guiaDePrueba([{ elementos: [IR(1411, 30, 10), ACEPTA(7001)] }, { elementos: [IR(1411, 30, 40), ACEPTA(7002)] }]));
  z.ponerGuia({ ...guiaDePrueba([{ elementos: zigzag }]), clave: 'Prueba\\zigzag' });
  z.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  const r = poner(z, [{ ruta: true, tipo: 'linea' }]);
  const trazos = guardados(z).map((t) => t.puntos);
  assert.ok(r.puestos >= 2, JSON.stringify(r));
  for (const t of trazos) assert.ok(t.length <= 40, 'como mucho 20 puntos por trazo');
  for (let i = 1; i < trazos.length; i++) assert.deepEqual(trazos[i].slice(0, 2), trazos[i - 1].slice(-2), 'seguidos');
  assert.deepEqual(trazos[0].slice(0, 2), [30, 10]);
  assert.deepEqual(trazos.at(-1).slice(-2), [30, 40]);
  sinErrores(m);
  sinErrores(z);
});

// ---------------------------------------------------------------------------------------------------
// Quitar dibujos: chat y mapa
// ---------------------------------------------------------------------------------------------------

test('«Quitar dibujos» del chat: solo activo con dibujos; los quita todos y repinta', () => {
  const m = nuevaMaquina();
  m.lua('SlashCmdList.SNET("chat")');
  assert.equal(m.lua(`${MC}.quitarDibujos:IsEnabled()`), false);
  abrir(m, 1411);
  poner(m, [T(), T({ mapa: 1453 })]);
  assert.equal(m.lua(`${MC}.quitarDibujos:IsEnabled()`), true);
  assert.equal(segmentos(m).length, 1);
  m.lua(`${MC}.quitarDibujos:Click()`);
  assert.equal(m.lua(`${D}.cuantos()`), 0);
  assert.equal(segmentos(m).length, 0);
  assert.equal(m.lua(`${MC}.quitarDibujos:IsEnabled()`), false);
  const ultima = sinColor(m.lua(`(function() local s = ${MC}.mensajes; return (s:GetMessageInfo(s:GetNumMessages())) end)()`));
  assert.equal(ultima, m.lua('SnetForever.L.t("CHAT_DIBUJOS_QUITADOS")'));
  sinErrores(m);
});

test('botón «Quitar dibujos» del mapa: hijo de WorldMapFrame, solo con dibujos en el mapa abierto; los quita todos', () => {
  const m = nuevaMaquina();
  abrir(m, 1411);
  assert.equal(botonMapa(m), false);
  poner(m, [T(), T({ mapa: 1453 })]);
  assert.equal(botonMapa(m), true);
  assert.equal(m.lua(`${D}.marcos.boton:GetParent() == WorldMapFrame`), true);
  assert.equal(m.lua(`${D}.marcos.boton:IsObjectType("Button")`), true);
  m.lua(`${D}.marcos.boton:Click()`);
  assert.equal(m.lua(`${D}.cuantos()`), 0);
  assert.equal(segmentos(m).length, 0);
  assert.equal(botonMapa(m), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// OpenMap
// ---------------------------------------------------------------------------------------------------

function conOpenMap(m, { cosido = true, arteArriba = 5000 } = {}) {
  m.lua(`OpenMapAPI = {
    llamadas = {}, avisos = {},
    IsStitched = function() return ${cosido} end,
    ArtTopLevel = function() return ${arteArriba} end,
    CanvasFromWorldPos = function(c, a, b)
      table.insert(OpenMapAPI.llamadas, {c, a, b})
      return 0.3, 0.6
    end,
    RegisterCallback = function(dueno, evento, metodo) OpenMapAPI.avisos[evento] = metodo end,
  }`);
}

test('con OpenMap cosido falso: se colocan con su API y por encima de su dibujo; si su API falla, cálculo normal', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.PinesMundo.crear()');
  conOpenMap(m);
  poner(m, [T()]);
  abrir(m, 1411);
  const s = segmentos(m);
  assert.equal(s.length, 1);
  assert.ok(cerca(s[0].x1, 300) && cerca(s[0].y1, -0.6 * 667), JSON.stringify(s[0]));
  const w = m.lua('SnetForever.Coord.aMundo({mapa = 1411, x = 10, y = 30})');
  assert.ok(m.lua('OpenMapAPI.llamadas').some((ll) => cerca(ll[1], w.wy) && cerca(ll[2], w.wx)));
  assert.ok(m.lua(`${D}.marcos.capa:GetFrameLevel()`) > 5000);
  assert.ok(m.lua(`${D}.marcos.boton:GetFrameLevel()`) > 5000);
  // Mueve su vista: se repinta (por el aviso de OpenMap que ya engancharon los pines).
  const antes = m.llamadas('Line:SetStartPoint').length;
  m.lua('OpenMapAPI.CanvasFromWorldPos = function() return 0.35, 0.6 end');
  m.lua('OpenMapAPI.avisos.OpenMap_ViewChanged("OpenMap_ViewChanged")');
  assert.ok(m.llamadas('Line:SetStartPoint').length > antes);
  // Su API falla: cálculo normal.
  m.lua('OpenMapAPI.CanvasFromWorldPos = function() error("roto") end; WorldMapFrame:OnMapChanged()');
  const n = segmentos(m);
  assert.ok(cerca(n[0].x1, 100) && cerca(n[0].y1, -0.3 * 667), JSON.stringify(n[0]));
  m.lua('OpenMapAPI.ArtTopLevel = function() error("roto") end; WorldMapFrame:OnMapChanged()');
  assert.equal(segmentos(m).length, 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Mensaje del buzón
// ---------------------------------------------------------------------------------------------------

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const TIMBRES = ['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar', 'vivo_a', 'vivo_b', 'presente'];
const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;
function carpetaConBuzon(buzon) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-dibujos-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever', 'senales'), { recursive: true });
  for (const t of TIMBRES) writeFileSync(join(dir, 'SnetForever', 'senales', `${t}.wav`), '');
  const r = nombreRanura(1);
  mkdirSync(join(dir, r), { recursive: true });
  writeFileSync(join(dir, r, `${r}.toc`), `## Interface: 16001\n## Title: SnetForever - Respuestas 001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\nbuzon.lua\n`);
  writeFileSync(join(dir, r, 'buzon.lua'), `SNF_BUZON = ${aLua(buzon)}\n`);
  return dir;
}

test('un mensaje del buzón con dibujos: se ponen solos y sale la línea en el chat', () => {
  const pj = (() => { const n = nuevaMaquina(); const c = n.lua('SnetForever.Personaje.clave()'); n.cerrar(); return c; })();
  const dir = carpetaConBuzon({
    v: 1, seq: 7, registros: [{
      seq: 7, pj, msg: 'tati-7', t: 'respuesta', origen: 'tati', texto: 'Te lo dibujo.',
      dibujos: [T({ texto: 'Por aquí' }), T({ tipo: 'marca', marca: 8, puntos: [70, 70], texto: 'El jefe' }), T({ tipo: 'nada' })],
    }],
  });
  const m = crearMaquina({ addonsDir: dir, entrar: false, ...ES });
  try {
    m.lua('SlashCmdList.SNET("chat")');
    m.lua('SnetForever.Buzon.cargar("timbre")');
    assert.equal(m.lua(`${D}.cuantos()`), 2);
    assert.equal(m.lua(`${MC}.quitarDibujos:IsEnabled()`), true);
    const lineas = (m.lua(`(function()
      local s, t = ${MC}.mensajes, {}
      for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
      return t
    end)()`) || []).map(sinColor);
    const linea = lineas.find((l) => l.startsWith('Dibujado en el mapa: 2 trazo(s)'));
    assert.ok(linea, lineas.join(' | '));
    assert.ok(linea.includes('Por aquí') && linea.includes('El jefe'), linea);
    sinErrores(m);
  } finally { m.cerrar(); }
});

// ---------------------------------------------------------------------------------------------------
// /reload
// ---------------------------------------------------------------------------------------------------

test('/reload: los dibujos siguen (lo guardado) y se pintan al abrir el mapa', () => {
  const m = nuevaMaquina();
  poner(m, [T({ tipo: 'flecha' }), T({ mapa: 1453 })]);
  const n = m.recargar();
  assert.equal(n.lua(`${D}.cuantos()`), 2);
  n.lua(`${D}.crear()`);
  abrir(n, 1411);
  assert.equal(segmentos(n).length, 3);
  sinErrores(n);
  n.cerrar();
});

test('lo guardado roto no da error: se salta al pintar y no cuenta', () => {
  const m = nuevaMaquina({ guardado: { SnetForeverPJ: { dibujos: { v: 1, porMapa: { 1411: [5, { tipo: 'linea', puntos: 'x' }, { dueno: 'IA', tipo: 'linea', tinta: 1, grosor: 1, puntos: [1, 1, 2, 2], fecha: 1 }] } } } } });
  abrir(m, 1411);
  assert.equal(segmentos(m).length, 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Revisión de la rama
// ---------------------------------------------------------------------------------------------------

test('revisión: ruta = true que va de A a B y vuelve a A da un trazo por tramo seguido, sin unir los puntos de A', () => {
  const m = nuevaMaquina();
  m.ponerGuia(guiaDePrueba([
    { elementos: [IR(1411, 40, 20)] },
    { elementos: [IR(1411, 50, 30)] },
    { elementos: [IR(1453, 10, 10), IR(1453, 20, 20)] },
    { elementos: [IR(1411, 60, 40)] },
    { elementos: [IR(1411, 70, 50)] },
  ]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.deepEqual(poner(m, [{ ruta: true, tipo: 'linea' }]), { puestos: 3, descartados: 0, sinGuia: 0 });
  assert.deepEqual(guardados(m).map((t) => t.puntos), [[40, 20, 50, 30], [60, 40, 70, 50]]);
  assert.deepEqual(guardados(m, 1453).map((t) => t.puntos), [[10, 10, 20, 20]]);
  sinErrores(m);
});

test('revisión: con OpenMap cosido, un OpenMap_ViewChanged sin cambios no repinta; con la vista movida, sí; una sola tabla de punto', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.PinesMundo.crear()');
  conOpenMap(m);
  m.lua(`OpenMapAPI.puntos = {}
    local de = SnetForever.PinesMundo.sitioDe
    SnetForever.PinesMundo.sitioDe = function(api, p, abierto) OpenMapAPI.puntos[p] = true; return de(api, p, abierto) end`);
  poner(m, [T(), T({ tipo: 'circulo', puntos: [50, 50], radio: 5 })]);
  abrir(m, 1411);
  const aviso = () => m.lua('OpenMapAPI.avisos.OpenMap_ViewChanged("OpenMap_ViewChanged")');
  aviso();
  const antes = m.llamadas('Line:SetStartPoint').length;
  aviso();
  aviso();
  assert.equal(m.llamadas('Line:SetStartPoint').length, antes, 'nada cambió: no se repinta');
  m.lua('OpenMapAPI.CanvasFromWorldPos = function() return 0.4, 0.6 end');
  aviso();
  assert.ok(m.llamadas('Line:SetStartPoint').length > antes, 'la vista se movió: se repinta');
  assert.equal(m.lua('(function() local n = 0; for _ in pairs(OpenMapAPI.puntos) do n = n + 1 end; return n end)()'), 1);
  // Otro trazo (SNF_DIBUJOS_CAMBIADOS) sí repinta aunque la vista sea la misma.
  const ya = m.llamadas('Line:SetStartPoint').length;
  poner(m, [T({ puntos: [20, 20, 30, 30] })]);
  assert.ok(m.llamadas('Line:SetStartPoint').length > ya);
  sinErrores(m);
});

test('revisión: sin SetMouseClickEnabled (cliente sin él) no hay zona del tooltip y las marcas no se quedan los clics', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.sinMetodo("SetMouseClickEnabled")');
  abrir(m, 1411);
  poner(m, [T({ texto: 'Por aquí' }), T({ tipo: 'marca', puntos: [70, 70], texto: 'El jefe' })]);
  assert.ok(segmentos(m).length > 0);
  const vistos = m.lua(`(function()
    local z, mm = 0, {}
    for _, f in ipairs(${D}.marcos.zonas) do if f:IsShown() then z = z + 1 end end
    for _, f in ipairs(${D}.marcos.marcas) do if f:IsShown() then mm[#mm + 1] = f:IsMouseEnabled() end end
    return {zonas = z, marcas = mm}
  end)()`);
  assert.equal(vistos.zonas, 0);
  assert.deepEqual(vistos.marcas, [false]);
  sinErrores(m);
});

test('revisión: la línea del chat dice los trazos sin dibujar (ruta sin guía activa) y no deja un «|» impar antes de «…»', () => {
  const pj = (() => { const n = nuevaMaquina(); const c = n.lua('SnetForever.Personaje.clave()'); n.cerrar(); return c; })();
  const dir = carpetaConBuzon({
    v: 1, seq: 7, registros: [
      { seq: 7, pj, msg: 'tati-7', t: 'respuesta', origen: 'tati', texto: 'Te lo dibujo.',
        dibujos: [T({ texto: `${'x'.repeat(39)}||yyyy` }), { ruta: true, tipo: 'linea' }] },
      { seq: 8, pj, msg: 'tati-8', t: 'respuesta', origen: 'tati', texto: 'Y la ruta.', dibujos: [{ ruta: true, tipo: 'linea' }] },
    ],
  });
  const m = crearMaquina({ addonsDir: dir, entrar: false, ...ES });
  try {
    m.lua('SlashCmdList.SNET("chat")');
    m.lua('SnetForever.Buzon.cargar("timbre")');
    const lineas = (m.lua(`(function()
      local s, t = ${MC}.mensajes, {}
      for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
      return t
    end)()`) || []).map(sinColor);
    const una = lineas.find((l) => l.startsWith('Dibujado en el mapa: 1 trazo(s)'));
    assert.ok(una, lineas.join(' | '));
    assert.ok(una.includes(`${'x'.repeat(39)}…`) && !una.includes('|…'), una);
    assert.ok(una.includes('1 sin dibujar: no hay guía activa'), una);
    const nada = lineas.find((l) => l.startsWith('Nada dibujado en el mapa'));
    assert.ok(nada && nada.includes('1 sin dibujar: no hay guía activa'), lineas.join(' | '));
    sinErrores(m);
  } finally { m.cerrar(); }
});
