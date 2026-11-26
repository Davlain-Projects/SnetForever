// Lote D (D4, lo vio el jugador el 10-nov): tras «18-22» su ruta sigue con «22-24 Laderas de Trabalomas» (Reinos del Este)
// cuando en Kalimdor aún le quedan misiones de su nivel. El orden de sus guías no se toca: antes de cambiar de continente
// sale un aviso en la cola de la ventana, «Aún te quedan N misiones de tu nivel en Kalimdor», con «Seguir la guía»
// (lo descarta para ese paso), «Ver dónde» (una guía lateral de solo lectura con las zonas, de la que más tiene a la que
// menos, y un goto al sitio donde empiezan, todo sacado de la base) y, con la app conectada, «Pedir la ruta a la IA».
// Se cuenta con caché: como mucho una pasada por la base por paso.
// Mapas del banco: 1411 Durotar (Kalimdor, instancia 1) y 1453 Ventormenta (Reinos del Este, instancia 0); aquí se añade
// 1413 Los Baldíos (Kalimdor) con un rectángulo propio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const conDatos = { skip: hayDatos ? false : 'no están los addons de datos (fase 1 sin generar)' };

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const RESTANTES = 'Restantes\\continente';
const ES = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } };
const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 22, mapa: 1411, x: 50, y: 50 };
const V = 'SnetForever.Ventana';
const F = `${V}.marcos.aviso`;

const BALDIOS = `BANCO.mapas[1413] = {nombre = "Los Baldíos", inst = 1, padre = 1414, tipo = 3, izquierda = -4000,
  arriba = -2000, ancho = 4000, alto = 5000}`;

// Dadores: 95001 en Durotar (40, 40) y 95002 en Los Baldíos (51, 30), de la Horda; 95003 de la Alianza en Durotar y
// 95004 en Ventormenta.
const PNJ = (id, nombre, mapa, x, y, faccion = 'H') => `SNF_MISIONES.npc[${id}] = {name = ${aLua(nombre)},
  friendlyToFaction = ${aLua(faccion)}, spawns = {[${mapa}] = {{${x}, ${y}}}}}`;
const MISION = (q, dador, extra = {}) => ({
  name: `Misión ${q}`, startedBy: [[dador]], finishedBy: [[dador]], requiredLevel: 20, questLevel: 22,
  requiredRaces: 0, requiredClasses: 0, zoneOrSort: 14, objectivesText: [`Haz la ${q}`], ...extra,
});

// Seis que valen (cuatro en Durotar y dos en Los Baldíos) y las que no deben contar.
const VALEN = [95101, 95102, 95103, 95104, 95105, 95106];
function ponerMundo(m, { cuantas = 6 } = {}) {
  m.lua(BALDIOS);
  m.lua(PNJ(95001, 'Dador de Durotar', 1411, 40, 40));
  m.lua(PNJ(95002, 'Dador de los Baldíos', 1413, 51, 30));
  m.lua(PNJ(95003, 'Dador de la Alianza', 1411, 41, 41, 'A'));
  m.lua(PNJ(95004, 'Dador de Ventormenta', 1453, 50, 50, 'AH'));
  VALEN.slice(0, cuantas).forEach((q, i) => m.datoMision(q, MISION(q, i < 4 ? 95001 : 95002, { questLevel: 20 + i })));
  // No cuentan: gris (nivel 12), de la Alianza (máscara de raza humana), de un dador de la Alianza, de nivel 30, en otro
  // continente, de mazmorra (zoneOrSort 1581, las Minas de la Muerte del fixture), con una previa sin hacer, de pícaro,
  // repetible y roja.
  m.datoMision(95201, MISION(95201, 95001, { questLevel: 12, requiredLevel: 8 }));
  m.datoMision(95202, MISION(95202, 95001, { requiredRaces: 1 }));
  m.datoMision(95203, MISION(95203, 95003));
  m.datoMision(95204, MISION(95204, 95001, { requiredLevel: 30, questLevel: 32 }));
  m.datoMision(95205, MISION(95205, 95004));
  m.datoMision(95206, MISION(95206, 95001, { zoneOrSort: 1581 }));
  m.datoMision(95207, MISION(95207, 95001, { preQuestSingle: [95204] }));
  m.datoMision(95208, MISION(95208, 95001, { requiredClasses: 8 }));
  m.datoMision(95209, MISION(95209, 95001, { specialFlags: 1 }));
  m.datoMision(95210, MISION(95210, 95001, { questLevel: 27 })); // roja a 22: se puede coger, pero no es «de su nivel»
}

