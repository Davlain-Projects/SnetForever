// Pruebas del flujo de la CLI (convertir): valida antes de escribir en addons/ y limpia lo sobrante.
// Las dependencias pesadas (origen real, QuestieDB) se sustituyen por versiones de prueba.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertir } from '../src/convertir.js';
import { FUENTES_PROFESIONES } from '../src/config.js';

let tmp;
let registro; // lo que reciben validar, validarLaterales y los escritores
let llamadas; // nombre de cada dependencia en el orden en que se llama
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'snf-convertir-'));
  registro = {};
  llamadas = [];
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

const resultadoValidar = (errores) => ({
  errores, avisos: [], avisosDetalle: [], cobertura: [], coberturaMazmorras: [],
});
/** Escritor de prueba: escribe `archivos` en `dir` y los devuelve como lo hacen los de verdad. */
const escritor = (archivos) => (dir) => {
  mkdirSync(dir, { recursive: true });
  for (const f of archivos) writeFileSync(join(dir, f), f);
  return { archivos, bytes: archivos.length, avisos: [], descartadas: [] };
};
const guiaProfesion = { clave: 'Herbalism-x', fuente: { archivo: FUENTES_PROFESIONES[0].en }, pasos: [] };
const guiaCadena = { clave: 'Cadenas de clase (H)\\c1', pasos: [] };
const guiaMazmorra = { clave: 'Mazmorras SnetForever (H)\\13-18 RFC', pasos: [] };
const deps = (errores, extra = {}) => ({
  existeOrigen: () => true,
  cargarMapas: () => { llamadas.push('cargarMapas'); return new Map(); },
  construirGuias: (fuentes, ctx) => {
    const profesiones = fuentes.some((f) => f.tipo === 'profesion');
    llamadas.push(profesiones ? 'construirGuias(profesiones)' : 'construirGuias(rxp)');
    registro[profesiones ? 'ctxProfesiones' : 'ctxRxp'] = ctx;
    return { guias: new Map(profesiones ? [[guiaProfesion.clave, guiaProfesion]] : []), avisos: [], estadisticas: {} };
  },
  leerEntidades: () => {
    llamadas.push('leerEntidades');
    return { quest: new Map([[1, { name: 'Una' }], [2, { name: 'NYI: otra' }]]), meta: { version: 'v', commit: 'c' } };
  },
  leerCorrecciones: () => { llamadas.push('leerCorrecciones'); return { Horde: {}, Alliance: {} }; },
  cargarZonas: () => { llamadas.push('cargarZonas'); return {}; },
  leerOpenMap: () => {
    llamadas.push('leerOpenMap');
    return { niveles: new Map(), instancias: [], sinEntrada: [], licencia: 'MIT de prueba' };
  },
  leerInstancias: () => { llamadas.push('leerInstancias'); return new Map(); },
  // Lote H, ronda 1: por defecto sin lista negra ni misiones hechas (sin Questie ni WTF de verdad).
  leerListaNegra: () => { llamadas.push('leerListaNegra'); return null; },
  leerCompletadas: () => { llamadas.push('leerCompletadas'); return new Map(); },
  leerEventos: () => { llamadas.push('leerEventos'); return new Map(); },
  guiasDeCadenas: () => {
    llamadas.push('guiasDeCadenas');
    return {
      guias: new Map([[guiaCadena.clave, guiaCadena]]),
      avisos: [{ id: 'a-cadena', tipo: 'cadena', clase: 'DRUID', nivel: 10, texto: { en: 'x' } }],
      filas: [{ id: 'c1', faccion: 'Horde', razas: ['Orc'], misiones: 3, deducidas: 0, estado: 'sin verificar' }],
      sinResolver: [{ id: 'c2', faccion: 'Horde', variante: 1, raza: 'Orc', motivo: 'no se encuentra' }],
      discrepancias: [],
    };
  },
  // Lote «Cadenas de mejoras»: por defecto sin mejoras (las pruebas de arriba no cambian); una prueba propia las trae.
  guiasDeMejoras: () => {
    llamadas.push('guiasDeMejoras');
    return { guias: new Map(), avisos: [], filas: [], sinResolver: [], discrepancias: [] };
  },
  indexarMazmorras: () => {
    llamadas.push('indexarMazmorras');
    return {
      porMazmorra: { 2437: { nombre: 'Ragefire Chasm', area: 2437, niveles: { min: 13, max: 18 }, fuenteNiveles: 'OpenMap', banda: false, misiones: [] } },
      instancias: { 389: 2437 }, filas: [], avisos: [],
    };
  },
  guiasDeMazmorras: () => {
    llamadas.push('guiasDeMazmorras');
    return {
      guias: new Map([[guiaMazmorra.clave, guiaMazmorra]]),
      avisos: [{ id: 'mazmorra-2437-H', tipo: 'mazmorra', nivel: 13, texto: { en: 'RFC' }, area: 2437 }],
      filas: [{ area: 2437, nombre: 'Ragefire Chasm', faccion: 'Horde', misiones: 2, guia: guiaMazmorra.clave }],
    };
  },
  recortarProfesion: (guia) => {
    llamadas.push('recortarProfesion');
    return { guia: { ...guia, clave: 'Profesiones\\01-300 Herbalism (H)' }, avisos: [], cuenta: { pasos: 6, recortados: 1, descartados: { hs: 1 } } };
  },
  validar: (entrada) => { llamadas.push('validar'); registro.validar = entrada; return resultadoValidar(errores); },
  validarLaterales: (entrada) => { llamadas.push('validarLaterales'); registro.laterales = entrada; return { errores: [], avisos: [] }; },
  escribirRutas: (guias, dir, o) => { llamadas.push('escribirRutas'); registro.rutas = { guias, o }; return escritor(['nucleo.lua', 'guias_1.lua'])(dir); },
  escribirMisiones: (dir, o) => { llamadas.push('escribirMisiones'); registro.misiones = o; return escritor(['nucleo.lua', 'quest_1.lua'])(dir); },
  log: () => {},
  ...extra,
});
const opciones = () => ({
  version: '2026.11.09.3', salida: join(tmp, 'addons'), informe: join(tmp, 'informes', 'avisos.md'), instalar: false,
  cuarentena: join(tmp, 'cuarentena'),
});

