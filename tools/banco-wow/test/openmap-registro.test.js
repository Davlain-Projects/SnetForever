// Registro de la ficha de mazmorra de OpenMap (fase 5, tarea 2; mapa/openmap.lua): OpenMapAPI.RegisterDungeonSection, estado,
// refresco y que nada de lo nuestro llegue nunca a geterrorhandler() (vigilancia 5: OpenMap enseñaría esos errores).
// Hay un OpenMapAPI falso; el contenido de las líneas ya lo prueba openmap-ficha.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, '..', 'fixtures');
const DATOS = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'openmap-mini.lua')];
const OF = 'SnetForever.OpenMapFicha';

const API = (extra = '') => `OpenMapAPI = {major = 1, version = 4, secciones = {}, refrescos = 0,
  RegisterDungeonSection = function(o, fn) OpenMapAPI.secciones[o] = fn; OpenMapAPI.refrescos = OpenMapAPI.refrescos + 1 end}
  ${extra}`;

function maquina(opciones = {}) {
  const { api = API(), ...resto } = opciones;
  const m = nuevaMaquina({
    datos: DATOS,
    jugador: { nivel: 20, raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde' },
    previo: api,
    ...resto,
  });
  m.lua('BANCO.zonasReales = {[33]="Castillo de Colmillo Oscuro",[189]="Monasterio Escarlata",[229]="Cumbre de Roca Negra",[230]="Profundidades de Roca Negra"}');
  m.nombreJuego('mision', 9001, 'Misión entregable');
  return m;
}

const INFO = { instances: [{ name: 'Castillo de Colmillo Oscuro' }] };
// seccion(info) por la función que tiene OpenMap, devolviendo {titulo, lineas} o false; si lanza, {error}.
const llamar = (m, info) => m.lua(`(function()
  local ok, titulo, lineas = pcall(OpenMapAPI.secciones.SnetForever, ${aLua(info)})
  if not ok then return {error = tostring(titulo)} end
  if titulo == nil then return false end
  return {titulo = titulo, lineas = lineas}
end)()`);
const estado = (m) => m.lua(`{${OF}.estado()}`);
const refrescos = (m) => m.lua('OpenMapAPI.refrescos');

// ---------------------------------------------------------------------------------------------------
// Registro y estado
// ---------------------------------------------------------------------------------------------------

test('al arrancar se registra la sección: función, estado «registrada» con la versión de la API y un solo registro', () => {
  const m = maquina();
  assert.equal(m.lua('type(OpenMapAPI.secciones.SnetForever)'), 'function');
  assert.deepEqual(estado(m), ['registrada', 4]);
  assert.equal(refrescos(m), 1);
  sinErrores(m);
});

test('la sección da el título «SnetForever: tus misiones aquí» y una tabla de cadenas', () => {
  const m = maquina();
  const r = llamar(m, INFO);
  assert.equal(r.titulo, 'SnetForever: tus misiones aquí');
  assert.ok(Array.isArray(r.lineas) && r.lineas.length > 1);
  for (const linea of r.lineas) assert.equal(typeof linea, 'string');
  assert.ok(r.lineas.length <= 24);
  sinErrores(m);
});

test('con openmap.ficha apagado o con openmap.usar apagado la sección da nil', () => {
  const a = maquina();
  a.lua('SnetForever.Ajustes.set("openmap.ficha", false)');
  assert.equal(llamar(a, INFO), false);
  a.lua('SnetForever.Ajustes.set("openmap.ficha", true)');
  assert.equal(typeof llamar(a, INFO).titulo, 'string');
  const b = maquina();
  b.lua('SnetForever.Ajustes.set("openmap.usar", false)');
  assert.equal(llamar(b, INFO), false);
  sinErrores(a);
  sinErrores(b);
});

test('vigilancia 5: sin OpenMapAPI no hay error y el estado es «sin_openmap»; al aparecer y cargar OpenMap se registra', () => {
  const m = maquina({ api: '' });
  assert.deepEqual(estado(m), ['sin_openmap']);
  m.lua(API());
  assert.deepEqual(estado(m), ['sin_api']); // la API ya está, pero aún no nos hemos registrado
  m.disparar('ADDON_LOADED', 'OpenMap');
  assert.equal(m.lua('type(OpenMapAPI.secciones.SnetForever)'), 'function');
  assert.equal(refrescos(m), 1);
  // Otro addon que carga no vuelve a registrar.
  m.disparar('ADDON_LOADED', 'OtroAddon');
  assert.equal(refrescos(m), 1);
  sinErrores(m);
});

test('vigilancia 5: OpenMapAPI con major = 2 no se usa (estado «otra_version»)', () => {
  const m = maquina({ api: API('OpenMapAPI.major = 2') });
  assert.deepEqual(estado(m), ['otra_version', 2]);
  assert.equal(m.lua('OpenMapAPI.secciones.SnetForever'), undefined);
  assert.equal(refrescos(m), 0);
  assert.equal(m.lua(`${OF}.registrar()`), false);
  sinErrores(m);
});

test('vigilancia 5: sin RegisterDungeonSection el estado es «sin_api»', () => {
  const m = maquina({ api: API('OpenMapAPI.RegisterDungeonSection = nil') });
  assert.deepEqual(estado(m), ['sin_api']);
  assert.equal(m.lua(`${OF}.registrar()`), false);
  sinErrores(m);
});

test('vigilancia 5: un RegisterDungeonSection que lanza error no da error de Lua y el estado es «sin_api»', () => {
  const m = maquina({ api: API('OpenMapAPI.RegisterDungeonSection = function() error("x") end') });
  assert.deepEqual(estado(m), ['sin_api']);
  assert.equal(m.lua(`${OF}.registrar()`), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// La sección nunca lanza error
// ---------------------------------------------------------------------------------------------------

test('vigilancia 5: sin porMazmorra, con info nil o con info.instances = 5 la sección da nil y no lanza error', () => {
  const m = maquina();
  assert.equal(llamar(m, undefined), false);
  assert.equal(llamar(m, { instances: 5 }), false);
  assert.equal(llamar(m, 'texto'), false);
  m.lua('SNF_MISIONES.porMazmorra = nil');
  assert.equal(llamar(m, INFO), false);
  sinErrores(m);
});

test('vigilancia 5: sin SNF_MISIONES, con GetRealZoneText que lanza error, sin C_Map o con enDiario que lanza error: nil o líneas, nunca error', () => {
  const sinMisiones = maquina();
  sinMisiones.lua('rawset(_G, "SNF_MISIONES", nil)');
  assert.equal(llamar(sinMisiones, INFO), false);
  sinErrores(sinMisiones);

  const zona = maquina();
  zona.lua('rawset(_G, "GetRealZoneText", function() error("roto") end)');
  const rz = llamar(zona, INFO);
  assert.equal(rz.error, undefined);
  sinErrores(zona);

  const sinMapa = maquina({ sinApi: ['C_Map'] });
  const rm = llamar(sinMapa, { mapID: 999, instances: [{ name: 'Castillo de Colmillo Oscuro' }] });
  assert.equal(rm.error, undefined);
  assert.equal(typeof rm.titulo, 'string'); // sin C_Map, «dónde» sale con el nombre del PNJ y la sección sigue
  const rn = llamar(sinMapa, { mapID: 999, instances: [] });
  assert.equal(rn, false);
  sinErrores(sinMapa);

  const diario = maquina();
  diario.lua('SnetForever.Misiones.enDiario = function() error("roto") end');
  const rd = llamar(diario, INFO);
  assert.equal(rd.error, undefined);
  sinErrores(diario);
});

test('vigilancia 5: si OpenMapFicha.lineas lanza error, la sección da nil y no llega nada a geterrorhandler', () => {
  const m = maquina();
  m.lua(`${OF}.lineas = function() error("roto") end`);
  assert.equal(llamar(m, INFO), false);
  sinErrores(m);
});

test('nombres secretos del motor (issecretvalue): ni la instancia de OpenMap ni el nombre del mapa se usan', () => {
  const m = maquina();
  m.lua('rawset(_G, "issecretvalue", function(v) return v == "SECRETO" end)');
  m.lua('BANCO.mapas[999] = {nombre = "SECRETO", inst = 0, tipo = 3}');
  assert.deepEqual(m.lua(`${OF}.areasDeInfo({instances = {{name = "SECRETO"}}})`) ?? [], []);
  assert.deepEqual(m.lua(`${OF}.areasDeInfo({mapID = 999, instances = {}})`) ?? [], []);
  sinErrores(m);
});

test('un «|» en el nombre de la previa, del mapa, del PNJ o de la cabecera de zona sale como «||»', () => {
  const m = maquina();
  m.nombreJuego('mision', 9500, 'Pre|via');
  m.lua('BANCO.mapas[1411].nombre = "Duro|tar"');
  const r = llamar(m, INFO);
  const texto = r.lineas.join('\n');
  assert.ok(texto.includes('antes: Pre||via'), texto);
  assert.ok(texto.includes('puedes cogerla: Duro||tar'), texto);

  const n = maquina();
  n.lua('BANCO.mapas[1411] = nil');
  n.lua('SnetForever.Datos.nombrePNJ = function() return "P|N" end');
  const rn = llamar(n, INFO);
  assert.ok(rn.lineas.join('\n').includes('puedes cogerla: P||N'), rn.lineas.join('\n'));

  const z = maquina();
  z.lua('SnetForever.Datos.nombreZona = function(a) return "Zo|na" .. a end');
  const rz = llamar(z, { instances: [{ name: 'Cumbre de Roca Negra' }, { name: 'Profundidades de Roca Negra' }] });
  assert.ok(rz.lineas.some((l) => l.includes('Zo||na1583')), rz.lineas.join('\n'));
  assert.ok(!rz.lineas.some((l) => /[^|]\|[^|rc]/.test(l.replace(/\|c[0-9a-f]{8}/g, '').replace(/\|r/g, '').replace(/\|\|/g, ''))), rz.lineas.join('\n'));
  sinErrores(m);
  sinErrores(n);
  sinErrores(z);
});

test('el índice de nombres no se guarda si salió vacío y se rehace al cambiar el idioma del addon', () => {
  const vacio = maquina();
  vacio.lua(`for _, z in pairs(SNF_MISIONES.porMazmorra) do z.nombre = nil end
    SnetForever.Datos.nombreZona = function() error("aún no") end
    BANCO.zonasReales = {}`);
  assert.deepEqual(vacio.lua(`${OF}.areasDeInfo({instances = {{name = "Castillo de Colmillo Oscuro"}}})`) ?? [], []);
  vacio.lua('BANCO.zonasReales = {[33]="Castillo de Colmillo Oscuro"}'); // los nombres llegan después
  assert.deepEqual(vacio.lua(`${OF}.areasDeInfo({instances = {{name = "Castillo de Colmillo Oscuro"}}})`), [209]);

  const idioma = maquina();
  idioma.lua(`SnetForever.Datos.nombreZona = function(a)
    if a == 209 then return SnetForever.L.idioma() == "es" and "Zona ES" or "Zone EN" end
    return "x" .. a
  end`);
  assert.deepEqual(idioma.lua(`${OF}.areasDeInfo({instances = {{name = "Zona ES"}}})`), [209]);
  idioma.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.deepEqual(idioma.lua(`${OF}.areasDeInfo({instances = {{name = "Zone EN"}}})`), [209]);
  sinErrores(vacio);
  sinErrores(idioma);
});

// ---------------------------------------------------------------------------------------------------
// Refresco
// ---------------------------------------------------------------------------------------------------

test('con el mapa abierto, tres QUEST_TURNED_IN seguidos y 1,1 s dan un solo refresco; con el mapa cerrado, ninguno', () => {
  const m = maquina();
  m.lua('WorldMapFrame:Show()');
  assert.equal(refrescos(m), 1);
  for (let i = 0; i < 3; i++) m.disparar('QUEST_TURNED_IN', 9001, 100, 10);
  assert.equal(refrescos(m), 1); // aún no: espera 1 s
  m.avanzar(1.1);
  assert.equal(refrescos(m), 2);
  // Pasado el segundo, otro evento vuelve a refrescar.
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(1.1);
  assert.equal(refrescos(m), 3);

  const cerrado = maquina();
  for (const e of ['QUEST_ACCEPTED', 'QUEST_TURNED_IN', 'QUEST_REMOVED', 'QUEST_LOG_UPDATE', 'PLAYER_LEVEL_UP']) cerrado.disparar(e, 1);
  cerrado.avanzar(1.1);
  assert.equal(refrescos(cerrado), 1);
  sinErrores(m);
  sinErrores(cerrado);
});

test('si el mapa se cierra durante la espera, no se refresca; PLAYER_LEVEL_UP y los ajustes openmap.* también refrescan', () => {
  const m = maquina();
  m.lua('WorldMapFrame:Show()');
  m.disparar('QUEST_ACCEPTED', 9001);
  m.lua('WorldMapFrame:Hide()');
  m.avanzar(1.1);
  assert.equal(refrescos(m), 1);
  m.lua('WorldMapFrame:Show()');
  m.disparar('PLAYER_LEVEL_UP', 21);
  m.avanzar(1.1);
  assert.equal(refrescos(m), 2);
  m.lua('SnetForever.Ajustes.set("openmap.ficha", false)');
  m.avanzar(1.1);
  assert.equal(refrescos(m), 3);
  m.lua('SnetForever.Ajustes.set("pines.mundo", false)'); // otro ajuste: nada
  m.avanzar(1.1);
  assert.equal(refrescos(m), 3);
  sinErrores(m);
});

test('sin OpenMap o con otra versión de la API, los eventos no hacen nada', () => {
  for (const api of ['', API('OpenMapAPI.major = 2')]) {
    const m = maquina({ api });
    m.lua('WorldMapFrame:Show()');
    m.disparar('QUEST_TURNED_IN', 9001, 100, 10);
    m.avanzar(1.1);
    assert.equal(m.lua('rawget(_G, "OpenMapAPI") and OpenMapAPI.refrescos or 0'), 0);
    sinErrores(m);
  }
});

test('un RegisterDungeonSection que empieza a fallar en el refresco no da error de Lua', () => {
  const m = maquina();
  m.lua('WorldMapFrame:Show(); OpenMapAPI.RegisterDungeonSection = function() error("roto") end');
  m.disparar('QUEST_TURNED_IN', 9001, 100, 10);
  m.avanzar(1.1);
  sinErrores(m);
});
