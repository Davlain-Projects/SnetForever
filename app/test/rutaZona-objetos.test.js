// Lote «Cadenas de mejoras»: las rutas de zona ven unidas las cadenas que se enlazan por objetos (la anterior se entrega
// en el objeto que da la siguiente), aunque la base no declare ninguna previa. Mundo de prueba: la cadena del saco de
// dormir en miniatura (dos inicios espejo con el mismo nombre, uno por facción, que forman un ciclo) y, aparte, el
// caso de la tumba de Duskwood (un ciclo largo que no se debe deducir). Al final, los datos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { construirRutaZona, dependencias, previasPorObjeto } from '../src/rutaZona.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const REALES = join(AQUI, '..', '..', 'addons', 'SnetForever_Misiones');

// Máscaras de 79007 (Horda) y 79008 (Alianza).
const HORDA = 2 ** 33 + 2 + 16 + 32 + 128;
const ALIANZA = 2 ** 32 + 1 + 4 + 8 + 64;

// Zona 1412 (área 215): todo está en ella salvo los objetos 101 y 104, que están en 1411 (área 14).
// zona: {q: AreaID} para cambiar el zoneOrSort de una; mas: {q: ',campo=valor'} para añadirle campos.
function baseDelSaco({ extra = [], zona = {}, mas = {} } = {}) {
  const carpeta = mkdtempSync(join(tmpdir(), 'snf-rutazona-objetos-'));
  const mision = (q, nombre, da, recoge, razas = 0) => `Q[${q}]={name="${nombre}",startedBy={[2]={${da}}},`
    + `finishedBy={[2]={${recoge}}},requiredLevel=1,questLevel=5,requiredRaces=${razas},requiredClasses=0,objectivesText={},`
    + `objectives={},sourceItemId=0,zoneOrSort=${zona[q] ?? 215},questFlags=8,specialFlags=0,parentQuest=0${mas[q] ?? ''}}`;
  const objeto = (id, ui) => `O[${id}]={name="Objeto ${id}",spawns={[${ui}]={{40,40}}}}`;
  const lineas = [
    'SNF_MISIONES = {version="t",esquema=1,fuente={nombre="QuestieDB",version="t",commit="0"},quest={},npc={},object={},item={},'
      + 'es={quest={},npc={},object={},item={}},porMazmorra={},zonas={area={[215]=1412,[14]=1411},nombre={[1412]={en="Mulgore",es="Mulgore"},[1411]={en="Durotar"}}},mazmorra={},porFaccion={}}',
    'local Q = SNF_MISIONES.quest', 'local O = SNF_MISIONES.object',
    objeto(101, 1411), objeto(102, 1412), objeto(103, 1412), objeto(104, 1411), objeto(105, 1412), objeto(106, 1412), objeto(107, 1412),
    mision(10, '... and that note you found', '101', '102,103', HORDA),
    mision(11, '... and that note you found', '102', '101,104', ALIANZA),
    mision(12, 'Stepping Stones', '101,102,104,103', '105'),
    mision(13, 'Scramble', '105', '106'),
    mision(14, 'This Must Be The Place', '106', '107'),
    ...extra,
  ];
  writeFileSync(join(carpeta, 'datos.lua'), `${lineas.join('\n')}\n`);
  writeFileSync(join(carpeta, 'app.toc'), '## Interface: 16001\n\ndatos.lua\n');
  return cargarBase(carpeta);
}

const ORCO = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 5 };
const HUMANO = { faccion: 'Alliance', raza: 'Human', clase: 'WARRIOR', nivel: 5 };
const SKY_H = { faccion: 'Horde', raza: 'Skyborne', clase: 'WARRIOR', nivel: 5 };
const turno = (personaje, lugar = { mapa: 1412, x: 50, y: 50 }) => ({ datos: { personaje, lugar, registro: [] } });
const condicionesDe = (guia, t, q) => guia.pasos.filter((p) => p.elementos.some((e) => e.t === t && e.q === q))
  .map((p) => p.elementos.filter((e) => e.t === 'isQuestTurnedIn').map((e) => e.qs));

test('previasPorObjeto: con la máscara de cada misión, el orco ve 10 antes de 12 y el humano, 11', () => {
  const b = baseDelSaco();
  assert.deepEqual(previasPorObjeto(b, ORCO, 12), [10]);
  assert.deepEqual(previasPorObjeto(b, SKY_H, 12), [10]);
  assert.deepEqual(previasPorObjeto(b, HUMANO, 12), [11]);
  assert.deepEqual(previasPorObjeto(b, ORCO, 13), [12]);
  // 10 empieza donde se entrega 11, pero 11 no es de la Horda: nada.
  assert.deepEqual(previasPorObjeto(b, ORCO, 10), []);
  assert.deepEqual(previasPorObjeto(b, HUMANO, 11), []);
});

