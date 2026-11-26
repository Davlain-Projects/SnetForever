import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, globalPermitida, guiaDePrueba, SIN_COMERCIO } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');

// Archivos .lua del .toc del addon, con / como separador.
function archivosDelToc(dir, nombre) {
  return readFileSync(join(dir, `${nombre}.toc`), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/\\/g, '/'));
}

test('un marco guarda tamaño y visibilidad', () => {
  const m = nuevaMaquina();
  m.lua('local f = CreateFrame("Frame", "SnetForeverX", UIParent); f:SetSize(10, 20); f:Hide()');
  assert.equal(m.lua('SnetForeverX:IsShown()'), false);
  assert.equal(m.lua('SnetForeverX:GetWidth()'), 10);
  const estado = m.marco('SnetForeverX');
  assert.equal(estado.mostrado, false);
  assert.equal(estado.ancho, 10);
  assert.equal(estado.alto, 20);
  assert.equal(estado.padre, 'UIParent');
  m.lua('SnetForeverX:Show(); SnetForeverX:SetPoint("TOPLEFT", UIParent, "CENTER", 5, -6)');
  const otra = m.marco('SnetForeverX');
  assert.equal(otra.mostrado, true);
  assert.deepEqual(otra.puntos, [{ punto: 'TOPLEFT', relativo: 'UIParent', relPunto: 'CENTER', x: 5, y: -6 }]);
  sinErrores(m);
});

test('las regiones guardan su estado y marco() acepta expresiones', () => {
  const m = nuevaMaquina();
  m.lua(`local f = CreateFrame("Frame", "SnetForeverY", UIParent)
    f.texto = f:CreateFontString(nil, "OVERLAY")
    f.texto:SetText("Hola")
    f.icono = f:CreateTexture(nil, "ARTWORK")
    f.icono:SetTexture("Interface\\\\Buttons\\\\WHITE8X8")
    f.icono:SetAlpha(0.5)`);
  assert.equal(m.marco('SnetForeverY.texto').texto, 'Hola');
  assert.equal(m.lua('SnetForeverY.icono:GetTexture()'), 'Interface\\Buttons\\WHITE8X8');
  assert.equal(m.marco('SnetForeverY.icono').alfa, 0.5);
  assert.equal(m.marco('SnetForeverY.icono').padre, 'SnetForeverY');
  assert.equal(m.marco('SnetForeverY').hijos.length, 2);
  sinErrores(m);
});

test('un método o una global sin imitar dan «no imitado»', () => {
  const m = nuevaMaquina();
  assert.throws(() => m.lua('local f = CreateFrame("Frame"); f:SetFoo()'), /no imitado: SetFoo/);
  assert.throws(() => m.lua('NoExisteEnElBanco()'), /no imitado: NoExisteEnElBanco/);
  assert.throws(() => m.lua('C_Timer.NoExiste(1)'), /no imitado: C_Timer.NoExiste/);
  // Los campos propios del addon en minúscula sí se pueden leer aunque no existan.
  assert.equal(m.lua('CreateFrame("Frame").algo'), undefined);
});

test('disparar llama al OnEvent de quien registró el evento y no al de los demás', () => {
  const m = nuevaMaquina();
  m.lua(`RECIBIDO = {}
    local a, b = CreateFrame("Frame"), CreateFrame("Frame")
    a:RegisterEvent("PLAYER_LEVEL_UP")
    a:SetScript("OnEvent", function(self, evento, nivel) table.insert(RECIBIDO, {self == a, evento, nivel}) end)
    b:SetScript("OnEvent", function(self, evento) table.insert(RECIBIDO, {"b", evento}) end)`);
  m.disparar('PLAYER_LEVEL_UP', 7);
  assert.deepEqual(m.lua('RECIBIDO'), [[true, 'PLAYER_LEVEL_UP', 7]]);
  sinErrores(m);
});

test('un error en un OnEvent llega a geterrorhandler() y no corta a los demás', () => {
  const m = nuevaMaquina();
  m.lua(`RECIBIDO = 0
    local a, b = CreateFrame("Frame"), CreateFrame("Frame")
    a:RegisterEvent("PLAYER_LEVEL_UP"); b:RegisterEvent("PLAYER_LEVEL_UP")
    a:SetScript("OnEvent", function() error("roto a propósito") end)
    b:SetScript("OnEvent", function() RECIBIDO = RECIBIDO + 1 end)`);
  m.disparar('PLAYER_LEVEL_UP', 2);
  assert.equal(m.lua('RECIBIDO'), 1);
  assert.equal(m.errores().length, 1);
  assert.match(m.errores()[0], /roto a propósito/);
  // sinErrores() lo ve y enseña la traza.
  assert.throws(() => sinErrores(m), /roto a propósito[\s\S]*stack traceback/);
});

