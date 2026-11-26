// 11-nov: la red de caminos a pie (motor/rutapie.lua) con guías de prueba en Durotar (1411: wx = -2000 - 50·x,
// wy = 1800 - 35·y, en yardas). Una guía rodea por el sur una «montaña» que no tiene ningún camino por encima.
// 12-nov: dentro de una misma zona se puede ir campo a través, así que la montaña separa dos zonas: la mitad de la guía
// que va al destino está en «Otra zona» (1499), con el mismo rectángulo que Durotar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const IR = (x, y, mapa = 1411) => ({ t: 'goto', mapa, x, y, modo: 'flecha' });
const OTRA = (x, y) => IR(x, y, 1499);
// De (10, 10) a (30, 10) dando la vuelta por (10, 30), (20, 40) y (30, 30): cada tramo de 10 % mide 500 o 350 yd.
const RODEO = [IR(10, 10), IR(10, 20), IR(10, 30), OTRA(20, 40), OTRA(30, 30), OTRA(30, 20), OTRA(30, 10)];
// La misma vuelta, toda en Durotar.
const RODEO_UNA_ZONA = [IR(10, 10), IR(10, 20), IR(10, 30), IR(20, 40), IR(30, 30), IR(30, 20), IR(30, 10)];

function conRed(elementos, otras = []) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 10, y: 10 } });
  m.lua('BANCO.mapas[1499] = {nombre = "Otra zona", inst = 1, padre = 1414, tipo = 3, izquierda = -2000, arriba = 1800, ancho = 5000, alto = 3500}');
  m.ponerGuia(guiaDePrueba([{ elementos }]));
  for (const [i, g] of otras.entries()) m.ponerGuia({ ...guiaDePrueba([{ elementos: g }]), clave: `Prueba\\otra ${i}` });
  return m;
}
const buscar = (m, a, b) => m.lua(`(function()
  local c = SnetForever.RutaPie.buscar(SnetForever.Coord.aMundo({mapa = 1411, x = ${a[0]}, y = ${a[1]}}),
    SnetForever.Coord.aMundo({mapa = 1411, x = ${b[0]}, y = ${b[1]}}))
  return c and {largo = c.largo, n = #c.puntos} or false
end)()`);

test('el camino sigue la red y rodea la montaña: más largo que la línea recta', () => {
  const m = conRed(RODEO);
  const c = buscar(m, [10, 10], [30, 10]);
  assert.ok(c, 'hay camino');
  // Recta: 20 % de ancho = 1000 yd. Por la red: 350 + 350 + 610 + 610 + 350 + 350 ≈ 2620 yd.
  assert.ok(c.largo > 2400 && c.largo < 2800, String(c.largo));
  assert.equal(c.n, 9, 'el jugador, los 7 puntos de la guía y el destino');
  sinErrores(m);
});

// 12-nov: campo a través solo en tramos cortos (en el juego, la línea recta larga cruzaba cortados que no se pueden
// andar: «las líneas rojas son desnivel, un jugador no puede ir por ese camino»).
test('12-nov: lejos (1000 yd) va por la red aunque sea en la misma zona; cerca (200 yd), en línea recta', () => {
  const m = conRed(RODEO_UNA_ZONA);
  const lejos = buscar(m, [10, 10], [30, 10]);
  assert.ok(lejos, 'hay camino');
  assert.equal(lejos.n, 9, 'por los 7 puntos de la guía');
  const cerca = buscar(m, [10, 10], [14, 10]);
  assert.equal(cerca.n, 2, 'el jugador y el destino, en línea recta');
  assert.ok(Math.abs(cerca.largo - 200) < 1, String(cerca.largo));
  sinErrores(m);
});

// 12-nov (en el juego, bajando por su cuenta del Puesto del Hachazo al río: «me manda en reversa, hasta la flecha»).
test('12-nov: yendo por un tramo largo, la flecha apunta al final del tramo, no al punto de detrás', () => {
  const m = conRed([IR(20, 22), IR(20, 20), IR(20, 5)]);
  m.jugador({ mapa: 1411, x: 20.8, y: 17 });
  const r = m.lua(`(function()
    local C = SnetForever.Coord
    local yo = C.jugador()
    local destino = C.aMundo({mapa = 1411, x = 20, y = 5})
    local puntos = {C.aMundo({mapa = 1411, x = 20, y = 22}), C.aMundo({mapa = 1411, x = 20, y = 20}), destino}
    SnetForever.RutaPie.buscar = function() return {puntos = puntos, largo = 1} end
    local p = SnetForever.RutaPie.seguir(yo, destino)
    return {wy = p.wy}
  end)()`);
  // (20, 20) está 112 yd detrás; el jugador va por el tramo hacia (20, 5) (wy = 1800 - 175 = 1625), a 40 yd de él.
  assert.equal(r.wy, 1625);
  sinErrores(m);
});