test('dependencias: las previas por objeto cuentan como «alguna», dentro de la ruta', () => {
  const b = baseDelSaco();
  const deps = dependencias(b, ORCO, [10, 12, 13, 14]);
  assert.deepEqual(deps.get(12), { todas: [], alguna: [10] });
  assert.deepEqual(deps.get(13), { todas: [], alguna: [12] });
  assert.deepEqual(deps.get(14), { todas: [], alguna: [13] });
  assert.deepEqual(deps.get(10), { todas: [], alguna: [] });
});

test('la ruta de la zona va en el orden de la cadena y, si la previa está fuera, la pide con isQuestTurnedIn', () => {
  const b = baseDelSaco();
  const r = construirRutaZona(b, { zona: 1412 }, turno(ORCO), 'es');
  assert.ok(r.guia, r.texto);
  // Posición del elemento en la guía entera (dos acciones en el mismo sitio van en el mismo paso, en orden).
  const elementos = r.guia.pasos.flatMap((p) => p.elementos);
  const pos = (t, q) => elementos.findIndex((e) => e.t === t && e.q === q);
  assert.ok(pos('turnin', 12) >= 0 && pos('accept', 13) >= 0);
  assert.ok(pos('turnin', 12) < pos('accept', 13), 'Scramble se recoge después de entregar Stepping Stones');
  assert.ok(pos('turnin', 13) < pos('accept', 14));
  // 10 está en la ruta (su objeto 101 está fuera, pero zoneOrSort 215 la pone en la zona): 12 no lleva condición.
  for (const c of condicionesDe(r.guia, 'accept', 12)) assert.deepEqual(c, []);
});

test('sin la primera en la ruta, la siguiente la pide con isQuestTurnedIn (no se ofrece a quien no la hizo)', () => {
  // La 10 de la Horda pasa a otra zona (área 14): ya no entra en la ruta de 1412.
  const b = baseDelSaco({ zona: { 10: 14 } });
  const r = construirRutaZona(b, { zona: 1412 }, turno(ORCO), 'es');
  const conds = condicionesDe(r.guia, 'accept', 12);
  assert.ok(conds.length > 0, '12 está en la ruta');
  for (const c of conds) assert.deepEqual(c, [[10]]);
  // Y la condición pasa a las que cuelgan de ella.
  for (const c of condicionesDe(r.guia, 'accept', 13)) assert.deepEqual(c, [[10]]);
});

test('un ciclo de dos para la misma raza y un ciclo largo con enlaces de la base no deducen nada', () => {
  const b = baseDelSaco({ extra: [
    // 20 y 21: cada una se entrega donde empieza la otra, para todas las razas.
    'Q[20]={name="X",startedBy={[2]={120}},finishedBy={[2]={121}},requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,zoneOrSort=215}',
    'Q[21]={name="Y",startedBy={[2]={121}},finishedBy={[2]={120}},requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,zoneOrSort=215}',
    // La tumba: 225 empieza en el objeto 161, donde se entrega 231, que va después de 225 por la base.
    'Q[225]={name="The Weathered Grave",startedBy={[2]={161}},finishedBy={{268}},nextQuestInChain=227,requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,zoneOrSort=215}',
    'Q[227]={name="Morgan Ladimore",startedBy={{268}},finishedBy={{264}},preQuestSingle={225},nextQuestInChain=231,requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,zoneOrSort=215}',
    'Q[231]={name="A Daughter\'s Love",startedBy={{576}},finishedBy={[2]={161}},requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,zoneOrSort=215}',
  ] });
  assert.deepEqual(previasPorObjeto(b, ORCO, 20), []);
  assert.deepEqual(previasPorObjeto(b, ORCO, 21), []);
  assert.deepEqual(previasPorObjeto(b, ORCO, 225), []);
});

test('ronda 1 (M1): un objeto «buzón» (más de 3 misiones de la raza pasan por él) no deduce nada', () => {
  // Como el «Dead Drop»: el objeto 130 recibe 30 y 32 y da (y recibe) 31 y 33.
  const m = (q, da, recoge) => `Q[${q}]={name="M${q}",startedBy=${da},finishedBy=${recoge},requiredLevel=1,questLevel=5,`
    + 'requiredRaces=0,requiredClasses=0,zoneOrSort=215}';
  const b = baseDelSaco({ extra: [
    m(30, '{{60100}}', '{[2]={130}}'), m(31, '{[2]={130}}', '{[2]={130}}'),
    m(32, '{{60100}}', '{[2]={130}}'), m(33, '{[2]={130}}', '{[2]={130}}'),
  ] });
  assert.deepEqual(previasPorObjeto(b, ORCO, 31), []);
  assert.deepEqual(previasPorObjeto(b, ORCO, 33), []);
});

test('ronda 1 (M1): no se deduce una previa que nadie da (sin startedBy)', () => {
  const b = baseDelSaco({ extra: [
    'Q[40]={name="Sin dador",startedBy={},finishedBy={[2]={140}},requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,zoneOrSort=215}',
    'Q[41]={name="Sigue",startedBy={[2]={140}},finishedBy={{60100}},requiredLevel=1,questLevel=5,requiredRaces=0,requiredClasses=0,zoneOrSort=215}',
  ] });
  assert.deepEqual(previasPorObjeto(b, ORCO, 41), []);
});