test('avanzar(1) ejecuta temporizadores y OnUpdate con el tiempo falso', () => {
  const m = nuevaMaquina();
  m.lua(`CUENTA = {after = 0, ticker = 0, suma = 0}
    INICIO = GetTime()
    C_Timer.After(0.5, function() CUENTA.after = CUENTA.after + 1 end)
    C_Timer.NewTicker(0.25, function() CUENTA.ticker = CUENTA.ticker + 1 end)
    local f = CreateFrame("Frame")
    f:SetScript("OnUpdate", function(self, transcurrido) CUENTA.suma = CUENTA.suma + transcurrido end)`);
  m.avanzar(1);
  const cuenta = m.lua('CUENTA');
  assert.equal(cuenta.after, 1);
  assert.equal(cuenta.ticker, 4);
  assert.ok(Math.abs(cuenta.suma - 1) < 1e-9, `suma ${cuenta.suma}`);
  assert.ok(Math.abs(m.lua('GetTime() - INICIO') - 1) < 1e-9);
  sinErrores(m);
});

test('un ticker cancelado no vuelve a sonar y respeta sus iteraciones', () => {
  const m = nuevaMaquina();
  m.lua(`CUENTA = {a = 0, b = 0}
    T1 = C_Timer.NewTicker(0.1, function() CUENTA.a = CUENTA.a + 1 end)
    C_Timer.NewTicker(0.1, function() CUENTA.b = CUENTA.b + 1 end, 2)`);
  m.avanzar(0.3);
  m.lua('T1:Cancel()');
  m.avanzar(0.5);
  assert.deepEqual(m.lua('CUENTA'), { a: 3, b: 2 });
  assert.equal(m.lua('T1:IsCancelled()'), true);
  sinErrores(m);
});

test('hooksecurefunc llama a la original y después al gancho', () => {
  const m = nuevaMaquina();
  m.lua(`ORDEN = {}
    TABLA = {f = function(x) table.insert(ORDEN, "original"); return x * 2 end}
    hooksecurefunc(TABLA, "f", function(x) table.insert(ORDEN, "gancho") end)
    RES = TABLA.f(3)`);
  assert.deepEqual(m.lua('ORDEN'), ['original', 'gancho']);
  assert.equal(m.lua('RES'), 6);
  m.lua(`function FUNCION_GLOBAL() table.insert(ORDEN, "global") end
    hooksecurefunc("FUNCION_GLOBAL", function() table.insert(ORDEN, "gancho global") end)
    FUNCION_GLOBAL()`);
  assert.deepEqual(m.lua('ORDEN'), ['original', 'gancho', 'global', 'gancho global']);
  sinErrores(m);
});

test('recargar() conserva las SavedVariables y nada más', () => {
  let m = nuevaMaquina({ guardado: { SnetForeverCuenta: { a: 1 } } });
  assert.equal(m.lua('SnetForeverCuenta.a'), 1);
  m.lua('SnetForeverPJ = SnetForeverPJ or {}; SnetForeverPJ.x = 5; SnetForeverPJ.y = 2.5; OTRA_GLOBAL = 1');
  m = m.recargar();
  assert.equal(m.lua('SnetForeverPJ.x'), 5);
  assert.equal(m.lua('SnetForeverPJ.y'), 2.5);
  assert.equal(m.lua('rawget(_G, "OTRA_GLOBAL")'), undefined);
  // Lo guardado sigue ahí; el arranque (ADDON_LOADED y la guía al entrar) solo añade los campos del addon.
  const guardado = m.guardado();
  assert.deepEqual(Object.keys(guardado).sort(), ['SnetForeverCuenta', 'SnetForeverPJ']);
  assert.equal(guardado.SnetForeverCuenta.a, 1);
  assert.equal(guardado.SnetForeverPJ.x, 5);
  assert.equal(guardado.SnetForeverPJ.y, 2.5);
  sinErrores(m);
  m.cerrar();
});