const A_VENTORMENTA = { t: 'goto', mapa: 1453, x: 50, y: 50, modo: 'flecha' };
const EN_DUROTAR = { t: 'goto', mapa: 1411, x: 45, y: 45, modo: 'flecha' };
const NOTA = (es) => ({ t: 'nota', texto: { en: es, es } });

function conGuia(pasos, opciones = {}) {
  const m = nuevaMaquina({ guardado: ES, jugador: DRUIDA, ...opciones });
  ponerMundo(m, opciones);
  if (opciones.antes) opciones.antes(m);
  m.ponerGuia(guiaDePrueba(pasos, opciones.campos || {}));
  m.lua(`SnetForever.Motor.cargar(${aLua(opciones.clave || CLAVE)})`);
  m.lua(`${V}.crear(); ${V}.pintar()`);
  return m;
}

const aviso = (m) => m.lua('SnetForever.Continente.aviso()');
const franja = (m) => m.lua(`(function() local f = ${F}
  return {visible = f:IsShown(), texto = f.texto:GetText(), ahora = f.ahora:IsShown() and f.ahora.texto:GetText() or false,
    masTarde = f.masTarde:IsShown() and f.masTarde.texto:GetText() or false,
    ruta = f.ruta ~= nil and f.ruta:IsShown() and f.ruta.texto:GetText() or false} end)()`);

// ---------------------------------------------------------------------------------------------------
// El aviso
// ---------------------------------------------------------------------------------------------------

test('D4: en Kalimdor con 6 misiones de su nivel y el paso que lleva a Reinos del Este, sale el aviso con 6', () => {
  const m = conGuia([{ elementos: [NOTA('Coge el barco'), A_VENTORMENTA] }]);
  const a = aviso(m);
  assert.ok(a, 'no hay aviso');
  assert.equal(a.n, 6);
  assert.equal(a.tipo, 'continente');
  const f = franja(m);
  assert.equal(f.visible, true);
  assert.equal(f.texto, 'Aún te quedan 6 misiones de tu nivel en Kalimdor');
  assert.equal(f.masTarde, 'Seguir la guía');
  assert.equal(f.ahora, 'Ver dónde');
  assert.equal(f.ruta, false); // sin la app conectada
  sinErrores(m);
});

test('D4: con 2 misiones no hay aviso; tampoco si el paso no sale del continente', () => {
  const pocas = conGuia([{ elementos: [A_VENTORMENTA] }], { cuantas: 2 });
  assert.equal(aviso(pocas), undefined);
  assert.equal(franja(pocas).visible, false);
  const mismo = conGuia([{ elementos: [EN_DUROTAR] }]);
  assert.equal(aviso(mismo), undefined);
  sinErrores(pocas);
  sinErrores(mismo);
});

test('D4: solo cuentan las de su facción, raza y clase, sin hacer ni en el registro, de su nivel, no grises y del continente', () => {
  const m = conGuia([{ elementos: [A_VENTORMENTA] }], {
    antes: (n) => {
      n.estadoMision(95101, { entregada: true });
      n.estadoMision(95102, { enDiario: true });
    },
  });
  // De las 6: una entregada y otra en el registro. Las 10 de la lista de las que no valen no suman.
  assert.equal(aviso(m), undefined); // 4 < 5
  const cuenta = m.lua('SnetForever.Continente.contar()');
  assert.equal(cuenta.n, 4);
  assert.deepEqual(cuenta.zonas.flatMap((z) => z.misiones).sort(), [95103, 95104, 95105, 95106]);
  sinErrores(m);
});

test('D4: cuando la guía siguiente lleva a otro continente (la mayoría de sus puntos), el aviso sale en el último paso con puntos', () => {
  const siguiente = 'Prueba\\22-24 Al otro lado';
  // Ronda 1 de T1: con un manual, los pasos 1 y 2 tienen trabajo (un goto flecha solo ya está hecho y se pasa al cargar).
  const HAZ = { t: 'manual', texto: { en: 'Do it', es: 'Hazlo' } };
  const m = conGuia([{ elementos: [EN_DUROTAR, HAZ] }, { elementos: [EN_DUROTAR, HAZ] }, { elementos: [NOTA('Abandona X')] }], {
    campos: { siguientes: [{ clave: siguiente }] },
    antes: (n) => n.ponerGuia(guiaDePrueba([
      { elementos: [EN_DUROTAR] }, { elementos: [A_VENTORMENTA] }, { elementos: [A_VENTORMENTA] },
    ], { clave: siguiente, nombre: '22-24 Al otro lado', niveles: [22, 24] })),
  });
  assert.equal(aviso(m), undefined); // paso 1: aún quedan puntos en esta guía
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(aviso(m).n, 6);
  m.lua('SnetForever.Motor.irA(3)');
  assert.equal(aviso(m).n, 6);
  sinErrores(m);
});

