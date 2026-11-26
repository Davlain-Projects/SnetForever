// Lote C (revisión 52, Minor 8): la ventana numera los pasos que ve ese personaje (1, 2, 3…), no el `n` de los datos,
// que cuenta también los de otras razas o clases. «Paso N» de la cabecera, de la lista, de la flecha, de los pines y del
// aviso de fallo usan ese mismo número. Los ids y el `n` que guardan el progreso no cambian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const VIGILADO = ['ui/ventana.lua', 'mapa/navegacion.lua', 'ui/fallo.lua', 'ui/panel.lua', 'motor/pasos.lua'];

const MANUAL = (texto) => ({ t: 'manual', texto: { en: texto, es: texto } });
const IR = (x, y) => ({ t: 'goto', mapa: 1411, x, y, modo: 'flecha' });

// Seis pasos de datos (n = 1…6); el 2 y el 4 son de mago y el orco guerrero del banco no los ve.
const PASOS = [
  { elementos: [MANUAL('Uno')] },
  { filtro: [['c:MAGE']], elementos: [MANUAL('Dos, de mago')] },
  { elementos: [MANUAL('Tres')] },
  { filtro: [['c:MAGE']], elementos: [MANUAL('Cuatro, de mago')] },
  { elementos: [IR(40, 60), MANUAL('Cinco')] },
  { elementos: [MANUAL('Seis')] },
];

function conGuia() {
  const m = nuevaMaquina({ jugador: { idioma: 'esES', mapa: 1411, x: 50, y: 50 }, vigilarSecretos: VIGILADO });
  m.ponerGuia(guiaDePrueba(PASOS));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  m.avanzar(0.3);
  return m;
}

const numeros = (m) => m.lua(`(function() local t = {} for i, fs in ipairs(${M}.siguientesNumeros) do t[i] = fs:GetText() end return t end)()`) || [];
// T4: al lado del número de la lista, el de la guía entera («· guía n»).
const guias = (m) => m.lua(`(function() local t = {} for i, fs in ipairs(${M}.siguientesGuias) do t[i] = fs:GetText() end return t end)()`) || [];
const sinColor = (s) => s.replace(/\|c\w{8}/g, '').replace(/\|r/g, '');
const pestana = (m) => sinColor(m.lua(`${M}.pasos[1].pestana.texto:GetText()`));

test('lote C (52-M8): la lista y la cabecera numeran los pasos que ve el personaje, sin huecos', () => {
  const m = conGuia();
  // Los datos llevan n = 1, 3, 5, 6 para este personaje; la ventana enseña 1, 2, 3, 4.
  assert.deepEqual(m.lua('(function() local t = {} for i = 1, 4 do t[i] = SnetForever.Motor.paso(i).n end return t end)()'), [1, 3, 5, 6]);
  assert.equal(pestana(m), 'Paso 1 · guía 1');
  assert.deepEqual(numeros(m).slice(0, 4), ['01', '02', '03', '04']);
  assert.deepEqual(guias(m).slice(0, 4), ['· guía 1', '· guía 3', '· guía 5', '· guía 6'], 'T4: y el de la guía entera');
  m.lua('SnetForever.Motor.irA(3)');
  m.avanzar(0.3);
  assert.equal(pestana(m), 'Paso 3 · guía 5', 'el paso con n = 5 es el tercero que ve');
  // El progreso sigue guardando el id (y el n de los datos), no el número de la ventana.
  assert.equal(m.lua('SnetForever.Motor.paso(3).id'), 'p5');
  sinErrores(m);
});

// T4: el número grande sigue siendo el del personaje; al lado va el de la guía entera, pequeño y en gris: «05 · guía 10».
test('T4: la lista y la pestaña enseñan «· guía n», pequeño y en gris, al lado del número del personaje', () => {
  const m = conGuia();
  m.lua('SnetForever.Motor.irA(4)');
  m.avanzar(0.3);
  const t = `${M}.tarjetasLista[${M}.listaActiva]`;
  assert.equal(m.lua(`${t}.numero:GetText()`), '04');
  assert.equal(m.lua(`${t}.guia:GetText()`), '· guía 6');
  // Más pequeño que el número y en gris (secundario).
  assert.ok(m.lua(`select(2, ${t}.guia:GetFont())`) < m.lua(`select(2, ${t}.numero:GetFont())`));
  assert.deepEqual(m.lua(`{${t}.guia:GetTextColor()}`).slice(0, 3), m.lua('SnetForever.Estilo.color("secundario")').slice(0, 3));
  // «04 · guía 6»: el de la guía abajo a la derecha y el número justo a su izquierda.
  assert.deepEqual(m.lua(`{${t}.guia:GetPoint(1)}`).filter((v) => typeof v !== 'object'), ['BOTTOMRIGHT', 'BOTTOMRIGHT', -4, 3]);
  assert.equal(m.lua(`(function() local a, rel, b = ${t}.numero:GetPoint(1) return a == "BOTTOMRIGHT" and rel == ${t}.guia and b == "BOTTOMLEFT" end)()`), true);
  // La pestaña: «Paso 4 · guía 6», con «· guía 6» en gris.
  const crudo = m.lua(`${M}.pasos[1].pestana.texto:GetText()`);
  assert.equal(sinColor(crudo), 'Paso 4 · guía 6');
  assert.match(crudo, /^Paso 4 \|c[0-9A-Fa-f]{8}· guía 6\|r$/);
  sinErrores(m);
});