test('recargar() conserva el jugador, el diario, los objetos y las guías puestas', () => {
  let m = nuevaMaquina();
  m.jugador({ nivel: 4 });
  m.estadoMision(4641, { enDiario: true, completa: true });
  m.objeto(159, 3, { banco: 2 });
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'nota', texto: { en: 'Hi', es: 'Hola' } }] }]));
  m.datoMision(9999, { name: 'Prueba', requiredLevel: 1 });
  m = m.recargar();
  assert.equal(m.jugador().nivel, 4);
  assert.deepEqual(m.lua('BANCO.misiones[4641]'), { enDiario: true, completa: true });
  assert.deepEqual(m.lua('BANCO.objetos[159]'), { cuenta: 3, banco: 2 });
  assert.equal(m.lua('#SNF_RUTAS.guias["Prueba\\\\01-60 Guía de prueba"].pasos'), 1);
  assert.equal(m.lua('SNF_MISIONES.quest[9999].name'), 'Prueba');
  sinErrores(m);
});

// F2b: cambiarDePersonaje() es salir al menú y entrar con otro de la cuenta: lo de la cuenta sigue y lo de cada personaje
// es suyo (uno nuevo empieza vacío; uno que ya jugó vuelve como lo dejó).
test('cambiarDePersonaje() guarda lo de la cuenta y separa lo de cada personaje, y entra con el otro desde la carga', () => {
  // Quién es el jugador en ADDON_LOADED (antes de que la prueba toque nada tras cambiar).
  const previo = `QUIEN = {}
    local f = CreateFrame("Frame")
    f:RegisterEvent("ADDON_LOADED")
    f:SetScript("OnEvent", function() QUIEN[#QUIEN + 1] = (UnitName("player")) end)`;
  let m = nuevaMaquina({ jugador: { nombre: 'Uno', reino: 'Normal', idioma: 'esES', nivel: 60, clase: 'MAGE' }, previo });
  m.lua('SnetForeverCuenta.prueba = "de la cuenta"; SnetForeverPJ.prueba = "de Uno"');
  m.estadoMision(4641, { enDiario: true });
  m.objeto(159, 3);
  m.bolsa(0, 1, { id: 159, n: 3 });
  m.lua('BANCO.ponerHechizo(133, "Bola de fuego", true); BANCO.ponerMarcador({mapa = 1411, x = 0.5, y = 0.5})');
  const marcadorUno = m.lua('BANCO.marcador');
  const avance = m.lua('BANCO.tick');
  // A un personaje nuevo: lo de la cuenta sigue; lo del personaje, vacío o por defecto.
  m = m.cambiarDePersonaje({ nombre: 'Dos', clase: 'PRIEST' });
  assert.deepEqual(m.lua('QUIEN'), ['Dos', 'Dos'], 'ya es el otro en el ADDON_LOADED del núcleo y del comercio');
  assert.equal(m.lua('SnetForeverCuenta.prueba'), 'de la cuenta');
  assert.equal(m.lua('SnetForeverPJ.prueba'), undefined, 'sus SavedVariablesPerCharacter empiezan sin nada');
  const j = m.jugador();
  assert.deepEqual([j.nombre, j.clase, j.reino, j.idioma, j.nivel, j.apellido ?? null], ['Dos', 'PRIEST', 'Normal', 'esES', 1, null]);
  assert.equal(m.lua('BANCO.misiones[4641]'), undefined);
  assert.equal(m.lua('C_Item.GetItemCount(159)'), 0);
  assert.equal(m.lua('C_Container.GetContainerNumSlots(0)'), 0, 'sin bolsas: son del otro');
  assert.equal(m.lua('BANCO.servicios.hechizos[133]'), undefined);
  assert.equal(m.lua('BANCO.marcador.punto'), undefined);
  assert.ok(m.lua('BANCO.tick') >= avance, 'el tiempo sigue');
  m.lua('SnetForeverCuenta.prueba2 = "de Dos, en la cuenta"; SnetForeverPJ.prueba = "de Dos"');
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  // Vuelta a Uno: lo suyo, como lo dejó; lo de la cuenta, con lo que hizo Dos.
  m = m.cambiarDePersonaje({ nombre: 'Uno' });
  assert.equal(m.lua('SnetForeverPJ.prueba'), 'de Uno');
  assert.equal(m.lua('SnetForeverCuenta.prueba'), 'de la cuenta');
  assert.equal(m.lua('SnetForeverCuenta.prueba2'), 'de Dos, en la cuenta');
  assert.deepEqual([m.jugador().nombre, m.jugador().clase, m.jugador().nivel], ['Uno', 'MAGE', 60]);
  assert.deepEqual(m.lua('BANCO.misiones[4641]'), { enDiario: true });
  assert.equal(m.lua('C_Item.GetItemCount(159)'), 3);
  assert.deepEqual(m.lua('C_Container.GetContainerItemInfo(0, 1)').itemID, 159);
  assert.equal(m.lua('BANCO.servicios.hechizos[133]'), 'Bola de fuego');
  assert.deepEqual(m.lua('BANCO.marcador'), marcadorUno);
  // Y Dos, al volver, también tiene lo suyo.
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  m = m.cambiarDePersonaje({ nombre: 'Dos' });
  assert.equal(m.lua('SnetForeverPJ.prueba'), 'de Dos');
  assert.equal(m.jugador().clase, 'PRIEST');
  sinErrores(m);
  m.cerrar();
});

