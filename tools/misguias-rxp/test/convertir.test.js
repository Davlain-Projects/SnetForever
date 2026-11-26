// El conversor de guías de RestedXP a Mis guías (src/convertir.js) con una guía INVENTADA con la misma sintaxis: nombres,
// misiones y textos de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertir } from '../src/convertir.js';
import { principal } from '../src/cli.js';

const GUIA_HORDA = `RegisterGuide([[
#group Pruebas inventadas
#name 1-6 Valle de prueba
<< Horde

step
    .goto Durotar,40.0,60.0
    .accept 9001 >>Habla con Garra Roja
step << Warrior
    .goto Durotar,41.0,61.0
    .accept 9002 >>Habla con el instructor de guerreros
step << Mage/Warlock
    .accept 9003
step << Orc Warrior/Troll Warrior
    .turnin 9002
step << !Troll
    >>Vende la basura
step << Tauren/Hunter
    .accept 9004
step << tbc
    .accept 9005
step << Warrior tbc
    .accept 9006
step
    .goto Durotar,42.0,62.0
    .turnin 9001
    .accept 9007 << Warrior
    .accept 9008 << Warrior
    .accept 9009
    .accept 9010 << Mage --la del mago
    .accept 9011 << sod
    .accept 9012 << Alliance
    .accept 9013 << BloodElf
    >>Habla con Piedra Gris
step << Rogue
    .accept 9014
    .accept 9015 << Orc
step << Human Warrior
    .accept 9016
]])`;

const GUIA_DOS = `RegisterGuide([[
#group Pruebas inventadas
#name 7-9 Para las dos

step << Horde
    .accept 9101
step << Alliance Warrior
    .accept 9102
step << !Alliance
    .accept 9103
step << Skyborne Horde
    .accept 9104
step << Orc
    .accept 9105
]])`;

const ARCHIVOS = [{ ruta: 'inventada.lua', texto: `${GUIA_HORDA}\n\n${GUIA_DOS}\n` }];

// Las líneas de los pasos de una guía (por su nombre) en el Lua que sale.
function pasosDe(lua, nombre) {
  const i = lua.indexOf(`nombre = "${nombre}"`);
  assert.ok(i >= 0, `está la guía ${nombre}`);
  const desde = lua.indexOf('pasos = {\n', i) + 'pasos = {\n'.length;
  const hasta = lua.indexOf('\n    },', desde);
  return lua.slice(desde, hasta).split('\n').map((l) => l.trim());
}

test('convertir: las condiciones de la cabecera del paso pasan a clase / raza / faccion en vez de tirar el paso', () => {
  const { lua, informe } = convertir(ARCHIVOS);
  assert.deepEqual(pasosDe(lua, '[H] 1-6 Valle de prueba'), [
    '{aceptar = 9001, ir = {1411, 40, 60}, texto = "Habla con Garra Roja"},',
    '{clase = "Guerrero", aceptar = 9002, ir = {1411, 41, 61}, texto = "Habla con el instructor de guerreros"},',
    '{clase = {"Mago", "Brujo"}, aceptar = 9003},',
    '{clase = "Guerrero", raza = {"Orco", "Trol"}, entregar = 9002},',
    '{sin_raza = "Trol", texto = "Vende la basura"},',
    // «Tauren/Hunter» no cabe en un paso: dos que no se pisan.
    '{clase = "Cazador", aceptar = 9004},',
    '{raza = "Tauren", sin_clase = "Cazador", aceptar = 9004},',
    // «tbc» y «Warrior tbc» no son del personaje: se tiran como antes. La línea partida: lo común y cada condición aparte,
    // en orden; «sod» sigue para todos (como antes) y lo de la Alianza o de los elfos de sangre no sale.
    '{aceptar = {9009, 9011}, entregar = 9001, ir = {1411, 42, 62}, texto = "Habla con Piedra Gris"},',
    '{clase = "Guerrero", aceptar = {9007, 9008}},',
    '{clase = "Mago", aceptar = 9010},',
    // Cabecera y línea: las dos (Y).
    '{clase = "Pícaro", aceptar = 9014},',
    '{clase = "Pícaro", raza = "Orco", aceptar = 9015},',
  ]);
  assert.deepEqual(pasosDe(lua, '[H-A] 7-9 Para las dos'), [
    '{faccion = "Horda", aceptar = 9101},',
    '{clase = "Guerrero", faccion = "Alianza", aceptar = 9102},',
    '{faccion = "Horda", aceptar = 9103},',
    '{raza = "Skyborne", faccion = "Horda", aceptar = 9104},',
    '{raza = "Orco", aceptar = 9105},',
  ]);
  assert.equal(informe.pasos, 16);
  assert.equal(informe.pasosCondicion, 2, 'los de «tbc» siguen fuera');
  assert.equal(informe.pasosConFiltro, 11);
  assert.deepEqual(informe.recuperadosPor, { clase: 6, raza: 5, faccion: 4 });
  assert.equal(informe.pasosImposibles, 1, '«Human Warrior» en una guía de la Horda');
  assert.equal(informe.pasosPartidos, 2);
  assert.equal(informe.pasosDeMas, 4, '2 del paso partido en tres, 1 del de pícaro y 1 de «Tauren/Hunter»');
  assert.equal(informe.lineasImposibles, 2);
  assert.equal(informe.guias, 2);
});

