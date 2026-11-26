import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { importarRXP } from '../../conversor/src/importar-rxp.js';
import { nuevaMaquina, sinErrores, withGuideDetails } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RUTA = 'RXP\\Ruta de prueba\\22-24 Camino';
const DESTINO = 'RXP\\Ruta de prueba\\24-26 Cima';
const ATAJO = 'RXP\\Ruta de prueba\\24-24 Atajo';
const OTRA_RUTA = 'RXP\\Otra ruta\\26-28 Destino';
const GRUPO = 'Mis guías RXP · Ruta de prueba';
const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

test('expone la ruta original en el menú, sigue sus pasos y enlaza el siguiente tramo', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'snet-rxp-test-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  mkdirSync(join(raiz, 'Guides', 'forever'), { recursive: true });
  mkdirSync(join(raiz, 'DB', 'forever'), { recursive: true });
  writeFileSync(join(raiz, 'DB', 'forever', 'db.lua'), 'addon.mapId = {["Durotar"] = 1411}');
  writeFileSync(join(raiz, 'LICENSE'), 'Fixture sintético.');
  writeFileSync(join(raiz, 'Guides', 'forever', 'prueba.lua'), String.raw`
error("El Lua de origen no se ejecuta")
addon:RegisterGuide([=[
#group Ruta de prueba
#name 22-24 Camino
#next 24-26 Cima
<< Horde
step
    #xprate <1.49
    +Primera parada
    .clicknext Otra ruta\26-28 Alternativa;26-28 Destino >>Pulsa para elegir otro recorrido
step
    #xprate >1.49
    +Parada con experiencia aumentada
step
    #include 22-22 Desvío@inicio
step << Mage
    +Visita al instructor
step
    +Última parada
]=])
addon:RegisterGuide([[
#group Ruta de prueba
#name 22-22 Desvío
<< Horde
step
    #label inicio
    +Paso incluido
]])
addon:RegisterGuide([[
#group Ruta de prueba
#name 24-26 Cima
<< Horde
#next Grupo ausente\26-28 Destino << Warrior
#next Otra ruta\26-28 Destino
step
    .daily 4641,788 >>Acepta una de las misiones
]])
addon:RegisterGuide([[
#group Ruta de prueba
#name 24-24 Atajo
<< Horde
step
    .next Otra ruta\26-28 Alternativa;26-28 Destino
step
    +Este paso solo se queda activo si falla el salto
]])
addon:RegisterGuide([[
#group Otra ruta
#name 26-28 Alternativa
<< Horde Mage
step
    +Tramo solo para magos
]])
addon:RegisterGuide([[
#group Otra ruta
#name 26-28 Destino
<< Horde
step
    +Tramo de otra ruta
]])
`);

  const resultado = importarRXP(raiz, raiz, '2026.01.01.1');
  assert.equal(resultado.guias, 6);
  assert.equal(resultado.inclusionesSinResolver, 0);
  assert.equal(resultado.enlacesSinResolver, 1);
  assert.throws(() => importarRXP(raiz, raiz), /ya existe/);

  const toc = join(resultado.destino, 'SnetForever_RutasRXP.toc');
  const opciones = { jugador: { nivel: 22, faccion: 'Horde', clase: 'WARRIOR', raza: 'Orc' } };
  const normal = nuevaMaquina(opciones);
  const m = withGuideDetails({
    ...opciones,
    datos: [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), toc],
  });
  assert.equal(m.lua('SnetForever.Guias.porDefecto()'), normal.lua('SnetForever.Guias.porDefecto()'));
  for (const version of ['normal', 'mazmorras']) {
    const menu = m.lua(`SnetForever.Guias.delMenu(${aLua(version)})`);
    assert.ok(menu.find((g) => g.grupo === GRUPO)?.claves.includes(RUTA));
  }

  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(RUTA)})`), true);
  const guia = m.lua(`SnetForever.Datos.guia(${aLua(RUTA)})`);
  assert.deepEqual(guia.pasos.map((paso) => paso.elementos[0].texto.en),
    ['Primera parada', 'Parada con experiencia aumentada', 'Paso incluido', 'Visita al instructor', 'Última parada']);
  assert.equal(guia.pasos[2].de, 'RXP\\Ruta de prueba\\22-22 Desvío');

  const actual = () => m.lua('SnetForever.Motor.estado().actual');
  const marcar = (paso) => {
    m.lua(`SnetForever.Motor.marcarManual(${paso}, 1, true)`);
    m.avanzar(0.25);
  };
  assert.equal(actual(), 1);
  marcar(1);
  assert.equal(actual(), 2);
  marcar(2);
  assert.equal(m.lua('SnetForever.Motor.paso(3).datos.n'), 5);
  assert.equal(actual(), 3);
  marcar(3);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), DESTINO);
  assert.equal(m.lua('SnetForever.Motor.paso(1).elementos[1].resultado'), 'pendiente');
  m.estadoMision(788, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 788);
  m.avanzar(0.3);
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), DESTINO);

  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(ATAJO)})`), true);
  m.avanzar(0.25);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), OTRA_RUTA, '.next conserva el grupo y la alternativa de la ruta original');

  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(RUTA)}, {n = 1})`), true);
  m.lua('SnetForever.Ventana.crear()');
  const clic = m.lua(`(function()
    for _, linea in ipairs(SnetForever.Ventana.marcos.pasos[1].lineas) do
      if linea.fila and linea:GetText() == "Pulsa para elegir otro recorrido" then
        linea.fila:Click()
        return true
      end
    end
    return false
  end)()`);
  assert.equal(clic, true);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), OTRA_RUTA, '.clicknext carga el destino al pulsar');
  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(RUTA)}, {n = 1})`), true);
  m.lua('SnetForever.Ajustes.set("guias.xp", 1.5)');
  assert.equal(m.lua('SnetForever.Motor.paso(1).datos.elementos[1].texto.en'), 'Parada con experiencia aumentada');
  sinErrores(m);
});