test('jugador() calcula el mundo con los rectángulos del banco, y al revés', () => {
  const m = nuevaMaquina();
  const j = m.jugador({ mapa: 1411, x: 50, y: 25 });
  assert.deepEqual(j.mundo, { wx: -4500, wy: 925, inst: 1 });
  const k = m.jugador({ mundo: { wx: 850, wy: -8575, inst: 0 } });
  assert.equal(k.mapa, 1453);
  assert.ok(Math.abs(k.x - 50) < 1e-9 && Math.abs(k.y - 50) < 1e-9);
  // Un punto de Durotar cae en 1411 (la zona) antes que en 1414 (el continente).
  assert.equal(m.jugador({ mundo: { wx: -4500, wy: 925, inst: 1 } }).mapa, 1411);
  sinErrores(m);
});

test('sinApi quita una API y una ruta que no existe es un error', () => {
  const m = nuevaMaquina({ sinApi: ['C_Timer.NewTicker'] });
  assert.equal(m.lua('C_Timer.NewTicker == nil'), true);
  assert.equal(m.lua('C_Timer.After ~= nil'), true);
  assert.throws(() => nuevaMaquina({ sinApi: ['C_NoExiste.Algo'] }), /sinApi/);
});

test('equivalencias de Lua 5.1 y alias de WoW', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('select("#", unpack({1, 2, 3}))'), 3);
  assert.ok(Math.abs(m.lua('math.atan2(1, 0)') - Math.PI / 2) < 1e-12);
  assert.equal(m.lua('math.pow(2, 10)'), 1024);
  assert.equal(m.lua('table.getn({1, 2})'), 2);
  assert.deepEqual(m.lua('{strsplit(",;", "a,,b;c")}'), ['a', '', 'b', 'c']);
  assert.deepEqual(m.lua('{strsplit(",", "a,b,c", 2)}'), ['a', 'b,c']);
  assert.equal(m.lua('strtrim("  hola \\n\\t")'), 'hola');
  assert.equal(m.lua('strtrim("xxholaxx", "x")'), 'hola');
  assert.equal(m.lua('next(wipe({1, 2})) == nil'), true);
  assert.equal(m.lua('format("%d-%s", floor(2.7), strupper("a"))'), '2-A');
  assert.equal(m.lua('tinsert == table.insert and tremove == table.remove and gsub == string.gsub'), true);
  assert.equal(m.lua('ceil(1.2) + max(1, 5) + min(1, 5) + abs(-2)'), 10);
  assert.equal(m.lua('strlower("A") .. strmatch("x12", "%d+") .. select(1, strfind("abc", "b"))'), 'a122');
  // Lo que no existe en Lua 5.1 tampoco existe en el banco.
  assert.equal(m.lua('table.unpack == nil and math.type == nil and string.pack == nil'), true);
  assert.throws(() => m.lua('utf8'), /no imitado: utf8/);
  sinErrores(m);
});

// Guardia: en fengari los enteros son de 32 bits y desbordan en silencio (en WoW todo son doubles).
// Si fengari cambia, esta prueba avisa. El patrón correcto para las máscaras es 2^k, /, math.floor y %.
test('enteros de 32 bits de fengari y patrón correcto de las máscaras de raza', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('2147483647 + 1'), -2147483648);
  assert.equal(m.lua('65536 * 65536'), 0);
  assert.throws(() => m.lua('string.format("%d", 8589934770)'), /integer representation/);
  m.lua('function TIENE_BIT(mascara, k) return math.floor(mascara / 2 ^ k) % 2 == 1 end');
  // 8589934770 = 2^33 + Troll (2^7) + Tauren (2^5) + Undead (2^4) + Orc (2^1).
  for (const k of [1, 4, 5, 7, 33]) assert.equal(m.lua(`TIENE_BIT(8589934770, ${k})`), true, `bit ${k}`);
  for (const k of [0, 2, 3, 6, 8, 32, 34]) assert.equal(m.lua(`TIENE_BIT(8589934770, ${k})`), false, `bit ${k}`);
  assert.equal(m.lua('TIENE_BIT(SNF_MISIONES.quest[4641].requiredRaces, 33)'), true);
  sinErrores(m);
});

