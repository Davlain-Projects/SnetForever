// Integración (tarea 21): el arranque (arranque.lua) conecta los módulos con ADDON_LOADED, PLAYER_LOGIN,
// PLAYER_ENTERING_WORLD y PLAYER_LEAVING_WORLD; la orden /snet prueba; y el addon entero, con los fixtures y con los
// datos reales de la fase 1.
// El jugador por defecto del banco es un orco guerrero de nivel 1 en el Valle de los Retos (src/wow-falso.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, globalPermitida } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const opcionesReales = { skip: hayDatos ? false : 'no están los addons de datos de la fase 1' };

const INICIO = 'Prueba (H)\\01-02 Inicio';
const SIGUE = 'Prueba (H)\\02-03 Sigue';
const M = 'SnetForever.Ventana.marcos';
// Tarea D3: saltar el primer paso como el jugador, con el clic derecho y «Saltar este paso».
const SALTAR_PRIMERO = `${M}.pasos[1].marco:Click("RightButton")
  for _, f in ipairs(${M}.contexto.filas) do
    if f:IsVisible() and f.texto:GetText() == SnetForever.L.t("SALTAR_PASO") then f:Click(); break end
  end
  SnetForever.Ventana.cerrarContexto()`;

const estado = (m) => m.lua('SnetForever.Motor.estado()');
const actualN = (m) => m.lua('(function() local e = SnetForever.Motor.estado() local pv = SnetForever.Motor.paso(e.actual) return pv and pv.n end)()');
const existe = (m, nombre) => m.lua(`rawget(_G, ${aLua(nombre)}) ~= nil`);
const mensajes = (m) => m.llamadas('AddMessage').map((args) => String(args[0]));
const orden = (m, texto) => m.lua(`SlashCmdList.SNET(${aLua(texto)})`);

// Textos de las líneas del paso pintado k de la ventana.
const lineas = (m, k = 1) =>
  m.lua(`(function() local t = {} for i, fs in ipairs(${M}.pasos[${k}].lineas) do t[i] = fs:GetText() end return t end)()`) || [];

// Tickers de C_Timer vivos (los del motor y la navegación).
const tickers = (m) =>
  m.lua('(function() local n = 0 for _, t in ipairs(BANCO.temporizadores) do if t.ticker and not t.cancelado then n = n + 1 end end return n end)()');

// Máquina sin arrancar: los eventos de inicio los dispara la prueba.
const sinArrancar = (opciones = {}) => nuevaMaquina({ arrancar: false, ...opciones });

function arrancar(m) {
  m.disparar('ADDON_LOADED', 'SnetForever');
  m.disparar('PLAYER_LOGIN');
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
}

// ---------------------------------------------------------------------------------------------------
// Banco: lo nuevo de la tarea 21
// ---------------------------------------------------------------------------------------------------

