// 12-nov (en el juego, con capturas): un jugador empezó la guía 26-28 de Vallefresno sin haber hecho la de 24-26, y el
// paso «Cabeza de Ordanus» (complete de la misión 1088, que se coge en Sierra Espolón) lo mandó a matar a Ordanus sin
// tener la misión: «llego al sitio, me muero muchas veces y luego me doy cuenta de que no tengo ni la quest». Ahora un
// complete o turnin cuyo paso no acepta esa misión cuenta como hecho si la misión no está en el diario (con el registro
// ya cargado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const ORDANUS = 1088;
const OTRA = 6441; // una misión cualquiera en el diario: el registro está cargado
const IR = { t: 'goto', mapa: 1411, x: 62, y: 51, modo: 'flecha' };
const MANUAL = { t: 'manual', texto: { en: 'Do it', es: 'Hazlo' } };
const HACER = (q) => ({ t: 'complete', q, objetivo: 1 });
const ENTREGAR = (q) => ({ t: 'turnin', q });
const ACEPTAR = (q) => ({ t: 'accept', q });

function conGuia(pasos, misiones = {}) {
  const m = nuevaMaquina();
  for (const [q, estado] of Object.entries(misiones)) m.estadoMision(Number(q), estado);
  m.ponerGuia(guiaDePrueba(pasos));
  m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  for (let i = 0; i < 4; i++) m.lua('SnetForever.Motor.actualizar()');
  return m;
}
const actual = (m) => m.lua('SnetForever.Motor.estado()').actual;

test('12-nov: sin la misión en el diario, el paso de hacerla se salta y la guía sigue', () => {
  const m = conGuia([{ elementos: [IR, HACER(ORDANUS)] }, { elementos: [MANUAL] }], { [OTRA]: { enDiario: true } });
  assert.equal(actual(m), 2);
  sinErrores(m);
});

test('12-nov: con la misión en el diario, el paso de hacerla espera', () => {
  const m = conGuia([{ elementos: [IR, HACER(ORDANUS)] }, { elementos: [MANUAL] }], { [ORDANUS]: { enDiario: true } });
  assert.equal(actual(m), 1);
  sinErrores(m);
});

test('12-nov: sin la misión, el paso de entregarla también se salta', () => {
  const m = conGuia([{ elementos: [IR, ENTREGAR(ORDANUS)] }, { elementos: [MANUAL] }], { [OTRA]: { enDiario: true } });
  assert.equal(actual(m), 2);
  sinErrores(m);
});

test('12-nov: si el mismo paso acepta la misión, no se salta aunque aún no se tenga', () => {
  const m = conGuia([{ elementos: [IR, ACEPTAR(ORDANUS), HACER(ORDANUS)] }, { elementos: [MANUAL] }], { [OTRA]: { enDiario: true } });
  assert.equal(actual(m), 1);
  sinErrores(m);
});

test('12-nov: con el registro aún vacío al entrar (sin ninguna misión), no se salta nada todavía', () => {
  const m = conGuia([{ elementos: [IR, HACER(ORDANUS)] }, { elementos: [MANUAL] }]);
  assert.equal(actual(m), 1);
  sinErrores(m);
});

test('12-nov: si la guía acepta la misión más adelante (recoger de camino), el paso espera como siempre', () => {
  const m = conGuia([{ elementos: [IR, HACER(ORDANUS)] }, { elementos: [MANUAL] }, { elementos: [ACEPTAR(ORDANUS)] }], { [OTRA]: { enDiario: true } });
  assert.equal(actual(m), 1);
  sinErrores(m);
});

// Con los datos reales: la guía 26-28 de Vallefresno, puesta en el paso de Ordanus con el diario de las capturas (sin
// la 1088), pasa al de Shadumbra.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const reales = { skip: existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES) ? false : 'no están los addons de datos', timeout: 900000 };

test('datos reales: en la 26-28 de Vallefresno sin la misión de Ordanus, la guía no manda a matarlo (ni a por Shadumbra)', reales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: { raza: 'Tauren', clase: 'DRUID', faccion: 'Horde', nivel: 25 }, forever: true });
  for (const q of [216, 6441]) m.estadoMision(q, { enDiario: true });
  const clave = 'Skyrim Horde 22-30 (EN)' + String.fromCharCode(92) + '26-28 Ashenvale';
  assert.ok(m.lua(`SnetForever.Motor.cargar(${aLua(clave)})`));
  const n = m.lua(`(function()
    local i = 1
    while SnetForever.Motor.paso(i) do
      if SnetForever.Motor.paso(i).n == 18 then
        SnetForever.Motor.irA(i)
        for _ = 1, 4 do SnetForever.Motor.actualizar() end
        local e = SnetForever.Motor.estado()
        return SnetForever.Motor.paso(e.actual).n
      end
      i = i + 1
    end
  end)()`);
  // Pasa de Ordanus (18). Desde el 12-nov (motor-no-disponible.test.js) tampoco se para en Shadumbra (19): sin «La Caza
  // de Vallefresno» entregada el juego no da «La cabeza de Shadumbra».
  assert.equal(n, 20, 'el paso de después de Shadumbra');
  sinErrores(m);
});
