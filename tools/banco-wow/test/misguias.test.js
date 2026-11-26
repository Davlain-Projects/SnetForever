// «Mis guías» (motor/misguias.lua): las guías que escribe el jugador en el addon aparte SnetForever_MisGuias (la global
// SnetForeverMisGuias) se traducen al formato de la fase 1, salen en el selector en su grupo y se cargan como cualquier
// otra. Lo que no se entiende no se usa y sale como aviso en el chat al entrar. Con los datos mini: 4641 «Your Place in
// the World» (sin objetivos en la base) y 788 «Cutting Teeth» (un objetivo de criatura).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const ORCO = { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', nivel: 1, idioma: 'esES' };
const HUMANO = { raza: 'Human', clase: 'WARRIOR', faccion: 'Alliance', nivel: 1, idioma: 'esES' };
const CLAVE = 'Mis guías\\Mi Durotar';

const BUENA = `SnetForeverMisGuias = {
  {
    nombre = "Mi Durotar",
    niveles = {1, 5},
    faccion = "Horda",
    pasos = {
      {aceptar = 4641, ir = {1411, 42.1, 68.3}, texto = "Habla con Kaltunk"},
      {entregar = 4641, aceptar = 788},
      {completar = 788},
      {ir = {1411, 44.0, 70.0}, texto = "Al Valle de los Retos"},
      {texto = "Vende la basura"},
      {entregar = {788}},
    },
  },
}`;

const conGuias = (previo, jugador = ORCO) => nuevaMaquina({ previo, jugador });
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
const guia = (m, clave = CLAVE) => m.lua(`SnetForever.Datos.guia(${aLua(clave)})`);
const tipos = (paso) => paso.elementos.map((e) => e.t);

