import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cargarMapas } from '../src/rxp/coordenadas.js';
import { analizarFiltro, yFiltro, negarFiltro, evaluarFiltro } from '../src/rxp/filtros.js';
import { construirGuias, normalizarNombre } from '../src/rxp/guias.js';
import { FUENTES, ENLACES, SIGUIENTES_EXTRA, ORIGEN } from '../src/config.js';
import { construirConFixtures } from './ayuda/construir.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dirFixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const mapas = cargarMapas(fileURLToPath(new URL('./fixtures/db-forever-mini.lua', import.meta.url)));

// Fuentes de prueba con la misma forma que FUENTES (rutas relativas a `origen`).
const fuentes = [
  { en: 'guias/horda-en.lua', es: 'guias/horda-es.lua', tipo: 'normal' },
  { en: 'guias/horda-mazmorras-en.lua', tipo: 'mazmorras' },
  { en: 'guias/skyrim-horda-en.lua', tipo: 'normal' },
  { en: 'guias/alianza-en.lua', es: 'guias/alianza-es.lua', tipo: 'normal' },
];
const construir = () => construirConFixtures(fuentes, { mapas });
const r = construir();
const g = (clave) => {
  const guia = r.guias.get(clave);
  assert.ok(guia, `falta la guía ${clave}; hay: ${[...r.guias.keys()].join(' | ')}`);
  return guia;
};
const DUROTAR = 'RestedXP Forever Guide (H)\\10-12 Durotar';
const DUROTAR_M = 'RestedXP Forever Dungeon Guide (H)\\10-12 Durotar';
const filtro = (texto) => analizarFiltro(texto).filtro;
const avisos = (re) => r.avisos.filter((a) => re.test(a.mensaje));
/** Paso de la guía que tiene un elemento con ese `t` y esa misión. */
const pasoCon = (guia, t, q) => guia.pasos.find((p) => p.elementos.some((e) => e.t === t && e.q === q));

describe('configuración', () => {
  test('FUENTES tiene las 22 parejas de RestedXP y las dos de Skyrim', () => {
    assert.equal(FUENTES.length, 24);
    assert.equal(FUENTES.filter((f) => f.tipo === 'mazmorras').length, 9);
    assert.ok(FUENTES.every((f) => !/^[A-Za-z]:/.test(f.en) && f.es), 'rutas relativas y con español');
    assert.deepEqual(FUENTES.find((f) => /Skyrim_Horde/.test(f.en)), {
      en: 'RXPGuides_Clasicas/Skyrim_Horde_22-60_EN.lua',
      es: 'RXPGuides_Clasicas/Skyrim_Horda_22-60_ES.lua',
      tipo: 'normal',
    });
    assert.ok(FUENTES.some((f) => f.en === 'RXPGuides/Guides/forever/dungeon/Horde-01-12_Durotar.lua'
      && f.es === 'RXPGuides/lang/Guides-esES/forever/dungeon/Horde-01-12_Durotar.lua'));
    // Erratas del original: sin `\`, el destino es un nombre del grupo de la guía de origen.
    assert.deepEqual(ENLACES, {
      '06-13 Mulgore': '06-12 Mulgore',
      '26-31 Duskwood Mage AoE': '26-31 Duskwood Part 2 Mage AoE',
    });
  });
  test('normalizarNombre aplica el affix de RestedXP', () => {
    assert.equal(normalizarNombre('1-6 Durotar'), '01-06 Durotar');
    assert.equal(normalizarNombre('6-10 Durotar'), '06-10 Durotar');
    assert.equal(normalizarNombre('10-12 Durotar'), '10-12 Durotar');
  });
});