test('una misión con previas declaradas no recibe previas por objeto (manda la base)', () => {
  const b = baseDelSaco({ mas: { 13: ',preQuestSingle={14}' } });
  assert.deepEqual(previasPorObjeto(b, ORCO, 13), []);
});

const hayReales = existsSync(join(REALES, 'SnetForever_Misiones.toc'));

test('datos reales: en Sierra Espolón, «Scramble» pide «Stepping Stones» y «Wet Job» va detrás de «Scramble»', { skip: !hayReales }, () => {
  const real = cargarBase(REALES);
  const pj = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 20 };
  // Lote H: hasta QuestieDB 1.0.11 la cadena del saco solo se unía por objeto; la 1.0.14 declara sus previas
  // (preQuestSingle), y entonces manda la base y previasPorObjeto no deduce nada. Vale cualquiera de las dos.
  const previaDe = (p, q) => {
    const porObjeto = previasPorObjeto(real, p, q);
    return porObjeto.length > 0 ? porObjeto : (real.mision(q, p)?.preQuestSingle ?? []);
  };
  // Ronda 1 (M5): la 79192 la declara la base (sin previa por objeto) y, en la ruta de la zona donde se entrega la primera
  // (Páramos de Poniente la Horda, Los Baldíos la Alianza), la condición de su accept lleva la «... and that note you
  // found» de la propia facción (79007 la Horda, 79008 la Alianza).
  const humano = { ...pj, faccion: 'Alliance', raza: 'Human' };
  for (const [p, propia, zona] of [[pj, 79007, 1436], [humano, 79008, 1413]]) {
    assert.deepEqual(previasPorObjeto(real, p, 79192), []);
    assert.deepEqual(real.mision(79192, p)?.preQuestSingle, [79007, 79008]);
    const ruta = construirRutaZona(real, { zona }, turno(p, { mapa: zona, x: 46, y: 74 }), 'es');
    assert.ok(ruta.guia, ruta.texto);
    const c79192 = condicionesDe(ruta.guia, 'accept', 79192);
    assert.ok(c79192.length > 0, `«Stepping Stones» en la ruta de ${p.faccion}`);
    for (const c of c79192) assert.ok(c.some((qs) => qs.includes(propia)), `${p.faccion}: ${JSON.stringify(c)}`);
  }
  assert.deepEqual(previaDe(pj, 79980), [79192]);
  const r = construirRutaZona(real, { zona: 1442 }, turno(pj, { mapa: 1442, x: 40, y: 50 }), 'es');
  assert.ok(r.guia, r.texto);
  const conds = condicionesDe(r.guia, 'accept', 79980);
  assert.ok(conds.length > 0, 'Scramble está en la ruta');
  for (const c of conds) assert.deepEqual(c, [[79192]]);
  const elementos = r.guia.pasos.flatMap((p) => p.elementos);
  const pos = (t, q) => elementos.findIndex((e) => e.t === t && e.q === q);
  if (pos('accept', 79974) >= 0) assert.ok(pos('turnin', 79980) < pos('accept', 79974));
  // Ronda 1 (M1): la cadena del saco sigue unida entera.
  assert.deepEqual([79980, 79974, 79975, 79976].map((q) => previaDe(pj, q)), [[79192], [79980], [79974], [79975]]);
  // «The Weathered Grave» (Duskwood) no pide «A Daughter's Love»: sería un ciclo.
  assert.deepEqual(previasPorObjeto(real, { faccion: 'Alliance', raza: 'Human', clase: 'WARRIOR', nivel: 30 }, 225), []);
});

test('ronda 1 (M1), datos reales: el «Dead Drop» y la Sparklematic 5200 son buzones; «The Horn of Xelthos» (otra temporada) ya no está', { skip: !hayReales }, () => {
  const real = cargarBase(REALES);
  const orco = { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 18 };
  assert.deepEqual(previasPorObjeto(real, orco, 78261), []);
  assert.deepEqual(previasPorObjeto(real, { ...orco, clase: 'ROGUE' }, 78676), []);
  assert.deepEqual(previasPorObjeto(real, { ...orco, nivel: 28 }, 2951), []);
  // Desde los datos 2026.11.11.6 (11-nov), las misiones de otras temporadas sin prueba del juego salen de los datos:
  // «The Horn of Xelthos» (78261, de pícaro de la Temporada de Descubrimiento) ya no está, y la ruta de Bosque de
  // Argénteos de un pícaro sale igual sin ella.
  assert.equal(real.mision(78261), undefined, 'la 78261 ya no está en los datos');
  const picaro = { ...orco, clase: 'ROGUE' };
  const r = construirRutaZona(real, { zona: 1421 }, turno(picaro, { mapa: 1421, x: 50, y: 50 }), 'es');
  assert.ok(r.guia, r.texto);
  assert.deepEqual(condicionesDe(r.guia, 'accept', 78261), [], '«The Horn of Xelthos» no está en la ruta');
});