test('misguias: una guía bien escrita se traduce al formato de la fase 1, paso a paso', () => {
  const m = conGuias(BUENA);
  const g = guia(m);
  assert.equal(g.clave, CLAVE);
  assert.equal(g.grupo, 'Mis guías');
  assert.equal(g.tipo, 'propia');
  assert.equal(g.faccion, 'Horde');
  assert.deepEqual(g.niveles, [1, 5]);
  assert.equal(g.pasos.length, 6);
  // Con misiones, el ir es la flecha y el texto una nota.
  assert.deepEqual(tipos(g.pasos[0]), ['accept', 'goto', 'nota']);
  assert.equal(g.pasos[0].elementos[1].modo, 'flecha');
  assert.deepEqual([g.pasos[0].elementos[1].mapa, g.pasos[0].elementos[1].x, g.pasos[0].elementos[1].y], [1411, 42.1, 68.3]);
  assert.deepEqual(g.pasos[0].elementos[2].texto, { es: 'Habla con Kaltunk', en: 'Habla con Kaltunk' });
  // aceptar, completar y entregar en este orden dentro del paso.
  assert.deepEqual(tipos(g.pasos[1]), ['accept', 'turnin']);
  // completar sin objetivo: uno por objetivo de la base (788 tiene uno).
  assert.deepEqual(g.pasos[2].elementos.map((e) => [e.t, e.q, e.objetivo]), [['complete', 788, 1]]);
  // Solo un sitio: se da por hecho al llegar.
  assert.deepEqual(tipos(g.pasos[3]), ['goto', 'nota']);
  assert.equal(g.pasos[3].elementos[0].modo, 'objetivo');
  assert.equal(g.pasos[3].elementos[0].radio, 10);
  // Solo texto: casilla que marca el jugador.
  assert.deepEqual(tipos(g.pasos[4]), ['manual']);
  // Una lista de misiones vale igual que un número.
  assert.deepEqual(g.pasos[5].elementos.map((e) => [e.t, e.q]), [['turnin', 788]]);
  assert.deepEqual(g.pasos.map((p) => p.n), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(m.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(m);
});

test('misguias: sale en el selector con su grupo, en las dos versiones, y no es la guía por defecto', () => {
  const m = conGuias(BUENA);
  assert.ok(m.lua('SnetForever.Datos.claves()').includes(CLAVE));
  for (const version of ['normal', 'mazmorras']) {
    const menu = m.lua(`SnetForever.Guias.delMenu(${aLua(version)})`);
    const mio = menu.find((g) => g.grupo === 'Mis guías');
    assert.ok(mio, `sale con la versión ${version}`);
    assert.deepEqual(mio.claves, [CLAVE]);
  }
  assert.equal(m.lua('SnetForever.Guias.tituloGrupo("Mis guías")'), 'Mis guías');
  assert.notEqual(m.lua('SnetForever.Guias.porDefecto()'), CLAVE);
  assert.equal(m.lua(`SnetForever.Guias.otraVersion(${aLua(CLAVE)})`), undefined);
  // Es de la Horda: un humano no la ve.
  const h = conGuias(BUENA, HUMANO);
  assert.equal(h.lua('SnetForever.Guias.delMenu("normal")').find((g) => g.grupo === 'Mis guías'), undefined);
  sinErrores(m);
  sinErrores(h);
});

test('misguias: se carga y el motor la sigue; elegir la otra versión no cambia de guía', () => {
  const m = conGuias(BUENA);
  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`), true);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), CLAVE);
  assert.equal(m.lua('SnetForeverPJ.guia'), CLAVE);
  m.lua('SnetForever.Guias.elegirVersion("mazmorras")');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), CLAVE);
  sinErrores(m);
});

test('misguias: al entrar dice en el chat cuántas guías cargó', () => {
  const m = conGuias(BUENA);
  assert.ok(impresos(m).includes('SnetForever: Mis guías: 1 guía(s) cargada(s).'));
  sinErrores(m);
});

test('misguias: sin el addon SnetForever_MisGuias no hay guías propias ni mensajes', () => {
  const m = nuevaMaquina({ jugador: ORCO });
  assert.deepEqual(m.lua('SnetForever.MisGuias.claves()'), []);
  assert.equal(impresos(m).filter((l) => l.includes('Mis guías')).length, 0);
  assert.equal(guia(m), undefined);
  sinErrores(m);
});

test('misguias: lo mal escrito no se usa y sale como aviso, sin inventar nada', () => {
  const m = conGuias(`SnetForeverMisGuias = {
    {
      nombre = "Con fallos",
      faccion = "Orcos",
      siguiente = "No existe",
      pasos = {
        {aceptar = 999999, entregar = 4641},
        {ir = {1411, 150, 20}},
        {acceptar = 788},
        {completar = 788, objetivo = 1},
        "hola",
      },
    },
    {nombre = "Con fallos", pasos = {{texto = "repetida"}}},
    {pasos = {{texto = "sin nombre"}}},
    {nombre = "Vacía", pasos = {{ir = "aquí"}}},
  }`);
  const g = guia(m, 'Mis guías\\Con fallos');
  // La misión que no está en la base y el sitio fuera de rango no se usan; el paso con solo eso desaparece.
  assert.deepEqual(g.pasos.map((p) => tipos(p)), [['turnin'], ['complete']]);
  assert.deepEqual(g.pasos.map((p) => p.n), [1, 2]);
  assert.equal(g.faccion, undefined, 'facción desconocida: vale para las dos');
  // Sin niveles: los de sus misiones.
  const nivel = m.lua('SnetForever.Datos.mision(4641).questLevel');
  assert.equal(g.niveles[0], Math.min(nivel, m.lua('SnetForever.Datos.mision(788).questLevel')));
  assert.deepEqual(g.siguientes, [{ sinResolver: 'No existe' }]);
  assert.equal(guia(m, 'Mis guías\\Vacía'), undefined);
  assert.deepEqual(m.lua('SnetForever.MisGuias.claves()'), ['Mis guías\\Con fallos']);
  const avisos = m.lua('SnetForever.MisGuias.avisos()').map((a) => a[0]);
  for (const clave of ['MISGUIAS_AVISO_FACCION', 'MISGUIAS_AVISO_MISION', 'MISGUIAS_AVISO_IR', 'MISGUIAS_AVISO_PASO_VACIO',
    'MISGUIAS_AVISO_PASO_TABLA', 'MISGUIAS_AVISO_REPETIDA', 'MISGUIAS_AVISO_SIN_NOMBRE',
    'MISGUIAS_AVISO_SIN_PASOS', 'MISGUIAS_AVISO_SIGUIENTE']) {
    assert.ok(avisos.includes(clave), `falta el aviso ${clave}`);
  }
  const chat = impresos(m);
  assert.ok(chat.includes('SnetForever: Mis guías: «Con fallos», paso 1: la misión 999999 no está en la base de misiones'));
  // Un campo que no entiende no avisa paso a paso (16-nov: 9569 avisos de «texto_en»); el paso que se queda vacío, sí.
  assert.ok(!avisos.includes('MISGUIAS_AVISO_CAMPO'));
  assert.ok(!chat.some((l) => l.includes('no entiendo')));
  assert.ok(chat.includes('SnetForever: Mis guías: «Con fallos», paso 3: no tiene nada que hacer y no se usa'));
  assert.ok(chat.some((l) => l.startsWith('SnetForever: Mis guías: …y ')), 'más de 10 avisos: el resto se resume');
  sinErrores(m);
});

test('misguias: la siguiente guía se resuelve por nombre y el texto no abre códigos del juego', () => {
  const m = conGuias(`SnetForeverMisGuias = {
    {nombre = "Primera", siguiente = "Segunda", pasos = {{texto = "|cffff0000rojo|r"}}},
    {nombre = "Segunda", pasos = {{aceptar = 4641}}},
  }`);
  assert.deepEqual(guia(m, 'Mis guías\\Primera').siguientes, [{ clave: 'Mis guías\\Segunda' }]);
  assert.equal(guia(m, 'Mis guías\\Primera').pasos[0].elementos[0].texto.es, '||cffff0000rojo||r');
  assert.deepEqual(m.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(m);
});

test('misguias: una global que no es una lista avisa y no rompe nada', () => {
  const m = conGuias('SnetForeverMisGuias = "hola"');
  assert.deepEqual(m.lua('SnetForever.MisGuias.claves()'), []);
  assert.ok(impresos(m).includes('SnetForever: Mis guías: SnetForeverMisGuias tiene que ser una lista { ... }'));
  sinErrores(m);
});

test('misguias: /snet aqui escribe tu posición como un «ir» de la guía; sin posición, solo avisa', () => {
  const m = nuevaMaquina({ jugador: { ...ORCO, mapa: 1411, x: 43.29, y: 68.53 } });
  m.lua('SlashCmdList.SNET("aqui")');
  assert.ok(impresos(m).includes('SnetForever: estás en ir = {1411, 43.3, 68.5} (cópialo en un paso de tu guía)'),
    impresos(m).join('\n'));
  m.lua('SlashCmdList.SNET("here")');
  assert.equal(impresos(m).filter((l) => l.includes('ir = {1411, 43.3, 68.5}')).length, 2);
  // Con la posición secreta (motor moderno): el aviso, sin error.
  m.lua(`rawset(C_Map, "GetPlayerMapPosition", function()
    return {GetXY = function() return BANCO.secreto("number"), BANCO.secreto("number") end}
  end)`);
  m.lua('SlashCmdList.SNET("aqui")');
  assert.ok(impresos(m).at(-1).includes('no da tu posición'));
  sinErrores(m);
  const dentro = nuevaMaquina({ jugador: { ...ORCO, enInstancia: true } });
  dentro.lua('SnetForever.MisGuias.aqui()');
  assert.ok(impresos(dentro).at(-1).includes('no da tu posición'));
  sinErrores(dentro);
});

test('misguias: si el addon está cargado pero su archivo no llegó a crear la lista, lo dice en el chat', () => {
  const m = nuevaMaquina({ jugador: ORCO, previo: 'BANCO.addonsCargados = BANCO.addonsCargados or {}; BANCO.addonsCargados.SnetForever_MisGuias = true' });
  assert.ok(impresos(m).some((l) => l.includes('tiene un error de escritura')), impresos(m).join('\n'));
  sinErrores(m);
});

// La plantilla que se copia a AddOns (templates/SnetForever_MisGuias/mis-guias.lua), con los datos reales: su guía de
// ejemplo se carga entera, sin avisos (todas sus misiones están en la base).
test('misguias: la plantilla se carga con los datos reales sin avisos', { timeout: 600000 }, async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const tocRutas = join(raiz, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
  const tocMisiones = join(raiz, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
  if (!existsSync(tocRutas) || !existsSync(tocMisiones)) return;
  const plantilla = readFileSync(join(raiz, 'templates', 'SnetForever_MisGuias', 'mis-guias.lua'), 'utf8');
  const m = nuevaMaquina({ datos: [tocRutas, tocMisiones], jugador: ORCO, forever: true, previo: plantilla });
  assert.deepEqual(m.lua('SnetForever.MisGuias.avisos()'), []);
  const g = guia(m, 'Mis guías\\Ejemplo: Valle de los Retos');
  assert.equal(g.pasos.length, 7);
  assert.ok(impresos(m).includes('SnetForever: Mis guías: 1 guía(s) cargada(s).'));
  // Los textos del ejemplo usan los nombres en español de la base.
  assert.match(m.lua('SnetForever.Datos.nombreItem(4862)'), /cola/i);
  assert.equal(m.lua('SnetForever.Datos.mision(789).preQuestSingle[1]'), 788);
  sinErrores(m);
});

// 16-nov (el jugador, con la 0.7.0): las guías que la app guarda con el inglés de cada paso traen `texto_en`, y el lector
// soltaba «no entiendo «texto_en»» por cada paso: «…y 9569 aviso(s) más» en el chat.
const pasosConIngles = (n) => Array.from({ length: n }, (_, i) =>
  `{ir = {1411, ${40 + (i % 20)}.0, 60.0}, texto = "Paso ${i + 1}", texto_en = "Step ${i + 1}"},`).join('\n');
const CON_INGLES = `SnetForeverMisGuias = {
  {nombre = "Ruta bilingüe", nombre_en = "Bilingual route", pasos = {
    {aceptar = 4641, texto = "Habla con el jefe", texto_en = "Talk to the chief"},
    ${pasosConIngles(40)}
  }},
}`;

test('misguias: «texto_en» se entiende (sin avisos) y es el texto del paso con el juego en inglés', () => {
  const m = conGuias(CON_INGLES);
  const g = guia(m, 'Mis guías\\Ruta bilingüe');
  assert.equal(g.pasos.length, 41);
  assert.deepEqual(g.pasos[0].elementos.at(-1).texto, { es: 'Habla con el jefe', en: 'Talk to the chief' });
  assert.deepEqual(g.pasos[40].elementos.at(-1).texto, { es: 'Paso 40', en: 'Step 40' });
  assert.deepEqual(g.titulo, { es: 'Ruta bilingüe', en: 'Bilingual route' });
  assert.deepEqual(m.lua('SnetForever.MisGuias.avisos()'), []);
  const chat = impresos(m).filter((l) => l.includes('Mis guías'));
  assert.deepEqual(chat, ['SnetForever: Mis guías: 1 guía(s) cargada(s).']);
  sinErrores(m);
});

test('misguias: sin «texto_en», el inglés del paso es el mismo texto (como antes)', () => {
  const m = conGuias(BUENA);
  assert.deepEqual(guia(m).pasos[0].elementos[2].texto, { es: 'Habla con Kaltunk', en: 'Habla con Kaltunk' });
  assert.deepEqual(guia(m).titulo, { es: 'Mi Durotar', en: 'Mi Durotar' });
});

const CAMPO_RARO = `SnetForeverMisGuias = {
  {nombre = "Con un campo raro", pasos = {
    ${Array.from({ length: 30 }, (_, i) => `{aceptar = 4641, notaVieja = "x${i}"},`).join('\n')}
    {entregar = 4641, otroCampo = 1},
  }},
}`;

test('misguias: un campo desconocido no llena el chat: sin modo de depuración, ningún aviso; con él, uno solo resumido', () => {
  const sin = conGuias(CAMPO_RARO);
  assert.ok(guia(sin, 'Mis guías\\Con un campo raro'), 'la guía se usa igual');
  assert.ok(!impresos(sin).some((l) => l.includes('notaVieja') || l.includes('otroCampo') || l.includes('aviso(s) más')));
  assert.deepEqual(sin.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(sin);

  const con = conGuias(`SnetForeverCuenta = {depurar = true}\n${CAMPO_RARO}`);
  const lineas = impresos(con).filter((l) => l.includes('no entiendo'));
  assert.deepEqual(lineas, ['SnetForever: Mis guías: no entiendo estos campos de los pasos: «notaVieja» (30 pasos), «otroCampo» (1 paso); valen aceptar, completar, objetivo, entregar, ir, texto, texto_en, clase, raza, faccion, sin_clase y sin_raza']);
  assert.ok(!impresos(con).some((l) => l.includes('aviso(s) más')));
  sinErrores(con);
});

// 17-nov: las guías convertidas de RestedXP tiraban los pasos de una clase, raza o facción («step << Warrior») y dejaban
// para todos las líneas con condición («.accept 123 << Warrior»). Ahora cada paso puede llevar clase, raza y facción (texto
// o lista; una lista es O; todo junto, Y) y sin_clase / sin_raza para las negaciones, en español o en inglés.
const TROL_MAGO = { raza: 'Troll', clase: 'MAGE', faccion: 'Horde', nivel: 1, idioma: 'esES' };
const POR_CLASE = `SnetForeverMisGuias = {
  {nombre = "Por clase", pasos = {
    {aceptar = 4641, texto = "Para todos"},
    {aceptar = 788, clase = "Mago"},
    {completar = 788, clase = {"Guerrero", "mage"}},
    {entregar = 788, clase = "WARRIOR", raza = "Orco"},
    {texto = "Solo trols", raza = "Trol"},
    {texto = "Solo no-muertos", raza = {"No-muerto", "undead", "Scourge"}},
    {texto = "Solo la Alianza", faccion = "Alianza"},
    {texto = "Menos los guerreros", sin_clase = "guerrero"},
    {texto = "Ni orcos ni humanos", sin_raza = {"Orc", "Humano"}},
    {texto = "Solo la Horda", faccion = "Horde"},
    {texto = "Elfos de la noche magos o druidas", raza = "Elfo de la noche", clase = {"Mago", "Druida"}},
    {texto = "Con tildes y mayúsculas", clase = "PÍCARO", raza = "GNOMO", sin_clase = "Chamán"},
  }},
}`;
const CLAVE_POR_CLASE = 'Mis guías\\Por clase';
// Los ids de los pasos que el motor deja para el personaje de la guía cargada.
function pasosVisibles(m) {
  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE_POR_CLASE)})`), true);
  return m.lua(`(function()
    local ids, i = {}, 1
    while SnetForever.Motor.paso(i) do ids[#ids + 1] = SnetForever.Motor.paso(i).datos.id; i = i + 1 end
    return ids
  end)()`);
}

test('misguias: clase, raza y facción del paso pasan al filtro del addon (en español o en inglés, lista O, juntos Y)', () => {
  const m = conGuias(POR_CLASE);
  const g = guia(m, CLAVE_POR_CLASE);
  assert.equal(g.pasos.length, 12);
  assert.deepEqual(g.pasos.map((p) => p.filtro ?? null), [
    null,
    [['c:MAGE']],
    [['c:WARRIOR'], ['c:MAGE']],
    [['c:WARRIOR', 'r:Orc']],
    [['r:Troll']],
    [['r:Scourge']],
    [['f:Alliance']],
    [['!c:WARRIOR']],
    [['!r:Orc', '!r:Human']],
    [['f:Horde']],
    [['c:MAGE', 'r:NightElf'], ['c:DRUID', 'r:NightElf']],
    [['c:ROGUE', 'r:Gnome', '!c:SHAMAN']],
  ]);
  assert.deepEqual(m.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(m);
});

test('misguias: el motor solo enseña los pasos de la clase, la raza y la facción del personaje', () => {
  const orco = conGuias(POR_CLASE);
  assert.deepEqual(pasosVisibles(orco), ['m1', 'm3', 'm4', 'm10']);
  const humano = conGuias(POR_CLASE, HUMANO);
  assert.deepEqual(pasosVisibles(humano), ['m1', 'm3', 'm7']);
  const trol = conGuias(POR_CLASE, TROL_MAGO);
  assert.deepEqual(pasosVisibles(trol), ['m1', 'm2', 'm3', 'm5', 'm8', 'm9', 'm10']);
  sinErrores(orco);
  sinErrores(humano);
  sinErrores(trol);
});

const ILEGIBLES = `SnetForeverMisGuias = {
  {nombre = "Con nombres raros", pasos = {
    {aceptar = 4641},
    {aceptar = 788, clase = "Magoo"},
    {completar = 788, clase = {"Mago", "Magoo"}},
    {texto = "raza que no es texto", raza = 5},
    {texto = "lista vacía", sin_clase = {}},
    {texto = "facción rara", faccion = "Neutral"},
    {texto = "otra vez", clase = "Magoo"},
    {entregar = 788},
  }},
}`;

test('misguias: una clase, raza o facción que no entiende: el paso no sale (para nadie) y, en depuración, un aviso resumido', () => {
  const sin = conGuias(ILEGIBLES);
  const g = guia(sin, 'Mis guías\\Con nombres raros');
  assert.deepEqual(g.pasos.map((p) => p.id), ['m1', 'm8'], 'los pasos con un nombre ilegible no salen');
  assert.deepEqual(sin.lua('SnetForever.MisGuias.avisos()'), [], 'sin modo de depuración, ningún aviso');
  assert.ok(!impresos(sin).some((l) => l.includes('Magoo')));
  sinErrores(sin);

  const con = conGuias(`SnetForeverCuenta = {depurar = true}\n${ILEGIBLES}`);
  const lineas = impresos(con).filter((l) => l.includes('clase, raza o facción'));
  assert.deepEqual(lineas, ['SnetForever: Mis guías: no entiendo esta clase, raza o facción de los pasos (esos pasos no salen): '
    + '«clase = Magoo» (3 pasos), «faccion = Neutral» (1 paso), «raza = 5» (1 paso), «sin_clase = {}» (1 paso)']);
  sinErrores(con);
});

// Ronda 2 (M1, M2): las tildes (agudas y graves, también en mayúscula) se quitan antes de mirar mayúsculas; otra tilde no
// se entiende. De una lista solo cuenta su parte de lista (1, 2, 3… hasta el primer hueco), como en la app.
test('misguias: tildes agudas y graves en mayúscula o minúscula; de una lista con huecos, solo su parte de lista', () => {
  const m = conGuias(`SnetForeverMisGuias = {
  {nombre = "Nombres raros", pasos = {
    {aceptar = 4641, clase = "Màgo"},
    {aceptar = 4641, clase = "GUÉRRERO"},
    {aceptar = 4641, clase = "Mâgo"},
    {aceptar = 4641, clase = {"Mago", nil, "Brujo"}},
    {aceptar = 4641, raza = {[2] = "Orco"}},
    {aceptar = 4641, raza = {x = "Orco"}},
    {aceptar = 4641, raza = "ÉLFO DE LA NÒCHE"},
  }},
}`);
  const g = guia(m, 'Mis guías\\Nombres raros');
  assert.deepEqual(g.pasos.map((p) => [p.id, p.filtro]), [
    ['m1', [['c:MAGE']]], ['m2', [['c:WARRIOR']]], ['m4', [['c:MAGE']]], ['m7', [['r:NightElf']]],
  ]);
  sinErrores(m);
});

// Ronda 2 (I2): cada paso puede llevar su `id` (así el progreso guardado sigue en su paso aunque se metan pasos nuevos
// delante); sin él, «m<número del paso>» como antes.
const ANTES_IDS = `SnetForeverMisGuias = {
  {nombre = "Con ids", pasos = {{aceptar = 4641}, {aceptar = 788}, {entregar = 788}}},
}`;
const AHORA_IDS = `SnetForeverMisGuias = {
  {nombre = "Con ids", pasos = {
    {id = "n1", texto = "Un paso nuevo delante"},
    {id = "m1", aceptar = 4641},
    {id = "m2", aceptar = 788},
    {id = "n2", clase = "Mago", texto = "Solo magos"},
    {id = "m3", entregar = 788},
  }},
}`;
const CLAVE_IDS = 'Mis guías\\Con ids';

test('misguias: con «id» en los pasos, un progreso guardado con el archivo de antes sigue en el mismo paso', () => {
  const guardado = { SnetForeverPJ: { guia: CLAVE_IDS, progreso: { [CLAVE_IDS]: { id: 'm2' } } } };
  const elActual = (m) => {
    assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE_IDS)})`), true);
    return m.lua('(function() local p = SnetForever.Motor.paso(SnetForever.Motor.estado().actual) return {p.datos.id, p.datos.elementos[1].q} end)()');
  };
  assert.deepEqual(elActual(nuevaMaquina({ previo: ANTES_IDS, jugador: ORCO, guardado })), ['m2', 788]);
  const ahora = nuevaMaquina({ previo: AHORA_IDS, jugador: ORCO, guardado });
  assert.deepEqual(guia(ahora, CLAVE_IDS).pasos.map((p) => p.id), ['n1', 'm1', 'm2', 'n2', 'm3']);
  assert.deepEqual(elActual(ahora), ['m2', 788], 'el mismo paso, aunque ahora es el tercero');
  assert.deepEqual(ahora.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(ahora);
});

const IDS_RAROS = `SnetForeverMisGuias = {
  {nombre = "Ids raros", pasos = {
    {id = "a", aceptar = 4641},
    {id = "a", aceptar = 788},
    {aceptar = 4641},
    {id = 5, aceptar = 788},
    {id = "m3", entregar = 788},
    {id = "  ", entregar = 4641},
    {id = {}, aceptar = 4641},
  }},
}`;

test('misguias: un id repetido, vacío o que no es texto no vale (el del número del paso) y, en depuración, avisa resumido', () => {
  const sin = conGuias(IDS_RAROS);
  // El «m3» explícito del quinto paso gana: el tercero, sin id, se queda con otro que no choca.
  assert.deepEqual(guia(sin, 'Mis guías\\Ids raros').pasos.map((p) => p.id), ['a', 'm2', 'm3~', 'm4', 'm3', 'm6', 'm7']);
  assert.deepEqual(sin.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(sin);
  const con = conGuias(`SnetForeverCuenta = {depurar = true}\n${IDS_RAROS}`);
  assert.deepEqual(impresos(con).filter((l) => l.includes(' id ')), [
    'SnetForever: Mis guías: estos id de los pasos están repetidos o mal escritos (esos pasos usan su número): «  » (1 paso), «(una tabla)» (1 paso), «5» (1 paso), «a» (1 paso)',
  ]);
  sinErrores(con);
});

// Ronda 2 (decisión 1): la guía entera puede ser de una clase, raza o facción (los mismos campos que un paso; la facción,
// como siempre): pasan a guia.filtro y la guía no sale en el selector a quien no la puede hacer.
const DE_CLASE = `SnetForeverMisGuias = {
  {nombre = "Solo cazadores", faccion = "Alianza", clase = "Cazador", pasos = {{aceptar = 4641}}},
  {nombre = "Sin guerreros ni chamanes", sin_clase = {"Guerrero", "Chamán"}, pasos = {{aceptar = 4641}}},
  {nombre = "Gnomos brujos", raza = "Gnomo", clase = "Brujo", pasos = {{aceptar = 4641}}},
  {nombre = "Para todos", pasos = {{aceptar = 4641}}},
  {nombre = "Clase rara", clase = "Magoo", pasos = {{aceptar = 4641}}},
}`;

test('misguias: una guía de una clase o raza solo sale en el selector a quien la cumple; con un nombre raro, no se usa y avisa', () => {
  const CAZADOR = { ...HUMANO, clase: 'HUNTER' };
  const delSelector = (m) => (m.lua('SnetForever.Guias.delMenu("normal")').find((g) => g.grupo === 'Mis guías')?.claves ?? [])
    .map((c) => c.replace('Mis guías\\', '')).sort();
  const orco = conGuias(DE_CLASE);
  assert.deepEqual(guia(orco, 'Mis guías\\Solo cazadores').filtro, [['c:HUNTER']]);
  assert.equal(guia(orco, 'Mis guías\\Solo cazadores').faccion, 'Alliance');
  assert.deepEqual(guia(orco, 'Mis guías\\Sin guerreros ni chamanes').filtro, [['!c:WARRIOR', '!c:SHAMAN']]);
  assert.deepEqual(guia(orco, 'Mis guías\\Gnomos brujos').filtro, [['c:WARLOCK', 'r:Gnome']]);
  assert.equal(guia(orco, 'Mis guías\\Para todos').filtro, undefined);
  assert.equal(guia(orco, 'Mis guías\\Clase rara'), undefined);
  assert.deepEqual(delSelector(orco), ['Para todos']);
  assert.deepEqual(delSelector(conGuias(DE_CLASE, CAZADOR)), ['Para todos', 'Sin guerreros ni chamanes', 'Solo cazadores']);
  assert.deepEqual(delSelector(conGuias(DE_CLASE, { ...HUMANO, raza: 'Gnome', clase: 'WARLOCK' })), ['Gnomos brujos', 'Para todos', 'Sin guerreros ni chamanes']);
  assert.ok(impresos(orco).includes('SnetForever: Mis guías: «Clase rara»: no entiendo su clase, raza o facción (clase = Magoo); no se usa'),
    impresos(orco).join('\n'));
  sinErrores(orco);
});

// Ronda 2 (M5): los MISMOS pasos en el addon (banco) y en la app (app/src/misguias.mjs, que lee mis-guias.lua para la IA):
// cada personaje de ejemplo ve los mismos pasos y las mismas guías en los dos.
const COMUN = `SnetForeverMisGuias = {
  {nombre = "Común", pasos = {
    {aceptar = 4641},
    {aceptar = 788, clase = "Guerrero", raza = "Orco"},
    {aceptar = 788, clase = {"Mago", "Brujo"}},
    {aceptar = 788, sin_clase = {"Guerrero", "Pícaro"}, sin_raza = "Humano"},
    {aceptar = 788, faccion = "Alianza"},
    {aceptar = 788, faccion = {"Horda"}, raza = {"Trol", "Skyborne"}},
    {aceptar = 788, clase = "MÀGO"},
    {aceptar = 788, clase = "Mâgo"},
    {aceptar = 788, clase = {"Druida", nil, "Mago"}},
    {aceptar = 788, raza = {[2] = "Orco"}},
    {aceptar = 788, raza = "No-muerto", sin_clase = "brujo"},
    {aceptar = 788, faccion = "Neutral"},
  }},
  {nombre = "De magos", clase = "Mago", pasos = {{aceptar = 4641}}},
  {nombre = "Sin orcos", sin_raza = "Orc", pasos = {{aceptar = 4641}}},
  {nombre = "Rara", raza = "Orcoo", pasos = {{aceptar = 4641}}},
}`;
const PERSONAJES = [
  ORCO, HUMANO, TROL_MAGO,
  { raza: 'Skyborne', clase: 'MAGE', faccion: 'Alliance', nivel: 1, idioma: 'esES' },
  { raza: 'Skyborne', clase: 'DRUID', faccion: 'Horde', nivel: 1, idioma: 'esES' },
  { raza: 'Scourge', clase: 'WARLOCK', faccion: 'Horde', nivel: 1, idioma: 'esES' },
  { raza: 'Scourge', clase: 'ROGUE', faccion: 'Horde', nivel: 1, idioma: 'esES' },
];

test('misguias: el addon y la app ven los mismos pasos y las mismas guías con cada personaje', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const app = await import('../../../app/src/misguias.mjs');
  const addons = mkdtempSync(join(tmpdir(), 'snf-comun-'));
  mkdirSync(join(addons, 'SnetForever_MisGuias'));
  writeFileSync(join(addons, app.ARCHIVO_MIS_GUIAS), COMUN);
  const lista = app.leerMisGuias(addons);
  for (const pj of PERSONAJES) {
    const m = conGuias(COMUN, pj);
    const delAddon = m.lua(`(function()
      local pj, salida = SnetForever.Personaje.actual(), {}
      for _, nombre in ipairs({"Común", "De magos", "Sin orcos", "Rara"}) do
        local clave = "Mis guías\\\\" .. nombre
        local g = SnetForever.MisGuias.guia(clave)
        local pasos = {}
        if g then
          for _, p in ipairs(g.pasos) do
            if SnetForever.Filtros.evaluar(p.filtro, pj) then pasos[#pasos + 1] = p.linea end
          end
        end
        salida[#salida + 1] = {nombre = nombre, existe = SnetForever.Guias.existe(clave, pj), pasos = pasos}
      end
      return salida
    end)()`);
    const pjApp = { clase: pj.clase, raza: pj.raza, faccion: pj.faccion };
    const deLaApp = lista.map((g) => {
      const deGuia = app.filtroDePasoPropio(g, { sinFaccion: true });
      const existe = deGuia !== false && app.cumpleFiltro(deGuia, pjApp);
      const pasos = [];
      Object.values(g.pasos).forEach((p, i) => {
        const f = app.filtroDePasoPropio(p);
        if (existe && f !== false && app.cumpleFiltro(f, pjApp)) pasos.push(i + 1);
      });
      return { nombre: g.nombre, existe, pasos };
    });
    // En el addon, una guía que no se usa no tiene pasos; los de una guía que no le vale se comparan igual (vacíos).
    const normal = delAddon.map((g) => ({ ...g, pasos: g.existe ? g.pasos : [] }));
    assert.deepEqual(normal, deLaApp, `${pj.raza} ${pj.clase} ${pj.faccion}`);
    sinErrores(m);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Ronda 3
// ---------------------------------------------------------------------------------------------------------------------

// Lo que el motor deja marcado en cada paso de la guía cargada: {id: 'actual' | 'hecho' | 'saltado' | 'marcado'…}.
function marcasDe(m, clave) {
  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(clave)})`), true);
  return m.lua(`(function()
    local salida, actual = {}, SnetForever.Motor.estado().actual
    local i = 1
    while SnetForever.Motor.paso(i) do
      local p = SnetForever.Motor.paso(i)
      local marcas = {}
      if i == actual then marcas[#marcas + 1] = "actual" end
      if p.saltado then marcas[#marcas + 1] = "saltado" end
      for k, e in ipairs(p.elementos) do
        if e.mem and e.mem.marcado then marcas[#marcas + 1] = "marcado" .. k end
      end
      salida[p.datos.id] = table.concat(marcas, ",")
      i = i + 1
    end
    return salida
  end)()`);
}

// Ronda 3 (m1): no solo el paso actual: las casillas marcadas a mano y los saltados siguen en los mismos pasos.
const ANTES_MARCAS = `SnetForeverMisGuias = {
  {nombre = "Con marcas", pasos = {{aceptar = 4641}, {aceptar = 788}, {texto = "Vende la basura"}, {entregar = 788}}},
}`;
const AHORA_MARCAS = `SnetForeverMisGuias = {
  {nombre = "Con marcas", pasos = {
    {id = "n1", texto = "Un paso nuevo delante"},
    {id = "m1", aceptar = 4641},
    {id = "m2", aceptar = 788},
    {id = "n2", clase = "Mago", texto = "Solo magos"},
    {id = "m3", texto = "Vende la basura"},
    {id = "m4", entregar = 788},
  }},
}`;

test('misguias: con «id», las casillas marcadas y los saltados guardados con el archivo de antes siguen en sus pasos', () => {
  const clave = 'Mis guías\\Con marcas';
  const guardado = () => ({ SnetForeverPJ: {
    guia: clave,
    progreso: { [clave]: { id: 'm2', manuales: { m3: { [1]: true } } } },
    saltados: [{ clave, id: 'm4' }],
  } });
  const antes = marcasDe(nuevaMaquina({ previo: ANTES_MARCAS, jugador: ORCO, guardado: guardado() }), clave);
  assert.equal(antes.m4, 'saltado');
  const m = nuevaMaquina({ previo: AHORA_MARCAS, jugador: ORCO, guardado: guardado() });
  assert.deepEqual(marcasDe(m, clave), { n1: '', ...antes }, 'los mismos pasos (el del mago no sale), con las mismas marcas');
  // La casilla marcada (el motor la enseña al activar el paso) sigue apuntando al paso «Vende la basura».
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(clave)}].manuales.m3[1]`), true);
  assert.equal(m.lua(`(function() for _, p in ipairs(SnetForever.MisGuias.guia(${aLua(clave)}).pasos) do
    if p.id == "m3" then return p.elementos[1].texto.es end end end)()`), 'Vende la basura');
  sinErrores(m);
});

// Ronda 3 (etiqueta de las guías de clase): con «nombre_antes», el progreso guardado con el nombre de antes pasa al nuevo
// (paso actual, marcas, saltados, retomados y la guía elegida), una sola vez y sin borrar el de la nueva si ya lo hay.
const VIEJA = 'Mis guías\\[H-A] Solo cazadores';
const NUEVA = 'Mis guías\\[A] Solo cazadores';
const CON_NOMBRE_ANTES = `SnetForeverMisGuias = {
  {nombre = "[A] Solo cazadores", nombre_antes = "[H-A] Solo cazadores", faccion = "Alianza", clase = "Cazador", pasos = {
    {id = "m1", aceptar = 4641}, {id = "m2", aceptar = 788}, {id = "m3", texto = "Vende la basura"}, {id = "m4", entregar = 788},
  }},
}`;
const CAZADOR_HUMANO = { ...HUMANO, clase: 'HUNTER' };

test('misguias: con «nombre_antes», el progreso de la guía con su nombre de antes pasa al nuevo, con sus marcas', () => {
  const guardado = { SnetForeverPJ: {
    guia: VIEJA,
    progreso: { [VIEJA]: { id: 'm2', manuales: { m3: { [1]: true } } } },
    saltados: [{ clave: VIEJA, id: 'm4' }],
    retomados: { [VIEJA]: { m4: true } },
  } };
  const m = nuevaMaquina({ previo: CON_NOMBRE_ANTES, jugador: CAZADOR_HUMANO, guardado });
  assert.equal(m.lua('SnetForeverPJ.guia'), NUEVA);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), NUEVA, 'la guía elegida es la de la etiqueta nueva');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(VIEJA)}]`), undefined);
  assert.equal(m.lua(`SnetForeverPJ.saltados[1].clave`), NUEVA);
  assert.equal(m.lua(`SnetForeverPJ.retomados[${aLua(NUEVA)}].m4`), true);
  assert.deepEqual(marcasDe(m, NUEVA), { m1: '', m2: 'actual', m3: '', m4: '' }, 'retomado: ya no cuenta como saltado');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(NUEVA)}].manuales.m3[1]`), true, 'la casilla marcada va con su paso');
  assert.equal(m.lua('SnetForever.MisGuias.guia(' + aLua(NUEVA) + ').nombre'), '[A] Solo cazadores');
  assert.deepEqual(m.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(m);
});

test('misguias: «nombre_antes» no pisa el progreso que ya tiene la guía nueva ni toca nada si la vieja sigue existiendo', () => {
  const conLasDos = nuevaMaquina({
    previo: CON_NOMBRE_ANTES,
    jugador: CAZADOR_HUMANO,
    guardado: { SnetForeverPJ: { guia: NUEVA, progreso: { [VIEJA]: { id: 'm4' }, [NUEVA]: { id: 'm1' } } } },
  });
  assert.equal(conLasDos.lua(`SnetForeverPJ.progreso[${aLua(NUEVA)}].id`), 'm1');
  assert.equal(conLasDos.lua(`SnetForeverPJ.progreso[${aLua(VIEJA)}].id`), 'm4');
  sinErrores(conLasDos);
  const viejaExiste = nuevaMaquina({
    previo: CON_NOMBRE_ANTES.replace('SnetForeverMisGuias = {', 'SnetForeverMisGuias = {\n  {nombre = "[H-A] Solo cazadores", pasos = {{aceptar = 4641}}},'),
    jugador: CAZADOR_HUMANO,
    guardado: { SnetForeverPJ: { guia: VIEJA, progreso: { [VIEJA]: { id: 'm1' } } } },
  });
  assert.equal(viejaExiste.lua('SnetForeverPJ.guia'), VIEJA);
  assert.equal(viejaExiste.lua(`SnetForeverPJ.progreso[${aLua(NUEVA)}]`), undefined);
  sinErrores(viejaExiste);
});

// Ronda 3 (Important): el conversor da el id de antes al trozo COMÚN de un paso partido, no al primer trozo si ese es de
// una clase. Un guerrero con su progreso en ese id lo encuentra con el archivo nuevo (no retrocede).
test('misguias: un guerrero con su progreso en un paso que el conversor partió sigue en el mismo paso', async () => {
  const { convertir } = await import('../../misguias-rxp/src/convertir.js');
  const rxp = `RegisterGuide([[
#name 1-5 Partido delante
<< Horde
step
    .accept 4641
step
    .accept 790 << Mage
    .accept 788
    >>Habla con el jefe
step
    .turnin 788
]])`;
  const anterior = `SnetForeverMisGuias = {
  {
    nombre = "[H] 1-5 Partido delante",
    niveles = {1, 5},
    faccion = "Horda",
    pasos = {
      {aceptar = 4641},
      {aceptar = {790, 788}, texto = "Habla con el jefe"},
      {entregar = 788},
    },
  },
}
`;
  const clave = 'Mis guías\\[H] 1-5 Partido delante';
  const guardado = () => ({ SnetForeverPJ: { guia: clave, progreso: { [clave]: { id: 'm2' } } } });
  const viejo = nuevaMaquina({ previo: anterior, jugador: ORCO, guardado: guardado() });
  assert.deepEqual(marcasDe(viejo, clave), { m1: '', m2: 'actual', m3: '' });
  const { lua } = convertir([{ ruta: 'p.lua', texto: rxp }], { anterior });
  const nuevo = nuevaMaquina({ previo: lua, jugador: ORCO, guardado: guardado() });
  assert.deepEqual(marcasDe(nuevo, clave), { m1: '', m2: 'actual', m3: '' }, 'el paso del mago no sale y el común sigue siendo m2');
  sinErrores(nuevo);
});

// Ronda 4: lo que quedaba del paso del progreso a la clave nueva.
test('misguias: «nombre_antes» pasa también el «Cómo llegar» cerrado (viajeCerrado) a la guía nueva', () => {
  const m = nuevaMaquina({
    previo: CON_NOMBRE_ANTES,
    jugador: CAZADOR_HUMANO,
    guardado: { SnetForeverPJ: { guia: VIEJA, progreso: { [VIEJA]: { id: 'm2' } }, viajeCerrado: { guia: VIEJA, paso: 'm2', destino: 'x' } } },
  });
  assert.equal(m.lua('SnetForeverPJ.viajeCerrado.guia'), NUEVA);
  assert.equal(m.lua('SnetForeverPJ.viajeCerrado.paso'), 'm2');
  sinErrores(m);
});

test('misguias: una guía nueva con un progreso sin paso y con las marcas vacías (lo crea el addon viejo) cuenta como vacía', () => {
  const vacias = { pegajosos: {}, manuales: {}, forzados: {}, llegados: {}, alcanzados: {} };
  const m = nuevaMaquina({
    previo: CON_NOMBRE_ANTES,
    jugador: CAZADOR_HUMANO,
    guardado: { SnetForeverPJ: { guia: VIEJA, progreso: { [VIEJA]: { id: 'm3' }, [NUEVA]: vacias } } },
  });
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(NUEVA)}].id`), 'm3');
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(VIEJA)}]`), undefined);
  assert.equal(m.lua('SnetForeverPJ.guia'), NUEVA);
  // Con una marca de verdad en la nueva, ya no se toca nada.
  const conMarca = nuevaMaquina({
    previo: CON_NOMBRE_ANTES,
    jugador: CAZADOR_HUMANO,
    guardado: { SnetForeverPJ: { guia: VIEJA, progreso: { [VIEJA]: { id: 'm3' }, [NUEVA]: { ...vacias, manuales: { m1: { [1]: true } } } } } },
  });
  assert.equal(conMarca.lua(`SnetForeverPJ.progreso[${aLua(VIEJA)}].id`), 'm3');
  sinErrores(m);
  sinErrores(conMarca);
});

test('misguias: «nombre_antes» igual a su propio nombre no hace nada', () => {
  const clave = 'Mis guías\\[A] Igual';
  const m = nuevaMaquina({
    previo: `SnetForeverMisGuias = {
  {nombre = "[A] Igual", nombre_antes = "[A] Igual", faccion = "Alianza", pasos = {{id = "m1", aceptar = 4641}, {id = "m2", aceptar = 788}}},
}`,
    jugador: HUMANO,
    guardado: { SnetForeverPJ: { guia: clave, progreso: { [clave]: { id: 'm2' } } } },
  });
  assert.equal(m.lua('SnetForeverPJ.guia'), clave);
  assert.equal(m.lua(`SnetForeverPJ.progreso[${aLua(clave)}].id`), 'm2');
  assert.deepEqual(m.lua('SnetForever.MisGuias.avisos()'), []);
  sinErrores(m);
});
