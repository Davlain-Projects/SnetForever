// Pruebas del addon de datos SnetForever_Misiones: se genera una vez sobre una carpeta temporal
// y se carga con fengari, en el orden del .toc.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escribirMisiones, esMisionBasura } from '../src/escribir/misiones.js';
import { cargarLua } from './ayuda/cargar-lua.js';
import { ORIGEN, rutaQuestieToc } from '../src/config.js';
import { leerEventos } from '../src/questie/lista-negra.js';
import { leerToc } from '../src/questie/toc.js';
import { valorCbor } from '../src/questie/cbor.js';
import { leerEntidades } from '../src/questie/entidades.js';

const hay = existsSync(rutaQuestieToc());
// El elemento k (desde 1) de una tabla Lua leída con cargarLua: array de JS (k-1) u objeto con claves de Lua (k).
const enLua = (t, k) => (Array.isArray(t) ? t[k - 1] : t?.[k]);

describe('esMisionBasura', () => {
  test('da el motivo de las misiones sin nombre, REUSE ME, TEST y NYI', () => {
    assert.ok(esMisionBasura({}));
    assert.ok(esMisionBasura({ name: '' }));
    assert.ok(esMisionBasura({ name: 'REUSE ME 12' }));
    assert.ok(esMisionBasura({ name: 'Prueba TEST quest' }));
    assert.ok(esMisionBasura({ name: 'NYI: Cosa' }));
  });
  test('deja pasar las misiones normales', () => {
    assert.equal(esMisionBasura({ name: 'Your Place In The World' }), null);
    assert.equal(esMisionBasura({ name: 'Testing the Waters' }), null);
    assert.equal(esMisionBasura({ name: 'The Latest News' }), null);
  });
});

const EXCLUIDAS = new Map([[60860, 'lista negra de Questie (de prueba)']]);
// Lote eventos: las misiones de fiesta que Questie destapa con su evento (QuestieEvent), leídas del Questie de verdad.
const EVENTOS = leerEventos(join(ORIGEN, 'Questie'));