test('D4: «Seguir la guía» no vuelve a avisar del mismo cruce (Kalimdor → Reinos del Este), también tras /reload', () => {
  const m = conGuia([{ elementos: [A_VENTORMENTA] }, { elementos: [NOTA('Ya en el barco'), A_VENTORMENTA] }]);
  assert.ok(aviso(m));
  m.lua(`${F}.masTarde:Click()`);
  assert.equal(aviso(m), undefined);
  assert.equal(franja(m).visible, false);
  // Ronda 1 (I2): otro paso del mismo cruce tampoco avisa.
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(aviso(m), undefined);
  assert.deepEqual(m.lua('SnetForeverPJ.continente.cruce'), { desde: 1, hacia: 0 });
  const n = m.recargar();
  ponerMundo(n);
  n.lua(`SnetForever.Motor.cargar(${aLua(CLAVE)}); ${V}.crear(); ${V}.pintar()`);
  n.lua('SnetForever.Motor.irA(2)');
  assert.equal(aviso(n), undefined);
  sinErrores(n);
});

test('D4 (ronda 1, I2): tras «Seguir» en el final de una guía, la siguiente (en el otro continente) no avisa en sus pasos 2 a 6', () => {
  const siguiente = 'Prueba\\22-24 Al otro lado';
  const pasoSiguiente = (i) => ({ elementos: [NOTA(`Paso ${i}`), A_VENTORMENTA, { t: 'accept', q: 95205 }] });
  const m = conGuia([{ elementos: [EN_DUROTAR, { t: 'accept', q: 95205 }] }, { elementos: [NOTA('Abandona X')] }], {
    campos: { siguientes: [{ clave: siguiente }] },
    antes: (n) => n.ponerGuia(guiaDePrueba([
      { elementos: [EN_DUROTAR, { t: 'accept', q: 95205 }] }, pasoSiguiente(2), pasoSiguiente(3), pasoSiguiente(4),
      pasoSiguiente(5), pasoSiguiente(6),
    ], { clave: siguiente, nombre: '22-24 Al otro lado', niveles: [22, 24] })),
  });
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(aviso(m).n, 6); // el disparo de la guía siguiente
  m.lua(`${F}.masTarde:Click()`);
  m.lua(`SnetForever.Motor.cargar(${aLua(siguiente)})`); // el motor pasa a la siguiente; el jugador sigue en Durotar
  for (let i = 1; i <= 6; i++) {
    m.lua(`SnetForever.Motor.irA(${i}); ${V}.pintar()`);
    assert.equal(aviso(m), undefined, `paso ${i}`);
    assert.equal(franja(m).visible, false, `paso ${i}`);
  }
  sinErrores(m);
});

test('D4 (ronda 1, I2): tras cruzar al otro continente y volver, otro paso que lo manda fuera vuelve a avisar', () => {
  const m = conGuia([{ elementos: [A_VENTORMENTA, { t: 'accept', q: 95205 }] }, { elementos: [NOTA('Otra vez'), A_VENTORMENTA] }]);
  m.lua(`${F}.masTarde:Click()`);
  assert.equal(aviso(m), undefined);
  m.jugador({ mapa: 1453, x: 50, y: 50 }); // en Ventormenta: ha cruzado
  m.disparar('ZONE_CHANGED_NEW_AREA');
  assert.equal(aviso(m), undefined); // en Reinos del Este el paso no lo saca del continente
  assert.equal(m.lua('SnetForeverPJ.continente.cruce'), undefined);
  m.jugador({ mapa: 1411, x: 50, y: 50 }); // de vuelta en Durotar
  m.disparar('ZONE_CHANGED_NEW_AREA');
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(aviso(m).n, 6);
  sinErrores(m);
});