test('restos de Lua 5.3 que el juego no tiene', () => {
  const m = nuevaMaquina();
  assert.throws(() => m.lua('rawlen'), /no imitado: rawlen/);
  assert.throws(() => m.lua('debug'), /no imitado: debug/);
  assert.equal(m.lua('math.maxinteger == nil and math.mininteger == nil'), true);
  assert.deepEqual(
    m.lua('(function() local k = {} for n in pairs(os) do k[#k + 1] = n end table.sort(k) return k end)()'),
    ['clock', 'date', 'difftime', 'time'],
  );
  // load solo acepta una función (Lua 5.1); el texto va con loadstring.
  assert.throws(() => m.lua('load("return 1")'), /loadstring/);
  assert.equal(m.lua(`(function()
    local dado = false
    local f = load(function() if dado then return nil end dado = true return "return 7" end)
    return f()
  end)()`), 7);
  assert.equal(m.lua('loadstring("return 8")()'), 8);
  assert.equal(m.lua('select(2, loadstring("x = = 1")) ~= nil'), true);
  // math.atan de 5.1 tiene un solo argumento; math.atan2 sigue dando el ángulo completo.
  assert.ok(Math.abs(m.lua('math.atan(1, -1)') - Math.PI / 4) < 1e-12);
  assert.ok(Math.abs(m.lua('math.atan2(1, -1)') - (3 * Math.PI) / 4) < 1e-12);
  sinErrores(m);
});

test('llamadas() registra las llamadas a una API', () => {
  const m = nuevaMaquina();
  m.lua('print("hola", 3)');
  assert.deepEqual(m.llamadas('print'), [['hola', 3]]);
  assert.deepEqual(m.llamadas('AddMessage'), [['hola 3']]);
  assert.deepEqual(m.llamadas('PlaySound'), []);
});

test('el addon carga con los datos mini', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.VERSION'), '0.7.0');
  assert.equal(m.lua('SNF_RUTAS.version'), '2026.11.09.1');
  assert.equal(m.lua('SNF_MISIONES.quest[4641].requiredRaces'), 8589934770);
  assert.equal(m.lua('#SNF_RUTAS.guias["Prueba (H)\\\\01-02 Inicio"].pasos'), 7);
  // Se cargaron, en orden, todos los archivos del .toc del núcleo y después los del addon de comercio (0.7.0); en la
  // pasada de solo núcleo (SNF_SIN_COMERCIO=1), solo los del núcleo.
  const comercio = SIN_COMERCIO ? []
    : archivosDelToc(join(RAIZ, 'addons', 'SnetForever_Comercio'), 'SnetForever_Comercio').map((a) => `SnetForever_Comercio/${a}`);
  assert.deepEqual(m.lua('BANCO.cargados'), [...archivosDelToc(ADDON, 'SnetForever').map((a) => `SnetForever/${a}`), ...comercio]);
  sinErrores(m);
});

test('datos acepta el .toc de un addon de datos (los de la fase 1)', () => {
  const m = nuevaMaquina({
    datos: [
      join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc'),
      join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc'),
    ],
  });
  assert.equal(m.lua('SNF_RUTAS.esquema'), 1);
  assert.equal(m.lua('SNF_MISIONES.quest[4641].name'), 'Your Place In The World');
  assert.equal(m.lua('SnetForever.VERSION'), '0.7.0');
  sinErrores(m);
  m.cerrar();
});

test('cada archivo del .toc recibe ("SnetForever", tabla) y todos la misma tabla', () => {
  const base = mkdtempSync(join(tmpdir(), 'banco-'));
  const dir = join(base, 'SnetForever');
  mkdirSync(join(dir, 'sub'), { recursive: true });
  writeFileSync(join(dir, 'SnetForever.toc'), '## Interface: 16001\n## Title: Prueba\n\na.lua\nsub\\b.lua\n');
  writeFileSync(join(dir, 'a.lua'), 'rawset(_G, "ARGS_A", {select("#", ...), ...})\n');
  writeFileSync(join(dir, 'sub', 'b.lua'), 'rawset(_G, "ARGS_B", {select("#", ...), ...})\n');
  const m = nuevaMaquina({ addon: dir });
  assert.equal(m.lua('ARGS_A[1] == 2 and ARGS_B[1] == 2'), true);
  assert.equal(m.lua('ARGS_A[2] == "SnetForever" and ARGS_B[2] == "SnetForever"'), true);
  assert.equal(m.lua('type(ARGS_A[3]) == "table" and ARGS_A[3] == ARGS_B[3]'), true);
  // En el addon de verdad, espacio.lua publica esa tabla como SnetForever.
  const real = nuevaMaquina();
  assert.equal(real.lua('type(SnetForever) == "table" and type(SnetForever.U) == "table"'), true);
  sinErrores(m);
  sinErrores(real);
});