// Ronda 1 de T4 (M3): «· guía n» tiene un ancho fijo (el del más largo), así el número del personaje queda en columna;
// también si el último paso de la lista no trae n.
test('T4 (ronda 1): «· guía n» con ancho fijo en todas las tarjetas, aunque el último paso no traiga n', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'esES', mapa: 1411, x: 50, y: 50 }, vigilarSecretos: VIGILADO });
  const pasos = Array.from({ length: 12 }, (_, k) => ({ elementos: [MANUAL(`Paso ${k + 1}`)] }));
  pasos[11] = { ...pasos[11], n: undefined };
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 12)');
  m.lua('SnetForever.Motor.irA(8)');
  m.avanzar(0.3);
  const anchos = m.lua(`(function() local t = {} for i, fs in ipairs(${M}.siguientesGuias) do t[i] = fs:GetWidth() end return t end)()`);
  assert.ok(anchos.length >= 3, JSON.stringify(anchos));
  assert.ok(anchos.every((a) => a > 0 && a === anchos[0]), JSON.stringify(anchos));
  assert.ok(guias(m).includes('· guía 11'), JSON.stringify(guias(m)));
  sinErrores(m);
});

test('lote C (52-M8): la flecha, el pin y el aviso de fallo dicen el mismo «Paso N» que la ventana', () => {
  const m = conGuia();
  m.lua('SnetForever.Motor.irA(3)');
  m.avanzar(0.3);
  const punto = m.lua('SnetForever.Navegacion.destino().punto');
  assert.equal(punto.orden, 3, JSON.stringify(punto));
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0)');
  assert.match(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), /Paso 3/);
  m.lua('SnetForever.Fallo.abrir()');
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Paso 3: /);
  // El aviso guarda el n de los datos (para buscar el paso) y además el número que vio el jugador.
  m.lua('SnetForever.Fallo.guardar("No sale")');
  const aviso = m.lua('SnetForeverCuenta.fallos[1]');
  assert.equal(aviso.n, 5);
  assert.equal(aviso.paso, 'p5');
  sinErrores(m);
});

test('lote C (52-M8): en «Pasos saltados», un paso de la guía cargada lleva el número de la ventana', () => {
  const m = conGuia();
  m.lua('SnetForever.Motor.saltar(3)');
  m.avanzar(0.3);
  assert.equal(m.lua('SnetForeverPJ.saltados[1].n'), 5, 'lo guardado no cambia');
  assert.equal(m.lua(`SnetForever.Motor.numero(${aLua(CLAVE)}, "p5")`), 3);
  assert.equal(m.lua('SnetForever.Motor.numero("Otra\\\\guía", "p5")'), undefined);
  m.lua('SlashCmdList.SNET("")');
  m.lua('SnetForever.Panel.elegir("saltados")');
  const filas = m.lua(`(function() local t = {} for i, f in ipairs(SnetForever.Panel.marcos.saltados) do
    if f:IsShown() then t[#t + 1] = f.t1:GetText() end end return t end)()`) || [];
  assert.ok(filas.some((t) => t.startsWith('Paso 3: ')), JSON.stringify(filas));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1 (revisión del lote C, Importante 1): el número cuenta solo los pasos que la lista de la ventana enseña de
// verdad: sin los `optional` ni los `hidewindow` (ni los de otra raza o clase). Un paso que no sale en la lista no tiene
// número: su cabecera va sin pestaña, la flecha sin «Paso N» y los textos lo dicen sin número.
// ---------------------------------------------------------------------------------------------------

const PASOS_R1 = [
  { elementos: [MANUAL('Uno')] }, // p1 -> 1
  { filtro: [['c:MAGE']], elementos: [MANUAL('De mago')] }, // p2: otra clase
  { etiquetas: { optional: true }, elementos: [MANUAL('Opcional')] }, // p3: sin número
  { elementos: [MANUAL('Dos')] }, // p4 -> 2
  { etiquetas: { hidewindow: true }, elementos: [MANUAL('Escondido')] }, // p5: sin número
  { elementos: [IR(40, 60), MANUAL('Tres')] }, // p6 -> 3
  { elementos: [MANUAL('Cuatro')] }, // p7 -> 4
];

function conGuiaR1() {
  const m = nuevaMaquina({ jugador: { idioma: 'esES', mapa: 1411, x: 50, y: 50 },
    vigilarSecretos: [...VIGILADO, 'ia/contexto.lua'] });
  m.ponerGuia(guiaDePrueba(PASOS_R1));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  m.lua(`${V}.crear()`);
  m.avanzar(0.3);
  return m;
}
const indiceDe = (m, id) => m.lua(`(function() local i = 1 while SnetForever.Motor.paso(i) do
  if SnetForever.Motor.paso(i).id == ${aLua(id)} then return i end i = i + 1 end end)()`);

test('ronda 1 (52-M8): los pasos optional y hidewindow no cuentan: la lista sale 01, 02, 03, 04', () => {
  const m = conGuiaR1();
  assert.deepEqual(numeros(m).slice(0, 4), ['01', '02', '03', '04']);
  const numerosMotor = m.lua(`(function() local t = {} local i = 1 while SnetForever.Motor.paso(i) do
    local pv = SnetForever.Motor.paso(i) t[#t + 1] = pv.id .. "=" .. tostring(pv.numero) i = i + 1 end return t end)()`);
  assert.deepEqual(numerosMotor, ['p1=1', 'p3=nil', 'p4=2', 'p5=nil', 'p6=3', 'p7=4']);
  sinErrores(m);
});

test('ronda 1 (52-M8): cabecera, flecha, fallo e IA dicen el número de la lista', () => {
  const m = conGuiaR1();
  m.lua(`SnetForever.Motor.irA(${indiceDe(m, 'p6')})`);
  m.avanzar(0.3);
  assert.equal(pestana(m), 'Paso 3 · guía 6');
  assert.equal(m.lua('SnetForever.Navegacion.destino().punto.orden'), 3);
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0)');
  assert.match(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), /Paso 3/);
  m.lua('SnetForever.Fallo.abrir()');
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Paso 3: /);
  assert.equal(m.lua('SnetForever.Contexto.construir().guia.n'), 3, 'la IA recibe el número de la ventana');
  sinErrores(m);
});