test('convertir: sin condiciones, el paso sale igual que con el conversor de antes (el primer texto y el primer goto)', () => {
  const { lua } = convertir([{ ruta: 'a.lua', texto: `RegisterGuide([[
#name 3-4 Sencilla
step
    #completewith next
    +Recoge leña por el camino
    .goto Durotar,10.5,20.25
    .goto Durotar,11,21
    .complete 9201,2
    -- un comentario
step
    .accept 9202
    .accept 9202
    .turnin 9203 >>Habla con la jefa |cRXP_FRIENDLY_Garra|r
    >>Otro texto
step
    .goto Durotar,6453.96,20
]])` }]);
  assert.deepEqual(pasosDe(lua, '[H-A] 3-4 Sencilla'), [
    '{completar = 9201, objetivo = 2, ir = {1411, 10.5, 20.25}, texto = "Recoge leña por el camino"},',
    '{aceptar = 9202, entregar = 9203, texto = "Habla con la jefa Garra"},',
  ]);
});

test('convertir: los textos se traducen con TRADUCCIONES (el inglés queda en texto_en) y todos van a pendientes', () => {
  const { lua, pendientes } = convertir(ARCHIVOS, { traducciones: { 'Vende la basura': 'Vende lo gris', '1-6 Valle de prueba': '1-6 Valle traducido' } });
  assert.ok(pasosDe(lua, '[H] 1-6 Valle traducido').includes('{sin_raza = "Trol", texto = "Vende lo gris", texto_en = "Vende la basura"},'));
  assert.ok(lua.includes('nombre_en = "[H] 1-6 Valle de prueba"'));
  assert.ok(pendientes.includes('Habla con Piedra Gris'));
  assert.ok(pendientes.includes('7-9 Para las dos'));
});

test('convertir: con la base de misiones, las que no están se quitan (los pasos que quedan sin nada, fuera)', () => {
  const conocidas = new Set([9002, 9003, 9004, 9007, 9008, 9011, 9014, 9015, 9101, 9102, 9103, 9104, 9105]);
  const { lua, informe } = convertir(ARCHIVOS, { misiones: conocidas });
  const pasos = pasosDe(lua, '[H] 1-6 Valle de prueba');
  assert.equal(pasos[0], '{ir = {1411, 40, 60}, texto = "Habla con Garra Roja"},');
  assert.ok(pasos.includes('{aceptar = 9011, ir = {1411, 42, 62}, texto = "Habla con Piedra Gris"},'), pasos.join('\n'));
  assert.ok(!pasos.some((p) => p.includes('9010')), 'el paso del mago se queda sin nada y se quita');
  assert.equal(informe.misionesQuitadas, 4);
  assert.equal(informe.pasosSinMisiones, 1);
});

test('convertir: las guías que ya están en Rutas y las de SoD se saltan; el ejemplo va siempre el primero', () => {
  const sod = `RegisterGuide([[
#group Otra
#name 10-12 SoD Inventada
step
    .accept 9301
]])`;
  const archivos = [...ARCHIVOS, { ruta: 'sod.lua', texto: sod }];
  const sinSod = convertir(archivos, { yaEnRutas: new Set(['*|paralasdos']) });
  assert.ok(!sinSod.lua.includes('Para las dos'));
  assert.ok(!sinSod.lua.includes('SoD Inventada'));
  assert.equal(sinSod.informe.yaExistentesEnRutas, 1);
  // enLasGuias cuenta solo las que salen; lo de fuera cuenta todo lo leído.
  assert.equal(sinSod.informe.pasos, 17);
  assert.equal(sinSod.informe.enLasGuias.pasos, 11);
  assert.equal(sinSod.informe.enLasGuias.pasosConFiltro, 6);
  assert.deepEqual(sinSod.informe.enLasGuias.recuperadosPor, { clase: 5, raza: 3, faccion: 0 });
  assert.equal(sinSod.informe.enLasGuias.pasosPartidos, 2);
  assert.ok(sinSod.lua.indexOf('Ejemplo: Valle de los Retos') < sinSod.lua.indexOf('Valle de prueba'));
  assert.ok(convertir(archivos, { incluirSod: true }).lua.includes('SoD Inventada'));
});