describe('cabecera', () => {
  test('«10-12 Durotar»: clave, niveles y dos siguientes con sus filtros', () => {
    const d = g(DUROTAR);
    assert.equal(d.clave, DUROTAR);
    assert.equal(d.grupo, 'RestedXP Forever Guide (H)');
    assert.equal(d.nombre, '10-12 Durotar');
    assert.deepEqual(d.niveles, [10, 12]);
    assert.deepEqual(d.siguientes, [
      { clave: 'RestedXP Forever Guide (H)\\10-12 Tirisfal (Orc/Troll)', filtro: filtro('!Hunter !Shaman !Tauren !Skyborne') },
      { clave: 'RestedXP Forever Guide (H)\\12-17 The Barrens', filtro: filtro('Orc Hunter/Troll Hunter/Orc Shaman/Troll Shaman') },
    ]);
    assert.equal(d.subgrupo, 'Speedrun Guide 1-22');
    assert.deepEqual(d.titulo, { en: '10-12 Durotar', es: '10-12 Durotar (España)' });
    assert.deepEqual(d.filtro, [['f:Horde']]);
    assert.deepEqual(d.porDefecto, filtro('Troll/Orc'));
    assert.equal(d.tipo, 'normal');
    assert.equal(d.faccion, 'Horde');
    assert.deepEqual(d.fuente, { archivo: 'guias/horda-en.lua', linea: 7 });
  });
  test('facción: guardián Lua, filtro de guía y grupos por facción (Skyborne vale para las dos)', () => {
    assert.equal(g('Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad').faccion, 'Horde');
    const neutra = g('Skyrim Neutral (A)\\01-09 Zephras Isle');
    assert.equal(neutra.faccion, undefined);
    assert.equal(r.guias.get('Skyrim Neutral (H)\\01-09 Zephras Isle'), undefined, 'una sola guía');
  });
  test('las etiquetas de cabecera con filtro dan variantes (la Horda conserva su grupo, subgrupo y título)', () => {
    const neutra = g('Skyrim Neutral (A)\\01-09 Zephras Isle');
    assert.equal(neutra.alias, undefined);
    assert.deepEqual(neutra.variantes, [
      {
        clave: 'Skyrim Neutral (A)\\01-09 Zephras Isle', grupo: 'Skyrim Neutral (A)',
        subgrupo: 'Speedrun Guide 1-20', titulo: { en: '1-9 Skyborne' }, filtro: filtro('Alliance'),
      },
      {
        clave: 'Skyrim Neutral (H)\\01-09 Zephras Isle', grupo: 'Skyrim Neutral (H)',
        subgrupo: 'Speedrun Guide 1-22', titulo: { en: '1-9 Skyborne (H)' },
        filtro: yFiltro(filtro('Horde'), negarFiltro(filtro('Alliance'))),
      },
    ]);
    // La primera variante es la de los campos de arriba.
    assert.equal(neutra.grupo, 'Skyrim Neutral (A)');
    assert.equal(neutra.subgrupo, 'Speedrun Guide 1-20');
    assert.deepEqual(neutra.titulo, { en: '1-9 Skyborne' });
    assert.equal(g(DUROTAR).variantes, undefined, 'sin filtros en la cabecera no hay variantes');
  });
  test('etiquetas de temporada de cabecera: la guía #som no se emite y su #next la sustituye', () => {
    assert.equal(r.guias.get('Skyrim Horde 22-30 (EN)\\24-25 Class quests'), undefined);
    assert.equal(avisos(/24-25 Class quests.*no se ve en Forever/).length, 1);
    assert.ok(r.guias.get('Skyrim Horde 22-30 (EN)\\26-28 Ashenvale'), '#season 0,1, #xprate <1.5 y #era/som se ven');
    assert.equal(g('Skyrim Horde 22-30 (EN)\\26-28 Ashenvale').filtro.length, 1);
    const h = g('Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad');
    assert.deepEqual(h.siguientes, [
      { clave: 'Skyrim Horde 22-30 (EN)\\26-28 Ashenvale', filtro: yFiltro(filtro('Rogue'), filtro('Horde')) },
      { sinResolver: '25-26 Inexistente', filtro: filtro('!Rogue') },
    ]);
  });
  test('mazmorras de la guía y del paso', () => {
    const d = g(DUROTAR);
    assert.deepEqual(d.mazmorras, { RFC: false });
    const p = d.pasos.find((x) => x.requisitos.some((q) => q.t === 'mazmorra'));
    assert.equal(p.mazmorra, 'RFC');
    const t = g('RestedXP Forever Guide (H)\\10-12 Tirisfal (Orc/Troll)');
    assert.equal(pasoCon(t, 'accept', 1358).sinMazmorra, 'RFC');
    assert.deepEqual(g(DUROTAR_M).mazmorras, { RFC: true, WC: true }, 'también el .enabledungeon de otra guía del grupo');
  });
  test('.enabledungeon vale para todas las guías del mismo grupo (dungeonOverride[grupo])', () => {
    const otra = g('RestedXP Forever Dungeon Guide (H)\\12-14 Mazmorra Prueba');
    assert.deepEqual(otra.mazmorras, { RFC: true, WC: true }, 'RFC lo activa «10-12 Durotar» del mismo grupo');
    assert.equal(otra.pasos[0].sinMazmorra, 'RFC');
    // La guía normal (otro grupo) no se entera.
    assert.deepEqual(g(DUROTAR).mazmorras, { RFC: false });
  });
});