test('D4 (ronda 1, M3): la tarjeta de una zona dice cuántas enseña: «10 de 12»', () => {
  const m = conGuia([{ elementos: [A_VENTORMENTA] }], {
    antes: (n) => {
      for (let q = 95301; q <= 95308; q++) n.datoMision(q, MISION(q, 95001));
    },
  });
  m.lua(`${F}.ahora:Click()`);
  const elementos = m.lua(`SnetForever.Datos.guia(${aLua(RESTANTES)}).pasos[1].elementos`);
  assert.equal(elementos.filter((e) => e.t === 'accept').length, 10);
  assert.equal(elementos[0].texto.es, 'Durotar: 10 de 12 misiones');
  assert.equal(elementos[0].texto.en, 'Durotar: 10 of 12 quests');
  // Los Baldíos (2) caben enteras: sin «de».
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(RESTANTES)}).pasos[2].elementos[1].texto.es`), 'Los Baldíos: 2 misiones');
  sinErrores(m);
});

test('D4: «Ver dónde» abre la guía lateral «Misiones que te quedan en Kalimdor»: las zonas de más a menos, con su goto y sus misiones', () => {
  const m = conGuia([{ elementos: [A_VENTORMENTA] }]);
  m.lua(`${F}.ahora:Click()`);
  const estado = m.lua('SnetForever.Motor.estado()');
  assert.equal(estado.clave, RESTANTES);
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(RESTANTES)})`), 'Misiones que te quedan en Kalimdor');
  assert.equal(m.lua(`SnetForever.Guias.esLateral(${aLua(RESTANTES)})`), true);
  assert.equal(m.lua('SnetForeverPJ.volverA'), CLAVE);
  const pasos = m.lua(`(function() local t = {}
    for i, p in ipairs(SnetForever.Datos.guia(${aLua(RESTANTES)}).pasos) do
      local e = {}
      for _, el in ipairs(p.elementos) do e[#e + 1] = {t = el.t, q = el.q or false, mapa = el.mapa or false, x = el.x or false, y = el.y or false} end
      t[i] = e
    end return t end)()`);
  assert.equal(pasos.length, 2);
  // Durotar (4 misiones) antes que Los Baldíos (2); el goto es el dador, de la base.
  assert.deepEqual(pasos[0].find((e) => e.t === 'goto'), { t: 'goto', q: false, mapa: 1411, x: 40, y: 40 });
  assert.deepEqual(pasos[0].filter((e) => e.t === 'accept').map((e) => e.q), [95101, 95102, 95103, 95104]);
  assert.deepEqual(pasos[1].find((e) => e.t === 'goto'), { t: 'goto', q: false, mapa: 1413, x: 51, y: 30 });
  assert.deepEqual(pasos[1].filter((e) => e.t === 'accept').map((e) => e.q), [95105, 95106]);
  // La flecha y los pines ya existentes llevan al goto del paso activo.
  m.lua(`${V}.pintar()`);
  const textos = m.lua(`(function() local t = {}
    for _, p in ipairs(${V}.marcos.pasos) do for _, fs in ipairs(p.lineas) do t[#t + 1] = fs:GetText() end end
    return t end)()`);
  assert.ok(textos.some((t) => t.includes('Durotar')), textos.join(' | '));
  assert.ok(m.lua('#SnetForever.Capa.puntos("guia")') >= 1);
  // «Volver» lleva a la guía de antes.
  m.lua('SnetForever.Avisos.volver()');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), CLAVE);
  sinErrores(m);
});

test('D4: con la app conectada sale «Pedir la ruta a la IA», que envía al chat la ruta de la zona con más misiones', () => {
  const m = conGuia([{ elementos: [A_VENTORMENTA] }]);
  m.lua(`SnetForever.Timbres.appViva = function() return true end
    BANCO_ENVIADOS = {}
    SnetForever.Chat.enviar = function(texto) BANCO_ENVIADOS[#BANCO_ENVIADOS + 1] = texto return true end
    ${V}.pintar()`);
  assert.equal(franja(m).ruta, 'Pedir la ruta a la IA');
  m.lua(`${F}.ruta:Click()`);
  const enviados = m.lua('BANCO_ENVIADOS');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0], 'Hazme la ruta de todas las misiones de Durotar (mapa 1411)');
  sinErrores(m);
});