describe('addon SnetForever_Misiones', { skip: !hay }, () => {
  let carpetaTmp;
  let dirSalida;
  let resultado;
  let toc;
  let archivosOrden;
  let datos;
  let segundos;

  before(async () => {
    carpetaTmp = mkdtempSync(join(tmpdir(), 'snf-misiones-'));
    dirSalida = join(carpetaTmp, 'SnetForever_Misiones');
    const t0 = Date.now();
    // Lote H, ronda 1: una excluida de muestra (la lista negra se aplica en convertir.js) sale como las basura, con su motivo.
    resultado = escribirMisiones(dirSalida, { version: '2026.11.09.1', excluidas: EXCLUIDAS, eventos: EVENTOS });
    segundos = (Date.now() - t0) / 1000;
    toc = readFileSync(join(dirSalida, 'SnetForever_Misiones.toc'), 'utf8');
    archivosOrden = toc.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => join(dirSalida, l.trim()));
    datos = (await cargarLua(archivosOrden)).SNF_MISIONES;
  });

  after(() => {
    // Solo la carpeta temporal creada por esta prueba.
    if (carpetaTmp) rmSync(carpetaTmp, { recursive: true, force: true });
  });

  test('misión 4641 en inglés y en español', () => {
    assert.equal(datos.quest[4641].name, 'Your Place In The World');
    assert.equal(datos.es.quest[4641].name, 'Tu lugar en el mundo');
  });

  test('PNJ 10176: spawns convertidos a uiMapID', () => {
    const puntos = datos.npc[10176].spawns[1411];
    assert.ok(puntos.some((p) => p[0] === 43.29 && p[1] === 68.53), JSON.stringify(puntos));
  });

  test('mazmorra 1581 existe y también las áreas que solo son alternativas', () => {
    assert.ok(datos.mazmorra[1581]);
    for (const a of [1585, 10000, 10007, 10011, 10012, 10020, 10030, 10032]) {
      assert.ok(datos.mazmorra[a], `falta la mazmorra ${a}`);
    }
  });

  test('número de misiones y descartadas', () => {
    // Decisión del controlador: el rango 20-40 del brief salía de contar «Test» sin distinguir
    // mayúsculas (misiones legítimas como «Test of Faith»). Con el criterio real (sin nombre,
    // «REUSE ME», palabra TEST o NYI en mayúsculas) se descartan solo las de relleno.
    // La 9378 «DND FLAG…» no es de relleno para esMisionBasura (aquí se escribe). Ronda 2: en los datos reales sí sale,
    // por la lista negra de Questie (QuestieQuestBlacklist.lua:29, «Naxxramas quest which doesn't seem to be in the game»),
    // que aplica convertir.js; esta prueba solo pasa la 60860 como excluida.
    // Lote H: sin la lista exacta de la fuente (8 en QuestieDB 1.0.11; 12 en la 1.0.14, que trae cinco NYI más y da
    // nombre a la 60860): las de relleno conocidas que sigan en la base salen siempre, cada descartada lo es por su
    // motivo, y son pocas (si el criterio se comiera misiones de verdad, se notaría).
    const ids = valorCbor(leerToc(rutaQuestieToc()), 'X-Quest-IDS', { zlib: true });
    const enBase = new Set(ids);
    const d = resultado.descartadas;
    const motivo = new Map(d.map((x) => [x.id, x.motivo]));
    for (const [id, m] of [[5691, 'contiene NYI'], [5692, 'contiene NYI'], [5693, 'contiene NYI'],
      [5704, 'contiene NYI'], [5705, 'contiene NYI'], [5706, 'contiene NYI'], [98338, 'REUSE ME']]) {
      if (enBase.has(id)) assert.equal(motivo.get(id), m, `la ${id} tenía que descartarse (${m})`);
    }
    // Ronda 1 (M3): el motivo de cada una es el de su registro de la base, no uno cualquiera de la lista.
    const base = leerEntidades(rutaQuestieToc()).quest;
    for (const x of d) {
      assert.ok(enBase.has(x.id), `${x.id} no está en la base`);
      assert.equal(x.motivo, esMisionBasura(base.get(x.id)) ?? EXCLUIDAS.get(x.id), `${x.id}`);
      assert.equal(datos.quest[x.id], undefined, `${x.id} descartada pero escrita`);
    }
    assert.ok(d.length <= 30, `${d.length} descartadas`);
    assert.equal(motivo.get(60860), 'lista negra de Questie (de prueba)');
    assert.ok(datos.quest[9378], 'el criterio de relleno no descarta la 9378 (DND FLAG)');
    assert.equal(Object.keys(datos.quest).length, ids.length - d.length);
  });

  test('cabecera del nucleo', () => {
    // Lote H: la versión y el commit de la base son los del .toc que haya, no unos fijos.
    const tocBase = leerToc(rutaQuestieToc());
    assert.equal(datos.version, '2026.11.09.1');
    assert.equal(datos.esquema, 1);
    assert.equal(datos.fuente.nombre, 'QuestieDB');
    assert.equal(datos.fuente.version, tocBase.get('Version'));
    assert.match(datos.fuente.version, /^\d+\.\d+\.\d+$/);
    assert.equal(datos.fuente.commit, tocBase.get('X-BUILD-COMMIT'));
    assert.match(datos.fuente.commit, /^[0-9a-f]{40}$/);
    assert.ok(datos.porFaccion.Horde && datos.porFaccion.Alliance);
  });

  test('las correcciones por facción llevan spawns por uiMapID (Garraluna, Horda)', () => {
    const spawns = datos.porFaccion.Horde.npc[12144].spawns;
    assert.ok(spawns, 'faltan los spawns corregidos');
    for (const k of Object.keys(spawns)) assert.ok(Number(k) > 100, `clave ${k} parece un areaId`);
  });

  test('triggerEnd de exploración por uiMapID (misión 25: área 331 → Ashenvale 1440)', () => {
    const [texto, puntos] = datos.quest[25].triggerEnd;
    assert.match(texto, /Scout the gazebo/);
    assert.deepEqual(puntos, { 1440: [[48.92, 69.56]] });
    // Ningún triggerEnd conserva claves de AreaID: todas son uiMapID que usan las misiones.
    const claves = (p) => Object.keys(p ?? {}).filter((k) => k !== 'enMazmorra');
    const uiMapsValidos = new Set(Object.values(datos.quest).map((q) => q.uiMap).filter(Boolean));
    const raras = Object.entries(datos.quest)
      .flatMap(([id, q]) => claves(q.triggerEnd?.[1]).filter((k) => !uiMapsValidos.has(Number(k))).map((k) => `${id}:${k}`));
    assert.deepEqual(raras, []);
    assert.deepEqual(datos.quest[1141].extraObjectives[0][0], { 1439: [[35.71, 44.68]] }, 'Costa Oscura, área 148');
    // Un triggerEnd dentro de una mazmorra (centinela -1,-1) lo dice con enMazmorra.
    assert.deepEqual(datos.quest[1144].triggerEnd[1].enMazmorra, [491]);
  });

  test('nucleo.lua documenta porClase y los puntos de las misiones', () => {
    const nucleo = readFileSync(join(dirSalida, 'nucleo.lua'), 'utf8');
    assert.match(nucleo, /Una clase que no\s+--\s+aparece en porClase \(nil\) significa «sin corrección: vale el valor base»/);
    assert.match(nucleo, /triggerEnd = \{texto, puntos\}/);
  });

  // Lote eventos: el QuestSort de Questie no basta para saber la fiesta (-22 junta cuatro y -284, el de Children's Week,
  // lo usan también misiones normales). Cada misión de evento lleva su nombre exacto en `evento`; las demás, nada.
  test('lote eventos: cada misión de evento lleva `evento` con el nombre de Questie y las demás no lo llevan', () => {
    assert.ok(EVENTOS.size > 100, `${EVENTOS.size} misiones de evento en Questie`);
    const escritas = Object.entries(datos.quest).map(([id, q]) => [Number(id), q]);
    const conEvento = escritas.filter(([, q]) => q.evento !== undefined);
    assert.ok(conEvento.length > 100, `${conEvento.length}`);
    for (const [id, q] of escritas) {
      if (EVENTOS.has(id)) assert.equal(q.evento, EVENTOS.get(id), `${id}`);
      else assert.equal(q.evento, undefined, `${id} no es de evento y lleva «${q.evento}»`);
    }
    const de = (nombre) => conEvento.filter(([, q]) => q.evento === nombre);
    // Children's Week va con el QuestSort SPECIAL (-284), el mismo que misiones normales: sin `evento` no se distingue.
    assert.ok(de("Children's Week").length > 0, 'ninguna de Children\'s Week');
    assert.ok(de("Children's Week").every(([, q]) => q.zoneOrSort === -284));
    assert.ok(escritas.some(([id, q]) => q.zoneOrSort === -284 && !EVENTOS.has(id) && q.evento === undefined),
      'las normales de -284 no llevan evento');
    // Winter Veil va con SEASONAL (-22), que comparte con otras fiestas.
    assert.ok(de('Winter Veil').length > 0 && de('Winter Veil').every(([, q]) => q.zoneOrSort === -22));
  });

  test('nucleo.lua documenta el campo evento de las misiones', () => {
    const nucleo = readFileSync(join(dirSalida, 'nucleo.lua'), 'utf8');
    assert.match(nucleo, /quest\[id\]\.evento = "<nombre>"/);
    assert.match(nucleo, /QuestieEvent/);
  });

  test('las misiones con zoneOrSort positivo reciben uiMap', () => {
    const conZona = Object.values(datos.quest).filter((q) => q.zoneOrSort > 0);
    assert.ok(conZona.length > 1000);
    assert.ok(conZona.filter((q) => q.uiMap > 0).length > conZona.length * 0.9);
  });

  test('zonas: area (areaId -> uiMap) y nombre (uiMap -> {en, es}) salen de Questie', () => {
    const z = datos.zonas;
    assert.ok(z, 'falta SNF_MISIONES.zonas');
    assert.equal(z.area[14], 1411, 'Durotar: área 14 -> uiMap 1411');
    assert.equal(z.area[17], 1413, 'Los Baldíos: área 17 -> uiMap 1413');
    assert.equal(z.nombre[1411].en, 'Durotar');
    assert.equal(z.nombre[1411].es, 'Durotar');
    // El Forever es Classic: sin las correcciones de Cataclysm, el área 17 es «The Barrens».
    assert.equal(z.nombre[1413].en, 'The Barrens');
    assert.equal(z.nombre[1413].es, 'Los Baldíos');
    assert.equal(z.nombre[1429].en, 'Elwynn Forest');
    assert.equal(z.nombre[1429].es, 'Bosque de Elwynn');
    // Todo uiMap de la tabla de áreas es un número positivo; los nombres son textos.
    for (const [area, ui] of Object.entries(z.area)) assert.ok(Number.isInteger(ui) && ui > 0, `área ${area} -> ${ui}`);
    for (const [ui, n] of Object.entries(z.nombre)) {
      assert.ok(typeof n.en === 'string' && n.en !== '', `uiMap ${ui} sin nombre en inglés`);
      assert.ok(n.es === undefined || (typeof n.es === 'string' && n.es !== ''));
    }
    // Las áreas de las misiones y de las entradas de mazmorra con mapa conocido están todas.
    const sinArea = Object.values(datos.quest).filter((q) => q.zoneOrSort > 0 && q.uiMap > 0 && z.area[q.zoneOrSort] !== q.uiMap);
    assert.equal(sinArea.length, 0, 'zoneOrSort con uiMap sin entrada en zonas.area');
    assert.ok(Object.keys(z.nombre).length > 50);
  });

  test('nucleo.lua documenta la tabla de zonas', () => {
    const nucleo = readFileSync(join(dirSalida, 'nucleo.lua'), 'utf8');
    assert.match(nucleo, /lookupZones.lua que carga Questie_Forever.toc, sin las correcciones/);
    assert.match(nucleo, /zonas = \{area = \{\[areaId\] = uiMap\}, nombre = \{\[uiMap\] = \{en, es\?\}\}\}/);
  });

  test('ningún archivo pasa de 500.000 bytes y el nucleo va primero', () => {
    for (const f of readdirSync(dirSalida)) {
      assert.ok(statSync(join(dirSalida, f)).size <= 500000, `${f} pasa de 500.000 bytes`);
    }
    assert.ok(archivosOrden[0].endsWith('nucleo.lua'));
    for (const f of resultado.archivos) assert.ok(existsSync(join(dirSalida, f)), f);
    assert.equal(
      resultado.bytes,
      resultado.archivos.reduce((s, f) => s + statSync(join(dirSalida, f)).size, 0),
    );
  });

  test('el .toc cumple las restricciones y no menciona Questie en el título', () => {
    assert.match(toc, /^## Interface: 16001$/m);
    assert.match(toc, /^## Title: SnetForever - Misiones$/m);
    assert.match(toc, /^## IconTexture: Interface\\AddOns\\SnetForever\\recursos\\icono$/m); // la estrella de SnetForever en la lista de addons
    assert.match(toc, /^## Version: 2026\.11\.09\.1$/m);
    const titulo = toc.split(/\r?\n/).find((l) => l.startsWith('## Title'));
    assert.ok(!/questie/i.test(titulo));
  });

  test('licencia y créditos', () => {
    assert.match(readFileSync(join(dirSalida, 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
    const creditos = readFileSync(join(dirSalida, 'CREDITOS.md'), 'utf8');
    // Lote H: el commit del .toc que haya (8086696… con QuestieDB 1.0.11; e19dfdf… con la 1.0.14).
    const commit = leerToc(rutaQuestieToc()).get('X-BUILD-COMMIT');
    assert.match(commit, /^[0-9a-f]{40}$/);
    assert.ok(creditos.includes(`\`${commit}\``), 'los créditos no citan el commit de la base');
    assert.ok(creditos.includes(`QuestieDB ${leerToc(rutaQuestieToc()).get('Version')}`));
    assert.match(creditos, /colaboradores de Questie\/QuestieDB/);
  });

  // ---- Lote B (B1): ítems y objetos del mundo fuera del juego ----
  test('el .toc no carga item_*, object_*, es_item_* ni es_object_*: los lista en X-SNF-App y están en la carpeta', () => {
    const lua = archivosOrden.map((f) => f.slice(dirSalida.length + 1));
    assert.deepEqual(lua.filter((f) => /^(es_)?(item|object)_\d+\.lua$/.test(f)), []);
    const linea = toc.split(/\r?\n/).find((l) => l.startsWith('## X-SNF-App:'));
    assert.ok(linea, 'falta la línea ## X-SNF-App');
    const app = linea.slice('## X-SNF-App:'.length).split(',').map((s) => s.trim());
    assert.deepEqual(app, resultado.archivosApp);
    for (const prefijo of ['item', 'object', 'es_item', 'es_object']) {
      assert.ok(app.some((f) => new RegExp(`^${prefijo}_\\d+\\.lua$`).test(f)), `falta ${prefijo}_<n>.lua en X-SNF-App`);
    }
    for (const f of app) assert.ok(existsSync(join(dirSalida, f)), f);
    assert.ok(app.every((f) => !lua.includes(f)));
  });

  test('en el juego, item y object solo traen la tabla pequeña (nombre, y puntos de los objetos)', () => {
    // 182 «Garrick's Head»: objetivo de la misión 6. Solo el nombre.
    assert.deepEqual(datos.item[182], { name: "Garrick's Head" });
    assert.ok(datos.es.item[182]?.name, 'falta el español del ítem 182');
    // 25 «Worn Shortsword» no lo pide ninguna misión (y aquí no hay guías): no está.
    assert.equal(datos.item[25], undefined);
    // 31 «Old Lion Statue» da las misiones 248 y 249: nombre y puntos; 32 «Sunken Chest» no da ninguna.
    assert.equal(datos.object[31].name, 'Old Lion Statue');
    assert.deepEqual(Object.keys(datos.object[31]).sort(), ['name', 'spawns']);
    assert.ok(datos.object[31].spawns[1433], 'puntos de la estatua en Montañas Crestagrana (1433)');
    assert.equal(datos.object[32], undefined);
    // Todos los objetos que dan una misión del juego están, con sus puntos si los tienen.
    const faltan = Object.values(datos.quest).flatMap((q) => enLua(q.startedBy, 2) ?? []).filter((id) => datos.object[id] === undefined);
    assert.equal(faltan.length, 0, `objetos que dan misión y no están: ${faltan.slice(0, 10)}`);
    const sinNombre = Object.values(datos.quest).flatMap((q) => Object.values(enLua(q.objectives, 3) ?? {})).map((e) => enLua(e, 1))
      .filter((id) => id && datos.item[id] === undefined);
    assert.ok(sinNombre.length < 20, `ítems de objetivos sin nombre en el juego: ${sinNombre.slice(0, 10)}`);
  });

  test('con los archivos de X-SNF-App (como la app), los ítems y objetos vuelven a estar completos', async () => {
    const app = resultado.archivosApp.map((f) => join(dirSalida, f));
    const completos = (await cargarLua([...archivosOrden, ...app])).SNF_MISIONES;
    assert.equal(completos.item[25].name, 'Worn Shortsword');
    assert.equal(completos.item[25].class, 2);
    assert.equal(completos.item[25].subClass, 7);
    assert.equal(completos.object[32].name, 'Sunken Chest');
    assert.ok(Object.keys(completos.item).length > 20000);
    assert.ok(Object.keys(completos.es.item).length > 15000);
  });

  test('tamaño: lo que carga el .toc es como mucho el 60 % de todos los .lua (antes lo cargaba todo)', () => {
    const total = resultado.bytesToc + resultado.bytesApp;
    console.log(`  .toc ${resultado.bytesToc} bytes, solo app ${resultado.bytesApp} bytes (${(100 * resultado.bytesToc / total).toFixed(1)} %)`);
    assert.ok(resultado.bytesToc <= 0.6 * total, `${resultado.bytesToc} > 60 % de ${total}`);
  });

  // ---- Lote B (B2): sin los valores por defecto ----
  test('quest, npc, object e item no llevan campos a 0, cadenas vacías ni tablas vacías (en el .toc ni en la app)', async () => {
    const app = resultado.archivosApp.map((f) => join(dirSalida, f));
    const completos = (await cargarLua([...archivosOrden, ...app])).SNF_MISIONES;
    const vacio = (v) => v === 0 || v === '' || (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
    for (const tipo of ['quest', 'npc', 'object', 'item']) {
      const malos = [];
      for (const [id, r] of Object.entries(completos[tipo])) {
        for (const [campo, v] of Object.entries(r)) if (vacio(v)) malos.push(`${id}.${campo}`);
      }
      assert.deepEqual(malos.slice(0, 10), [], `${tipo}: campos con el valor por defecto`);
    }
    // La misión 2 tenía requiredClasses=0, objectives={} y parentQuest=0; el PNJ 6, minLevelHealth=0 y rank=0.
    assert.equal(completos.quest[2].requiredClasses, undefined);
    assert.equal(completos.quest[2].objectives, undefined);
    assert.equal(completos.quest[2].parentQuest, undefined);
    assert.equal(completos.quest[2].questLevel, 30);
    assert.equal(completos.npc[6].minLevelHealth, undefined);
    assert.equal(completos.npc[6].rank, undefined);
    assert.equal(completos.npc[6].maxLevel, 2);
    // Un ítem de clase 0 (consumible) ya no escribe class: 118 «Minor Healing Potion» (clase 0, subclase 3).
    assert.equal(completos.item[118].class, undefined);
    assert.equal(completos.item[118].subClass, 3);
  });

  test('las correcciones por facción sí conservan sus 0 (cambian el valor base)', () => {
    const ceros = [];
    for (const f of ['Horde', 'Alliance']) {
      for (const tipo of ['quest', 'npc', 'object', 'item']) {
        for (const [id, corr] of Object.entries(datos.porFaccion[f][tipo] ?? {})) {
          for (const [campo, v] of Object.entries(corr)) if (v === 0) ceros.push(`${f}.${tipo}.${id}.${campo}`);
        }
      }
    }
    assert.ok(ceros.length > 0, 'ninguna corrección a 0: la prueba no mira nada');
  });

  test('informa del tiempo', () => {
    console.log(`  generación: ${segundos.toFixed(1)} s, ${resultado.bytes} bytes, ${resultado.archivos.length} archivos`);
    assert.ok(segundos >= 0);
  });
});
