// Tarea 14 de la fase 3 (fundida en la D3): en la ventana, el menú con las secciones de guías laterales (cadenas de
// clase, profesiones y mazmorras), «Volver a <guía>» siempre que haya una guía a la que volver y la marca «sin
// verificar» en la cabecera y en el paso. Usa los fixtures de las tareas 12 y 13 (laterales-mini.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGuideDetails as nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';
import { comprobarLua51 } from '../src/comprobar-lua51.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, '..', 'fixtures');
const ADDON = join(AQUI, '..', '..', '..', 'addons', 'SnetForever');
const DATOS = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'laterales-mini.lua')];

const OSO = 'Cadenas de clase (H)\\druida-oso';
const INICIO = 'Prueba (H)\\01-02 Inicio';
const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 };
const GUERRERO = { clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 10 };
const EN = { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } };

const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;

function conVentana(jugador = DRUIDA, extra = {}) {
  const m = nuevaMaquina({ datos: DATOS, jugador, ...extra });
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  m.lua(`${V}.crear()`);
  return m;
}

const abrirGuias = (m) => m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');
const filasMenu = (m) => m.lua(`(function() local t = {}
  for _, f in ipairs(${M}.menu.filas) do if f:IsVisible() then t[#t + 1] = f.texto:GetText() end end
  return t end)()`) || [];
function pulsarMenu(m, buscado) {
  const ok = m.lua(`(function()
    for _, fila in ipairs(${M}.menu.filas) do
      if fila:IsVisible() and fila.texto:GetText() == ${aLua(buscado)} then fila:Click(); return true end
    end
    return false
  end)()`);
  assert.ok(ok, `no hay en el menú una fila «${buscado}»: ${filasMenu(m).join(' | ')}`);
}
const texto = (m, expr) => m.lua(`${expr}:GetText()`);
const visible = (m, expr) => m.lua(`${expr}:IsVisible()`);

// Todos los textos visibles de la ventana (sus piezas y el bloque activo).
const textos = (m, raiz = 'SnetForeverVentana') => m.lua(`(function()
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
end)()`) || [];

test('menú: un druida tauren ve las tres secciones (cadenas, profesiones y mazmorras); un guerrero, sin «Cadenas de clase»', () => {
  const m = conVentana();
  abrirGuias(m);
  const filas = filasMenu(m);
  for (const s of ['Cadenas de clase', 'Profesiones', 'Mazmorras']) assert.ok(filas.includes(s), `${s}: ${filas.join(' | ')}`);
  // Van después de los grupos de la versión.
  assert.ok(filas.indexOf('Prueba (H)') < filas.indexOf('Cadenas de clase'), filas.join(' | '));
  // Se pliegan: abrir «Cadenas de clase» enseña la del oso.
  assert.ok(!filas.includes('Druida: Forma de oso'), 'empiezan cerradas');
  pulsarMenu(m, 'Cadenas de clase');
  assert.ok(filasMenu(m).includes('Druida: Forma de oso'), filasMenu(m).join(' | '));
  const g = conVentana(GUERRERO);
  abrirGuias(g);
  const filasG = filasMenu(g);
  assert.ok(!filasG.includes('Cadenas de clase'), filasG.join(' | '));
  assert.ok(filasG.includes('Profesiones') && filasG.includes('Mazmorras'), filasG.join(' | '));
  sinErrores(m);
  sinErrores(g);
});