describe('convertir', () => {
  test('con errores de validación no escribe nada en addons/ (y lo que había sigue igual) ni instala', () => {
    const viejo = join(tmp, 'addons', 'SnetForever_Rutas', 'guias_1.lua');
    mkdirSync(join(tmp, 'addons', 'SnetForever_Rutas'), { recursive: true });
    writeFileSync(viejo, 'versión anterior');
    let escrito = false;
    const codigo = convertir({ ...opciones(), instalar: true }, deps(['falla algo'], {
      escribirRutas: () => { escrito = true; throw new Error('no debía escribir'); },
      escribirMisiones: () => { escrito = true; throw new Error('no debía escribir'); },
      instalarAddon: () => { throw new Error('no debía instalar'); },
    }));
    assert.equal(codigo, 1);
    assert.equal(escrito, false);
    assert.equal(readFileSync(viejo, 'utf8'), 'versión anterior');
    assert.match(readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8'), /falla algo/, 'el informe sí se escribe');
    // El validador recibe las misiones descartadas (basura de QuestieDB) sin haber escrito el addon.
    assert.deepEqual([...registro.validar.misiones.descartadas], [2]);
  });

  test('sin errores escribe los addons y mueve a la cuarentena los archivos de addons/ que ya no se generan', () => {
    const dirR = join(tmp, 'addons', 'SnetForever_Rutas');
    mkdirSync(dirR, { recursive: true });
    writeFileSync(join(dirR, 'guias_7.lua'), 'de una versión con más archivos');
    const lineas = [];
    const codigo = convertir(opciones(), deps([], { log: (l) => lineas.push(l) }));
    assert.equal(codigo, 0);
    assert.deepEqual(readdirSync(dirR).sort(), ['guias_1.lua', 'nucleo.lua']);
    // Lote C (revisión 52, Minor 7): no desaparece, está en <cuarentena>\<sello>\SnetForever_Rutas\.
    const sellos = readdirSync(join(tmp, 'cuarentena'));
    assert.equal(sellos.length, 1);
    assert.match(sellos[0], /^\d{4}-\d{2}-\d{2}_\d{6}$/);
    assert.equal(readFileSync(join(tmp, 'cuarentena', sellos[0], 'SnetForever_Rutas', 'guias_7.lua'), 'utf8'),
      'de una versión con más archivos');
    assert.ok(lineas.some((l) => l.includes('cuarentena')), lineas.join('\n'));
    assert.deepEqual(readdirSync(join(tmp, 'addons', 'SnetForever_Misiones')).sort(), ['nucleo.lua', 'quest_1.lua']);
    assert.ok(lineas.some((l) => /guias_7\.lua/.test(l)), lineas.join('\n'));
    assert.ok(existsSync(join(tmp, 'informes', 'avisos.md')));
  });

  test('llama a las dependencias en el orden: RestedXP, profesiones, entidades, cadenas y mazmorras, validar', () => {
    assert.equal(convertir(opciones(), deps([])), 0);
    assert.deepEqual(llamadas, [
      'cargarMapas', 'construirGuias(rxp)', 'leerOpenMap', 'construirGuias(profesiones)', 'recortarProfesion',
      'leerEntidades', 'leerCorrecciones', 'cargarZonas', 'leerInstancias', 'leerListaNegra', 'leerCompletadas', 'leerEventos',
      'guiasDeCadenas', 'guiasDeMejoras', 'indexarMazmorras', 'guiasDeMazmorras',
      'validar', 'validarLaterales', 'escribirRutas', 'escribirMisiones',
    ]);
  });

  // Lote H, ronda 1: la lista negra de Questie saca la misión de todo lo que viene después (validar la ve descartada,
  // escribirMisiones la recibe con su motivo) y las cadenas se resuelven antes sin quitar nada (para no romper ninguna).
  test('con lista negra: la misión sale con su motivo, las cadenas se miran antes sin quitarla, y el informe lo cuenta', () => {
    let cadenas = 0;
    const codigo = convertir(opciones(), deps([], {
      leerListaNegra: () => new Map([[1, { linea: 7050, nota: 'promo de Asia' }]]),
      guiasDeCadenas: (cat, f) => {
        cadenas += 1;
        registro[`cadenas${cadenas}`] = [...f.entidades.quest.keys()];
        return { guias: new Map(), avisos: [], filas: [], sinResolver: [], discrepancias: [] };
      },
    }));
    assert.equal(codigo, 0);
    assert.equal(cadenas, 2, 'una sin quitar nada y otra con la base que queda');
    assert.deepEqual(registro.cadenas1, [1, 2]);
    assert.deepEqual(registro.cadenas2, [2]);
    assert.deepEqual([...registro.validar.misiones.descartadas].sort(), [1, 2]);
    assert.deepEqual([...registro.misiones.excluidas], [[1, 'lista negra de Questie (QuestieQuestBlacklist.lua:7050: promo de Asia)']]);
    const informe = readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8');
    assert.match(informe, /## Lista negra de Questie y misiones de otras temporadas/);
    assert.match(informe, /Misiones de la lista negra de Questie fuera: 1\./);
  });

  // Ronda 2: una de fiesta de la lista negra que Questie destapa con su evento se escribe (no va a excluidas), pero las
  // guías laterales no la ven.
  test('con lista negra y evento: se queda en los datos, fuera de las guías laterales, y el informe la cuenta', () => {
    let cadenas = 0;
    const codigo = convertir(opciones(), deps([], {
      leerListaNegra: () => new Map([[1, { linea: 900, nota: '' }]]),
      leerEventos: () => new Map([[1, 'Lunar Festival']]),
      guiasDeCadenas: (cat, f) => {
        cadenas += 1;
        registro[`cadenas${cadenas}`] = [...f.entidades.quest.keys()];
        return { guias: new Map(), avisos: [], filas: [], sinResolver: [], discrepancias: [] };
      },
    }));
    assert.equal(codigo, 0);
    assert.equal(cadenas, 1, 'nada que quitar: sin la vuelta de las cadenas sin quitar');
    assert.deepEqual(registro.cadenas1, [2]);
    assert.deepEqual([...registro.misiones.excluidas], []);
    assert.deepEqual([...registro.validar.misiones.descartadas], [2]);
    const informe = readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8');
    assert.match(informe, /Misiones que se quedan por evento: 1./);
    assert.match(informe, /| 1 | Una | lista-negra | se queda por evento (Lunar Festival) | 900 |/);
  });

  // Lote eventos: Misiones recibe el evento de cada misión de fiesta (todas las de QuestieEvent, estén o no en la lista
  // negra) para escribirlo en `evento`.
  test('Misiones recibe los eventos de Questie, también los de misiones que no están en la lista negra', () => {
    const codigo = convertir(opciones(), deps([], {
      leerListaNegra: () => new Map([[1, { linea: 900, nota: '' }]]),
      leerEventos: () => new Map([[1, 'Lunar Festival'], [3, "Children's Week"]]),
    }));
    assert.equal(codigo, 0);
    assert.deepEqual([...registro.misiones.eventos], [[1, 'Lunar Festival'], [3, "Children's Week"]]);
  });

  test('las profesiones se construyen con siguientesExtra vacío y un contexto propio', () => {
    convertir(opciones(), deps([]));
    assert.deepEqual(registro.ctxProfesiones.siguientesExtra, {});
    assert.notEqual(registro.ctxProfesiones, registro.ctxRxp);
  });

  test('validar solo ve las guías de RestedXP; validarLaterales ve las de Rutas, las de Misiones, los avisos y las misiones', () => {
    convertir(opciones(), deps([]));
    assert.equal(registro.validar.guias.size, 0, 'las profesiones no entran en validar');
    const l = registro.laterales;
    assert.deepEqual([...l.guiasRutas.keys()], ['Profesiones\\01-300 Herbalism (H)']);
    assert.deepEqual([...l.guiasMisiones.keys()].sort(), [guiaCadena.clave, guiaMazmorra.clave].sort());
    assert.deepEqual(l.avisos.map((a) => a.id), ['a-cadena', 'mazmorra-2437-H']);
    assert.ok(l.misiones.quest.has(1));
  });

  test('Rutas recibe RestedXP, las profesiones, los avisos y la licencia de OpenMap; Misiones, las guías laterales', () => {
    convertir(opciones(), deps([]));
    assert.deepEqual([...registro.rutas.guias.keys()], ['Profesiones\\01-300 Herbalism (H)']);
    assert.deepEqual(registro.rutas.o.avisos.map((a) => a.id), ['a-cadena', 'mazmorra-2437-H']);
    assert.equal(registro.rutas.o.licenciaOpenMap, 'MIT de prueba');
    assert.equal(registro.misiones.licenciaOpenMap, 'MIT de prueba');
    assert.deepEqual([...registro.misiones.guias.keys()].sort(), [guiaCadena.clave, guiaMazmorra.clave].sort());
    // Lote B (B1): las guías de rutas también llegan a Misiones, que saca de ellas los ítems y objetos del juego.
    assert.deepEqual([...registro.misiones.guiasRutas.keys()], [...registro.rutas.guias.keys()]);
    assert.deepEqual(Object.keys(registro.misiones.porMazmorra), ['2437']);
    assert.deepEqual(registro.misiones.instancias, { 389: 2437 });
  });

  test('un error de validarLaterales devuelve 1 y no escribe nada', () => {
    let escrito = false;
    const codigo = convertir(opciones(), deps([], {
      validarLaterales: () => ({ errores: ['la guía «x» está rota'], avisos: [] }),
      escribirRutas: () => { escrito = true; throw new Error('no debía escribir'); },
      escribirMisiones: () => { escrito = true; throw new Error('no debía escribir'); },
    }));
    assert.equal(codigo, 1);
    assert.equal(escrito, false);
    assert.ok(!existsSync(join(tmp, 'addons')), 'no se crea addons/');
    assert.match(readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8'), /la guía «x» está rota/);
  });

  test('las cadenas sin resolver no bloquean y salen en el informe', () => {
    assert.equal(convertir(opciones(), deps([])), 0);
    const informe = readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8');
    assert.match(informe, /c2.*Orc.*no se encuentra/);
  });

  test('las guías de mejora van a Misiones, sus avisos a Rutas y el informe lleva su sección', () => {
    const guiaMejora = { clave: 'Mejoras (H)\\mejora-x', tipo: 'mejora', pasos: [] };
    convertir(opciones(), deps([], {
      guiasDeMejoras: () => ({
        guias: new Map([[guiaMejora.clave, guiaMejora]]),
        avisos: [{ id: 'mejora-x-H', tipo: 'mejora', nivel: 14, texto: { en: 'You can get: X' } }],
        filas: [{ id: 'mejora-x', faccion: 'Horde', razas: ['Orc'], misiones: 6, porObjeto: 5, deducidas: 0, recompensa: 'X',
          estado: 'sin verificar', sinEspanol: [7, 8], vendedorDeLaBase: true, combate: 'sí', combateDudoso: [9], nivelAviso: 18 }],
        sinResolver: [{ id: 'mejora-y', faccion: 'Alliance', variante: 1, raza: 'Human', motivo: 'no da «Y»' }],
        discrepancias: [{ id: 'mejora-x-H', nivel: 14, catalogo: 15 }],
      }),
    }));
    assert.ok(registro.misiones.guias.has(guiaMejora.clave));
    assert.ok(registro.laterales.guiasMisiones.has(guiaMejora.clave));
    assert.ok(registro.rutas.o.avisos.some((a) => a.id === 'mejora-x-H'));
    const informe = readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8');
    assert.match(informe, /^## Cadenas de mejoras$/m);
    // Ronda 2: con combate (decide el nivel del aviso) y el nivel del aviso.
    assert.ok(informe.includes('| mejora-x | H | Orc | 6 | 5 | X | sí | 18 | sin verificar |'), 'la fila de la mejora');
    assert.ok(informe.includes('- mejora-x (H): no se sabe si hay combate en 9 (un objeto sin fuente en la base): se toma con combate.'), 'dudosas');
    assert.match(informe, /mejora-y.*Human.*no da «Y»/);
    assert.ok(informe.includes('- mejora-x (H): misiones sin nombre español en la base: 7, 8'), 'las que se quedan en inglés');
    // Ronda 1: el vendedor que trae la base para la recompensa no vale para el Forever (el jugador, 10-nov).
    assert.ok(informe.includes('- mejora-x (H): la base le pone vendedor a «X», pero en el Forever solo se consigue con la '
      + 'cadena (el jugador, 10-nov-2026): el dato `vendors` de la base no vale para el Forever.'), 'la nota del vendedor');
    assert.match(informe, /aviso mejora-x-H: el nivel de la base es 14 y el del catálogo 15/);
  });

  test('el informe lleva las cinco secciones nuevas', () => {
    convertir(opciones(), deps([]));
    const informe = readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8');
    for (const titulo of ['Cadenas de clase', 'Cadenas sin resolver', 'Misiones de clase sin cadena', 'Mazmorras', 'Profesiones']) {
      assert.match(informe, new RegExp(`^## ${titulo}$`, 'm'), titulo);
    }
    assert.match(informe, /Ragefire Chasm/);
    assert.match(informe, /Herbalism/);
  });

  test('lote B (B3): los PNJ de target/mob reciben su id de la base antes de escribir, y el informe lista los que no', () => {
    const conPnj = {
      clave: 'Prueba\\1-10', fuente: { archivo: 'x.lua' },
      pasos: [{ id: 'p1', n: 1, linea: 1, elementos: [
        { t: 'goto', mapa: 1411, wx: 1, wy: 1 },
        { t: 'mob', npcs: [{ nombre: 'Gornek' }, { nombre: 'Guardia' }, { nombre: 'Nadie' }], linea: 3 },
      ] }],
    };
    convertir(opciones(), deps([], {
      construirGuias: (fuentes) => ({
        guias: new Map(fuentes.some((f) => f.tipo === 'profesion') ? [[guiaProfesion.clave, guiaProfesion]] : [[conPnj.clave, conPnj]]),
        avisos: [], estadisticas: {},
      }),
      leerEntidades: () => ({
        quest: new Map([[1, { name: 'Una' }]]), meta: { version: 'v', commit: 'c' },
        npc: new Map([[3143, { name: 'Gornek' }], [10, { name: 'Guardia' }], [11, { name: 'Guardia' }]]),
      }),
    }));
    assert.deepEqual(conPnj.pasos[0].elementos[1].npcs, [{ nombre: 'Gornek', id: 3143 }, { nombre: 'Guardia' }, { nombre: 'Nadie' }]);
    const informe = readFileSync(join(tmp, 'informes', 'avisos.md'), 'utf8');
    assert.match(informe, /^## PNJ de target y mob sin id$/m);
    assert.match(informe, /Guardia.*ninguno-en-el-mapa.*10, 11.*Prueba\\1-10:3/);
    assert.match(informe, /Nadie.*no-esta-en-la-base/);
    assert.match(informe, /PNJ de target\/mob con id resuelto por la base: 1\./);
  });
});
