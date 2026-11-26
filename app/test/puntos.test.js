// Puntos de las misiones sacados de la base: dónde se recoge, dónde están los objetivos y dónde se entrega.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarDatos, elemento, entradas } from '../src/base/leer-lua.mjs';
import { cargarBase, crearBase } from '../src/base/base.mjs';
import { puntoRepresentativo, puntosDeMision } from '../src/base/puntos.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const carpeta = mkdtempSync(join(tmpdir(), 'snf-puntos-'));
copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(carpeta, 'misiones-app.lua'));
writeFileSync(join(carpeta, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));
const base = cargarBase(carpeta);

// Una base pequeña a partir de texto Lua (mismo formato que los addons de datos).
function baseDe(cuerpo, porFaccion = '') {
  const raiz = {};
  const cabecera = 'SNF_MISIONES = {version="t",esquema=1,quest={},npc={},object={},item={},es={quest={},npc={},object={},item={}},'
    + 'zonas={area={[14]=1411,[17]=1413,[40]=1412},nombre={[1411]={en="Durotar",es="Durotar"},[1412]={en="Mulgore"}}},'
    + 'mazmorra={[1581]={nombre="The Deadmines",zonaPadre=40,entradas={{zona=40,mapa=1436,x=42.5,y=71.7}}}},porFaccion={' + porFaccion + '}}\n'
    + 'local Q = SNF_MISIONES.quest\nlocal N = SNF_MISIONES.npc\nlocal O = SNF_MISIONES.object\nlocal I = SNF_MISIONES.item\n';
  ejecutarDatos(cabecera + cuerpo, raiz, 'texto.lua');
  return crearBase(raiz.SNF_MISIONES);
}
const mision = (extra) => `name="Prueba",startedBy={{10}},finishedBy={{20}},requiredLevel=1,questLevel=1,requiredRaces=0,requiredClasses=0,`
  + `objectivesText={},sourceItemId=0,zoneOrSort=0,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0${extra ? ',' + extra : ''}`;

// ---------------------------------------------------------------------------------------------------------------------
// puntoRepresentativo
// ---------------------------------------------------------------------------------------------------------------------

test('puntoRepresentativo: el grupo más denso y su media con un decimal', () => {
  assert.deepEqual(puntoRepresentativo({ 1411: [[10, 10], [11, 10], [12, 11], [80, 80]] }), { mapa: 1411, x: 11, y: 10.3, n: 3 });
});

test('puntoRepresentativo: gana el mapa preferido aunque tenga menos puntos; si no está, el de más puntos', () => {
  const spawns = { 1411: [[10, 10]], 1412: [[50, 50], [51, 51], [52, 52]] };
  assert.equal(puntoRepresentativo(spawns, 1411).mapa, 1411);
  assert.equal(puntoRepresentativo(spawns, 1412).mapa, 1412);
  assert.equal(puntoRepresentativo(spawns, 9999).mapa, 1412);
  assert.equal(puntoRepresentativo(spawns).mapa, 1412);
});

test('puntoRepresentativo: a igualdad de puntos, el mapa con id más bajo', () => {
  const spawns = { 1500: [[10, 10]], 1411: [[20, 20]] };
  assert.equal(puntoRepresentativo(spawns).mapa, 1411);
});

test('puntoRepresentativo: sin puntos válidos da null', () => {
  assert.equal(puntoRepresentativo({ 1411: [[-1, -1]] }), null);
  assert.equal(puntoRepresentativo({ 1411: [[-1, 5], [5, -1]] }), null);
  assert.equal(puntoRepresentativo({}), null);
  assert.equal(puntoRepresentativo(undefined), null);
  assert.equal(puntoRepresentativo({ enMazmorra: [1581] }), null);
});

test('puntoRepresentativo: los puntos negativos se quitan y no cuentan para el mapa', () => {
  const spawns = { 1411: [[-1, -1], [-1, -1], [-1, -1]], 1412: [[30, 30]] };
  assert.deepEqual(puntoRepresentativo(spawns), { mapa: 1412, x: 30, y: 30, n: 1 });
});

test('puntoRepresentativo: empate entre grupos, gana el de cy más bajo y luego el de cx más bajo', () => {
  // Dos grupos de 2 puntos separados: uno abajo (cy alto) y otro arriba (cy bajo).
  assert.deepEqual(puntoRepresentativo({ 1: [[50, 80], [51, 81], [50, 10], [51, 11]] }), { mapa: 1, x: 50.5, y: 10.5, n: 2 });
  // Mismo cy, distinto cx.
  assert.deepEqual(puntoRepresentativo({ 1: [[80, 20], [81, 21], [10, 20], [11, 21]] }), { mapa: 1, x: 10.5, y: 20.5, n: 2 });
});