test('12-nov: entre zonas distintas no hay línea recta: campo a través hasta la red de su zona y por la red a la otra', () => {
  // El jugador en (14, 10), a 200 yd al este del principio de la vuelta.
  const m = conRed(RODEO);
  const c = buscar(m, [14, 10], [30, 10]);
  assert.ok(c, 'hay camino');
  assert.ok(c.largo > 2400 && c.largo < 3000, String(c.largo));
  sinErrores(m);
});

test('lejos de la red (más de 250 yd) no hay camino', () => {
  const m = conRed(RODEO);
  assert.equal(buscar(m, [10, 10], [80, 80]), false);
  sinErrores(m);
});

test('un vuelo en medio de la guía corta el recorrido: no hay camino a pie por donde se vuela', () => {
  const m = conRed([IR(10, 10), IR(10, 20), IR(10, 30), { t: 'fly', nombre: 'Orgrimmar' }, OTRA(20, 40), OTRA(30, 30), OTRA(30, 20), OTRA(30, 10)]);
  assert.equal(buscar(m, [10, 10], [30, 10]), false);
  sinErrores(m);
});

test('los caminos de guías distintas se cruzan donde coinciden', () => {
  const m = conRed([IR(10, 10), IR(10, 20), IR(10, 30)], [[IR(10, 30), OTRA(20, 40), OTRA(30, 30)], [OTRA(30, 30), OTRA(30, 20), OTRA(30, 10)]]);
  assert.ok(buscar(m, [10, 10], [30, 10]), 'se unen en (10, 30) y (30, 30)');
  sinErrores(m);
});

test('seguir: apunta al siguiente punto del camino (no al destino) y cuenta lo que queda por él; avisa con SNF_RUTA_PIE', () => {
  const m = conRed(RODEO);
  m.lua('AVISOS_RUTA = 0; SnetForever.Eventos.escuchar("SNF_RUTA_PIE", function() AVISOS_RUTA = AVISOS_RUTA + 1 end)');
  const r = m.lua(`(function()
    local yo = SnetForever.Coord.jugador()
    local destino = SnetForever.Coord.aMundo({mapa = 1411, x = 30, y = 10})
    local p, resto = SnetForever.RutaPie.seguir(yo, destino)
    return {wx = p.wx, wy = p.wy, resto = resto, puntos = #SnetForever.RutaPie.actual()}
  end)()`);
  // El primer punto a 30 yd o más: (10, 20), al sur del jugador (wy = 1800 - 700).
  assert.equal(r.wy, 1100);
  assert.ok(r.resto > 2400 && r.resto < 2800, String(r.resto));
  assert.equal(r.puntos, 9);
  assert.equal(m.lua('AVISOS_RUTA'), 1);
  sinErrores(m);
});

test('la flecha sigue el camino: la distancia es la que queda por él', () => {
  const m = conRed(RODEO);
  m.ponerGuia({ ...guiaDePrueba([{ elementos: [OTRA(30, 10)] }]), clave: 'Prueba\\destino' });
  m.lua(`SnetForever.Motor.cargar(${aLua('Prueba\\destino')})`);
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0)');
  const lineas = m.lua('SnetForever.Flecha.marcos.texto:GetText()').split('\n');
  const yardas = Number(lineas[1].replace(/\D/g, ''));
  assert.ok(yardas > 2400 && yardas < 2800, lineas[1]);
  sinErrores(m);
});

// 12-nov (en el juego: «la misión está en una dirección y la flecha me manda hacia atrás»): si el camino empieza con un
// rodeo por detrás, la flecha entra al camino por el punto que deja menos recorrido.
test('12-nov: con un rodeo por detrás al principio del camino, la flecha va directa al tramo que avanza', () => {
  // Camino: (20, 22) detrás del jugador, luego (20, 20), (20, 15), (20, 10). El jugador en (20, 19).
  const m = conRed([IR(20, 22), IR(20, 20), IR(20, 15), IR(20, 10)]);
  m.jugador({ mapa: 1411, x: 20, y: 19 });
  const r = m.lua(`(function()
    local yo = SnetForever.Coord.jugador()
    local destino = SnetForever.Coord.aMundo({mapa = 1411, x = 20, y = 10})
    -- Un camino que empieza por detrás, como el que salió en el juego.
    local puntos = {yo, SnetForever.Coord.aMundo({mapa = 1411, x = 20, y = 22}), SnetForever.Coord.aMundo({mapa = 1411, x = 20, y = 20}),
      SnetForever.Coord.aMundo({mapa = 1411, x = 20, y = 15}), destino}
    SnetForever.RutaPie.buscar = function() return {puntos = puntos, largo = 1} end
    local p, resto = SnetForever.RutaPie.seguir(yo, destino)
    return {wy = p.wy, resto = resto}
  end)()`);
  // Va a (20, 15) (wy = 1800 - 525 = 1275), no a (20, 22) de detrás; quedan 140 + 175 = 315 yd.
  assert.equal(r.wy, 1275);
  assert.ok(Math.abs(r.resto - 315) < 1, String(r.resto));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// 16-nov (en el juego, en Las Mil Agujas: la línea naranja iba de Viento Libre a la cueva de las arpías y a Nido Alto por
// encima de los cortados). Regla del jugador: mejor sin línea que una por donde no se puede ir. Dos sitios de misión
// seguidos de una guía no son un camino: solo se unen si están a 250 yd o menos. Los puntos de viaje que el autor puso
// para ir andando (un paso de solo ir, waypoint, line y loop) sí son camino, aunque estén lejos.
// ---------------------------------------------------------------------------------------------------

const ACEPTA = (q) => ({ t: 'accept', q });
function conPasos(pasos) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 10, y: 10 } });
  m.ponerGuia(guiaDePrueba(pasos.map((elementos) => ({ elementos }))));
  return m;
}