test('pulsar la cadena la carga (abrirLateral), cierra el menú, deja volverA y enseña «Volver a 1-2 Inicio» sin acabar; «Volver» vuelve al mismo n', () => {
  const m = conVentana();
  m.lua('SnetForever.Motor.irA(3)');
  assert.equal(m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n'), 3);
  assert.equal(visible(m, `${M}.estado`), false, 'sin guía a la que volver, sin tarjeta de estado');
  m.lua(`SnetForever.ABRIR = {}
  hooksecurefunc(SnetForever.Guias, "abrirLateral", function(c) table.insert(SnetForever.ABRIR, c) end)`);
  abrirGuias(m);
  pulsarMenu(m, 'Cadenas de clase');
  pulsarMenu(m, 'Druida: Forma de oso');
  assert.deepEqual(m.lua('SnetForever.ABRIR'), [OSO]);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), OSO);
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), false);
  assert.equal(m.lua('SnetForeverPJ.volverA'), INICIO);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  assert.equal(texto(m, `${M}.estado.volver.texto`), 'Volver a 1-2 Inicio (paso 3)');
  assert.equal(visible(m, `${M}.estado.mensaje`), false, 'no ha acabado: sin mensaje de fin');
  // The active and inactive guides use the primary and secondary theme colors.
  abrirGuias(m);
  assert.ok(filasMenu(m).includes('Druida: Forma de oso'), filasMenu(m).join(' | '));
  const color = (t) => m.lua(`(function() for _, f in ipairs(${M}.menu.filas) do
    if f:IsVisible() and f.texto:GetText() == ${aLua(t)} then return {f.texto:GetTextColor()} end end end)()`).slice(0, 3);
  assert.deepEqual(color('Druida: Forma de oso'), [245 / 255, 232 / 255, 212 / 255]);
  pulsarMenu(m, 'Prueba (H)');
  assert.deepEqual(color('1-2 Inicio'), [203 / 255, 190 / 255, 177 / 255]);
  m.lua(`${V}.cerrarMenu()`);
  // «Volver» carga la principal en el mismo paso.
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  assert.equal(m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n'), 3);
  assert.equal(m.lua('SnetForeverPJ.volverA'), undefined);
  assert.equal(visible(m, `${M}.estado`), false);
  sinErrores(m);
});

test('F3-23: una marca a mano en la principal sigue tras abrir una lateral y «Volver»; elegir la guía en el selector la borra', () => {
  const m = conVentana();
  m.lua('SnetForever.Motor.irA(2)');
  const marca = () => m.lua(`${M}.pasos[1].casillas[1].marca:IsShown()`);
  assert.equal(marca(), false);
  m.lua(`${M}.pasos[1].casillas[1]:Click()`);
  assert.equal(marca(), true, 'marcada a mano');
  abrirGuias(m);
  pulsarMenu(m, 'Cadenas de clase');
  pulsarMenu(m, 'Druida: Forma de oso');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), OSO);
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), INICIO);
  assert.equal(m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n'), 2);
  assert.equal(marca(), true, 'la marca sigue en su paso');
  // Pulsar la casilla ya marcada la desmarca; otra vez la marca.
  m.lua(`${M}.pasos[1].casillas[1]:Click()`);
  assert.equal(marca(), false);
  m.lua(`${M}.pasos[1].casillas[1]:Click()`);
  assert.equal(marca(), true);
  // Cargarla a mano desde el selector es empezar de cero: sus marcas se borran.
  abrirGuias(m);
  pulsarMenu(m, 'Prueba (H)');
  pulsarMenu(m, '1-2 Inicio');
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(marca(), false, 'el selector borra las marcas de esa guía');
  sinErrores(m);
});