test('banco: PLAYER_LEAVING_WORLD es un evento conocido', () => {
  const m = nuevaMaquina();
  m.lua('local f = CreateFrame("Frame") f:RegisterEvent("PLAYER_LEAVING_WORLD")');
  m.disparar('PLAYER_LEAVING_WORLD');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// ADDON_LOADED y PLAYER_LOGIN
// ---------------------------------------------------------------------------------------------------

test('ADDON_LOADED de otro addon no prepara nada; el de SnetForever prepara las dos SavedVariables', () => {
  const m = sinArrancar();
  m.disparar('ADDON_LOADED', 'OtroAddon');
  assert.equal(m.lua('rawget(_G, "SnetForeverPJ")'), undefined);
  assert.equal(m.lua('rawget(_G, "SnetForeverCuenta")'), undefined);
  m.disparar('ADDON_LOADED', 'SnetForever');
  assert.equal(m.lua('SnetForeverPJ.esquema'), 1);
  assert.equal(m.lua('SnetForeverCuenta.esquema'), 1);
  assert.equal(m.lua('type(SnetForeverPJ.progreso)'), 'table');
  sinErrores(m);
});

test('PLAYER_LOGIN crea la ventana, la flecha, los pines del mapa y del minimapa, el panel y el botón (una vez)', () => {
  const m = nuevaMaquina();
  for (const nombre of ['SnetForeverVentana', 'SnetForeverFlecha', 'SnetForeverPanel', 'SnetForeverBotonMinimapa']) {
    assert.ok(existe(m, nombre), nombre);
  }
  assert.equal(m.lua('SnetForever.PinesMundo.crear()'), true, 'el mapa ya está enganchado');
  assert.equal(m.lua('SnetForever.PinesMinimapa.marcos.reloj ~= nil'), true, 'el reloj de los pines del minimapa');
  // Engancharse dos veces duplicaría los repintados: OnMapChanged tiene un solo gancho.
  assert.equal(m.lua('BANCO.originalDe(WorldMapFrame.OnMapChanged) ~= WorldMapFrame.OnMapChanged'), true);
  sinErrores(m);
});

test('sin WorldMapFrame en PLAYER_LOGIN, los pines del mapa se enganchan cuando carga Blizzard_WorldMap', () => {
  const m = sinArrancar();
  m.lua('MAPA_GUARDADO = WorldMapFrame; BANCO.permitirNil("WorldMapFrame"); WorldMapFrame = nil');
  arrancar(m);
  assert.equal(existe(m, 'SnetForeverVentana'), true, 'lo demás se crea igual');
  m.lua('WorldMapFrame = MAPA_GUARDADO');
  m.disparar('ADDON_LOADED', 'Blizzard_WorldMap');
  assert.equal(m.lua('BANCO.originalDe(WorldMapFrame.OnMapChanged) ~= WorldMapFrame.OnMapChanged'), true, 'enganchado');
  m.lua('WorldMapFrame:Show()');
  const pines = m.lua('(function() local n = 0 for _, p in ipairs(SnetForever.PinesMundo.marcos.pines) do if p:IsShown() then n = n + 1 end end return n end)()');
  assert.ok(pines >= 1, 'los puntos de la guía salen en el mapa');
  sinErrores(m);
});

test('sin WorldMapFrame en PLAYER_LOGIN, se reintenta al volver a entrar al mundo', () => {
  const m = sinArrancar();
  m.lua('MAPA_GUARDADO = WorldMapFrame; BANCO.permitirNil("WorldMapFrame"); WorldMapFrame = nil');
  arrancar(m);
  m.lua('WorldMapFrame = MAPA_GUARDADO');
  m.disparar('PLAYER_LEAVING_WORLD');
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  assert.equal(m.lua('BANCO.originalDe(WorldMapFrame.OnMapChanged) ~= WorldMapFrame.OnMapChanged'), true);
  sinErrores(m);
});

test('datos rotos (SNF_RUTAS sin esquema): un mensaje con «SnetForever» en el chat, ningún marco y sin errores', () => {
  const m = sinArrancar();
  m.lua('SNF_RUTAS.esquema = nil');
  arrancar(m);
  const avisos = mensajes(m).filter((t) => t.includes('SnetForever'));
  assert.equal(avisos.length, 1, `mensajes: ${mensajes(m).join(' | ')}`);
  assert.match(avisos[0], /esquema/);
  for (const nombre of ['SnetForeverVentana', 'SnetForeverFlecha', 'SnetForeverPanel', 'SnetForeverBotonMinimapa']) {
    assert.equal(existe(m, nombre), false, nombre);
  }
  assert.equal(estado(m).sinGuia, true, 'no se carga ninguna guía');
  // /snet tampoco crea nada: repite el aviso.
  orden(m, '');
  assert.equal(existe(m, 'SnetForeverPanel'), false);
  assert.equal(mensajes(m).filter((t) => t.includes('SnetForever')).length, 2);
  sinErrores(m);
});

test('datos que faltan (sin SNF_MISIONES): el aviso dice «faltan» y no se crea nada', () => {
  const m = sinArrancar();
  m.lua('BANCO.permitirNil("SNF_MISIONES"); SNF_MISIONES = nil');
  arrancar(m);
  const avisos = mensajes(m).filter((t) => t.includes('SnetForever'));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /faltan/);
  assert.equal(existe(m, 'SnetForeverVentana'), false);
  sinErrores(m);
});

test('el aviso de datos rotos sale en inglés con el cliente en inglés', () => {
  const m = sinArrancar({ jugador: { idioma: 'enUS' } });
  m.lua('SNF_MISIONES.esquema = 2');
  arrancar(m);
  const avisos = mensajes(m).filter((t) => t.includes('SnetForever'));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /data/i);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// PLAYER_ENTERING_WORLD: la guía
// ---------------------------------------------------------------------------------------------------

test('un orco nuevo entra con su guía por defecto: Inicio, guardada en SnetForeverPJ.guia, y la ventana la enseña', () => {
  const m = nuevaMaquina();
  assert.equal(estado(m).clave, INICIO);
  assert.equal(m.lua('SnetForeverPJ.guia'), INICIO);
  assert.equal(actualN(m), 1);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  assert.match(m.lua('SnetForever.GuideViews.frames.notice.body:GetText()'), /Acepta la misión Tu lugar en el mundo/);
  sinErrores(m);
});

test('con SnetForeverPJ.guia guardada se carga esa guía (no la de por defecto) y se reanuda su progreso', () => {
  const m = nuevaMaquina({
    guardado: { SnetForeverPJ: { esquema: 1, guia: SIGUE, progreso: { [SIGUE]: { id: 'h0000102', n: 2 } } } },
  });
  assert.equal(estado(m).clave, SIGUE);
  assert.equal(actualN(m), 2);
  sinErrores(m);
});

test('una SnetForeverPJ.guia que ya no existe en los datos se cambia por la de por defecto', () => {
  const m = nuevaMaquina({ guardado: { SnetForeverPJ: { esquema: 1, guia: 'No\\Existe' } } });
  assert.equal(estado(m).clave, INICIO);
  assert.equal(m.lua('SnetForeverPJ.guia'), INICIO);
  sinErrores(m);
});

test('un personaje sin guía por defecto entra sin guía y sin errores', () => {
  const m = nuevaMaquina({ jugador: { raza: 'Dwarf', faccion: 'Alliance' } });
  assert.equal(estado(m).sinGuia, true);
  assert.equal(m.lua('SnetForeverPJ.guia'), undefined);
  sinErrores(m);
});

test('PLAYER_ENTERING_WORLD lee al personaje de nuevo: un orco de nivel 2 (sin copia previa) recibe su guía', () => {
  const m = sinArrancar({ jugador: { nivel: 2 } });
  arrancar(m);
  assert.equal(m.lua('SnetForever.Personaje.actual().nivel'), 2);
  assert.equal(estado(m).clave, m.lua('SnetForever.Guias.porDefecto()'));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Flujo completo con los fixtures
// ---------------------------------------------------------------------------------------------------

// Pasos de Inicio (fixtures/rutas-mini.lua): 1 accept 4641; 2 goto + turnin 4641 + accept 788; 3 complete 788 obj. 1;
// 4 goto + collect 5 × 159; 5 turnin 788 (requiere 4641 entregada).
test('flujo completo de un orco nuevo por Inicio con eventos del juego', () => {
  const m = nuevaMaquina();
  assert.equal(actualN(m), 1);
  assert.ok(lineas(m).some((t) => t.includes('Acepta la misión Tu lugar en el mundo')));

  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 4641);
  m.avanzar(0.3);
  assert.equal(actualN(m), 2, 'aceptada 4641');
  assert.ok(lineas(m).some((t) => t.includes('Entrega la misión Tu lugar en el mundo')), lineas(m).join(' | '));

  // La flecha apunta al goto del paso 2; el jugador llega (ese goto no trae radio: no se «alcanza», solo guía).
  assert.ok(m.lua('SnetForever.Navegacion.destino().distancia') > 20);
  m.jugador({ mundo: { wx: -4105, wy: -590.5, inst: 1 } });
  m.avanzar(0.4);
  assert.ok(m.lua('SnetForever.Navegacion.destino().distancia') < 1, 'la flecha está en el goto');
  assert.equal(actualN(m), 2, 'el goto no basta: faltan la entrega y la nueva misión');

  m.estadoMision(4641, { entregada: true });
  m.estadoMision(788, {
    enDiario: true, objetivos: [{ texto: 'Jabalí moteado: 0/10', hecho: 0, pedido: 10, terminado: false }],
  });
  m.disparar('QUEST_TURNED_IN', 4641, 0, 0);
  m.disparar('QUEST_ACCEPTED', 788);
  m.avanzar(0.3);
  assert.equal(actualN(m), 3, 'entregada 4641 y aceptada 788');

  m.estadoMision(788, {
    enDiario: true, objetivos: [{ texto: 'Jabalí moteado: 10/10', hecho: 10, pedido: 10, terminado: true }],
  });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(0.3);
  assert.equal(actualN(m), 4, 'objetivo terminado');

  m.objeto(159, 5);
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(0.3);
  assert.equal(actualN(m), 5, 'cinco aguas compradas');

  m.estadoMision(788, { entregada: true });
  m.disparar('QUEST_TURNED_IN', 788, 0, 0);
  m.avanzar(0.3);
  assert.equal(actualN(m), 6, 'entregada 788');
  sinErrores(m);
});

test('un segundo PLAYER_ENTERING_WORLD no recarga la guía ni cambia el paso', () => {
  const m = nuevaMaquina();
  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 4641);
  m.avanzar(0.3);
  assert.equal(actualN(m), 2);
  m.lua('SnetForever.Pruebas_cargas = 0; SnetForever.escuchar("SNF_GUIA_CARGADA", function() SnetForever.Pruebas_cargas = SnetForever.Pruebas_cargas + 1 end)');
  m.disparar('PLAYER_LEAVING_WORLD');
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  m.avanzar(0.3);
  assert.equal(actualN(m), 2);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(m.lua('SnetForever.Pruebas_cargas'), 0, 'sin SNF_GUIA_CARGADA');
  sinErrores(m);
});

test('tras recargar() se vuelve al mismo paso de la misma guía, con la ventana pintada', () => {
  let m = nuevaMaquina();
  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 4641);
  m.avanzar(0.3);
  assert.equal(actualN(m), 2);
  m = m.recargar();
  assert.equal(estado(m).clave, INICIO);
  assert.equal(actualN(m), 2);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  assert.ok(lineas(m).some((t) => t.includes('Entrega la misión Tu lugar en el mundo')));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Temporizadores: PLAYER_LEAVING_WORLD los para y PLAYER_ENTERING_WORLD los vuelve a poner
// ---------------------------------------------------------------------------------------------------

test('PLAYER_LEAVING_WORLD para los temporizadores del motor y la navegación; al volver siguen', () => {
  const m = nuevaMaquina();
  m.avanzar(0.5);
  assert.equal(tickers(m), 2, 'el del motor y el de la navegación');

  m.disparar('PLAYER_LEAVING_WORLD');
  m.avanzar(0.1);
  assert.equal(tickers(m), 0);
  // Mientras está fuera, ni cargar una guía ni cambiar la capa los vuelve a poner.
  m.lua('SnetForever.Capa.poner("jugador", {})');
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  m.avanzar(0.1);
  assert.equal(tickers(m), 0);
  // Ni avanza el paso.
  m.estadoMision(4641, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 4641);
  m.avanzar(1);
  assert.equal(actualN(m), 1, 'con el motor parado el paso no avanza');

  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  assert.equal(tickers(m), 2);
  m.avanzar(0.3);
  assert.equal(actualN(m), 2, 'al volver, el ciclo pendiente se hace');
  sinErrores(m);
});

test('PLAYER_LEAVING_WORLD sin guía no rompe y al volver no hay temporizador del motor de más', () => {
  const m = nuevaMaquina({ jugador: { raza: 'Dwarf', faccion: 'Alliance' } });
  m.disparar('PLAYER_LEAVING_WORLD');
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  m.avanzar(0.3);
  assert.ok(tickers(m) <= 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// El menú de guías se cierra cuando la ventana se oculta
// ---------------------------------------------------------------------------------------------------

test('alternar la ventana cierra el menú de guías (y su fondo, que se comería el primer clic)', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Ventana.abrirMenu()');
  assert.equal(m.lua('SnetForeverMenuGuias:IsShown()'), true);
  m.lua('SnetForever.Ventana.alternar()');
  assert.equal(m.lua('SnetForeverVentana:IsShown()'), false);
  assert.equal(m.lua('SnetForeverMenuGuias:IsShown()'), false);
  assert.equal(m.lua(`${M}.menu.fondo:IsShown()`), false);
  sinErrores(m);
});

test('al ocultarse en combate la ventana cierra el menú de guías', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Ajustes.set("ventana.ocultarEnCombate", true)');
  m.lua('SnetForever.Ventana.abrirMenu()');
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForeverVentana:IsShown()'), false);
  assert.equal(m.lua('SnetForeverMenuGuias:IsShown()'), false);
  assert.equal(m.lua(`${M}.menu.fondo:IsShown()`), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// /snet prueba
// ---------------------------------------------------------------------------------------------------

test('/snet prueba con rumbo 0: A 40 yd al norte (delante) y B 40 yd al oeste (izquierda), la flecha va a A sin girar', () => {
  const m = nuevaMaquina();
  const j = m.lua('SnetForever.Coord.jugador()');
  orden(m, 'prueba');
  const puntos = m.lua('SnetForever.Capa.puntos("jugador")');
  assert.equal(puntos.length, 2);
  const [a, b] = puntos;
  assert.equal(a.etiqueta, 'Prueba A (delante)');
  assert.equal(b.etiqueta, 'Prueba B (izquierda)');
  assert.equal(a.seguir, true);
  assert.equal(b.seguir, true);
  assert.ok(Math.abs(a.wx - j.wx) < 1e-6 && Math.abs(a.wy - (j.wy + 40)) < 1e-6, `A = ${a.wx}, ${a.wy}`);
  assert.ok(Math.abs(b.wx - (j.wx + 40)) < 1e-6 && Math.abs(b.wy - j.wy) < 1e-6, `B = ${b.wx}, ${b.wy}`);
  assert.equal(a.inst, 1);
  assert.equal(a.mapa, 1411, 'en el mapa del jugador, para los pines');
  assert.equal(m.lua('SnetForever.Navegacion.destino().punto.etiqueta'), 'Prueba A (delante)');
  m.avanzar(0.1);
  const giro = m.lua('SnetForever.Flecha.marcos.textura:GetRotation()');
  assert.ok(Math.abs(giro) < 0.01 || Math.abs(giro - 2 * Math.PI) < 0.01, `giro ${giro}`);
  assert.equal(m.lua('SnetForeverFlecha:IsShown()'), true);
  assert.match(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), /Prueba A \(delante\)/);
  // Los pines: en el mapa del mundo abierto en 1411 y en el minimapa.
  m.lua('WorldMapFrame:Show()');
  assert.ok(m.lua('(function() local n = 0 for _, p in ipairs(SnetForever.PinesMundo.marcos.pines) do if p:IsShown() then n = n + 1 end end return n end)()') >= 2);
  orden(m, 'prueba fin');
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("jugador")'), []);
  sinErrores(m);
});

test('/snet prueba con rumbo π/2 (mirando al oeste): A queda al oeste y B al sur', () => {
  const m = nuevaMaquina({ jugador: { rumbo: Math.PI / 2 } });
  const j = m.lua('SnetForever.Coord.jugador()');
  orden(m, 'PRUEBA');
  const [a, b] = m.lua('SnetForever.Capa.puntos("jugador")');
  assert.ok(Math.abs(a.wx - (j.wx + 40)) < 1e-6 && Math.abs(a.wy - j.wy) < 1e-6);
  assert.ok(Math.abs(b.wx - j.wx) < 1e-6 && Math.abs(b.wy - (j.wy - 40)) < 1e-6);
  orden(m, '  prueba   FIN ');
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("jugador")'), []);
  sinErrores(m);
});

test('/snet prueba dentro de una instancia (sin posición) avisa y no pone nada', () => {
  const m = nuevaMaquina();
  m.jugador({ enInstancia: true });
  const antes = mensajes(m).length;
  orden(m, 'prueba');
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("jugador")'), []);
  assert.equal(mensajes(m).length, antes + 1);
  sinErrores(m);
});

test('la ayuda de /snet incluye /snet prueba, en español y en inglés', () => {
  const m = nuevaMaquina();
  orden(m, 'ayuda');
  assert.ok(mensajes(m).some((t) => t.startsWith('/snet prueba')), mensajes(m).join(' | '));
  const n = nuevaMaquina({ jugador: { idioma: 'enUS' } });
  orden(n, 'help');
  // Lote C (revisión 52, Minor 16): en inglés, la orden en inglés y la española entre paréntesis.
  assert.ok(mensajes(n).some((t) => t.startsWith('/snet test') && t.includes('/snet prueba')), mensajes(n).join(' | '));
  sinErrores(m);
  sinErrores(n);
});

// ---------------------------------------------------------------------------------------------------
// Globales
// ---------------------------------------------------------------------------------------------------

test('el addon arrancado (con /snet prueba y PLAYER_LEAVING_WORLD) solo crea globales permitidas', () => {
  const m = nuevaMaquina();
  orden(m, 'prueba');
  m.disparar('PLAYER_LEAVING_WORLD');
  m.disparar('PLAYER_ENTERING_WORLD', false, false);
  m.avanzar(0.5);
  const malas = m.globalesNuevas().filter((g) => !globalPermitida(g));
  assert.deepEqual(malas, []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Datos reales de la fase 1
// ---------------------------------------------------------------------------------------------------

const PERSONAJES = [
  { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde' },
  { raza: 'Troll', clase: 'MAGE', faccion: 'Horde' },
  { raza: 'Tauren', clase: 'DRUID', faccion: 'Horde' },
  { raza: 'Scourge', clase: 'PRIEST', faccion: 'Horde' },
  { raza: 'Human', clase: 'PALADIN', faccion: 'Alliance' },
  { raza: 'Dwarf', clase: 'HUNTER', faccion: 'Alliance' },
  { raza: 'Gnome', clase: 'WARLOCK', faccion: 'Alliance' },
  { raza: 'NightElf', clase: 'DRUID', faccion: 'Alliance' },
  { raza: 'Skyborne', clase: 'SHAMAN', faccion: 'Horde' },
  { raza: 'Skyborne', clase: 'WARRIOR', faccion: 'Alliance' },
];

// Con el perfil «Forever» (tarea 22): sin las APIs que no tiene el cliente real (src/maquina.js, SIN_API_FOREVER).
const conDatosReales = (jugador) => nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: { ...jugador, nivel: 1 }, forever: true });

// Comprueba lo que un personaje recién arrancado debe ver: guía, ventana con su paso y la flecha sin errores.
function comprobarArranque(m, etiqueta) {
  const clave = m.lua('SnetForever.Guias.porDefecto()');
  assert.ok(clave, `${etiqueta}: porDefecto no es nil`);
  const e = estado(m);
  assert.equal(e.clave, clave, `${etiqueta}: se carga la guía por defecto`);
  assert.equal(m.lua('SnetForeverPJ.guia'), clave);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true, `${etiqueta}: ventana visible`);
  assert.ok(m.lua(`#${M}.pasos`) >= 1, `${etiqueta}: la ventana pinta al menos un paso`);
  assert.ok(lineas(m).some((t) => typeof t === 'string' && t.length > 0), `${etiqueta}: el paso tiene texto`);
  m.avanzar(0.3);
  // La flecha: con destino, visible y con texto; sin destino (mapa que el banco no tiene), oculta. Nunca con error.
  const destino = m.lua('SnetForever.Navegacion.destino() ~= nil');
  if (destino) assert.ok(m.lua('SnetForever.Flecha.marcos.texto:GetText()'), `${etiqueta}: la flecha tiene texto`);
  sinErrores(m);
  return clave;
}

test('datos reales: personajes nuevos de 10 razas/clases arrancan con guía, ventana y flecha; 50 «Saltar» sin errores; también tras /reload',
  { ...opcionesReales, timeout: 600000 },
  () => {
    for (const pj of PERSONAJES) {
      const etiqueta = `${pj.raza} ${pj.clase} ${pj.faccion}`;
      let m = conDatosReales(pj);
      const clave = comprobarArranque(m, etiqueta);
      m.lua('SnetForever.GuideViews.frames.notice.details:Click()');
      for (let i = 0; i < 50; i++) {
        const hay = m.lua(`${M}.pasos[1] ~= nil and ${M}.pasos[1].marco:IsVisible()`);
        if (hay) m.lua(SALTAR_PRIMERO);
        m.avanzar(0.3);
      }
      sinErrores(m);
      const despues = estado(m);
      m = m.recargar();
      assert.equal(estado(m).clave, despues.clave, `${etiqueta}: la misma guía tras /reload`);
      assert.equal(m.lua('SnetForeverVentana:IsVisible()'), true, `${etiqueta}: ventana tras /reload`);
      if (despues.clave === clave && !despues.fin) {
        assert.equal(estado(m).actual, despues.actual, `${etiqueta}: el mismo paso tras /reload`);
      }
      m.avanzar(0.3);
      sinErrores(m);
      assert.deepEqual(m.globalesNuevas().filter((g) => !globalPermitida(g)), [], `${etiqueta}: globales`);
      m.cerrar();
    }
  });

test('datos reales: Motor.cargar de la guía con más pasos tarda menos de 2 s', opcionesReales, (t) => {
  const m = conDatosReales(PERSONAJES[0]);
  const [clave, n] = m.lua(`(function()
    local mejor, n = nil, -1
    for clave, guia in pairs(SNF_RUTAS.guias) do
      if #guia.pasos > n then mejor, n = clave, #guia.pasos end
    end
    return {mejor, n}
  end)()`);
  const inicio = performance.now();
  assert.equal(m.lua(`SnetForever.Motor.cargar(${aLua(clave)})`), true);
  const ms = performance.now() - inicio;
  t.diagnostic(`Motor.cargar(«${clave}», ${n} pasos): ${ms.toFixed(0)} ms`);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
  m.avanzar(0.3);
  sinErrores(m);
});