describe('español', () => {
  test('los pasos cuadrados llevan texto.es', () => {
    const p = pasoCon(g(DUROTAR), 'accept', 840);
    const acc = p.elementos.find((e) => e.t === 'accept');
    assert.deepEqual(acc.texto, { en: 'Accept Conscript of the Horde', es: 'Acepta Recluta de la Horda' });
    const tirisfal = g('RestedXP Forever Guide (H)\\10-12 Tirisfal (Orc/Troll)');
    assert.deepEqual(pasoCon(tirisfal, 'accept', 1358).elementos.find((e) => e.t === 'accept').texto,
      { en: 'Accept Sample for Helbrim', es: 'Acepta Muestra para Helbrim' }, 'emparejada por posición');
    assert.deepEqual(tirisfal.titulo, { en: '10-12 Tirisfal (Orc/Troll)', es: '10-12 Tirisfal (Orco/Trol)' });
  });
  test('el paso descuadrado conserva el inglés y da aviso con las dos líneas', () => {
    const p = pasoCon(g(DUROTAR), 'complete', 816);
    for (const e of p.elementos) if (e.texto) assert.equal(e.texto.es, undefined);
    assert.equal(p.elementos.find((e) => e.t === 'nota').texto.en.startsWith('Kill '), true);
    const a = avisos(/no cuadra/).filter((x) => x.archivo === 'guias/horda-en.lua');
    assert.equal(a.length, 1, JSON.stringify(a));
    assert.equal(a[0].linea, p.linea);
    assert.equal(a[0].lineaEs, p.linea + 1, 'el español lleva una línea más (#displayname)');
    assert.equal(a[0].archivoEs, 'guias/horda-es.lua');
    assert.match(a[0].mensaje, new RegExp(`${p.linea}.*${a[0].lineaEs}`));
  });
  test('si al español le falta un paso en medio, los posteriores siguen llevando su español', () => {
    const sg = g('RestedXP Forever Guide (A)\\01-06 Shadowglen');
    const texto = (t, q) => pasoCon(sg, t, q).elementos.find((e) => e.t === t).texto;
    assert.deepEqual(texto('accept', 456), { en: 'Accept The Balance of Nature', es: 'Acepta El equilibrio de la naturaleza' });
    assert.deepEqual(texto('accept', 458), { en: 'Accept The Woodland Protector' }, 'el que falta');
    assert.deepEqual(texto('turnin', 456), { en: 'Turn in The Balance of Nature', es: 'Entrega El equilibrio de la naturaleza' });
    assert.deepEqual(texto('accept', 3116), { en: 'Accept Simple Sigil', es: 'Acepta Sigilo simple' });
    const falta = r.avisos.filter((a) => a.tipo === 'descuadre' && a.linea === pasoCon(sg, 'accept', 458).linea);
    assert.equal(falta.length, 1);
    assert.match(falta[0].mensaje, /el español no tiene/);
  });
  test('para cuadrar también cuentan qs, is y los mapas de puntos', () => {
    const sg = g('RestedXP Forever Guide (A)\\01-06 Shadowglen');
    for (const t of ['isOnQuest', 'use', 'line']) {
      const p = sg.pasos.find((x) => x.elementos.some((e) => e.t === t));
      assert.ok(p, t);
      for (const e of p.elementos) if (e.texto) assert.equal(e.texto.es, undefined, t);
      const a = r.avisos.filter((x) => x.tipo === 'descuadre' && x.linea === p.linea);
      assert.equal(a.length, 1, t);
      assert.match(a[0].mensaje, /no cuadra/);
      assert.equal(typeof a[0].lineaEs, 'number');
    }
  });
  test('sin archivo en español los textos quedan como {en}', () => {
    const p = g('Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad').pasos[0];
    assert.deepEqual(p.elementos[0].texto, { en: 'Accept Journey to Hillsbrad Foothills' });
  });
});