test('el tramo de la cadena acaba en «· sin verificar» (amarillo); el de la principal, no', () => {
  const m = conVentana();
  assert.equal(texto(m, `${M}.tramo`), 'Nivel 1-2');
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)})`);
  assert.equal(texto(m, `${M}.tramo`), 'Nivel 10-10 · |cFFFFD040sin verificar|r');
  assert.equal(texto(m, `${M}.titulo`), 'Druida: Forma de oso');
  sinErrores(m);
});

test('el paso 2 de la cadena enseña «sin verificar: orden deducido» en amarillo antes de los requisitos; en inglés, «unverified: order inferred»', () => {
  const m = conVentana();
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)})`);
  assert.equal(m.lua(`${M}.pasos[1].sinVerificar`), undefined, 'el paso 1 está verificado');
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(texto(m, `${M}.pasos[1].sinVerificar`), '|cFFFFD040sin verificar: orden deducido|r');
  assert.equal(visible(m, `${M}.pasos[1].sinVerificar`), true);
  // Va después de las líneas del paso (y antes de los requisitos, si los hay).
  const ultimaLinea = m.lua(`select(5, ${M}.pasos[1].lineas[#${M}.pasos[1].lineas]:GetPoint(1))`);
  assert.ok(m.lua(`select(5, ${M}.pasos[1].sinVerificar:GetPoint(1))`) < ultimaLinea);
  const en = conVentana(DRUIDA, EN);
  en.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)}); SnetForever.Motor.irA(2)`);
  assert.equal(texto(en, `${M}.pasos[1].sinVerificar`), '|cFFFFD040unverified: order inferred|r');
  assert.equal(texto(en, `${M}.tramo`), 'Level 10-10 · |cFFFFD040unverified|r');
  // Un paso con sinVerificar = "punto".
  m.lua(`SNF_MISIONES.guias[${aLua(OSO)}].pasos[3].sinVerificar = "punto"; SnetForever.Guias.cargar(${aLua(OSO)}); SnetForever.Motor.irA(3)`);
  assert.equal(texto(m, `${M}.pasos[1].sinVerificar`), '|cFFFFD040sin verificar: sin coordenadas en la base|r');
  sinErrores(m);
  sinErrores(en);
});

test('ningún texto de la ventana ni del menú contiene «.0» (salvo la versión fija del pie) y la versión es la 0.7.0', () => {
  const m = conVentana();
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)}); SnetForever.Motor.irA(2)`);
  abrirGuias(m);
  for (const s of ['Cadenas de clase', 'Profesiones', 'Mazmorras']) pulsarMenu(m, s);
  const todos = [...textos(m), ...textos(m, 'SnetForeverMenuGuias')];
  assert.ok(todos.length > 8, todos.join(' | '));
  assert.ok(todos.includes('SnetForever v0.7.0'));
  for (const s of todos.filter((x) => x !== 'SnetForever v0.7.0')) assert.ok(!s.includes('.0'), s);
  assert.equal(m.lua('SnetForever.VERSION'), '0.7.0');
  assert.match(readFileSync(join(ADDON, 'SnetForever.toc'), 'utf8'), /^## Version: 0.7.0\r?$/m);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// 16-nov (en el juego: «Volver a [H] Ciudad de Dalaran» arriba siempre, sin X, con una guía cuyos pasos no se podían
// hacer): la X olvida la vuelta y el botón solo sale si tiene sentido.
// ---------------------------------------------------------------------------------------------------

const PRUEBA = 'Prueba\\01-60 Guía de prueba';
const MISION_PRUEBA = (nombre, extra = {}) => ({ name: nombre, startedBy: [[3143]], finishedBy: [[3143]], requiredLevel: 1,
  questLevel: 5, requiredRaces: 0, requiredClasses: 0, objectivesText: [`Haz ${nombre}`], ...extra });

// La principal es una guía cuyos pasos no se pueden hacer (su misión necesita una previa que no se tiene); el registro
// está cargado (hay otra misión en el diario).
function conPrincipalSinNada() {
  const m = nuevaMaquina({ datos: DATOS, jugador: DRUIDA });
  m.datoMision(9101, MISION_PRUEBA('La previa de prueba'));
  m.datoMision(9102, MISION_PRUEBA('La que pide la previa', { preQuestSingle: [9101] }));
  m.datoMision(9103, MISION_PRUEBA('Otra de prueba'));
  m.estadoMision(9103, { enDiario: true });
  m.ponerGuia(guiaDePrueba([
    { elementos: [{ t: 'goto', mapa: 1411, x: 50, y: 50, modo: 'flecha' }, { t: 'accept', q: 9102 }] },
    { elementos: [{ t: 'turnin', q: 9102 }] },
  ]));
  m.lua(`SnetForever.Guias.cargar(${aLua(PRUEBA)})`);
  m.lua(`${V}.crear()`);
  return m;
}

test('16-nov: «Volver a» lleva una X; cerrada, no vuelve a salir (tampoco tras recargar); con otra lateral, sí', () => {
  const m = conVentana();
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)}); ${V}.pintar()`);
  m.avanzar(0.5);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  assert.equal(visible(m, `${M}.estado.olvidar`), true, 'la X junto a «Volver a»');
  assert.equal(texto(m, `${M}.estado.olvidar.texto`), 'X');
  m.lua(`${M}.estado.olvidar:Click()`);
  m.avanzar(0.5);
  assert.equal(visible(m, `${M}.estado.volver`), false);
  assert.equal(visible(m, `${M}.estado`), false, 'sin nada más, sin tarjeta de estado');
  assert.equal(m.lua('SnetForeverPJ.volverA'), undefined, 'la vuelta se olvida (por personaje)');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), OSO, 'la guía abierta no cambia');
  sinErrores(m);
  const m2 = m.recargar();
  m2.lua(`${V}.crear()`);
  m2.avanzar(0.5);
  assert.equal(m2.lua('SnetForever.Motor.estado().clave'), OSO);
  assert.equal(visible(m2, `${M}.estado.volver`), false, 'tras recargar sigue cerrada');
  // Otra lateral: hay otra vuelta, y sale.
  m2.lua(`SnetForever.Guias.abrirLateral(${aLua('Profesiones\\01-300 Herbalism (H)')}); ${V}.pintar()`);
  m2.avanzar(0.5);
  assert.equal(visible(m2, `${M}.estado.volver`), true);
  assert.equal(texto(m2, `${M}.estado.volver.texto`), 'Volver a Druida: Forma de oso (paso 1)');
  sinErrores(m2);
});

test('16-nov: «Volver a» no sale si la guía de vuelta no tiene nada que hacer; sale al acabar la lateral', () => {
  const m = conPrincipalSinNada();
  m.avanzar(1);
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)}); ${V}.pintar()`);
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForeverPJ.volverA'), PRUEBA);
  assert.equal(m.lua(`SnetForever.Guias.algoQueHacer(${aLua(PRUEBA)})`), false);
  assert.equal(visible(m, `${M}.estado.volver`), false, 'la guía de vuelta no tiene nada que hacer');
  assert.equal(visible(m, `${M}.estado.olvidar`), false);
  // Al acabar la lateral, sí (con el «Fin de la guía»).
  for (const q of [4641, 788]) m.estadoMision(q, { entregada: true });
  m.disparar('QUEST_TURNED_IN', 788);
  m.avanzar(2);
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  assert.equal(texto(m, `${M}.estado.volver.texto`), 'Volver a 1-60 Guía de prueba');
  sinErrores(m);
});