test('puntoRepresentativo: funciona con la forma array de JS (un mapa de clave 1 y puntos de Lua)', () => {
  const raiz = {};
  ejecutarDatos('SNF_MISIONES = {s={[1]={{40,41},{41,42}}}}', raiz, 'p.lua');
  assert.ok(Array.isArray(raiz.SNF_MISIONES.s));
  assert.deepEqual(puntoRepresentativo(raiz.SNF_MISIONES.s), { mapa: 1, x: 40.5, y: 41.5, n: 2 });
});

// ---------------------------------------------------------------------------------------------------------------------
// puntosDeMision
// ---------------------------------------------------------------------------------------------------------------------

test('puntosDeMision 4641 en es: recoger, objetivo (grupo de 45,70) y entregar', () => {
  const puntos = puntosDeMision(base, 4641, undefined, 'es', undefined);
  assert.deepEqual(puntos, [
    { papel: 'recoger', q: 4641, texto: 'Recoger «Tu lugar en el mundo» (Gornek)', donde: 'Durotar', mapa: 1411, x: 42.1, y: 68.3 },
    { papel: 'objetivo', q: 4641, obj: 'Mottled Boar', texto: 'Tu lugar en el mundo: Mottled Boar', donde: 'Durotar', mapa: 1411, x: 45, y: 70 },
    { papel: 'entregar', q: 4641, texto: 'Entregar «Tu lugar en el mundo» (Gornek)', donde: 'Durotar', mapa: 1411, x: 42.1, y: 68.3 },
  ]);
});

test('puntosDeMision 4641 en en: textos en inglés', () => {
  const textos = puntosDeMision(base, 4641, undefined, 'en', 1411).map((p) => p.texto);
  assert.deepEqual(textos, ['Pick up "Your Place In The World" (Gornek)', 'Your Place In The World: Mottled Boar', 'Hand in "Your Place In The World" (Gornek)']);
});

test('puntosDeMision: una misión que no existe da lista vacía', () => {
  assert.deepEqual(puntosDeMision(base, 999999, undefined, 'es', undefined), []);
});

