// Coordenadas, capa de puntos y navegación (mapa/coordenadas.lua, mapa/capa.lua y mapa/navegacion.lua), tarea 13.
// Rectángulo del mapa 1411 del banco (src/wow-falso.lua): wx = -2000 - 5000·x/100, wy = 1800 - 3500·y/100, inst 1.
// wx crece hacia el oeste y wy hacia el norte (plano 3 §2.2 y §3.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const mundo1411 = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

// Elementos de prueba. `padre` es el índice (desde 0) del elemento padre en el paso, como en los datos de la fase 1.
const ACEPTAR = (q) => ({ t: 'accept', q, texto: { en: `Accept ${q}`, es: `Acepta ${q}` } });
const IR = (x, y, campos = {}) => ({ t: 'goto', mapa: 1411, x, y, modo: 'flecha', ...campos });

function conGuia(pasos, campos = {}, opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba(pasos, campos));
  return m;
}

const cargar = (m) => m.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
const destino = (m) => m.lua('SnetForever.Navegacion.destino()');
const comprobar = (m) => m.lua('SnetForever.Navegacion.comprobarLlegada()');
// Elemento k (desde 0, como `padre`) del paso i del motor.
const elemento = (m, i, k) => m.lua(`SnetForever.Motor.paso(${i}).elementos[${k + 1}]`);
// Pone al jugador en (x, y) del mapa 1411, o a `dy` yardas al norte de ese punto.
const ponerEn = (m, x, y, dy = 0) => {
  const w = mundo1411(x, y);
  m.jugador({ mundo: { wx: w.wx, wy: w.wy + dy, inst: 1 } });
};

// Cuenta los mensajes internos `evento` y guarda el último argumento.
function contar(m, evento) {
  m.lua(`CUENTA_${evento} = {n = 0}
  SnetForever.Eventos.escuchar("${evento}", function(a) CUENTA_${evento}.n = CUENTA_${evento}.n + 1; CUENTA_${evento}.ultimo = a end)`);
  return () => m.lua(`CUENTA_${evento}`);
}

// ---------------------------------------------------------------------------------------------------
// Banco: las APIs nuevas guardan el orden de UnitPosition y de HereBeDragons
// ---------------------------------------------------------------------------------------------------

