// Lote C (revisión 52, Minor 4): los ajustes que cambian qué pasos se ven o qué avisos tocan se aplican al momento, sin
// recargar: «Saltar pasos por nivel» (pasos.saltarPorNivel) rehace la guía con Motor.recargar(); encender
// avisos.cadenas, avisos.mazmorras o avisos.mejoras (o cambiar la versión, de la que depende el valor por defecto de
// avisos.mazmorras) mete en la cola lo que ya toca con Avisos.revisar(); «Saltar misiones grises» vuelve a mirar el
// paso actual en el ciclo siguiente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const AVISOS = ['rutas-mini.lua', 'misiones-mini.lua', 'avisos-f3-mini.lua'].map((f) => join(FIXTURES, f));
const MEJORAS = ['rutas-mini.lua', 'misiones-mini.lua', 'laterales-mini.lua', 'mejoras-mini.lua'].map((f) => join(FIXTURES, f));
const CLAVE = 'Prueba\\01-60 Guía de prueba';
const VIGILADO = ['motor/pasos.lua', 'motor/avisos.lua'];

const guardado = (ajustes) => ({
  SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } },
  SnetForeverPJ: { esquema: 1, ajustes },
});
const maquina = (opciones) => nuevaMaquina({ vigilarSecretos: VIGILADO, ...opciones });
const cola = (m) => m.lua('SnetForever.Avisos.cola()').map((a) => a.id);
const ids = (m) => m.lua(`(function()
  local t, i = {}, 1
  while SnetForever.Motor.paso(i) do t[i] = SnetForever.Motor.paso(i).id; i = i + 1 end
  return t
end)()`);

// --- Avisos ---

test('lote C (52-M4): encender avisos.cadenas mete en la cola el aviso que ya toca, sin subir de nivel ni recargar', () => {
  const m = maquina({ datos: AVISOS, guardado: guardado({ 'avisos.cadenas': false }),
    jugador: { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 } });
  m.lua('SnetForever.Avisos.revisar()');
  assert.deepEqual(cola(m), []);
  m.lua('SnetForever.Ajustes.set("avisos.cadenas", true)');
  assert.ok(cola(m).includes('cadena-oso-H'), cola(m).join(', '));
  // Apagarlo lo quita de la cola (como hasta ahora) y volver a encenderlo no lo duplica.
  m.lua('SnetForever.Ajustes.set("avisos.cadenas", false)');
  assert.deepEqual(cola(m), []);
  m.lua('SnetForever.Ajustes.set("avisos.cadenas", true)');
  assert.equal(cola(m).filter((id) => id === 'cadena-oso-H').length, 1);
  sinErrores(m);
});

test('lote C (52-M4): encender avisos.mazmorras, o pasar a «Con mazmorras» con el ajuste sin tocar, avisa al momento', () => {
  const guerrero = { clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 15 };
  const m = maquina({ datos: AVISOS, jugador: guerrero });
  m.lua('SnetForever.Avisos.revisar()');
  assert.ok(!cola(m).includes('mazmorra-1581-H'));
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", true)');
  assert.ok(cola(m).includes('mazmorra-1581-H'), cola(m).join(', '));
  sinErrores(m);
  const porVersion = maquina({ datos: AVISOS, jugador: guerrero });
  porVersion.lua('SnetForever.Avisos.revisar()');
  assert.ok(!cola(porVersion).includes('mazmorra-1581-H'));
  porVersion.lua('SnetForever.Ajustes.set("version", "mazmorras")');
  assert.ok(cola(porVersion).includes('mazmorra-1581-H'), cola(porVersion).join(', '));
  sinErrores(porVersion);
});

test('lote C (52-M4): encender avisos.mejoras mete en la cola la mejora que ya toca', () => {
  const m = maquina({ datos: MEJORAS, guardado: guardado({ 'avisos.mejoras': false }),
    jugador: { clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 14 } });
  m.lua('SnetForever.Avisos.revisar()');
  assert.ok(!cola(m).includes('mejora-prueba-H'));
  m.lua('SnetForever.Ajustes.set("avisos.mejoras", true)');
  assert.ok(cola(m).includes('mejora-prueba-H'), cola(m).join(', '));
  sinErrores(m);
});

// --- Pasos ---

const NOTA = { t: 'nota', texto: { en: 'Note', es: 'Nota' } };

test('lote C (52-M4): «Saltar pasos por nivel» quita y devuelve al momento los pasos con #maxlevel, sin perder el paso actual', () => {
  const pasos = [
    { elementos: [NOTA] },
    { etiquetas: { maxlevel: '5' }, elementos: [NOTA] },
    { elementos: [{ t: 'manual', texto: { en: 'Do it', es: 'Hazlo' } }] },
    { elementos: [NOTA] },
  ];
  const m = maquina({ jugador: { nivel: 6 } });
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.avanzar(1);
  assert.deepEqual(ids(m), ['p1', 'p3', 'p4']);
  const actualId = () => m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).id');
  assert.equal(actualId(), 'p3');
  m.lua('SnetForever.Ajustes.set("pasos.saltarPorNivel", false)');
  assert.deepEqual(ids(m), ['p1', 'p2', 'p3', 'p4'], 'aparece sin recargar');
  assert.equal(actualId(), 'p3', 'el paso actual se conserva');
  m.lua('SnetForever.Ajustes.set("pasos.saltarPorNivel", true)');
  assert.deepEqual(ids(m), ['p1', 'p3', 'p4'], 'y desaparece');
  assert.equal(actualId(), 'p3');
  sinErrores(m);
});

test('lote C (52-M4): «Saltar misiones grises» se aplica al paso actual sin recargar', () => {
  const MISION = (nombre, ql) => ({ name: nombre, startedBy: [[3143]], finishedBy: [[3143]], requiredLevel: Math.max(1, ql - 5),
    questLevel: ql, requiredRaces: 0, requiredClasses: 0, objectivesText: [`Haz ${nombre}`] });
  const m = maquina({ guardado: guardado({ 'pasos.saltarGrises': false }), jugador: { nivel: 22, clase: 'DRUID', raza: 'Tauren' } });
  m.datoMision(9001, MISION('Boticaria de prueba', 15));
  m.datoMision(9003, MISION('De tu nivel', 21));
  m.ponerGuia(guiaDePrueba([
    { elementos: [{ t: 'accept', q: 9001 }] },
    { elementos: [{ t: 'accept', q: 9003 }] },
  ]));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  m.avanzar(2);
  const actualN = () => m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).n');
  assert.equal(actualN(), 1);
  m.lua('SnetForever.Ajustes.set("pasos.saltarGrises", true)');
  m.avanzar(1);
  assert.equal(actualN(), 2, 'el paso gris se salta solo');
  assert.equal((m.lua('SnetForeverPJ.saltados') || [])[0].motivo, 'gris');
  sinErrores(m);
});