// T3 con la regla del 16-nov: la guía de vuelta a medias pero sin nada que hacer no da «Volver a» (hasta acabar la
// lateral); a medias y con algo que hacer, sí, con su paso.
test('T3: la guía de vuelta sin acabar y sin nada que hacer no da «Volver a»; con algo que hacer sale con «(paso N)»', () => {
  const m = conPrincipalSinNada();
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)}); ${V}.pintar()`);
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForeverPJ.volverA'), PRUEBA);
  assert.deepEqual(m.lua(`{SnetForever.Motor.numeroGuardado(${aLua(PRUEBA)})}`), [1, false], 'sin acabar');
  assert.equal(m.lua(`SnetForever.Guias.algoQueHacer(${aLua(PRUEBA)})`), false);
  assert.equal(visible(m, `${M}.estado.volver`), false);
  // Con algo que hacer (la previa ya entregada), sale.
  m.estadoMision(9101, { entregada: true });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.5);
  assert.equal(m.lua(`SnetForever.Guias.algoQueHacer(${aLua(PRUEBA)})`), true);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  assert.equal(texto(m, `${M}.estado.volver.texto`), 'Volver a 1-60 Guía de prueba (paso 1)');
  sinErrores(m);
});

test('16-nov: con la guía de vuelta con algo que hacer, «Volver a» sale aunque la lateral no haya acabado', () => {
  const m = conVentana();
  assert.equal(m.lua(`SnetForever.Guias.algoQueHacer(${aLua(INICIO)})`), true);
  m.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)}); ${V}.pintar()`);
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), false);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  sinErrores(m);
});

test('comprobarLua51 pasa en los archivos que toca la tarea (ventana, controles, motor y textos)', () => {
  for (const archivo of ['ui/ventana.lua', 'ui/controles.lua', 'motor/pasos.lua', 'motor/guias.lua', 'motor/avisos.lua', 'textos/es.lua', 'textos/en.lua', 'nucleo/espacio.lua']) {
    assert.deepEqual(comprobarLua51(readFileSync(join(ADDON, archivo), 'utf8'), archivo), [], archivo);
  }
});