test('banco: UnitPosition da primero wy y luego wx; el vector de GetWorldPosFromMapPos, primero wy', () => {
  const m = nuevaMaquina();
  m.jugador({ mapa: 1411, x: 50, y: 25 });
  assert.deepEqual(m.lua('{UnitPosition("player")}'), [925, -4500, 0, 1]);
  assert.deepEqual(m.lua('{C_Map.GetWorldPosFromMapPos(1411, CreateVector2D(0.5, 0.25))}')[0], 1);
  assert.deepEqual(m.lua('{C_Map.GetWorldPosFromMapPos(1411, CreateVector2D(0.5, 0.25))}')[1].x, 925);
  assert.deepEqual(m.lua('{C_Map.GetWorldPosFromMapPos(1411, CreateVector2D(0.5, 0.25))}')[1].y, -4500);
  assert.deepEqual(m.lua('{C_Map.GetPlayerMapPosition(1411, "player"):GetXY()}'), [0.5, 0.25]);
  assert.equal(m.lua('C_Map.GetMapInfo(1411).parentMapID'), 1414);
  assert.equal(m.lua('C_Map.GetMapInfo(1414).mapType'), 2);
  assert.equal(m.lua('C_Map.GetMapInfo(9999)'), undefined);
  assert.equal(m.lua('GetPlayerFacing()'), 0);
  m.jugador({ enInstancia: true });
  assert.deepEqual(m.lua('{UnitPosition("player")}'), []);
  assert.equal(m.lua('GetPlayerFacing()'), undefined);
  assert.throws(() => m.lua('CreateVector2D(1, 2):Normalize()'), /no imitado: Normalize/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Coord
// ---------------------------------------------------------------------------------------------------

test('Coord.aMundo de {mapa=1411, x=50, y=25} sale del rectángulo del banco, con GetWorldPosFromMapPos', () => {
  const m = nuevaMaquina({ entrar: false }); // sin entrar al mundo: los puntos de la guía del arranque llamarían antes
  assert.deepEqual(m.lua('SnetForever.Coord.aMundo({mapa = 1411, x = 50, y = 25})'), { wx: -4500, wy: 925, inst: 1 });
  assert.deepEqual(m.llamadas('C_Map.GetWorldPosFromMapPos').map((l) => l[0]), [1411]);
  assert.deepEqual(m.llamadas('CreateVector2D')[0], [0.5, 0.25]);
  // Un punto de mundo pasa tal cual y no pregunta al juego.
  assert.deepEqual(m.lua('SnetForever.Coord.aMundo({mapa = 1411, inst = 1, wx = -4251.46, wy = -607.35})'),
    { wx: -4251.46, wy: -607.35, inst: 1 });
  // Se memoriza por punto.
  m.lua('P = {mapa = 1411, x = 10, y = 10}; SnetForever.Coord.aMundo(P); SnetForever.Coord.aMundo(P)');
  assert.equal(m.llamadas('C_Map.GetWorldPosFromMapPos').length, 2);
  assert.equal(m.lua('SnetForever.Coord.aMundo({mapa = 9999, x = 1, y = 1})'), undefined);
  sinErrores(m);
});

test('Coord.rect: esquinas (0,0) y (1,1) en wx/wy, memorizado', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Coord.rect(1411)'), { x0: -2000, y0: 1800, x1: -7000, y1: -1700, inst: 1 });
  m.lua('SnetForever.Coord.rect(1411)');
  assert.equal(m.llamadas('C_Map.GetWorldPosFromMapPos').length, 2);
  assert.equal(m.lua('SnetForever.Coord.rect(9999)'), undefined);
  sinErrores(m);
});

test('Coord.aMapa: de vuelta da 50 y 25 (error < 0,01)', () => {
  const m = nuevaMaquina();
  const [x, y] = m.lua(`(function()
    local C = SnetForever.Coord
    local w = C.aMundo({mapa = 1411, x = 50, y = 25})
    return {C.aMapa({mapa = 1411, inst = w.inst, wx = w.wx, wy = w.wy})}
  end)()`);
  assert.ok(Math.abs(x - 50) < 0.01 && Math.abs(y - 25) < 0.01, `${x}, ${y}`);
  // Un punto en % se queda en sus propias coordenadas.
  assert.deepEqual(m.lua('{SnetForever.Coord.aMapa({mapa = 1411, x = 12.5, y = 80})}'), [12.5, 80]);
  sinErrores(m);
});

test('Coord: orden fijado con el primer goto real de Durotar (.goto 1411/1,-4251.46,-607.35, Kaltunk ~ (43, 68) %)', () => {
  const m = nuevaMaquina();
  // wx es el PRIMER número de la guía (2.º de UnitPosition) y wy el segundo (1.º de UnitPosition).
  const [x, y] = m.lua('{SnetForever.Coord.aMapa({mapa = 1411, inst = 1, wx = -4251.46, wy = -607.35})}');
  assert.ok(x > 40 && x < 50 && y > 63 && y < 73, `cae en Durotar cerca de (43, 68): ${x}, ${y}`);
  // Con el jugador sobre ese punto, UnitPosition da (wy, wx) y Coord.jugador() lo vuelve a cruzar.
  m.jugador({ mundo: { wx: -4251.46, wy: -607.35, inst: 1 } });
  assert.deepEqual(m.lua('SnetForever.Coord.jugador()'), { wx: -4251.46, wy: -607.35, inst: 1 });
  assert.deepEqual(m.lua('{UnitPosition("player")}').slice(0, 2), [-607.35, -4251.46]);
  const d = m.lua('(SnetForever.Coord.vector(SnetForever.Coord.jugador(), SnetForever.Coord.aMundo({mapa = 1411, inst = 1, wx = -4251.46, wy = -607.35})))');
  assert.ok(cerca(d, 0));
  sinErrores(m);
});

test('Coord.aMapa sobre el padre 1414 usa GetMapRectOnMap; sobre 1453 (sin relación), nil', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.ponerRectEnMapa(1411, 1414, 0.4, 0.6, 0.3, 0.5)');
  assert.deepEqual(m.lua('{SnetForever.Coord.aMapa({mapa = 1411, x = 50, y = 25}, 1414)}').map((v) => Math.round(v * 1e6) / 1e6), [50, 35]);
  assert.deepEqual(m.llamadas('C_Map.GetMapRectOnMap'), [[1411, 1414]]);
  // Un punto de mundo, igual que su equivalente en %.
  const [x, y] = m.lua('{SnetForever.Coord.aMapa({mapa = 1411, inst = 1, wx = -4500, wy = 925}, 1414)}');
  assert.ok(cerca(x, 50) && cerca(y, 35), `${x}, ${y}`);
  assert.deepEqual(m.lua('{SnetForever.Coord.aMapa({mapa = 1411, x = 50, y = 25}, 1453)}'), []);
  assert.deepEqual(m.lua('{SnetForever.Coord.aMapa({mapa = 1411, x = 50, y = 25}, 1411)}'), [50, 25]);
  sinErrores(m);
});

test('Coord.vector: 0 al norte, π/2 al oeste, π al sur, 3π/2 al este; la distancia a (30, 40) es 50', () => {
  const m = nuevaMaquina();
  const vector = (dx, dy) => m.lua(`{SnetForever.Coord.vector({wx = 0, wy = 0}, {wx = ${dx}, wy = ${dy}})}`);
  assert.ok(cerca(vector(0, 10)[1], 0));
  assert.ok(cerca(vector(10, 0)[1], Math.PI / 2));
  assert.ok(cerca(vector(0, -10)[1], Math.PI));
  assert.ok(cerca(vector(-10, 0)[1], 3 * Math.PI / 2));
  assert.ok(cerca(vector(30, 40)[0], 50));
  for (const [dx, dy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const a = vector(dx, dy)[1];
    assert.ok(a >= 0 && a < 2 * Math.PI, `[0, 2π): ${a}`);
  }
  sinErrores(m);
});

test('Coord.comprobar: GetPlayerMapPosition y aMapa de UnitPosition coinciden', () => {
  const m = nuevaMaquina();
  const c = m.lua('SnetForever.Coord.comprobar()');
  assert.equal(c.mapa, 1411);
  assert.ok(cerca(c.x, 43.3) && cerca(c.y, 69), JSON.stringify(c));
  assert.ok(cerca(c.xCalc, 43.3) && cerca(c.yCalc, 69), JSON.stringify(c));
  assert.ok(c.dif < 1e-6);
  m.jugador({ enInstancia: true });
  assert.equal(m.lua('SnetForever.Coord.comprobar().dif'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Capa
// ---------------------------------------------------------------------------------------------------

test('Capa: poner/quitar emiten SNF_PUNTOS_CAMBIADOS; visibles sin "ia" con pines.ia apagado', () => {
  const m = nuevaMaquina();
  const cambios = contar(m, 'SNF_PUNTOS_CAMBIADOS');
  m.lua(`local C = SnetForever.Capa
    C.poner("guia", {{mapa = 1411, x = 1, y = 1}})
    C.poner("ia", {{mapa = 1411, x = 2, y = 2}})
    C.poner("jugador", {{mapa = 1411, x = 3, y = 3}})`);
  assert.equal(cambios().n, 3);
  assert.equal(cambios().ultimo, 'jugador');
  assert.deepEqual(m.lua('SnetForever.Capa.visibles()').map((p) => p.origen).sort(), ['guia', 'ia', 'jugador']);
  m.lua('SnetForever.Ajustes.set("pines.ia", false)');
  assert.deepEqual(m.lua('SnetForever.Capa.visibles()').map((p) => p.origen).sort(), ['guia', 'jugador']);
  m.lua('SnetForever.Capa.quitar("jugador")');
  assert.equal(cambios().n, 4);
  assert.deepEqual(m.lua('SnetForever.Capa.visibles()').map((p) => p.origen), ['guia']);
  assert.deepEqual(m.lua('SnetForever.Capa.puntos("jugador")'), []);
  assert.throws(() => m.lua('SnetForever.Capa.poner("otro", {})'), /origen/);
  sinErrores(m);
});

test('Capa.ruta: los puntos con seguir de "jugador" e "ia", por orden; sin ninguno, nil', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Capa.ruta()'), undefined);
  m.lua(`local C = SnetForever.Capa
    C.poner("guia", {{mapa = 1411, x = 1, y = 1, seguir = true, orden = 0, etiqueta = "G"}})
    C.poner("jugador", {{mapa = 1411, x = 2, y = 2, seguir = true, orden = 3, etiqueta = "J3"},
      {mapa = 1411, x = 3, y = 3, orden = 1, etiqueta = "suelto"}})
    C.poner("ia", {{mapa = 1411, x = 4, y = 4, seguir = true, orden = 2, etiqueta = "I2"}})`);
  assert.deepEqual(m.lua('SnetForever.Capa.ruta()').map((p) => p.etiqueta), ['I2', 'J3']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Navegacion.destino
// ---------------------------------------------------------------------------------------------------

test('destino: el primer goto del paso activo, con distancia y ángulo', () => {
  const m = conGuia([{ elementos: [ACEPTAR(10), IR(50, 25, { padre: 0 }), IR(60, 25, { padre: 0 })] }]);
  ponerEn(m, 50, 50);
  cargar(m);
  const d = destino(m);
  assert.equal(d.punto.x, 50);
  assert.equal(d.punto.origen, 'guia');
  assert.equal(d.punto.orden, 1);
  assert.equal(d.punto.etiqueta, 'Acepta 10');
  assert.ok(cerca(d.distancia, 875), `${d.distancia}`);
  assert.ok(cerca(d.angulo, 0), `al norte: ${d.angulo}`);
  assert.equal(d.otroContinente, undefined);
  sinErrores(m);
});

test('destino: con el padre hecho, el siguiente', () => {
  const m = conGuia([{
    elementos: [ACEPTAR(10), IR(50, 25, { padre: 0 }), ACEPTAR(11), IR(60, 25, { padre: 2 })],
  }]);
  cargar(m);
  assert.equal(destino(m).punto.x, 50);
  m.estadoMision(10, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 10);
  assert.equal(elemento(m, 1, 0).resultado, 'hecho');
  assert.equal(destino(m).punto.x, 60);
  sinErrores(m);
});

test('destino: "baja" solo si no hay otro; "pin" no lleva flecha', () => {
  const m = conGuia([{
    elementos: [
      ACEPTAR(10),
      IR(10, 10, { modo: 'pin', radio: 0, padre: 0 }),
      IR(20, 20, { modo: 'baja', radio: 0, padre: 0 }),
      ACEPTAR(11),
      IR(30, 30, { padre: 3 }),
    ],
  }]);
  cargar(m);
  assert.equal(destino(m).punto.x, 30);
  m.estadoMision(11, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 11);
  assert.equal(destino(m).punto.x, 20);
  assert.equal(destino(m).punto.modo, 'baja');
  sinErrores(m);
});

test('destino: entre dos "cercano", el más próximo', () => {
  const m = conGuia([{
    elementos: [ACEPTAR(10), IR(10, 50, { modo: 'cercano', radio: -1, padre: 0 }), IR(90, 50, { modo: 'cercano', radio: -1, padre: 0 })],
  }]);
  cargar(m);
  ponerEn(m, 80, 50);
  assert.equal(destino(m).punto.x, 90);
  ponerEn(m, 20, 50);
  assert.equal(destino(m).punto.x, 10);
  sinErrores(m);
});

test('destino: con una Capa.ruta() del jugador, gana la ruta; al llegar a su punto, el siguiente', () => {
  const m = conGuia([{ elementos: [ACEPTAR(10), IR(50, 25, { padre: 0 })] }]);
  cargar(m);
  const llegadas = contar(m, 'SNF_LLEGADA');
  m.lua(`SnetForever.Capa.poner("jugador", {
    {mapa = 1411, x = 20, y = 20, seguir = true, orden = 2, etiqueta = "B"},
    {mapa = 1411, x = 10, y = 10, seguir = true, orden = 1, etiqueta = "A"}})`);
  assert.equal(destino(m).punto.etiqueta, 'A');
  assert.equal(destino(m).punto.origen, 'jugador');
  ponerEn(m, 10, 10, 2);
  comprobar(m);
  assert.equal(llegadas().n, 1);
  assert.equal(llegadas().ultimo.etiqueta, 'A');
  assert.equal(destino(m).punto.etiqueta, 'B');
  // Con la capa del jugador vacía vuelve la guía.
  m.lua('SnetForever.Capa.quitar("jugador")');
  assert.equal(destino(m).punto.x, 50);
  sinErrores(m);
});

test('destino: nil dentro de una instancia', () => {
  const m = conGuia([{ elementos: [ACEPTAR(10), IR(50, 25, { padre: 0 })] }]);
  cargar(m);
  assert.notEqual(destino(m), undefined);
  m.jugador({ enInstancia: true });
  assert.equal(destino(m), undefined);
  sinErrores(m);
});

test('destino: el punto en la instancia 0 y el jugador en la 1 → otroContinente', () => {
  const m = conGuia([{ elementos: [ACEPTAR(10), { t: 'goto', mapa: 1453, inst: 0, wx: 850, wy: -8575, modo: 'flecha', padre: 0 }] }]);
  cargar(m);
  const d = destino(m);
  assert.equal(d.otroContinente, true);
  assert.equal(d.punto.wx, 850);
  assert.equal(d.distancia, undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Destino en un paso de completar: los goto con `objetivo = k` (fallo de la 6128 visto por el jugador)
// ---------------------------------------------------------------------------------------------------

const Q = 6128;
const COMPLETAR = (k) => ({ t: 'complete', q: Q, objetivo: k });
const OBJ = (texto, hecho, pedido) => ({ texto: `${texto}: ${hecho}/${pedido}`, hecho, pedido, terminado: hecho >= pedido });
// Paso de completar como los de las cadenas: un goto por objetivo y un complete por objetivo.
const pasoDeCompletar = (gotos) => [{ elementos: [...gotos, COMPLETAR(1), COMPLETAR(2)] }];
const conObjetivos = (m, raiz, cuerno) => {
  m.estadoMision(Q, { enDiario: true, objetivos: [OBJ('Raíz de tierra', raiz, 5), OBJ('Cuerno de kodo', cuerno, 5)] });
  m.disparar('QUEST_LOG_UPDATE');
};

test('destino: con el objetivo 1 cumplido (5/5), la flecha va al goto del objetivo 2', () => {
  const m = conGuia(pasoDeCompletar([IR(30, 50, { objetivo: 1 }), IR(70, 50, { objetivo: 2 })]));
  conObjetivos(m, 0, 0);
  cargar(m);
  ponerEn(m, 31, 50); // al lado del goto de la raíz
  assert.equal(destino(m).punto.x, 30);
  conObjetivos(m, 5, 2);
  assert.equal(elemento(m, 1, 2).resultado, 'hecho');
  assert.equal(destino(m).punto.x, 70);
  sinErrores(m);
});

test('destino: un objetivo dado por hecho a mano también se salta', () => {
  const m = conGuia(pasoDeCompletar([IR(30, 50, { objetivo: 1 }), IR(70, 50, { objetivo: 2 })]));
  conObjetivos(m, 1, 0);
  cargar(m);
  ponerEn(m, 31, 50);
  assert.equal(destino(m).punto.x, 30);
  m.lua('SnetForever.Motor.marcarHecho(1, 3)'); // la casilla del complete del objetivo 1
  assert.equal(destino(m).punto.x, 70);
  sinErrores(m);
});

test('destino: sin nada hecho y el jugador más cerca del segundo goto, va al segundo', () => {
  const m = conGuia(pasoDeCompletar([IR(30, 50, { objetivo: 1 }), IR(70, 50, { objetivo: 2 })]));
  conObjetivos(m, 0, 0);
  cargar(m);
  ponerEn(m, 65, 50);
  assert.equal(destino(m).punto.x, 70);
  ponerEn(m, 35, 50);
  assert.equal(destino(m).punto.x, 30);
  sinErrores(m);
});

test('destino: un goto de otro continente no se elige si hay uno en el del jugador; si no queda otro, sí', () => {
  const lejos = { t: 'goto', mapa: 1453, inst: 0, wx: 850, wy: -8575, modo: 'flecha', objetivo: 1 };
  const m = conGuia(pasoDeCompletar([lejos, IR(90, 90, { objetivo: 2 })]));
  conObjetivos(m, 0, 0);
  cargar(m);
  ponerEn(m, 10, 10);
  const d = destino(m);
  assert.equal(d.punto.x, 90);
  assert.equal(d.otroContinente, undefined);
  // Con el objetivo 2 cumplido solo queda el de otro continente: la flecha lo enseña (otroContinente).
  conObjetivos(m, 0, 5);
  assert.equal(destino(m).punto.wx, 850);
  assert.equal(destino(m).otroContinente, true);
  sinErrores(m);
});

test('destino: un goto con objetivo sin su complete en el paso (exploración) mira el objetivo en el diario', () => {
  const m = conGuia(pasoDeCompletar([IR(30, 50, { objetivo: 3 }), IR(70, 50, { objetivo: 2 })]));
  const objetivos = (llegado) => [OBJ('Raíz de tierra', 0, 5), OBJ('Cuerno de kodo', 0, 5),
    { texto: 'Explora el claro', hecho: llegado ? 1 : 0, pedido: 1, terminado: llegado }];
  m.estadoMision(Q, { enDiario: true, objetivos: objetivos(false) });
  cargar(m);
  ponerEn(m, 31, 50);
  assert.equal(destino(m).punto.x, 30);
  // El objetivo se lee del diario al llegar QUEST_LOG_UPDATE (no en cada fotograma).
  m.estadoMision(Q, { objetivos: objetivos(true) });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(destino(m).punto.x, 70);
  sinErrores(m);
});

test('destino: misión con reputación y exploración: con los ítems hechos, la flecha va al goto de exploración', () => {
  // El conversor deja sin `objetivo` el goto de triggerEnd de una misión con reputación; el complete 2 es la reputación.
  const m = conGuia([{ elementos: [IR(30, 50, { objetivo: 1 }), IR(70, 50), COMPLETAR(1), COMPLETAR(2)] }]);
  const poner = (raiz) => {
    m.estadoMision(Q, { enDiario: true, objetivos: [OBJ('Raíz de tierra', raiz, 5), OBJ('Reputación', 0, 1)] });
    m.disparar('QUEST_LOG_UPDATE');
  };
  poner(0);
  cargar(m);
  ponerEn(m, 69, 50);
  assert.equal(destino(m).punto.x, 70, 'nada hecho: el más cercano, también el de exploración');
  ponerEn(m, 31, 50);
  assert.equal(destino(m).punto.x, 30);
  poner(5);
  assert.equal(destino(m).punto.x, 70, 'ítems hechos: la exploración');
  assert.deepEqual(m.lua('SnetForever.Navegacion.puntosDeGuia()').map((p) => p.x), [70]);
  sinErrores(m);
});

// Cuenta las llamadas a Misiones.objetivo desde ahora.
const contarObjetivo = (m) => {
  m.lua(`N_OBJETIVO = 0
  local original = SnetForever.Misiones.objetivo
  SnetForever.Misiones.objetivo = function(...) N_OBJETIVO = N_OBJETIVO + 1; return original(...) end`);
  return () => m.lua('N_OBJETIVO');
};

test('destino: el objetivo del diario se lee una vez por QUEST_LOG_UPDATE, no en cada fotograma', () => {
  const m = conGuia(pasoDeCompletar([IR(30, 50, { objetivo: 3 }), IR(70, 50, { objetivo: 1 })]));
  conObjetivos(m, 5, 0);
  cargar(m);
  const llamadas = contarObjetivo(m);
  m.disparar('QUEST_LOG_UPDATE');
  const antes = llamadas();
  for (let i = 0; i < 20; i++) destino(m);
  assert.ok(llamadas() - antes <= 2, `llamadas en 20 fotogramas: ${llamadas() - antes}`);
  const despues = llamadas();
  for (let i = 0; i < 20; i++) destino(m);
  assert.equal(llamadas(), despues, 'sin QUEST_LOG_UPDATE no se vuelve a leer');
  sinErrores(m);
});

test('destino: con todos los goto de objetivo hechos y un complete pendiente sin goto, el más cercano de ellos', () => {
  // 4 objetivos y 3 goto (el 4.º sin punto propio): con los 3 hechos, la flecha no se queda sin destino.
  const m = conGuia([{ elementos: [IR(10, 50, { objetivo: 1 }), IR(50, 50, { objetivo: 2 }), IR(90, 50, { objetivo: 3 }),
    COMPLETAR(1), COMPLETAR(2), COMPLETAR(3), COMPLETAR(4)] }]);
  const cuatro = (hechos) => {
    m.estadoMision(Q, { enDiario: true, objetivos: [1, 2, 3, 4].map((k) => OBJ(`Pieza ${k}`, k <= hechos ? 1 : 0, 1)) });
    m.disparar('QUEST_LOG_UPDATE');
  };
  cuatro(0);
  cargar(m);
  ponerEn(m, 85, 50);
  assert.equal(destino(m).punto.x, 90);
  cuatro(3);
  assert.equal(elemento(m, 1, 6).resultado, 'pendiente');
  const d = destino(m);
  assert.notEqual(d, undefined, 'la flecha no puede quedarse sin destino');
  assert.equal(d.punto.x, 90);
  ponerEn(m, 12, 50);
  assert.equal(destino(m).punto.x, 10);
  // Los pines tampoco desaparecen: se ven los tres.
  assert.deepEqual(m.lua('SnetForever.Navegacion.puntosDeGuia()').map((p) => p.x).sort((a, b) => a - b), [10, 50, 90]);
  sinErrores(m);
});

test('destino: si el tipo del objetivo k del juego no casa con el de la base, ese goto no se salta', () => {
  // La base dice que los objetivos 1 y 2 son ítems; el juego da el 1 como criatura: el índice no es fiable.
  const m = conGuia(pasoDeCompletar([IR(30, 50, { objetivo: 1 }), IR(70, 50, { objetivo: 2 })]));
  m.datoMision(Q, { name: 'Curar envenenamiento', requiredLevel: 14, objectives: [[], [], [[2449, null, 0], [15852, null, 0]]] });
  const poner = (tipo) => {
    m.estadoMision(Q, { enDiario: true, objetivos: [{ ...OBJ('Raíz de tierra', 5, 5), tipo }, { ...OBJ('Cuerno de kodo', 0, 5), tipo: 'item' }] });
    m.disparar('QUEST_LOG_UPDATE');
  };
  poner('monster');
  cargar(m);
  ponerEn(m, 31, 50);
  assert.equal(elemento(m, 1, 2).resultado, 'hecho');
  assert.equal(destino(m).punto.x, 30, 'tipo distinto: no se salta');
  poner('item');
  assert.equal(destino(m).punto.x, 70, 'tipo igual: se salta');
  sinErrores(m);
});

test('destino: los goto sin objetivo siguen yendo al primero, aunque otro esté más cerca', () => {
  const m = conGuia(pasoDeCompletar([IR(30, 50), IR(70, 50)]));
  conObjetivos(m, 5, 0);
  cargar(m);
  ponerEn(m, 69, 50);
  assert.equal(destino(m).punto.x, 30);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Llegada
// ---------------------------------------------------------------------------------------------------

test('llegada: a 3 yd de un goto objetivo de radio 5, el elemento hecho; tras recargar() sigue hecho', () => {
  const m = conGuia([{ elementos: [IR(50, 25, { modo: 'objetivo', radio: 5 }), ACEPTAR(10)] }, { elementos: [ACEPTAR(11)] }]);
  cargar(m);
  const llegadas = contar(m, 'SNF_LLEGADA');
  assert.equal(elemento(m, 1, 0).resultado, 'pendiente');
  ponerEn(m, 50, 25, 8);
  m.avanzar(0.35);
  assert.equal(elemento(m, 1, 0).resultado, 'pendiente', 'a 8 yd no se llega');
  ponerEn(m, 50, 25, 3);
  m.avanzar(0.35); // el temporizador de 0,3 s comprueba la llegada
  assert.equal(elemento(m, 1, 0).resultado, 'hecho');
  assert.equal(elemento(m, 1, 0).mem.llegado, true);
  assert.deepEqual(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].llegados.p1`), [true]);
  assert.equal(llegadas().n, 1);
  assert.equal(llegadas().ultimo.x, 50);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1, 'el accept sigue pendiente');
  const m2 = m.recargar();
  m2.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.equal(m2.lua('SnetForever.Motor.estado().actual'), 1);
  assert.equal(elemento(m2, 1, 0).resultado, 'hecho');
  // Ya alcanzado: la flecha no vuelve a él.
  assert.equal(destino(m2), undefined);
  sinErrores(m2);
});

test('llegada: el goto "paso" que no es el destino no se consume; el que lo es, sí', () => {
  const m = conGuia([{
    elementos: [ACEPTAR(10), IR(10, 10, { modo: 'paso', radio: 10, padre: 0 }), IR(20, 20, { modo: 'paso', radio: 10, padre: 0 })],
  }]);
  cargar(m);
  const llegadas = contar(m, 'SNF_LLEGADA');
  ponerEn(m, 20, 20, 2);
  comprobar(m);
  assert.equal(llegadas().n, 0);
  assert.notEqual(elemento(m, 1, 2).mem.alcanzado, true);
  assert.equal(destino(m).punto.x, 10);
  ponerEn(m, 10, 10, 2);
  comprobar(m);
  assert.equal(llegadas().n, 1);
  assert.equal(destino(m).punto.x, 20);
  // Un goto "paso" no es un objetivo: el elemento sigue siendo informativo.
  assert.equal(elemento(m, 1, 1).resultado, 'info');
  sinErrores(m);
});

test('llegada: un #loop de 3 puntos alcanzados vuelve a empezar', () => {
  const VERTICES = [[10, 10], [20, 20], [30, 30]];
  const m = conGuia([{
    etiquetas: { loop: true },
    elementos: [ACEPTAR(10), ...VERTICES.map(([x, y]) => IR(x, y, { modo: 'paso', radio: 10, padre: 0 }))],
  }]);
  cargar(m);
  const llegadas = contar(m, 'SNF_LLEGADA');
  for (const [x, y] of VERTICES) {
    assert.equal(destino(m).punto.x, x);
    ponerEn(m, x, y, 1);
    comprobar(m);
  }
  assert.equal(llegadas().n, 3);
  assert.equal(destino(m).punto.x, 10, 'tras el tercero, otra vez el primero');
  ponerEn(m, 10, 10, 1);
  comprobar(m);
  assert.equal(llegadas().n, 4);
  assert.equal(destino(m).punto.x, 20);
  sinErrores(m);
});

test('llegada: sin #loop, con los puntos alcanzados la flecha se queda sin destino', () => {
  const m = conGuia([{ elementos: [ACEPTAR(10), IR(10, 10, { modo: 'paso', radio: 10, padre: 0 })] }]);
  cargar(m);
  ponerEn(m, 10, 10, 1);
  comprobar(m);
  assert.equal(destino(m), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// puntosDeGuia y el evaluador de goto
// ---------------------------------------------------------------------------------------------------

test('puntosDeGuia: goto, pin y vértices de loop de los pasos activos y siguientes, hasta pines.cuantos pasos', () => {
  const m = conGuia([
    { elementos: [ACEPTAR(10), IR(10, 10, { padre: 0 }), { t: 'pin', mapa: 1411, x: 11, y: 11, modo: 'pin', padre: 0 }] },
    {
      elementos: [ACEPTAR(11), {
        t: 'loop', rango: 20, padre: 0,
        puntos: [{ mapa: 1411, x: 1, y: 1 }, { mapa: 1411, x: 2, y: 2 }, { mapa: 1411, x: 3, y: 3 }, { mapa: 1411, x: 1, y: 1 }],
      }],
    },
    { elementos: [ACEPTAR(12), IR(30, 30, { padre: 0 })] },
    { elementos: [ACEPTAR(13), { t: 'waypoint', mapa: 1411, x: 40, y: 40, modo: 'paso', radio: 5, sinPin: true, padre: 0 }] },
  ]);
  cargar(m);
  m.lua('SnetForever.Ajustes.set("pines.cuantos", 2)');
  const puntos = m.lua('SnetForever.Navegacion.puntosDeGuia()');
  assert.deepEqual(puntos.map((p) => [p.tipo, p.orden, p.x]),
    [['goto', 1, 10], ['pin', 1, 11], ['loop', 2, 1], ['loop', 2, 2], ['loop', 2, 3]]);
  assert.deepEqual([...new Set(puntos.map((p) => p.orden))], [1, 2]);
  assert.ok(puntos.every((p) => p.origen === 'guia' && typeof p.wx === 'number' && p.inst === 1));
  assert.equal(puntos[0].etiqueta, 'Acepta 10');
  assert.equal(puntos[2].etiqueta, 'Acepta 11');
  m.lua('SnetForever.Ajustes.set("pines.cuantos", 15)');
  const todos = m.lua('SnetForever.Navegacion.puntosDeGuia()');
  assert.deepEqual([...new Set(todos.map((p) => p.orden))], [1, 2, 3, 4]);
  assert.equal(todos.at(-1).tipo, 'waypoint');
  assert.equal(todos.at(-1).sinPin, true);
  sinErrores(m);
});

test('puntosDeGuia: solo se fusionan goto con objetivo del mismo paso; otro elemento en el mismo punto se ve', () => {
  // En (70, 50) hay un goto del objetivo 2 y, en el mismo punto, el goto de quien da otra misión (padre: su accept).
  const m = conGuia([{ elementos: [IR(30, 50, { objetivo: 1 }), IR(70, 50, { objetivo: 2 }), ACEPTAR(77),
    IR(70, 50, { padre: 2 }), IR(70, 50, { objetivo: 1 }), COMPLETAR(1), COMPLETAR(2)] }]);
  conObjetivos(m, 0, 0);
  cargar(m);
  const puntos = m.lua('SnetForever.Navegacion.puntosDeGuia()');
  assert.deepEqual(puntos.map((p) => p.x), [30, 70, 70], 'el goto de la otra misión no se fusiona');
  assert.deepEqual(puntos.map((p) => p.q ?? null), [null, null, 77]);
  assert.equal(puntos[2].etiqueta, 'Acepta 77');
  sinErrores(m);
});

test('puntosDeGuia: en el paso activo no salen los goto de objetivos cumplidos y los puntos iguales van una vez', () => {
  const m = conGuia(pasoDeCompletar([IR(30, 50, { objetivo: 1 }), IR(70, 50, { objetivo: 2 }), IR(70, 50, { objetivo: 1 })]));
  conObjetivos(m, 0, 0);
  cargar(m);
  assert.deepEqual(m.lua('SnetForever.Navegacion.puntosDeGuia()').map((p) => p.x), [30, 70]);
  conObjetivos(m, 5, 0);
  assert.deepEqual(m.lua('SnetForever.Navegacion.puntosDeGuia()').map((p) => p.x), [70]);
  sinErrores(m);
});

test('puntosDeGuia: en un paso activo, sin los puntos alcanzados ni los de padre hecho', () => {
  const m = conGuia([{
    elementos: [ACEPTAR(10), IR(10, 10, { padre: 0 }), ACEPTAR(11), IR(20, 20, { modo: 'paso', radio: 10, padre: 2 }), IR(30, 30, { padre: 2 })],
  }]);
  cargar(m);
  assert.deepEqual(m.lua('SnetForever.Navegacion.puntosDeGuia()').map((p) => p.x), [10, 20, 30]);
  m.estadoMision(10, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 10);
  ponerEn(m, 20, 20);
  comprobar(m);
  assert.deepEqual(m.lua('SnetForever.Navegacion.puntosDeGuia()').map((p) => p.x), [30]);
  sinErrores(m);
});

test('evaluador de goto: objetivo hecho con mem.llegado (si no, pendiente); los demás modos, info', () => {
  const m = nuevaMaquina();
  const evaluar = (el, mem = {}) => m.lua(`SnetForever.Elementos.evaluar(${aLua(el)}, ${aLua(mem)})`);
  assert.equal(evaluar({ t: 'goto', mapa: 1411, x: 1, y: 1, modo: 'objetivo', radio: 5 }), 'pendiente');
  assert.equal(evaluar({ t: 'goto', mapa: 1411, x: 1, y: 1, modo: 'objetivo', radio: 5 }, { llegado: true }), 'hecho');
  for (const modo of ['flecha', 'paso', 'pin', 'baja', 'cercano']) {
    assert.equal(evaluar({ t: 'goto', mapa: 1411, x: 1, y: 1, modo }, { llegado: true }), 'info', modo);
  }
  assert.deepEqual(m.lua('SnetForever.Elementos.def("goto").campos'), ['mapa', 'modo']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglos ronda 1: lo alcanzado se guarda por paso (RXPCData.completedWaypoints, plano 3 §2.5)
// ---------------------------------------------------------------------------------------------------

test('alcanzados: cadena de 3 goto "paso", se alcanzan los dos primeros y tras recargar() la flecha va al tercero', () => {
  const m = conGuia([{
    elementos: [ACEPTAR(10), IR(10, 10, { modo: 'paso', radio: 10, padre: 0 }), IR(20, 20, { modo: 'paso', radio: 10, padre: 0 }),
      IR(30, 30, { modo: 'paso', radio: 10, padre: 0 })],
  }]);
  cargar(m);
  for (const [x, y] of [[10, 10], [20, 20]]) {
    assert.equal(destino(m).punto.x, x);
    ponerEn(m, x, y, 1);
    comprobar(m);
  }
  assert.equal(destino(m).punto.x, 30);
  assert.deepEqual(m.lua(`SnetForeverPJ.progreso[${aLua(CLAVE)}].alcanzados.p1`), { 2: true, 3: true });
  const m2 = m.recargar();
  m2.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.equal(destino(m2).punto.x, 30);
  sinErrores(m2);
});

test('alcanzados: el reinicio de #loop borra lo guardado; tras recargar() sigue donde iba la vuelta nueva', () => {
  const VERTICES = [[10, 10], [20, 20], [30, 30]];
  const m = conGuia([{
    etiquetas: { loop: true },
    elementos: [ACEPTAR(10), ...VERTICES.map(([x, y]) => IR(x, y, { modo: 'paso', radio: 10, padre: 0 }))],
  }]);
  cargar(m);
  for (const [x, y] of VERTICES) {
    ponerEn(m, x, y, 1);
    comprobar(m);
  }
  assert.equal(m.lua(`next(SnetForeverPJ.progreso[${aLua(CLAVE)}].alcanzados.p1 or {}) == nil`), true);
  let m2 = m.recargar();
  m2.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.equal(destino(m2).punto.x, 10, 'tras reiniciar, otra vez el primero');
  ponerEn(m2, 10, 10, 1);
  comprobar(m2);
  m2 = m2.recargar();
  m2.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)})`);
  assert.equal(destino(m2).punto.x, 20, 'el primero de la vuelta nueva sigue alcanzado');
  sinErrores(m2);
});

test('Motor.marcarLlegado y marcarAlcanzado: un elemento sin mem no da error', () => {
  const m = conGuia([{ elementos: [IR(50, 25, { modo: 'objetivo', radio: 5 }), ACEPTAR(10)] }]);
  cargar(m);
  m.lua('SnetForever.Motor.paso(1).elementos[1].mem = nil; SnetForever.Motor.marcarLlegado(1, 1)');
  assert.equal(elemento(m, 1, 0).resultado, 'hecho');
  m.lua('SnetForever.Motor.paso(1).elementos[1].mem = nil; SnetForever.Motor.marcarAlcanzado(1, 1, true)');
  assert.equal(elemento(m, 1, 0).mem.alcanzado, true);
  m.lua('SnetForever.Motor.marcarLlegado(9, 9); SnetForever.Motor.marcarAlcanzado(9, 9, true)');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T2: una entrega a medias lleva a los objetivos que faltan, no al PNJ
// ---------------------------------------------------------------------------------------------------

// Datos inventados: la misión 97901 pide matar al «Lobo de prueba» (k1, aparece en (60, 30) y (20, 70)), la «Garra de
// prueba» (k2, la suelta el «Cuervo de prueba», que aparece en (30, 60)) y el «Polvo de prueba» (k3, sin sitio en los
// datos, como los objetos de la bolsa en el juego). La entrega es en el PNJ de (80, 40).
const Q_MEDIAS = 97901;
// El tipo de cada objetivo es el que da el juego: con uno que no casa con la base, el índice no es fiable y no da sitio.
const OBJ_MEDIAS = (texto, terminado, tipo) => ({ texto, hecho: terminado ? 1 : 0, pedido: 1, terminado, tipo });

function conEntregaAMedias(objetivos, { completa = false, antes = [] } = {}) {
  const m = conGuia([{ elementos: [IR(80, 40), ...antes, { t: 'turnin', q: Q_MEDIAS }] }]);
  m.lua(`SNF_MISIONES.npc[97911] = {name = "Lobo de prueba", spawns = {[1411] = {{60, 30}, {20, 70}}}}
  SNF_MISIONES.npc[97912] = {name = "Cuervo de prueba", spawns = {[1411] = {{30, 60}}}}
  SNF_MISIONES.item[97931] = {name = "Garra de prueba", npcDrops = {97912}}
  SNF_MISIONES.item[97932] = {name = "Polvo de prueba"}`);
  m.datoMision(Q_MEDIAS, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5,
    objectives: [[[97911]], [], [[97931], [97932]]] });
  m.estadoMision(Q_MEDIAS, { enDiario: true, completa, objetivos });
  cargar(m);
  return m;
}

const TODOS = (t1, t2, t3) => [OBJ_MEDIAS('Lobo de prueba: 0/1', t1, 'monster'), OBJ_MEDIAS('Garra de prueba: 0/1', t2, 'item'),
  OBJ_MEDIAS('Polvo de prueba: 0/1', t3, 'item')];

test('T2: con «faltan», el destino es el spawn más cercano de los objetivos sin terminar, nunca el PNJ de entrega', () => {
  const m = conEntregaAMedias(TODOS(false, false, false));
  assert.equal(elemento(m, 1, 1).extra, 'faltan:1,2,3');
  ponerEn(m, 22, 68);
  let d = destino(m);
  assert.deepEqual([d.punto.x, d.punto.y], [20, 70], 'el lobo más cercano');
  assert.match(d.punto.etiqueta, /Lobo de prueba/);
  assert.match(d.punto.etiqueta, /Misión inventada/);
  // Junto al PNJ de entrega, la flecha sigue yendo a un objetivo (el más cercano desde allí: el lobo de (60, 30)).
  ponerEn(m, 79, 41);
  d = destino(m);
  assert.deepEqual([d.punto.x, d.punto.y], [60, 30]);
  // Terminado el lobo, va al cuervo que suelta la garra.
  m.estadoMision(Q_MEDIAS, { objetivos: TODOS(true, false, false) });
  m.disparar('QUEST_LOG_UPDATE');
  d = destino(m);
  assert.deepEqual([d.punto.x, d.punto.y], [30, 60], 'el que suelta la garra');
  assert.match(d.punto.etiqueta, /Garra de prueba/);
  // Llegar allí no da nada por alcanzado ni marca el goto del PNJ.
  ponerEn(m, 80, 40);
  comprobar(m);
  assert.equal(elemento(m, 1, 0).mem.alcanzado, undefined, 'el goto del PNJ no se alcanza mientras falten objetivos');
  sinErrores(m);
});

test('T2: con «faltan» y sin sitio en los datos para lo que queda, no hay destino (ni el PNJ)', () => {
  const m = conEntregaAMedias(TODOS(true, true, false));
  ponerEn(m, 79, 41);
  assert.equal(destino(m), undefined);
  assert.deepEqual(m.lua('SnetForever.Navegacion.puntosDeGuia()').map((p) => [p.x, p.y]), [[80, 40]],
    'el pin del PNJ sigue en el mapa');
  sinErrores(m);
});

test('T2: al completarse la misión (QUEST_LOG_UPDATE), la flecha vuelve al PNJ de entrega sin esperar a otro evento', () => {
  const m = conEntregaAMedias(TODOS(true, true, false));
  ponerEn(m, 50, 50);
  assert.equal(destino(m), undefined);
  m.estadoMision(Q_MEDIAS, { completa: true, objetivos: TODOS(true, true, true) });
  m.disparar('QUEST_LOG_UPDATE');
  assert.equal(elemento(m, 1, 1).extra, undefined);
  const d = destino(m);
  assert.deepEqual([d.punto.x, d.punto.y], [80, 40]);
  sinErrores(m);
});

test('T2: con la misión completa desde el principio, la flecha va al PNJ como siempre', () => {
  const m = conEntregaAMedias(TODOS(true, true, true), { completa: true });
  ponerEn(m, 22, 68);
  assert.deepEqual([destino(m).punto.x, destino(m).punto.y], [80, 40]);
  sinErrores(m);
});

test('T2: un objetivo cuyo tipo del juego no casa con la base no da sitio (el índice no es fiable)', () => {
  const objetivos = TODOS(true, false, true);
  objetivos[1].tipo = 'monster'; // la base dice objeto de la bolsa
  const m = conEntregaAMedias(objetivos);
  ponerEn(m, 50, 50);
  assert.equal(destino(m), undefined);
  sinErrores(m);
});

test('T2: la flecha y «Cómo llegar» dicen lo mismo: el objetivo que falta, no la entrega', () => {
  const m = conEntregaAMedias(TODOS(false, true, true));
  ponerEn(m, 22, 68);
  m.lua('BANCO.ponerServicios({taxi = true})'); // en vuelo, «Cómo llegar» siempre cuenta el destino
  m.lua('SnetForever.Flecha.crear(); SnetForever.Flecha.actualizar(0); SnetForever.Ventana.pintar()');
  const flecha = m.lua('SnetForever.Flecha.marcos.texto:GetText()');
  assert.match(flecha, /^Lobo de prueba \(para «Misión inventada»\)/);
  assert.equal(m.lua('SnetForever.Ventana.marcos.viaje:IsShown()'), true);
  const viaje = m.lua('SnetForever.Ventana.marcos.viaje.texto:GetText()');
  assert.match(viaje, /Lobo de prueba \(para «Misión inventada»\)/);
  assert.doesNotMatch(viaje, /Entrega/);
  sinErrores(m);
});

// Ronda 1 (I1): la flecha solo pasa a los objetivos si en el paso no queda nada que se pueda hacer ya en el PNJ (entregar
// una misión completa o aceptar una). Si queda algo, va al PNJ como siempre; el texto sigue enseñando lo que falta.
test('T2 ronda 1: paso con dos turnin (A completa y B a medias): la flecha va al PNJ; entregada A, a los objetivos de B', () => {
  const m = conEntregaAMedias(TODOS(false, true, true), { antes: [{ t: 'turnin', q: 97902 }] });
  m.estadoMision(97902, { enDiario: true, completa: true });
  m.disparar('QUEST_LOG_UPDATE');
  ponerEn(m, 22, 68);
  assert.deepEqual([destino(m).punto.x, destino(m).punto.y], [80, 40], 'A se puede entregar ya: al PNJ');
  // Pasando por el PNJ, su goto se puede alcanzar como siempre (hay algo que hacer allí).
  m.estadoMision(97902, { enDiario: false, entregada: true });
  m.disparar('QUEST_TURNED_IN', 97902);
  const d = destino(m);
  assert.deepEqual([d.punto.x, d.punto.y], [20, 70], 'solo queda B: a su objetivo');
  sinErrores(m);
});

test('T2 ronda 1: dos turnin (A completa y B a medias sin sitio): al PNJ; entregada A, sin flecha', () => {
  const m = conEntregaAMedias(TODOS(true, true, false), { antes: [{ t: 'turnin', q: 97902 }] });
  m.estadoMision(97902, { enDiario: true, completa: true });
  m.disparar('QUEST_LOG_UPDATE');
  ponerEn(m, 50, 50);
  assert.deepEqual([destino(m).punto.x, destino(m).punto.y], [80, 40]);
  m.estadoMision(97902, { enDiario: false, entregada: true });
  m.disparar('QUEST_TURNED_IN', 97902);
  assert.equal(destino(m), undefined);
  sinErrores(m);
});

test('T2 ronda 1: accept pendiente y entrega a medias en el mismo paso: al PNJ; aceptada, a los objetivos', () => {
  const m = conEntregaAMedias(TODOS(false, true, true), { antes: [{ t: 'accept', q: 97903 }] });
  ponerEn(m, 22, 68);
  assert.deepEqual([destino(m).punto.x, destino(m).punto.y], [80, 40], 'se puede aceptar ya: al PNJ');
  m.estadoMision(97903, { enDiario: true });
  m.disparar('QUEST_ACCEPTED', 97903);
  assert.deepEqual([destino(m).punto.x, destino(m).punto.y], [20, 70]);
  sinErrores(m);
});

test('T2 ronda 1: con algo que hacer en el PNJ, su goto se alcanza; con solo la entrega a medias, no', () => {
  const m = conGuia([{ elementos: [IR(80, 40, { radio: 5 }), { t: 'accept', q: 97903 }, { t: 'turnin', q: Q_MEDIAS }] }]);
  m.lua('SNF_MISIONES.npc[97911] = {name = "Lobo de prueba", spawns = {[1411] = {{60, 30}}}}');
  m.datoMision(Q_MEDIAS, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5, objectives: [[[97911]]] });
  m.estadoMision(Q_MEDIAS, { enDiario: true, objetivos: [OBJ_MEDIAS('Lobo de prueba: 0/1', false, 'monster')] });
  cargar(m);
  ponerEn(m, 80, 40);
  comprobar(m);
  assert.equal(elemento(m, 1, 0).mem.alcanzado, true, 'hay un accept que hacer allí');
  const m2 = conGuia([{ elementos: [IR(80, 40, { radio: 5 }), { t: 'turnin', q: Q_MEDIAS }] }]);
  m2.lua('SNF_MISIONES.npc[97911] = {name = "Lobo de prueba", spawns = {[1411] = {{60, 30}}}}');
  m2.datoMision(Q_MEDIAS, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5, objectives: [[[97911]]] });
  m2.estadoMision(Q_MEDIAS, { enDiario: true, objetivos: [OBJ_MEDIAS('Lobo de prueba: 0/1', false, 'monster')] });
  cargar(m2);
  ponerEn(m2, 80, 40);
  comprobar(m2);
  assert.equal(elemento(m2, 1, 0).mem.alcanzado, undefined, 'solo la entrega a medias: no se alcanza');
  sinErrores(m);
  sinErrores(m2);
});