describe('#include', () => {
  test('el #include con rango copia exactamente los pasos entre las dos etiquetas', () => {
    const normal = g(DUROTAR);
    const m = g(DUROTAR_M);
    const ini = normal.pasos.findIndex((p) => p.etiquetas.label === 'InicioRuta');
    const fin = normal.pasos.findIndex((p) => p.etiquetas.label === 'FinRuta');
    const esperados = normal.pasos.slice(ini, fin + 1);
    assert.equal(esperados.length, 3);
    // Paso 1: el del propio #include (tiene `.enabledungeon`); detrás, los copiados.
    assert.deepEqual(m.pasos[0].elementos.map((e) => e.t), ['enabledungeon']);
    assert.equal(m.pasos[0].etiquetas.include, undefined);
    const copiados = m.pasos.slice(1);
    assert.equal(copiados.length, 3, 'los otros dos #include fallan y su paso vacío no se conserva');
    copiados.forEach((p, i) => {
      assert.deepEqual(p.elementos, esperados[i].elementos);
      assert.deepEqual(p.etiquetas, esperados[i].etiquetas);
      assert.equal(p.linea, esperados[i].linea);
      assert.equal(p.n, i + 2);
      assert.notEqual(p.id, esperados[i].id, 'el id depende de la guía');
    });
    assert.equal(avisos(/No Existe/).length, 1);
    assert.equal(avisos(/NoHay/).length, 1);
  });
});