test('ronda 1 (52-M8): un paso optional activo va sin pestaña ni número, y la IA no recibe n', () => {
  const m = conGuiaR1();
  m.lua(`SnetForever.Motor.irA(${indiceDe(m, 'p3')})`);
  m.avanzar(0.3);
  assert.equal(m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).id'), 'p3');
  assert.equal(m.lua(`${M}.pasos[1].pestana:IsShown()`), false);
  assert.equal(m.lua('SnetForever.Contexto.construir().guia.n'), undefined);
  m.lua('SnetForever.Fallo.abrir()');
  assert.match(m.lua('SnetForeverFallo.etiquetaPaso:GetText()'), /^Paso sin número: /);
  sinErrores(m);
});

// Ronda 1: con los datos reales. «01-06 Shadowglen» (A) tiene el paso 425bb3ee (n = 34, optional) entre el 33 y el 35:
// la lista de una elfa de la noche no salta ningún número alrededor de él.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOCS = [join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'), join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc')];
const conReales = { skip: !TOCS.every(existsSync) && 'faltan los datos reales' };

test('ronda 1 (52-M8), datos reales: en Shadowglen, alrededor del paso optional, la lista sale seguida', conReales, () => {
  const SHADOWGLEN = 'RestedXP Forever Guide (A)\\01-06 Shadowglen';
  const m = nuevaMaquina({ datos: TOCS, vigilarSecretos: VIGILADO,
    jugador: { idioma: 'esES', clase: 'DRUID', raza: 'NightElf', faccion: 'Alliance', nivel: 2 } });
  m.lua(`SnetForever.Guias.cargar(${aLua(SHADOWGLEN)})`);
  m.lua(`${V}.crear()`);
  const i = indiceDe(m, '425bb3ee');
  assert.ok(i > 1, 'el paso optional está en la guía de este personaje');
  assert.equal(m.lua(`SnetForever.Motor.paso(${i}).numero`), undefined, 'el optional no tiene número');
  // Todos los pasos con número van seguidos: 1, 2, 3… sin saltos en toda la guía.
  const todos = m.lua(`(function() local t = {} local k = 1 while SnetForever.Motor.paso(k) do
    local n = SnetForever.Motor.paso(k).numero if n then t[#t + 1] = n end k = k + 1 end return t end)()`);
  assert.ok(todos.length > 20, `${todos.length} pasos con número`);
  assert.deepEqual(todos, todos.map((_, k) => k + 1));
  // En la ventana, con la lista colocada antes del optional: las tarjetas que lo rodean van seguidas y cada número es
  // el del motor (el optional no sale).
  m.lua(`SnetForever.Motor.irA(${i - 3})`);
  m.avanzar(0.3);
  const indices = m.lua(`${M}.siguientesPasos`) || [];
  assert.ok(indices.some((k) => k < i) && indices.some((k) => k > i), JSON.stringify(indices));
  assert.ok(!indices.includes(i), 'el optional no sale en la lista');
  const vistos = numeros(m).slice(0, indices.length).map(Number);
  for (let k = 1; k < vistos.length; k++) assert.equal(vistos[k], vistos[k - 1] + 1, JSON.stringify(vistos));
  sinErrores(m);
});