test('puntosDeMision: un objetivo en mazmorra da la primera entrada con «Dentro de …»', () => {
  const b = baseDe(`
Q[900]={${mision('objectives={[1]={{644}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[644]={name="Defias",enMazmorra={1581}}
`);
  const objetivo = puntosDeMision(b, 900, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
  assert.deepEqual(objetivo, { papel: 'objetivo', q: 900, obj: 'Defias', texto: 'Prueba: Defias', donde: 'Dentro de The Deadmines', mapa: 1436, x: 42.5, y: 71.7 });
  assert.equal(puntosDeMision(b, 900, undefined, 'en', undefined).find((p) => p.papel === 'objetivo').donde, 'Inside The Deadmines');
});

test('puntosDeMision: una mazmorra sin uiMap resoluble o desconocida no da punto (no se inventa)', () => {
  const b = baseDe(`
Q[900]={${mision('objectives={[1]={{644},{645}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[644]={name="Sin zona",enMazmorra={77}}
N[645]={name="Desconocida",enMazmorra={78}}
`);
  const raiz = b.datos;
  raiz.mazmorra[77] = { nombre: 'Utgarde', zonaPadre: 495, entradas: [{ zona: 495, x: 58.8, y: 48.3 }] };
  assert.deepEqual(puntosDeMision(b, 900, undefined, 'es', undefined).map((p) => p.papel), ['recoger', 'entregar']);
});

test('puntosDeMision: sin spawns de objetivo no hay punto de objetivo y no da error', () => {
  const puntos = puntosDeMision(base, 792, undefined, 'es', undefined);
  assert.deepEqual(puntos.map((p) => p.papel), ['recoger', 'entregar']);
  // Un objetivo cuyo PNJ no tiene spawns (788) y una misión sin objetivos (791) tampoco dan punto de objetivo.
  assert.deepEqual(puntosDeMision(base, 788, undefined, 'es', undefined).map((p) => p.papel), ['recoger', 'entregar']);
  assert.deepEqual(puntosDeMision(base, 791, undefined, 'es', undefined).map((p) => p.papel), ['recoger', 'entregar']);
});

test('puntosDeMision: recoger por objeto (startedBy[2]) y por ítem de inicio (sin punto)', () => {
  const b = baseDe(`
Q[900]={name="Por objeto",startedBy={[2]={50}},finishedBy={{20}},requiredLevel=1,questLevel=1,requiredRaces=0,requiredClasses=0,objectivesText={},sourceItemId=0,zoneOrSort=0,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0}
Q[901]={name="Por ítem",startedBy={[3]={60}},finishedBy={{20}},requiredLevel=1,questLevel=1,requiredRaces=0,requiredClasses=0,objectivesText={},sourceItemId=60,zoneOrSort=0,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0}
N[20]={name="B",spawns={[1411]={{20,20}}}}
O[50]={name="Tablón",spawns={[1411]={{33,34}}}}
I[60]={name="Nota",startQuest=901}
`);
  const porObjeto = puntosDeMision(b, 900, undefined, 'es', undefined);
  assert.deepEqual(porObjeto[0], { papel: 'recoger', q: 900, texto: 'Recoger «Por objeto» (Tablón)', donde: 'Durotar', mapa: 1411, x: 33, y: 34 });
  assert.deepEqual(puntosDeMision(b, 901, undefined, 'es', undefined).map((p) => p.papel), ['entregar']);
});

test('puntosDeMision: objetivo por objeto (objectives[2]) y por ítem con npcDrops y objectDrops juntos', () => {
  const b = baseDe(`
Q[900]={${mision('objectives={[2]={{50,"Tablón"}}}')}}
Q[901]={${mision('objectives={[3]={{60}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[70]={name="Lobo",spawns={[1411]={{60,61}}}}
N[71]={name="Lobo viejo",spawns={[1411]={{61,62}}}}
O[50]={name="Tablón",spawns={[1411]={{33,34}}}}
O[80]={name="Cofre",spawns={[1411]={{62,60}}}}
I[60]={name="Colmillo",npcDrops={70,71},objectDrops={80}}
`);
  const porObjeto = puntosDeMision(b, 900, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
  assert.equal(porObjeto.obj, 'Tablón');
  assert.deepEqual([porObjeto.mapa, porObjeto.x, porObjeto.y], [1411, 33, 34]);
  const porItem = puntosDeMision(b, 901, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
  assert.equal(porItem.obj, 'Colmillo');
  // Los tres puntos de los dos lobos y del cofre forman un solo grupo.
  assert.deepEqual([porItem.mapa, porItem.x, porItem.y], [1411, 61, 61]);
});

test('puntosDeMision: un ítem con objectDrops "__borrar" no falla y usa solo los PNJ', () => {
  const b = baseDe(`
Q[901]={${mision('objectives={[3]={{60}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[70]={name="Lobo",spawns={[1411]={{60,61}}}}
I[60]={name="Colmillo",npcDrops={70},objectDrops="__borrar"}
`);
  const objetivo = puntosDeMision(b, 901, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
  assert.deepEqual([objetivo.x, objetivo.y], [60, 61]);
});

test('puntosDeMision: triggerEnd.puntos da un objetivo con el texto de la exploración', () => {
  const b = baseDe(`
Q[900]={${mision('triggerEnd={"Llega a la cueva",{[1411]={{70,71},{71,72}}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
`);
  const objetivo = puntosDeMision(b, 900, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
  assert.deepEqual(objetivo, { papel: 'objetivo', q: 900, obj: 'Llega a la cueva', texto: 'Prueba: Llega a la cueva', donde: 'Durotar', mapa: 1411, x: 70.5, y: 71.5 });
});

test('puntosDeMision: un objetivo por entrada, en el orden de la base', () => {
  const b = baseDe(`
Q[900]={${mision('objectives={[1]={{70},{71}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[70]={name="Lobo",spawns={[1411]={{60,61}}}}
N[71]={name="Oso",spawns={[1411]={{30,31}}}}
`);
  assert.deepEqual(puntosDeMision(b, 900, undefined, 'es', undefined).filter((p) => p.papel === 'objetivo').map((p) => p.obj), ['Lobo', 'Oso']);
});

// ---------------------------------------------------------------------------------------------------------------------
// Mapa preferido (Ruling F4-15)
// ---------------------------------------------------------------------------------------------------------------------

// Un objetivo con 1 punto en 1411 y 3 en 1412 (más poblado). La misión se recoge y entrega donde se diga.
function baseConDosMapas({ recoge, entrega, zona = 0 }) {
  return baseDe(`
Q[900]={${mision(`objectives={[1]={{70}}},zoneOrSort=${zona}`)}}
N[10]={name="Recoge",spawns={[${recoge}]={{10,10}}}}
N[20]={name="Entrega",spawns={[${entrega}]={{20,20}}}}
N[70]={name="Lobo",spawns={[1411]={{50,50}},[1412]={{60,60},{61,61},{62,62}}}}
`);
}
const objetivoDe = (b, mapaJugador) => puntosDeMision(b, 900, undefined, 'es', mapaJugador).find((p) => p.papel === 'objetivo');

test('F4-15: el objetivo con puntos en el mapa de la misión y en otro más poblado gana el mapa de la misión', () => {
  const b = baseConDosMapas({ recoge: 1411, entrega: 1411 });
  const objetivo = objetivoDe(b, undefined);
  assert.equal(objetivo.mapa, 1411);
  assert.deepEqual([objetivo.x, objetivo.y], [50, 50]);
});

test('F4-15: mapaJugador manda sobre el mapa de la misión, si el objetivo tiene puntos ahí', () => {
  const b = baseConDosMapas({ recoge: 1411, entrega: 1411 });
  assert.equal(objetivoDe(b, 1412).mapa, 1412);
  // Si el objetivo no tiene puntos en el mapa del jugador, se sigue con la cadena.
  assert.equal(objetivoDe(b, 9999).mapa, 1411);
});

test('F4-15: sin puntos en el mapa de recoger, vale el de entregar', () => {
  const b = baseConDosMapas({ recoge: 1500, entrega: 1411 });
  assert.equal(objetivoDe(b, undefined).mapa, 1411);
});

test('F4-15: sin puntos en recoger ni entregar, vale la zona de la misión (zoneOrSort 14 -> uiMap 1411 por uiDeArea)', () => {
  const b = baseConDosMapas({ recoge: 1500, entrega: 1501, zona: 14 });
  assert.equal(objetivoDe(b, undefined).mapa, 1411);
});

test('F4-15: sin ninguna coincidencia, el mapa con más puntos', () => {
  const b = baseConDosMapas({ recoge: 1500, entrega: 1501, zona: 363 });
  assert.equal(objetivoDe(b, undefined).mapa, 1412); // el área 363 no está en la tabla de zonas
});

test('recoger y entregar prefieren mapaJugador', () => {
  const b = baseDe(`
Q[900]={${mision('')}}
N[10]={name="Recoge",spawns={[1411]={{10,10}},[1412]={{11,11}}}}
N[20]={name="Entrega",spawns={[1411]={{20,20}},[1412]={{21,21}}}}
`);
  const puntos = puntosDeMision(b, 900, undefined, 'es', 1412);
  assert.deepEqual(puntos.map((p) => p.mapa), [1412, 1412]);
  assert.deepEqual(puntosDeMision(b, 900, undefined, 'es', undefined).map((p) => p.mapa), [1411, 1411]);
});

test('puntosDeMision usa las correcciones del personaje (porFaccion)', () => {
  const b = baseDe(`
Q[900]={${mision('')}}
N[10]={name="Recoge",spawns={[1411]={{10,10}}}}
N[20]={name="Entrega",spawns={[1411]={{20,20}}}}
N[21]={name="Entrega Horda",spawns={[1411]={{70,70}}}}
`, 'Horde={quest={[900]={finishedBy={{21}}}},npc={},object={},item={}}');
  assert.equal(puntosDeMision(b, 900, { faccion: 'Horde' }, 'es', undefined).find((p) => p.papel === 'entregar').x, 70);
  assert.equal(puntosDeMision(b, 900, { faccion: 'Alliance' }, 'es', undefined).find((p) => p.papel === 'entregar').x, 20);
});

// ---------------------------------------------------------------------------------------------------------------------
// Datos reales
// ---------------------------------------------------------------------------------------------------------------------

const REALES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'addons', 'SnetForever_Misiones');

test('datos reales: puntosDeMision de todas las misiones no falla y da puntos válidos', { skip: !existsSync(join(REALES, 'SnetForever_Misiones.toc')) && 'faltan los datos reales' }, () => {
  const real = cargarBase(REALES);
  let conPuntos = 0;
  let conDonde = 0;
  let conDentro = 0;
  let sinEntregaConEntidad = 0;
  let total = 0;
  for (const [q] of entradas(real.datos.quest)) {
    const puntos = puntosDeMision(real, q, { faccion: 'Horde', clase: 'WARRIOR' }, 'es', undefined);
    total++;
    if (puntos.length > 0) conPuntos++;
    if (puntos.some((p) => p.donde)) conDonde++;
    if (puntos.some((p) => p.donde?.startsWith('Dentro de '))) conDentro++;
    if (!puntos.some((p) => p.papel === 'entregar')) {
      const f = real.mision(q).finishedBy;
      if (entradas(elemento(f, 1)).length + entradas(elemento(f, 2)).length > 0) sinEntregaConEntidad++;
    }
    for (const p of puntos) {
      assert.ok(Number.isInteger(p.mapa) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, `misión ${q}: punto raro ${JSON.stringify(p)}`);
      assert.ok(['recoger', 'objetivo', 'entregar'].includes(p.papel));
    }
  }
  console.log(`# misiones reales con punto: ${conPuntos}, con zona: ${conDonde}, «Dentro de»: ${conDentro}, sin entrega teniendo entregador: ${sinEntregaConEntidad}, de ${total}`);
  assert.ok(conPuntos > total / 2);
  // Umbrales según lo medido con los datos 2026.11.10.1 (con punto 4.988, con zona 4.980, «Dentro de» 589, sin entrega
  // teniendo entregador 15; antes de leer enMazmorra de primer nivel solo 5 misiones salían con «Dentro de»), con holgura.
  assert.ok(conPuntos >= 4900, `con punto: ${conPuntos}`);
  assert.ok(conDonde >= 4800, `con zona: ${conDonde}`);
  assert.ok(conDentro >= 500, `«Dentro de»: ${conDentro}`);
  assert.ok(sinEntregaConEntidad <= 30, `sin entrega teniendo entregador: ${sinEntregaConEntidad}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// Ronda 1: enMazmorra de primer nivel, zonas, rangos, nombres y celdas vacías
// ---------------------------------------------------------------------------------------------------------------------

const MISION_SIN_OBJ = (nombre, inicio, fin) => `name="${nombre}",startedBy={{${inicio}}},finishedBy={{${fin}}},requiredLevel=1,questLevel=1,requiredRaces=0,requiredClasses=0,`
  + 'objectivesText={},sourceItemId=0,zoneOrSort=0,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0';

test('enMazmorra de primer nivel: el PNJ de mazmorra da la entrada y el nombre «Dentro de …» (fixture de la forma real)', () => {
  // En misiones-app.lua el PNJ 644 lleva enMazmorra como campo suyo, como lo escribe el conversor.
  assert.deepEqual(base.npc(644).enMazmorra, [1581]);
  const b = baseDe(`
Q[900]={${mision('objectives={[1]={{644}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[644]={name="Defias",enMazmorra={1581},minLevel=10}
`);
  const objetivo = puntosDeMision(b, 900, undefined, 'en', undefined).find((p) => p.papel === 'objetivo');
  assert.equal(objetivo.donde, 'Inside The Deadmines');
  assert.deepEqual([objetivo.mapa, objetivo.x, objetivo.y], [1436, 42.5, 71.7]);
});

test('enMazmorra: el PNJ que recoge o entrega dentro de una mazmorra tiene punto', () => {
  const b = baseDe(`
Q[900]={${MISION_SIN_OBJ('Dentro', 644, 644)}}
N[644]={name="Defias",enMazmorra={1581}}
`);
  const puntos = puntosDeMision(b, 900, undefined, 'es', undefined);
  assert.deepEqual(puntos.map((p) => [p.papel, p.donde, p.mapa]), [['recoger', 'Dentro de The Deadmines', 1436], ['entregar', 'Dentro de The Deadmines', 1436]]);
});

test('enMazmorra dentro de triggerEnd.puntos (la otra forma)', () => {
  const b = baseDe(`
Q[900]={${mision('triggerEnd={"Entra",{enMazmorra={1581}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
`);
  const objetivo = puntosDeMision(b, 900, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
  assert.equal(objetivo.donde, 'Dentro de The Deadmines');
  assert.equal(objetivo.obj, 'Entra');
});

test('la entrada de mazmorra sin mapa pero con zona se resuelve con uiDeArea', () => {
  const b = baseDe(`
Q[900]={${mision('objectives={[1]={{644}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[644]={name="Defias",enMazmorra={77}}
`);
  b.datos.mazmorra[77] = { nombre: 'Utgarde', zonaPadre: 17, entradas: [{ zona: 17, x: 58.8, y: 48.3 }] };
  const objetivo = puntosDeMision(b, 900, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
  assert.deepEqual(objetivo, { papel: 'objetivo', q: 900, obj: 'Defias', texto: 'Prueba: Defias', donde: 'Dentro de Utgarde', mapa: 1413, x: 58.8, y: 48.3 });
});

test('donde es el nombre de la zona del mapa (es, luego en) y null si el mapa no tiene nombre', () => {
  const b = baseDe(`
Q[900]={${MISION_SIN_OBJ('Uno', 10, 20)}}
Q[901]={${MISION_SIN_OBJ('Dos', 11, 20)}}
Q[902]={${MISION_SIN_OBJ('Tres', 12, 20)}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[11]={name="B",spawns={[1412]={{10,10}}}}
N[12]={name="C",spawns={[1500]={{10,10}}}}
N[20]={name="E",spawns={[1411]={{20,20}}}}
`);
  assert.equal(puntosDeMision(b, 900, undefined, 'es', undefined)[0].donde, 'Durotar');
  assert.equal(puntosDeMision(b, 901, undefined, 'es', undefined)[0].donde, 'Mulgore'); // sin es: el inglés
  assert.equal(puntosDeMision(b, 902, undefined, 'es', undefined)[0].donde, null);
});

test('puntoRepresentativo descarta los puntos con x o y mayores que 100', () => {
  assert.equal(puntoRepresentativo({ 1: [[101, 5], [5, 150]] }), null);
  assert.deepEqual(puntoRepresentativo({ 1: [[100, 100], [100.5, 20], [30, 100.1]] }), { mapa: 1, x: 100, y: 100, n: 1 });
});

test('una entrada de mazmorra con x o y fuera de 0-100 no da punto', () => {
  const b = baseDe(`
Q[900]={${mision('objectives={[1]={{644}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
N[644]={name="Defias",enMazmorra={77}}
`);
  b.datos.mazmorra[77] = { nombre: 'Rara', zonaPadre: 17, entradas: [{ zona: 17, mapa: 1413, x: 120, y: 48.3 }] };
  assert.deepEqual(puntosDeMision(b, 900, undefined, 'es', undefined).map((p) => p.papel), ['recoger', 'entregar']);
});

test('el nombre entre paréntesis es el de un PNJ con spawn dentro del bloque ganador', () => {
  // El primer PNJ está lejos del grupo: el nombre tiene que ser el de uno que está en el grupo ganador.
  const b = baseDe(`
Q[900]={name="Pr",startedBy={{31,32,33}},finishedBy={{20}},requiredLevel=1,questLevel=1,requiredRaces=0,requiredClasses=0,objectivesText={},sourceItemId=0,zoneOrSort=0,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0}
N[31]={name="Lejano",spawns={[1411]={{90,90}}}}
N[32]={name="Uno",spawns={[1411]={{10,10}}}}
N[33]={name="Dos",spawns={[1411]={{11,11}}}}
N[20]={name="E",spawns={[1411]={{20,20}}}}
`);
  const recoger = puntosDeMision(b, 900, undefined, 'es', undefined)[0];
  assert.deepEqual([recoger.x, recoger.y], [10.5, 10.5]);
  assert.equal(recoger.texto, 'Recoger «Pr» (Uno)');
});

test('un triggerEnd sin texto no deja «: » colgando', () => {
  const b = baseDe(`
Q[900]={${mision('triggerEnd={"",{[1411]={{70,71}}}}')}}
Q[901]={${mision('triggerEnd={[2]={[1411]={{70,71}}}}')}}
N[10]={name="A",spawns={[1411]={{10,10}}}}
N[20]={name="B",spawns={[1411]={{20,20}}}}
`);
  for (const q of [900, 901]) {
    const objetivo = puntosDeMision(b, q, undefined, 'es', undefined).find((p) => p.papel === 'objetivo');
    assert.equal(objetivo.texto, 'Prueba', `misión ${q}`);
    assert.equal('obj' in objetivo, false);
  }
});

test('desempate: el bloque ganador puede estar centrado en una celda vecina vacía', () => {
  // Puntos en las celdas cx 0 y cx 2: solo el bloque centrado en la celda vacía cx 1 los recoge a los dos.
  assert.deepEqual(puntoRepresentativo({ 1: [[2, 50], [12, 50]] }), { mapa: 1, x: 7, y: 50, n: 2 });
});