describe('#next', () => {
  test('#next 22-24 Hillsbrad se resuelve por nombre a la guía de Skyrim', () => {
    const b = g('RestedXP Forever Guide (H)\\12-17 The Barrens');
    assert.deepEqual(b.siguientes, [{ clave: 'Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad' }]);
    const a = avisos(/enlazado por nombre/).filter((x) => x.archivo === 'guias/horda-en.lua');
    assert.equal(a.length, 1, JSON.stringify(a));
    assert.match(a[0].mensaje, /"22-24 Hillsbrad" enlazado por nombre/);
  });
  test('lo que no se encuentra queda sin resolver', () => {
    const h = g('Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad');
    assert.deepEqual(h.siguientes.at(-1), { sinResolver: '25-26 Inexistente', filtro: filtro('!Rogue') });
    assert.equal(avisos(/"25-26 Inexistente" sin resolver/).length, 1);
  });
  test('en una lista A;B las alternativas que no existen no se marcan si otra se resuelve', () => {
    const t = g('RestedXP Forever Guide (H)\\10-12 Tirisfal (Orc/Troll)');
    assert.deepEqual(t.siguientes, [{ clave: 'RestedXP Forever Guide (H)\\12-17 The Barrens' }]);
    assert.equal(avisos(/12-17 No Existe/).length, 0);
    assert.equal(r.estadisticas.next.sinResolver, 3, 'Inexistente, 9-13 Zephras Isle y 6-11 Teldrassil');
    assert.equal(r.estadisticas.next.alternativaInexistente, 1);
  });
  test('ENLACES con un nombre sin grupo busca en el grupo de la guía de origen', () => {
    const otra = construirConFixtures(fuentes, { mapas, enlaces: { '12-17 No Existe': '10-12 Durotar' } });
    assert.deepEqual(otra.guias.get('RestedXP Forever Guide (H)\\10-12 Tirisfal (Orc/Troll)').siguientes,
      [{ clave: DUROTAR }, { clave: 'RestedXP Forever Guide (H)\\12-17 The Barrens' }]);
  });
  test('la tabla ENLACES se usa antes que el nombre', () => {
    const otra = construirConFixtures(fuentes, {
      mapas, enlaces: { '22-24 Hillsbrad': 'RestedXP Forever Guide (H)\\10-12 Durotar' },
    });
    assert.deepEqual(otra.guias.get('RestedXP Forever Guide (H)\\12-17 The Barrens').siguientes, [{ clave: DUROTAR }]);
    assert.equal(otra.avisos.filter((a) => /Hillsbrad" enlazado por nombre/.test(a.mensaje)).length, 0);
  });
});

describe('#next con el filtro de la guía destino', () => {
  const rn = construirConFixtures([{ en: 'guias/next-filtro-en.lua', tipo: 'normal' }], { mapas });
  const gn = (nombre) => rn.guias.get(`Prueba Next\\${nombre}`);

  test('A;B: cada alternativa lleva el filtro de su guía destino y la que nunca aplica se quita', () => {
    assert.deepEqual(gn('01-05 Origen').siguientes, [
      { clave: 'Prueba Next\\05-10 Cazador', filtro: [['f:Alliance', 'c:HUNTER']] },
      { clave: 'Prueba Next\\05-10 Resto', filtro: [['f:Alliance', '!c:HUNTER']] },
    ]);
    assert.equal(rn.estadisticas.next.destinoNoAplica, 1, '«05-10 Solo Horda» es de la Horda');
    // Un cazador toma la primera; quien no lo es, la segunda.
    const elegida = (clase) => gn('01-05 Origen').siguientes
      .find((s) => evaluarFiltro(s.filtro ?? true, { clase, raza: 'Human', faccion: 'Alliance', nivel: 5 }))?.clave;
    assert.equal(elegida('HUNTER'), 'Prueba Next\\05-10 Cazador');
    assert.equal(elegida('WARRIOR'), 'Prueba Next\\05-10 Resto');
  });
  test('si la guía de origen ya implica el filtro del destino, no se repite', () => {
    assert.deepEqual(gn('05-10 Cazador').siguientes, [{ clave: 'Prueba Next\\10-12 Comun' }]);
  });
  test('el enlace por nombre no elige una guía cuyo filtro choca con el de la guía de origen', () => {
    assert.deepEqual(gn('05-10 Resto').siguientes, [{ sinResolver: 'Otro Grupo\\10-12 Solo Cazador' }]);
  });
  test('si se llega por el grupo de una variante, cuenta el filtro de esa variante', () => {
    // «Grupo H\05-10 Bivalente» solo existe para la Horda: desde una guía sin facción, la entrada lo lleva.
    assert.deepEqual(gn('01-05 Neutral').siguientes, [
      { clave: 'Grupo A\\05-10 Bivalente', filtro: [['f:Horde', '!f:Alliance']] },
    ]);
  });
});

describe('id de paso', () => {
  test('los id son estables entre dos ejecuciones y únicos en la guía', () => {
    const otra = construir();
    for (const [clave, guia] of r.guias) {
      const ids = guia.pasos.map((p) => p.id);
      assert.deepEqual(otra.guias.get(clave).pasos.map((p) => p.id), ids);
      assert.equal(new Set(ids).size, ids.length);
      for (const id of ids) assert.match(id, /^[0-9a-f]{8}(-\d+)?$/);
      guia.pasos.forEach((p, i) => assert.equal(p.n, i + 1));
    }
    const b = g('RestedXP Forever Guide (H)\\12-17 The Barrens');
    assert.equal(b.pasos[1].id, `${b.pasos[0].id}-2`, 'paso repetido');
  });
});

describe('SIGUIENTES_EXTRA', () => {
  const ORIGEN_X = 'Prueba Extra\\22-24 Origen';
  const DESTINO_X = 'Prueba Extra\\24-26 Destino';
  const f = [{ en: 'guias/extra-en.lua', tipo: 'normal' }];
  const con = (extra) => construirConFixtures(f, { mapas, siguientesExtra: extra });

  test('añade al final y sin filtro el destino de su grupo, con aviso siguiente-extra', () => {
    const res = con({ [ORIGEN_X]: [{ destino: '24-26 Destino' }] });
    const sig = res.guias.get(ORIGEN_X).siguientes;
    assert.equal(sig.length, 2);
    assert.equal(sig[0].clave, DESTINO_X);
    assert.deepEqual(sig[0].filtro, [['!c:ROGUE']]);
    assert.deepEqual(sig[1], { clave: DESTINO_X });
    assert.equal(res.avisos.filter((a) => a.tipo === 'siguiente-extra').length, 1);
    // Un pícaro solo encuentra la entrada extra; quien no lo es, la primera.
    const aplica = (s, clase) => evaluarFiltro(s.filtro ?? true, { clase, raza: 'Orc', faccion: 'Horde', nivel: 24 });
    assert.equal(sig.find((s) => aplica(s, 'ROGUE')), sig[1]);
    assert.equal(sig.find((s) => aplica(s, 'WARRIOR')), sig[0]);
  });

  test('una clave (con barra) también vale como destino', () => {
    const res = con({ [ORIGEN_X]: [{ destino: DESTINO_X }] });
    assert.deepEqual(res.guias.get(ORIGEN_X).siguientes.at(-1), { clave: DESTINO_X });
  });

  test('origen o destino inexistentes dan un error claro', () => {
    assert.throws(() => con({ 'No\\Existe': [{ destino: 'x' }] }), /SIGUIENTES_EXTRA.*No\\Existe/);
    assert.throws(() => con({ [ORIGEN_X]: [{ destino: '99-99 Nada' }] }), /SIGUIENTES_EXTRA.*99-99 Nada/);
  });

  test('config.js trae la entrada de Hillsbrad', () => {
    assert.deepEqual(SIGUIENTES_EXTRA['Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad'], [{ destino: '24-26 Southern Barrens/Stonetalon' }]);
  });
});

describe('SIGUIENTES_EXTRA con el origen real', () => {
  const dbReal = join(ORIGEN, 'RXPGuides', 'DB', 'forever', 'db.lua');
  test('con `origen` puesto y sin `siguientesExtra`, rige la tabla real', { skip: !existsSync(dbReal) && 'no hay origen' }, () => {
    const res = construirGuias(FUENTES, { mapas: cargarMapas(dbReal), origen: ORIGEN, descartados: {}, avisos: [] });
    const sig = res.guias.get('Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad').siguientes;
    assert.deepEqual(sig.at(-1), { clave: 'Skyrim Horde 22-30 (EN)\\24-26 Southern Barrens/Stonetalon' });
    assert.equal(sig.at(-1).filtro, undefined);
    assert.equal(res.avisos.filter((a) => a.tipo === 'siguiente-extra').length, 2);
    // Versión con mazmorras de la Alianza: el cazador sigue a su guía y los demás a la de no cazador.
    assert.deepEqual(res.guias.get('RestedXP Forever Dungeon Guide (A)\\20-21 Darkshore/Ashenvale').siguientes, [
      { clave: 'Skyrim Alliance 20-30 (EN)\\21-23 Ashenvale/Stonetalon', filtro: [['f:Alliance', 'c:HUNTER']] },
      { clave: 'Skyrim Alliance 20-30 (EN)\\21-23 Stonetalon/Ashenvale', filtro: [['f:Alliance', '!c:HUNTER']] },
    ]);
    // Alianza no cazador 39-40 (Skyrim_Alianza_20-60_EN.lua:15419): la primera guía es solo de cazador.
    assert.deepEqual(res.guias.get('Skyrim Alliance 30-40 (EN)\\39-40 Alterac/Arathi').siguientes, [
      { clave: 'Skyrim Alliance 40-50 (EN)\\40-40 Dustwallow Marsh', filtro: [['f:Alliance', 'c:HUNTER']] },
      { clave: 'Skyrim Alliance 40-50 (EN)\\39-40 Dustwallow Marsh', filtro: [['f:Alliance', '!c:HUNTER']] },
    ]);
    // .enabledungeon por grupo: el paso de la piedra de hogar con `.dungeon !WC`
    // (dungeon/Horde-12-22_Barrens.lua: 3978-3985 en RXP 4.11.33, 3964-3971 en la 4.11.35) queda oculto en la versión
    // con mazmorras. Lote H: se busca por lo que es (el `.home` con `.dungeon !WC`), no por la línea, que cambia.
    const barrensM = [...res.guias.values()].filter((x) => x.tipo === 'mazmorras'
      && x.fuente.archivo.endsWith('dungeon/Horde-12-22_Barrens.lua'));
    const hogares = barrensM.flatMap((x) => x.pasos.map((p) => [x, p]))
      .filter(([, p]) => p.sinMazmorra === 'WC' && p.elementos.some((e) => e.t === 'home'));
    assert.equal(hogares.length, 1, 'el paso del hogar con `.dungeon !WC`');
    const [hogar] = hogares;
    assert.equal(hogar[1].sinMazmorra, 'WC');
    assert.equal(hogar[0].mazmorras.WC, true, `WC activa en «${hogar[0].clave}»`);
    // Cazador enano 5-11 (Alliance-1-14_DwarfGnome.lua:666): las guías de Dwarf/Gnome no son de cazador.
    assert.deepEqual(res.guias.get('RestedXP Forever Guide (A)\\05-11 Dun Morogh').siguientes.map((s) => s.filtro),
      [[['f:Alliance', '!c:HUNTER']], [['f:Alliance', '!c:HUNTER']], [['f:Alliance', 'c:HUNTER']]]);
  });
});

// Lote A (revisión 52, I2): construirGuias pone casilla a los pasos con texto que nada detiene.
describe('pasos que solo informan', () => {
  const res = construirConFixtures([{ en: 'guias/informativos-en.lua', tipo: 'normal' }], { mapas });
  const guia = res.guias.get('Prueba Informativos\\24-26 Informativos');
  const tipos = (n) => guia.pasos[n - 1].elementos.map((e) => e.t);

  test('«Habla con…» sin misión: la nota pasa a casilla con el mismo texto', () => {
    assert.deepEqual(tipos(1), ['goto', 'manual', 'target']);
    assert.deepEqual(guia.pasos[0].elementos[1].texto, { en: 'Talk to Newton' });
  });

  test('un bankwithdraw con texto ya detiene el paso: no se añade nada', () => {
    assert.deepEqual(tipos(2), ['goto', 'nota', 'bankwithdraw']);
  });

  test('un bankwithdraw sin texto no detiene: la primera nota pasa a casilla y las demás se quedan', () => {
    assert.deepEqual(tipos(3), ['manual', 'nota', 'bankwithdraw']);
  });

  test('los pegajosos y los pasos de solo recorrido no cambian', () => {
    assert.deepEqual(tipos(4), ['nota']);
    assert.deepEqual(tipos(5), ['goto']);
    assert.deepEqual(tipos(6), ['goto', 'bankwithdraw', 'nota', 'accept']);
  });
});