test('D4: se cuenta con caché: repintar muchas veces no vuelve a recorrer la base; un paso nuevo, una vez', () => {
  // El paso 1 espera a una misión (si no, con solo informativos, el motor lo pasaría de largo en el primer ciclo).
  const m = conGuia([{ elementos: [A_VENTORMENTA, { t: 'accept', q: 95205 }] }, { elementos: [NOTA('Otro'), A_VENTORMENTA] }]);
  const pasadas = () => m.lua('SnetForever.Continente.pasadas');
  // Al arrancar, la guía por defecto ya pudo contar: se mide desde el primer aviso de esta guía.
  assert.ok(aviso(m));
  const antes = pasadas();
  for (let i = 0; i < 20; i++) m.lua(`${V}.pintar(); SnetForever.Continente.aviso()`);
  m.avanzar(3);
  assert.equal(pasadas(), antes);
  m.lua('SnetForever.Motor.irA(2)');
  aviso(m);
  m.lua(`${V}.pintar()`);
  assert.equal(pasadas(), antes + 1);
  sinErrores(m);
});

test('D4: en inglés, «You still have 6 quests of your level in Kalimdor» y «Quests left in Kalimdor»', () => {
  const m = conGuia([{ elementos: [A_VENTORMENTA] }], { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } });
  assert.equal(franja(m).texto, 'You still have 6 quests of your level in Kalimdor');
  m.lua(`${F}.ahora:Click()`);
  assert.equal(m.lua(`SnetForever.Guias.titulo(${aLua(RESTANTES)})`), 'Quests left in Kalimdor');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Datos reales: el druida de prueba en Los Baldíos, al final de «18-22», con «22-24 Laderas de Trabalomas» detrás
// ---------------------------------------------------------------------------------------------------

// uiMapID de las zonas de Kalimdor (instancia 1) y de Reinos del Este (instancia 0) de Classic: el banco necesita un
// rectángulo por mapa para saber de qué continente es (en el juego lo da C_Map.GetWorldPosFromMapPos).
const KALIMDOR = [1411, 1412, 1413, 1438, 1439, 1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447, 1448, 1449, 1450, 1451,
  1452, 1454, 1456, 1457];
const REINOS = [1416, 1417, 1418, 1419, 1420, 1421, 1422, 1423, 1424, 1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432,
  1433, 1434, 1435, 1436, 1437, 1453, 1455, 1458];
const mapasReales = () => [...KALIMDOR.map((id, i) => [id, 1, 1414, i]), ...REINOS.map((id, i) => [id, 0, 1415, i])]
  .map(([id, inst, padre, i]) => `if not BANCO.mapas[${id}] then BANCO.mapas[${id}] = {nombre = "Mapa ${id}", inst = ${inst},
    padre = ${padre}, tipo = 3, izquierda = ${-100000 - i * 20000}, arriba = ${-100000 - inst * 300000}, ancho = 10000,
    alto = 10000} end`).join('\n')
  + '\nBANCO.mapas[1415] = {nombre = "Reinos del Este", inst = 0, tipo = 2, izquierda = 0, arriba = 0, ancho = 1, alto = 1}';

test('D4: con los datos reales, el druida de prueba (druida Skyborne, 22) en Los Baldíos al final de «18-22» recibe el aviso con un número razonable', conDatos, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], guardado: ES,
    jugador: { clase: 'DRUID', raza: 'Skyborne', faccion: 'Horde', nivel: 22 } });
  m.lua(mapasReales());
  // En el Cruce (Los Baldíos, 51.4, 30.2), con el rectángulo de 1413 que acaba de ponerse.
  m.jugador({ mapa: 1413, x: 51.4, y: 30.2 });
  const guia = 'RestedXP Forever Guide (H)\\\\17-22 Stonetalon/Barrens/Ashenvale';
  m.lua(`SnetForever.Guias.cargar("${guia}", {n = 341})`);
  // Los avisos de clase van antes en la cola: se dejan para más tarde para ver el de continente.
  m.lua('for _, a in ipairs(SnetForever.Avisos.cola()) do SnetForever.Avisos.masTarde(a.id) end');
  m.lua(`${V}.crear(); ${V}.pintar()`);
  const a = aviso(m);
  assert.ok(a, 'no hay aviso al final de 18-22');
  assert.ok(a.n >= 5 && a.n <= 250, String(a.n));
  assert.equal(franja(m).texto, `Aún te quedan ${a.n} misiones de tu nivel en Kalimdor`);
  sinErrores(m);
});