test('globalesNuevas() solo tiene las globales permitidas', () => {
  const m = nuevaMaquina();
  const nuevas = m.globalesNuevas();
  assert.ok(nuevas.includes('SnetForever'));
  for (const nombre of nuevas) assert.ok(globalPermitida(nombre), `global no permitida: ${nombre}`);
  sinErrores(m);
});

test('espacio: U.redondear y U.copiar', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.U.redondear(3.14159, 2)'), 3.14);
  assert.equal(m.lua('SnetForever.U.redondear(2.5)'), 3);
  assert.equal(m.lua('SnetForever.U.redondear(-2.5)'), -3);
  assert.equal(m.lua('SnetForever.U.redondear(1.005, 1)'), 1);
  m.lua(`ORIGINAL = {a = {b = {1, 2}}, c = "x"}
    COPIA = SnetForever.U.copiar(ORIGINAL)
    COPIA.a.b[1] = 99`);
  assert.deepEqual(m.lua('ORIGINAL'), { a: { b: [1, 2] }, c: 'x' });
  assert.equal(m.lua('COPIA.a ~= ORIGINAL.a and COPIA.a.b[1] == 99'), true);
  assert.equal(m.lua('SnetForever.U.copiar(5)'), 5);
  sinErrores(m);
});

test('el banco imita EnableKeyboard, OnKeyDown y SetPropagateKeyboardInput (BANCO.pulsarTecla)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local f = CreateFrame("Frame", nil, UIParent)
    local vistas = {}
    f:SetScript("OnKeyDown", function(self, tecla) vistas[#vistas + 1] = tecla; self:SetPropagateKeyboardInput(tecla ~= "ESCAPE") end)
    local sinTeclado = BANCO.pulsarTecla("A")
    local previo = {f:IsKeyboardEnabled(), f:GetPropagateKeyboardInput()}
    f:EnableKeyboard(true)
    local a = BANCO.pulsarTecla("A")
    local esc = BANCO.pulsarTecla("ESCAPE")
    f:Hide()
    local oculto = BANCO.pulsarTecla("B")
    -- un marco con el teclado y sin SetPropagateKeyboardInput se queda con las teclas
    local g = CreateFrame("Frame", nil, UIParent)
    g:EnableKeyboard(true)
    local retenida = BANCO.pulsarTecla("C")
    g:SetPropagateKeyboardInput(true)
    local pasa = BANCO.pulsarTecla("C")
    return {sinTeclado, previo, a, esc, oculto, retenida, pasa, vistas, f:IsKeyboardEnabled()}
  end)()`);
  assert.deepEqual(r[0], false);
  assert.deepEqual(r[1], [false, false]);
  assert.equal(r[2], false, 'A: propagate true, no se retiene');
  assert.equal(r[3], true, 'Escape: propagate false, se retiene');
  assert.equal(r[4], false, 'un marco oculto no recibe teclas');
  assert.equal(r[5], true);
  assert.equal(r[6], false);
  assert.deepEqual(r[7], ['A', 'ESCAPE']);
  assert.equal(r[8], true);
  sinErrores(m);
});

test('BANCO.pulsarTecla("ESCAPE") sin ningún marco que la retenga cierra los marcos de UISpecialFrames (CloseSpecialWindows)', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local a = CreateFrame("Frame", "SnetForeverPruebaA", UIParent)
    local b = CreateFrame("Frame", "SnetForeverPruebaB", UIParent)
    table.insert(UISpecialFrames, "SnetForeverPruebaA")
    table.insert(UISpecialFrames, "SnetForeverPruebaB")
    local retenida = BANCO.pulsarTecla("ESCAPE")
    return {retenida, a:IsShown(), b:IsShown()}
  end)()`);
  assert.deepEqual(r, [false, false, false]);
  sinErrores(m);
});
