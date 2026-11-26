// Órdenes cortas de /snet (0.7.0): una letra para las que más se usan, porque «/snet muestrario» es largo y se olvida.
// g = ventana de la guía, c = comercio (y «c activar»), m = muestrario, d = diario, a = aquí, f = fallo, h = ayuda.
// «ia» se queda como está; «reiniciar» y «prueba» no tienen letra, para que no se pulsen sin querer. Las órdenes largas
// y las inglesas siguen valiendo. La ayuda enseña la letra al lado de cada orden; el muestrario sigue fuera de la ayuda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLua } from '../src/lua-js.js';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const SOLO = { sinComercio: true, jugador: JUGADOR };
const INICIO = 'Prueba (H)\\01-02 Inicio';

const slash = (m, texto = '') => m.lua(`SlashCmdList.SNET(${aLua(texto)})`);
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
const texto = (m, clave) => m.lua(`SnetForever.L.t(${aLua(clave)})`);

// Lo que escribe una orden en el chat (solo lo nuevo).
const escribe = (m, orden) => {
  const antes = impresos(m).length;
  slash(m, orden);
  return impresos(m).slice(antes);
};

test('/snet g alterna la ventana de la guía, igual que /snet ventana (también en mayúscula)', () => {
  const m = nuevaMaquina({ jugador: JUGADOR });
  m.lua(`SnetForever.Motor.cargar(${aLua(INICIO)})`);
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  slash(m, 'g');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), false);
  slash(m, 'G');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  slash(m, 'ventana');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), false, 'la orden larga sigue valiendo');
  slash(m, 'window');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true, 'la inglesa también');
  sinErrores(m);
});

test('/snet f abre el diálogo de fallo, igual que /snet fallo', () => {
  const m = nuevaMaquina({ jugador: JUGADOR });
  slash(m, 'f');
  assert.equal(m.marco('SnetForeverFallo').visible, true);
  sinErrores(m);
});

test('/snet d, /snet a y /snet h escriben lo mismo que diario, aqui y ayuda', () => {
  const m = nuevaMaquina({ jugador: JUGADOR });
  m.lua('BANCO.nombresJuego.item[5107] = "Camisa"');
  m.lua('SnetForeverPJ.diario.e = {{i = 5107, c = 1, t = 6, nv = 1, o = "vendedor", npc = 3143, p = 125}}');
  const diario = escribe(m, 'diario');
  assert.ok(diario.length > 0);
  assert.deepEqual(escribe(m, 'd'), diario);
  const aqui = escribe(m, 'aqui');
  assert.ok(aqui.length > 0);
  assert.deepEqual(escribe(m, 'a'), aqui);
  const ayuda = escribe(m, 'ayuda');
  assert.ok(ayuda.length > 0);
  assert.deepEqual(escribe(m, 'h'), ayuda);
  assert.deepEqual(escribe(m, 'help'), ayuda, 'la inglesa sigue valiendo');
  sinErrores(m);
});

test('con solo el núcleo: /snet c, /snet m y /snet c activar dicen lo mismo que las órdenes largas', () => {
  const m = nuevaMaquina(SOLO);
  assert.deepEqual(escribe(m, 'c'), [texto(m, 'COMERCIO_NO_CARGADO')]);
  assert.deepEqual(escribe(m, 'm'), [texto(m, 'COMERCIO_NO_CARGADO')]);
  assert.ok(!m.lua('rawget(_G, "SnetForeverMuestrario")'));
  const largo = escribe(m, 'comercio activar');
  assert.ok(largo.length > 0);
  assert.deepEqual(escribe(m, 'c activar'), largo);
  assert.deepEqual(escribe(m, 'C ACTIVAR'), largo, 'sin distinguir mayúsculas');
  sinErrores(m);
});

test('con los dos addons: /snet m abre y cierra el muestrario; /snet c no avisa de desactivado', necesitaComercio, () => {
  const m = nuevaMaquina({ jugador: JUGADOR });
  slash(m, 'm');
  assert.equal(m.lua('SnetForeverMuestrario:IsShown()'), true);
  slash(m, 'm');
  assert.equal(m.lua('SnetForeverMuestrario:IsShown()'), false);
  slash(m, 'muestrario');
  assert.equal(m.lua('SnetForeverMuestrario:IsShown()'), true, 'la orden larga sigue valiendo');
  const corta = escribe(m, 'c');
  assert.ok(!corta.includes(texto(m, 'COMERCIO_NO_CARGADO')));
  assert.deepEqual(corta, escribe(m, 'comercio'), '/snet c hace lo mismo que /snet comercio');
  sinErrores(m);
});

test('reiniciar y prueba no tienen letra: /snet r y /snet p solo escriben la ayuda', () => {
  const m = nuevaMaquina({ jugador: JUGADOR });
  m.lua(`SnetForever.Motor.cargar(${aLua(INICIO)})`);
  m.lua('SnetForever.Ajustes.set("ventana.pos", {punto = "TOP", relPunto = "TOP", x = 7, y = -9})');
  const ayuda = escribe(m, 'ayuda');
  assert.deepEqual(escribe(m, 'r'), ayuda);
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.pos").x'), 7, '/snet r no devuelve nada a su sitio');
  assert.deepEqual(escribe(m, 'p'), ayuda);
  assert.ok(!impresos(m).includes(texto(m, 'PRUEBA_PUESTA')), '/snet p no pone puntos de prueba');
  sinErrores(m);
});

// La letra va al lado de cada orden: «/snet g (o /snet ventana): …». Con «(» detrás, porque «/snet a» también es el
// principio de «/snet ai».
const LETRAS_ES = { g: '/snet ventana', c: '/snet comercio', d: '/snet diario', a: '/snet aqui', f: '/snet fallo', h: '/snet ayuda' };
const LETRAS_EN = { g: '/snet window', c: '/snet trade', d: '/snet log', a: '/snet here', f: '/snet bug', h: '/snet help' };

for (const [idioma, letras, activar] of [['esES', LETRAS_ES, 'activar'], ['enUS', LETRAS_EN, 'activate']]) {
  test(`la ayuda (${idioma}) enseña la letra al lado de cada orden; el muestrario y las letras de reiniciar y prueba no salen`, () => {
    const m = nuevaMaquina({ jugador: { ...JUGADOR, idioma } });
    const lineas = escribe(m, 'h');
    assert.equal(lineas.length, 12, 'título, ajustes, ventana, comercio, chat, fallo, reiniciar, prueba, aquí, importar, diario y ayuda');
    for (const [letra, larga] of Object.entries(letras)) {
      const conLetra = lineas.filter((l) => l.startsWith(`/snet ${letra} (`));
      assert.equal(conLetra.length, 1, `/snet ${letra}`);
      assert.ok(conLetra[0].includes(larga), `${letra} → ${larga}: ${conLetra[0]}`);
    }
    assert.ok(lineas.some((l) => l.includes(`/snet c ${activar}`)), `la ayuda dice /snet c ${activar}`);
    assert.deepEqual(escribe(m, `c ${activar}`), escribe(m, 'comercio activar'), `/snet c ${activar} funciona`);
    for (const letra of ['m', 'r', 'p', 't']) {
      assert.ok(!lineas.some((l) => l.startsWith(`/snet ${letra} (`)), `/snet ${letra} no sale`);
    }
    assert.ok(!lineas.some((l) => l.includes('muestrario')), 'el muestrario sigue fuera de la ayuda');
    sinErrores(m);
  });
}