test('16-nov: dos sitios de misión seguidos a 800 yd y nada entre medias: sin camino (buscar, seguir y actual dan nil)', () => {
  // 16 % de ancho de Durotar = 800 yd.
  const m = conPasos([[IR(10, 10), ACEPTA(7001)], [IR(26, 10), ACEPTA(7002)]]);
  assert.equal(buscar(m, [10, 10], [26, 10]), false);
  const r = m.lua(`(function()
    local yo = SnetForever.Coord.aMundo({mapa = 1411, x = 10, y = 10})
    local p = SnetForever.RutaPie.seguir(yo, SnetForever.Coord.aMundo({mapa = 1411, x = 26, y = 10}))
    return {p = p ~= nil, actual = SnetForever.RutaPie.actual() ~= nil}
  end)()`);
  assert.deepEqual(r, { p: false, actual: false });
  sinErrores(m);
});

test('16-nov: sitios de misión seguidos a 250 yd o menos sí se unen', () => {
  // Cada 4 % = 200 yd.
  const m = conPasos([10, 14, 18, 22, 26].map((x, i) => [IR(x, 10), ACEPTA(7001 + i)]));
  const c = buscar(m, [10, 10], [26, 10]);
  assert.ok(c, 'hay camino');
  assert.ok(Math.abs(c.largo - 800) < 1, String(c.largo));
  sinErrores(m);
});

test('16-nov: un goto de viaje (un paso de solo ir) lejos del sitio anterior sigue contando como camino; un waypoint también', () => {
  const m = conPasos([[IR(10, 10), ACEPTA(7001)], [IR(26, 10)], [IR(26, 26), ACEPTA(7002)]]);
  const c = buscar(m, [10, 10], [26, 26]);
  assert.ok(c, 'hay camino: el paso de solo ir es de viaje');
  assert.equal(c.n, 5);
  const w = conPasos([[IR(10, 10), ACEPTA(7001)], [{ t: 'waypoint', mapa: 1411, x: 26, y: 10 }, ACEPTA(7003)]]);
  assert.ok(buscar(w, [10, 10], [26, 10]), 'un waypoint es de viaje');
  // Un goto «paso» en un paso de misión no es de viaje (en RestedXP suelen ser los sitios de los bichos).
  const p = conPasos([[IR(10, 10), ACEPTA(7001)], [{ ...IR(26, 10), modo: 'paso', radio: 10 }, ACEPTA(7003)]]);
  assert.equal(buscar(p, [10, 10], [26, 10]), false);
  sinErrores(m);
  sinErrores(w);
  sinErrores(p);
});

test('16-nov: RutaPie.tramos da el camino tramo a tramo entre los puntos (false donde no hay) y lo memoriza', () => {
  // De (10, 10) a (26, 10) por un paso de viaje; de (26, 10) a (26, 40), 1050 yd sin nada: sin camino.
  const m = conPasos([[IR(10, 10), ACEPTA(7001)], [IR(26, 10)]]);
  const r = m.lua(`(function()
    local C = SnetForever.Coord
    local lista = {C.aMundo({mapa = 1411, x = 10, y = 10}), C.aMundo({mapa = 1411, x = 26, y = 10}), C.aMundo({mapa = 1411, x = 26, y = 40})}
    local llamadas = 0
    local buscar = SnetForever.RutaPie.buscar
    SnetForever.RutaPie.buscar = function(a, b) llamadas = llamadas + 1 return buscar(a, b) end
    local t = SnetForever.RutaPie.tramos(lista)
    local otra = SnetForever.RutaPie.tramos(lista)
    SnetForever.RutaPie.buscar = buscar
    return {n = #t, uno = t[1] and #t[1].puntos or false, dos = t[2], llamadas = llamadas, igual = otra[1] == t[1]}
  end)()`);
  assert.deepEqual(r, { n: 2, uno: 4, dos: false, llamadas: 2, igual: true });
  sinErrores(m);
});