// La orden de verdad: rutas por argumentos y variables de entorno, sin rutas del jugador en el código.
test('cli: lee la carpeta de origen, TRADUCCIONES, EXCLUIR_RUTAS y MISIONES, y escribe mis-guias.lua, pendientes.json e informe.json', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-misguias-rxp-'));
  const origen = join(raiz, 'origen', 'sub');
  mkdirSync(origen, { recursive: true });
  writeFileSync(join(origen, 'inventada.lua'), ARCHIVOS[0].texto);
  const trad = join(raiz, 'trad.json');
  writeFileSync(trad, JSON.stringify({ 'Vende la basura': 'Vende lo gris' }));
  const rutas = join(raiz, 'rutas');
  mkdirSync(rutas);
  writeFileSync(join(rutas, 'guias_1.lua'), 'T["x"]={grupo="Pruebas inventadas",nombre="7-9 Para las dos",titulo={en="7-9 Para las dos"}}');
  const misiones = join(raiz, 'misiones');
  mkdirSync(misiones);
  writeFileSync(join(misiones, 'quest_1.lua'), [9001, 9002, 9003, 9004, 9009, 9011, 9014, 9015].map((q) => `T[${q}]={}`).join('\n'));
  const salida = join(raiz, 'salida');
  const errores = [];
  const codigo = principal([join(raiz, 'origen'), salida], { TRADUCCIONES: trad, EXCLUIR_RUTAS: rutas, MISIONES: misiones },
    { escribir: () => {}, error: (t) => errores.push(t) });
  assert.equal(codigo, 0, errores.join('\n'));
  const lua = readFileSync(join(salida, 'mis-guias.lua'), 'utf8');
  assert.ok(lua.includes('texto = "Vende lo gris", texto_en = "Vende la basura"'));
  assert.ok(!lua.includes('Para las dos'));
  assert.ok(!lua.includes('9007'), 'la 9007 no está en la base');
  assert.ok(existsSync(join(salida, 'pendientes.json')));
  const informe = JSON.parse(readFileSync(join(salida, 'informe.json'), 'utf8'));
  assert.equal(informe.yaExistentesEnRutas, 1);
  assert.equal(informe.guias, 1);
  // Sin carpeta de origen, la orden explica cómo usarla.
  const sinErrores = [];
  assert.notEqual(principal([], {}, { escribir: () => {}, error: (t) => sinErrores.push(t) }), 0);
  assert.match(sinErrores.join('\n'), /Uso/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Ronda 2
// ---------------------------------------------------------------------------------------------------------------------

const GUIA_R2 = `RegisterGuide([[
#group Pruebas inventadas
#name 13-15 Ronda dos

step
    .accept 9106
    .accept 9107 << Warrior sod
    .accept 9108 << Mage/tbc
    .accept 9109 << !wotlk
step << !tbc !wotlk
    .accept 9110
step << Orc/Troll/Undead/Tauren
    .accept 9111
step << Rogue tbc
    .accept 9112
step << skip
    .accept 9113
step << Mage !wotlk
    .accept 9114
]])`;

test('convertir: en una línea «Warrior sod» y «Mage/tbc» quedan de su clase; !tbc y !wotlk valen siempre; lo demás, como antes', () => {
  const { lua, informe } = convertir([{ ruta: 'r2.lua', texto: GUIA_R2 }]);
  assert.deepEqual(pasosDe(lua, '[H-A] 13-15 Ronda dos'), [
    '{aceptar = {9106, 9109}},',
    '{clase = "Guerrero", aceptar = 9107},',
    '{clase = "Mago", aceptar = 9108},',
    '{aceptar = 9110},',
    // Las cuatro razas clásicas de la Horda son la Horda entera (con Goblin y Skyborne).
    '{faccion = "Horda", aceptar = 9111},',
    '{clase = "Mago", aceptar = 9114},',
  ]);
  assert.equal(informe.pasosCondicion, 2);
  assert.deepEqual(informe.tiradasPorPalabra, { skip: 1, tbc: 1 });
  assert.equal(informe.pasosCiertos, 1, 'el de «!tbc !wotlk», que entra para todos');
});

const GUIAS_DE_CABECERA = `RegisterGuide([[
#group Pruebas inventadas
#name 10-12 Solo cazadores
<< Alliance Hunter

step
    .accept 9401
step << Hunter
    .accept 9402
step << Warrior
    .accept 9403
step << Gnome
    .accept 9406
]])
RegisterGuide([[
#group Pruebas inventadas
#name 20-23 Sin guerreros ni chamanes
<< Horde !Warrior !Shaman
step
    .accept 9501
]])
RegisterGuide([[
#group Pruebas inventadas
#name 11-12 Brujos gnomos
<< Gnome Warlock
step
    .accept 9502
]])
RegisterGuide([[
#group Pruebas inventadas
#name 6-11 Con comentario
<< Alliance --!Hunter
step
    .accept 9503
]])
RegisterGuide([[
#group Pruebas inventadas
#name 30-31 De temporada
<<sod
step
    .accept 9504
]])
RegisterGuide([[
#group Pruebas inventadas
#name 40-41 No cabe
<< Tauren/Hunter
step
    .accept 9505
]])`;

// Las líneas de la cabecera de una guía (nombre, nombre_en, niveles, faccion, clase…), por su nombre.
function cabeceraDe(lua, nombre) {
  const i = lua.indexOf(`nombre = "${nombre}"`);
  assert.ok(i >= 0, `está la guía ${nombre}`);
  return lua.slice(i, lua.indexOf('pasos = {', i)).split('\n').map((l) => l.trim()).filter(Boolean);
}

test('convertir: la condición de la cabecera de la GUÍA va a la guía (clase, raza…) y su facción da la etiqueta', () => {
  const { lua, informe } = convertir([{ ruta: 'g.lua', texto: GUIAS_DE_CABECERA }]);
  assert.deepEqual(cabeceraDe(lua, '[A] 10-12 Solo cazadores'),
    ['nombre = "[A] 10-12 Solo cazadores",', 'niveles = {10, 12},', 'faccion = "Alianza",', 'clase = "Cazador",']);
  // Dentro de la guía de cazadores, «<< Hunter» vale para todos y «<< Warrior», para nadie.
  assert.deepEqual(pasosDe(lua, '[A] 10-12 Solo cazadores'), ['{aceptar = 9401},', '{aceptar = 9402},', '{raza = "Gnomo", aceptar = 9406},']);
  assert.deepEqual(cabeceraDe(lua, '[H] 20-23 Sin guerreros ni chamanes'),
    ['nombre = "[H] 20-23 Sin guerreros ni chamanes",', 'niveles = {20, 23},', 'faccion = "Horda",', 'sin_clase = {"Guerrero", "Chamán"},']);
  assert.deepEqual(cabeceraDe(lua, '[A] 11-12 Brujos gnomos'),
    ['nombre = "[A] 11-12 Brujos gnomos",', 'niveles = {11, 12},', 'faccion = "Alianza",', 'clase = "Brujo",', 'raza = "Gnomo",']);
  assert.deepEqual(cabeceraDe(lua, '[A] 6-11 Con comentario'), ['nombre = "[A] 6-11 Con comentario",', 'niveles = {6, 11},', 'faccion = "Alianza",']);
  // Lo que no es del personaje sigue como antes (no cuenta) y lo que no cabe en una guía, también.
  assert.deepEqual(cabeceraDe(lua, '[H-A] 30-31 De temporada'), ['nombre = "[H-A] 30-31 De temporada",', 'niveles = {30, 31},']);
  assert.deepEqual(cabeceraDe(lua, '[H-A] 40-41 No cabe'), ['nombre = "[H-A] 40-41 No cabe",', 'niveles = {40, 41},']);
  assert.equal(informe.guiasConFiltro, 3);
  assert.equal(informe.guiasConCondicionSinUsar, 2);
});

// Ronda 2 (I2): con el archivo de antes (ANTERIOR), cada paso que ya estaba conserva su id (el del progreso guardado:
// «m<número>» o el que traía) y los nuevos llevan uno que no choca. Así el progreso del jugador sigue en su paso.
const ANTERIOR = `SnetForeverMisGuias = {
  {
    nombre = "[H] 1-6 Valle de prueba",
    niveles = {1, 6},
    faccion = "Horda",
    pasos = {
      {aceptar = 9001, ir = {1411, 40, 60}, texto = "Habla con Garra Roja"},
      {aceptar = {9007, 9008, 9009, 9010, 9011, 9012, 9013}, entregar = 9001, ir = {1411, 42, 62}, texto = "Habla con Piedra Gris"},
    },
  },
}
`;

test('convertir: con el archivo de antes, los pasos que ya estaban conservan su id y los nuevos llevan otro', () => {
  const { lua, informe } = convertir(ARCHIVOS, { anterior: ANTERIOR });
  const pasos = pasosDe(lua, '[H] 1-6 Valle de prueba');
  assert.deepEqual(pasos.map((p) => p.match(/^\{id = "([^"]+)"/)?.[1]),
    ['m1', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'm2', 'n7', 'n8', 'n9', 'n10']);
  assert.equal(pasos[0], '{id = "m1", aceptar = 9001, ir = {1411, 40, 60}, texto = "Habla con Garra Roja"},');
  // El paso partido: su parte común se queda con el id del paso entero de antes.
  assert.equal(pasos[7], '{id = "m2", aceptar = {9009, 9011}, entregar = 9001, ir = {1411, 42, 62}, texto = "Habla con Piedra Gris"},');
  // Una guía que no estaba: sus ids son los de siempre (m<número>), escritos.
  assert.deepEqual(pasosDe(lua, '[H-A] 7-9 Para las dos').map((p) => p.match(/^\{id = "([^"]+)"/)?.[1]), ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.deepEqual(informe.ids, { conservados: 2, nuevos: 15, deAntesSinPaso: 0, guiasNuevas: 1 });
  // Otra vez con el que acaba de salir: sale lo mismo.
  assert.equal(convertir(ARCHIVOS, { anterior: lua }).lua, lua);
});

// Ronda 3: la guía lleva la etiqueta nueva y nombre_antes con el de antes (el addon pasa el progreso de uno a otro).
test('convertir: una guía que ahora lleva otra etiqueta sale con la nueva y con nombre_antes (también al volver a pasarla)', () => {
  const anterior = `SnetForeverMisGuias = {
  {
    nombre = "[H-A] 10-12 Solo cazadores",
    niveles = {10, 12},
    pasos = {
      {aceptar = 9401},
    },
  },
}
`;
  const { lua, informe } = convertir([{ ruta: 'g.lua', texto: GUIAS_DE_CABECERA }], { anterior });
  assert.deepEqual(cabeceraDe(lua, '[A] 10-12 Solo cazadores'), ['nombre = "[A] 10-12 Solo cazadores",',
    'nombre_antes = "[H-A] 10-12 Solo cazadores",', 'niveles = {10, 12},', 'faccion = "Alianza",', 'clase = "Cazador",']);
  assert.equal(pasosDe(lua, '[A] 10-12 Solo cazadores')[0], '{id = "m1", aceptar = 9401},');
  assert.deepEqual(informe.guiasConNombreAntes, ['[A] 10-12 Solo cazadores']);
  // Las demás guías no estaban: sin nombre_antes. Y otra vez con lo que acaba de salir: lo mismo.
  assert.ok(!cabeceraDe(lua, '[A] 11-12 Brujos gnomos').some((l) => l.startsWith('nombre_antes')));
  assert.equal(convertir([{ ruta: 'g.lua', texto: GUIAS_DE_CABECERA }], { anterior: lua }).lua, lua);
});

// Ronda 3 (Important): el id de antes va al trozo COMÚN de un paso partido, aunque el primero sea de una clase.
test('convertir: el id de antes va al trozo común del paso partido, no al de la clase que va delante', () => {
  const guia = `RegisterGuide([[
#name 2-3 Clase delante
<< Horde
step
    .accept 9701 << Warrior
    .accept 9702
step
    .accept 9703 << Mage
    .accept 9704 << Mage
]])`;
  const anterior = `SnetForeverMisGuias = {
  {
    nombre = "[H] 2-3 Clase delante",
    niveles = {2, 3},
    faccion = "Horda",
    pasos = {
      {aceptar = {9701, 9702}},
      {aceptar = {9703, 9704}},
    },
  },
}
`;
  const { lua, informe } = convertir([{ ruta: 'c.lua', texto: guia }], { anterior });
  // Sin trozo común (todo es del mago), el id va al primero.
  assert.deepEqual(pasosDe(lua, '[H] 2-3 Clase delante'), [
    '{id = "n1", clase = "Guerrero", aceptar = 9701},', '{id = "m1", aceptar = 9702},', '{id = "m2", clase = "Mago", aceptar = {9703, 9704}},',
  ]);
  assert.deepEqual(informe.idsEnPasosConFiltro, [{ guia: '[H] 2-3 Clase delante', id: 'm2', linea: '{clase = "Mago", aceptar = {9703, 9704}}' }]);
});

// Ronda 3 (m2, m3): un nombre con comillas casa igual; un id de antes que ya no cae en ningún paso sale listado.
test('convertir: un nombre con comillas conserva sus ids y los ids de antes que se pierden salen en el informe', () => {
  const guia = `RegisterGuide([[
#name 4-5 El "raro"
step
    .accept 9801
]])`;
  const anterior = `SnetForeverMisGuias = {
  {
    nombre = "[H-A] 4-5 El \\"raro\\"",
    niveles = {4, 5},
    pasos = {
      {aceptar = 9801},
      {aceptar = 9802, texto = "Ya no está"},
    },
  },
}
`;
  const { lua, informe } = convertir([{ ruta: 'r.lua', texto: guia }], { anterior });
  assert.deepEqual(pasosDe(lua, '[H-A] 4-5 El \\"raro\\"'), ['{id = "m1", aceptar = 9801},']);
  assert.deepEqual(informe.ids, { conservados: 1, nuevos: 0, deAntesSinPaso: 1, guiasNuevas: 0 });
  assert.deepEqual(informe.idsPerdidos, [{ guia: '[H-A] 4-5 El "raro"', id: 'm2', linea: '{aceptar = 9802, texto = "Ya no está"}' }]);
});

test('cli: TRADUCCIONES admite varios json separados por «;» (el último manda) y ANTERIOR el archivo de antes', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-misguias-rxp-'));
  const origen = join(raiz, 'origen');
  mkdirSync(origen);
  writeFileSync(join(origen, 'inventada.lua'), ARCHIVOS[0].texto);
  writeFileSync(join(raiz, 'a.json'), JSON.stringify({ 'Vende la basura': 'Vende lo gris', 'Habla con Piedra Gris': 'Viejo' }));
  writeFileSync(join(raiz, 'b.json'), JSON.stringify({ 'Habla con Piedra Gris': 'Habla con Piedra Gris, en español' }));
  writeFileSync(join(raiz, 'anterior.lua'), ANTERIOR);
  const salida = join(raiz, 'salida');
  const errores = [];
  const codigo = principal([origen, salida], {
    TRADUCCIONES: `${join(raiz, 'a.json')};${join(raiz, 'b.json')}`, ANTERIOR: join(raiz, 'anterior.lua'),
  }, { escribir: () => {}, error: (t) => errores.push(t) });
  assert.equal(codigo, 0, errores.join('\n'));
  const lua = readFileSync(join(salida, 'mis-guias.lua'), 'utf8');
  assert.ok(lua.includes('texto = "Vende lo gris"'));
  assert.ok(lua.includes('texto = "Habla con Piedra Gris, en español"'));
  assert.ok(lua.includes('{id = "m1", aceptar = 9001'));
});

// Ronda 2 (I2, revisión de la regeneración): un paso partido cuya última línea no la cumple nadie también conserva su id.
test('convertir: el id de antes sigue en el paso partido aunque su última línea no la cumpla nadie', () => {
  const guia = `RegisterGuide([[
#name 2-3 Final imposible
<< Horde
step
    .accept 9601
    .accept 9602 << Warrior
    .accept 9603 << Alliance
]])`;
  const anterior = `SnetForeverMisGuias = {
  {
    nombre = "[H] 2-3 Final imposible",
    niveles = {2, 3},
    faccion = "Horda",
    pasos = {
      {aceptar = {9601, 9602, 9603}},
    },
  },
}
`;
  const { lua } = convertir([{ ruta: 'f.lua', texto: guia }], { anterior });
  assert.deepEqual(pasosDe(lua, '[H] 2-3 Final imposible'), ['{id = "m1", aceptar = 9601},', '{id = "n1", clase = "Guerrero", aceptar = 9602},']);
});
