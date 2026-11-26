// Guías (motor/guias.lua) y avisos de clase (motor/avisos.lua), tarea 12: guía por defecto, cambio de guía y de
// versión (normal / con mazmorras), guías disponibles y avisos de cadenas de clase por nivel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const FIXTURES = join(AQUI, '..', 'fixtures');
const RUTAS = join(FIXTURES, 'rutas-mini.lua');
const MISIONES = join(FIXTURES, 'misiones-mini.lua');
const AVISOS = join(FIXTURES, 'avisos-mini.lua');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');

const INICIO = 'Prueba (H)\\01-02 Inicio';
const INICIO_MAZMORRAS = 'Prueba (H) Mazmorras\\01-02 Inicio';
const SIGUE = 'Prueba (H)\\02-03 Sigue';
const ELWYNN = 'Prueba (A)\\01-03 Elwynn';
const SKYBORNE = 'Prueba\\01-03 Skyborne';
const CIELONATO = 'Prueba (A)\\01-09 Cielonato';

const ORCO = { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', nivel: 1 };
const HUMANO = { raza: 'Human', clase: 'WARRIOR', faccion: 'Alliance', nivel: 1 };

// Máquina con los datos mini y los avisos mini; `jugador` cambia al personaje de por defecto (un orco guerrero).
const conAvisos = (jugador = {}) =>
  nuevaMaquina({ datos: [RUTAS, MISIONES, AVISOS], jugador });

const porDefecto = (m, pj, version) =>
  m.lua(`SnetForever.Guias.porDefecto(${aLua(pj)}${version ? `, ${aLua(version)}` : ''})`);
const cargarGuia = (m, clave, opciones) =>
  m.lua(`SnetForever.Guias.cargar(${aLua(clave)}${opciones ? `, ${aLua(opciones)}` : ''})`);
const estado = (m) => m.lua('SnetForever.Motor.estado()');
const pjGuardado = (m) => m.lua('SnetForeverPJ');

// Cuenta los mensajes internos `evento` y guarda el último argumento.
function contar(m, evento) {
  m.lua(`CUENTA_${evento} = {n = 0}
  SnetForever.Eventos.escuchar("${evento}", function(a) CUENTA_${evento}.n = CUENTA_${evento}.n + 1; CUENTA_${evento}.ultimo = a end)`);
  return () => m.lua(`CUENTA_${evento}`);
}

// ---------------------------------------------------------------------------------------------------
// faccionDe
// ---------------------------------------------------------------------------------------------------

test('faccionDe: el campo manda; sin campo ni variantes se deduce del grupo; con variantes, nunca', () => {
  const m = nuevaMaquina();
  const f = (guia) => m.lua(`SnetForever.Guias.faccionDe(${aLua(guia)})`);
  assert.equal(f({ faccion: 'Horde', grupo: 'Prueba (A)' }), 'Horde');
  assert.equal(f({ grupo: 'Prueba (H) Mazmorras' }), 'Horde');
  assert.equal(f({ grupo: 'Prueba (A)' }), 'Alliance');
  assert.equal(f({ grupo: 'Prueba' }), undefined);
  assert.equal(f({ grupo: 'Prueba (A)', variantes: [{ clave: 'x', grupo: 'Prueba (A)' }] }), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// porDefecto
// ---------------------------------------------------------------------------------------------------

test('porDefecto: orco nivel 1 -> Inicio; un mago orco -> la misma (no la de AoE)', () => {
  const m = nuevaMaquina();
  assert.equal(porDefecto(m, ORCO), INICIO);
  assert.equal(porDefecto(m, { ...ORCO, clase: 'MAGE' }), INICIO);
  sinErrores(m);
});

test('porDefecto: humano -> Elwynn; Skyborne de la Horda y de la Alianza -> la guía Skyborne', () => {
  const m = nuevaMaquina();
  assert.equal(porDefecto(m, HUMANO), ELWYNN);
  assert.equal(porDefecto(m, { raza: 'Skyborne', clase: 'WARRIOR', faccion: 'Horde', nivel: 1 }), SKYBORNE);
  assert.equal(porDefecto(m, { raza: 'Skyborne', clase: 'WARRIOR', faccion: 'Alliance', nivel: 1 }), SKYBORNE);
  sinErrores(m);
});

test('porDefecto: orco nivel 3 -> 02-03 Sigue (la que contiene su nivel antes que la que tiene porDefecto)', () => {
  const m = nuevaMaquina();
  assert.equal(porDefecto(m, { ...ORCO, nivel: 3 }), SIGUE);
  assert.equal(porDefecto(m, { ...ORCO, nivel: 2 }), INICIO);
  sinErrores(m);
});

test('porDefecto (vigilancia 5): raza desconocida, nivel 60 o Skyborne neutral: nil sin error si no hay guía, la anterior si la hay', () => {
  const m = nuevaMaquina();
  assert.equal(porDefecto(m, { raza: 'Vulpera', clase: 'WARRIOR', faccion: 'Horde', nivel: 1 }), undefined);
  // Lote A: a nivel 60 ninguna guía lo contiene; la anterior más cercana de la Horda es Sigue (2-3), que no pide raza
  // (la misma que ya recibía a nivel 3, porque la contiene).
  assert.equal(porDefecto(m, { raza: 'Vulpera', clase: 'WARRIOR', faccion: 'Horde', nivel: 3 }), SIGUE);
  assert.equal(porDefecto(m, { raza: 'Vulpera', clase: 'WARRIOR', faccion: 'Horde', nivel: 60 }), SIGUE);
  // Lote A (52-I1): ninguna guía contiene el nivel 60, así que gana la anterior más cercana (Sigue, 2-3), no la de
  // nivel 1 por tener porDefecto.
  assert.equal(porDefecto(m, { ...ORCO, nivel: 60 }), SIGUE, 'sin guía que contenga el nivel, la anterior más cercana');
  // Skyborne neutral: no hay guía Skyborne con mazmorras, así que se busca entre las normales (lote A).
  assert.equal(porDefecto(m, { raza: 'Skyborne', clase: 'WARRIOR', faccion: 'Neutral', nivel: 1 }, 'mazmorras'), SKYBORNE);
  // Y con la versión normal, una guía cualquiera de las dos facciones, sin error.
  assert.equal(porDefecto(m, { raza: 'Skyborne', clase: 'WARRIOR', faccion: 'Neutral', nivel: 1 }), SKYBORNE);
  // Sin personaje a medias: campos que faltan.
  assert.equal(porDefecto(m, {}), undefined);
  sinErrores(m);
});

test('porDefecto: la versión mazmorras elige la guía de Mazmorras; sin argumento usa el ajuste «version»', () => {
  const m = nuevaMaquina();
  assert.equal(porDefecto(m, ORCO, 'mazmorras'), INICIO_MAZMORRAS);
  assert.equal(porDefecto(m, ORCO, 'normal'), INICIO);
  assert.equal(porDefecto(m, ORCO), INICIO);
  m.lua('SnetForever.Ajustes.set("version", "mazmorras")');
  assert.equal(porDefecto(m, ORCO), INICIO_MAZMORRAS);
  assert.equal(m.lua('SnetForever.Guias.porDefecto()'), INICIO_MAZMORRAS, 'sin personaje, el actual (un orco guerrero)');
  sinErrores(m);
});

test('porDefecto (lote A): con «mazmorras» y sin guía de mazmorras que contenga el nivel, la normal que lo contiene', () => {
  const m = nuevaMaquina();
  assert.equal(porDefecto(m, { ...ORCO, nivel: 2 }, 'mazmorras'), INICIO_MAZMORRAS, 'la de mazmorras manda si contiene el nivel');
  assert.equal(porDefecto(m, { ...ORCO, nivel: 3 }, 'mazmorras'), SIGUE, 'nivel 3: ninguna de mazmorras lo contiene');
  sinErrores(m);
});

test('porDefecto (lote A): en un hueco entre guías, la anterior más cercana de su raza y facción, no la de nivel 1', () => {
  const m = nuevaMaquina();
  m.ponerGuia(
    guiaDePrueba([{ elementos: [{ t: 'manual', texto: { en: 'x', es: 'x' } }] }], {
      clave: 'Prueba (H)\\06-08 Hueco',
      grupo: 'Prueba (H)',
      nombre: '06-08 Hueco',
      faccion: 'Horde',
      filtro: [['f:Horde']],
      niveles: [6, 8],
    }),
  );
  // Del 4 al 5 no hay guía: la anterior más cercana es Sigue (2-3), con o sin mazmorras.
  assert.equal(porDefecto(m, { ...ORCO, nivel: 4 }), SIGUE);
  assert.equal(porDefecto(m, { ...ORCO, nivel: 5 }, 'mazmorras'), SIGUE);
  assert.equal(porDefecto(m, { ...ORCO, nivel: 7 }), 'Prueba (H)\\06-08 Hueco');
  // Pasado el 8, la de 6-8; un humano no la recibe (es de la Horda): la suya, Elwynn (1-3).
  assert.equal(porDefecto(m, { ...ORCO, nivel: 20 }), 'Prueba (H)\\06-08 Hueco');
  assert.equal(porDefecto(m, { ...HUMANO, nivel: 20 }), ELWYNN);
  sinErrores(m);
});

test('porDefecto: las guías con porDefecto false (guías de otras clases) nunca son la elegida', () => {
  const m = nuevaMaquina();
  m.ponerGuia(
    guiaDePrueba([{ elementos: [{ t: 'manual', texto: { en: 'x', es: 'x' } }] }], {
      clave: 'Prueba (H)\\01-60 Nunca',
      grupo: 'Prueba (H)',
      nombre: '01-60 Nunca',
      faccion: 'Horde',
      niveles: [1, 60],
      porDefecto: false,
    }),
  );
  assert.equal(porDefecto(m, ORCO), INICIO);
  assert.equal(porDefecto(m, { ...ORCO, raza: 'Vulpera' }), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// cargar y volverPorDefecto
// ---------------------------------------------------------------------------------------------------

test('cargar: carga en el motor y apunta SnetForeverPJ.guia; una clave desconocida da false y no cambia nada', () => {
  const m = nuevaMaquina();
  assert.equal(cargarGuia(m, INICIO), true);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(pjGuardado(m).guia, INICIO);
  assert.equal(cargarGuia(m, 'No\\existe'), false);
  assert.equal(pjGuardado(m).guia, INICIO);
  assert.equal(estado(m).clave, INICIO);
  // Con una clave de variante se guarda la clave real.
  assert.equal(cargarGuia(m, 'Prueba (H)\\01-09 Cielonato'), true);
  assert.equal(pjGuardado(m).guia, CIELONATO);
  sinErrores(m);
});

test('cargar: la guía que carga el motor por su cuenta también queda como guía del personaje', () => {
  const m = nuevaMaquina();
  m.lua(`SnetForever.Motor.cargar(${aLua(SIGUE)})`);
  assert.equal(pjGuardado(m).guia, SIGUE);
  sinErrores(m);
});

test('volverPorDefecto: carga la guía de su raza', () => {
  const m = nuevaMaquina();
  cargarGuia(m, SIGUE);
  assert.equal(m.lua('SnetForever.Guias.volverPorDefecto()'), true);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(pjGuardado(m).guia, INICIO);
  const h = nuevaMaquina({ jugador: { raza: 'Human', faccion: 'Alliance' } });
  assert.equal(h.lua('SnetForever.Guias.volverPorDefecto()'), true);
  assert.equal(estado(h).clave, ELWYNN);
  const v = nuevaMaquina({ jugador: { raza: 'Vulpera' } });
  assert.equal(v.lua('SnetForever.Guias.volverPorDefecto()'), false);
  sinErrores(m);
  sinErrores(h);
  sinErrores(v);
});

// ---------------------------------------------------------------------------------------------------
// disponibles
// ---------------------------------------------------------------------------------------------------

const disponibles = (m, pj) => m.lua(`SnetForever.Guias.disponibles(${aLua(pj)})`);

test('disponibles: un orco no ve el grupo (A); los grupos van por nombre y las guías por niveles[1]', () => {
  const m = nuevaMaquina();
  const grupos = disponibles(m, ORCO);
  const nombres = grupos.map((g) => g.grupo);
  assert.deepEqual(nombres, ['Prueba', 'Prueba (H)', 'Prueba (H) Mazmorras']);
  assert.ok(!nombres.some((n) => n.includes('(A)')));
  const h = grupos.find((g) => g.grupo === 'Prueba (H)');
  // Inicio (1-2), la guía Skyborne de Cielonato con variante (H) (1-9) y Sigue (2-3).
  assert.deepEqual(h.claves, [INICIO, CIELONATO, SIGUE]);
  sinErrores(m);
});

test('disponibles: el filtro de la guía cuenta (la de AoE solo para magos) y la variante pone el grupo', () => {
  const m = nuevaMaquina();
  const magos = disponibles(m, { ...ORCO, clase: 'MAGE' }).map((g) => g.grupo);
  assert.ok(magos.includes('Prueba (H) Mago AoE'));
  const alianza = disponibles(m, HUMANO);
  assert.deepEqual(
    alianza.map((g) => g.grupo),
    ['Prueba', 'Prueba (A)'],
  );
  assert.deepEqual(alianza.find((g) => g.grupo === 'Prueba (A)').claves, [ELWYNN, CIELONATO]);
  sinErrores(m);
});

const delMenu = (m, version, pj) => m.lua(`SnetForever.Guias.delMenu(${aLua(version)}${pj ? `, ${aLua(pj)}` : ''})`);

test('delMenu (lote A): «normal» da solo las normales; «mazmorras», las suyas y las normales de los tramos sin mazmorras', () => {
  const m = nuevaMaquina();
  // Normal: los grupos de disponibles con sus guías normales (sin el de mazmorras).
  assert.deepEqual(delMenu(m, 'normal', ORCO), [
    { grupo: 'Prueba', claves: [SKYBORNE] },
    { grupo: 'Prueba (H)', claves: [INICIO, CIELONATO, SIGUE] },
  ]);
  // Con mazmorras: las de mazmorras llegan al nivel 2; las normales que pasan de ahí salen marcadas como normales.
  assert.deepEqual(delMenu(m, 'mazmorras', ORCO), [
    { grupo: 'Prueba', claves: [SKYBORNE], normal: true },
    { grupo: 'Prueba (H)', claves: [CIELONATO, SIGUE], normal: true },
    { grupo: 'Prueba (H) Mazmorras', claves: [INICIO_MAZMORRAS] },
  ]);
  // Un humano no tiene ninguna guía con mazmorras: con «mazmorras» ve todas sus normales (y no se queda sin menú).
  assert.deepEqual(delMenu(m, 'mazmorras', HUMANO), [
    { grupo: 'Prueba', claves: [SKYBORNE], normal: true },
    { grupo: 'Prueba (A)', claves: [ELWYNN, CIELONATO], normal: true },
  ]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// otraVersion, pasoEquivalente y cambiarVersion
// ---------------------------------------------------------------------------------------------------

const otraVersion = (m, clave) => m.lua(`SnetForever.Guias.otraVersion(${aLua(clave)})`);

test('otraVersion: funciona en los dos sentidos y es nil si no hay guía gemela', () => {
  const m = nuevaMaquina();
  assert.equal(otraVersion(m, INICIO), INICIO_MAZMORRAS);
  assert.equal(otraVersion(m, INICIO_MAZMORRAS), INICIO);
  assert.equal(otraVersion(m, ELWYNN), undefined);
  assert.equal(otraVersion(m, 'No\\existe'), undefined);
  sinErrores(m);
});

test('otraVersion: entre varias gemelas prefiere la que existe para el personaje y no es de AoE', () => {
  // La guía de AoE del mago tiene el mismo nombre y facción que Inicio: no se elige nunca.
  const mago = nuevaMaquina({ jugador: { clase: 'MAGE' } });
  assert.equal(otraVersion(mago, INICIO_MAZMORRAS), INICIO);
  const guerrero = nuevaMaquina();
  assert.equal(otraVersion(guerrero, INICIO_MAZMORRAS), INICIO);
  sinErrores(mago);
  sinErrores(guerrero);
});

const PASO_X = { t: 'nota', texto: { en: 'x', es: 'x' } };

test('pasoEquivalente: el n del primer paso con la misma firma (t con q, i y mapa); nil si no hay', () => {
  const m = nuevaMaquina();
  cargarGuia(m, INICIO);
  const eq = (i) =>
    m.lua(`SnetForever.Guias.pasoEquivalente(${aLua(INICIO_MAZMORRAS)}, SnetForever.Motor.paso(${i}))`);
  assert.equal(eq(1), 1);
  assert.equal(eq(3), 3);
  assert.equal(eq(4), 4);
  // Un paso de otra guía con una firma que no está en el destino.
  assert.equal(
    m.lua(`SnetForever.Guias.pasoEquivalente(${aLua(INICIO_MAZMORRAS)}, {datos = {elementos = {{t = "accept", q = 9999}}}})`),
    undefined,
  );
  assert.equal(m.lua(`SnetForever.Guias.pasoEquivalente(${aLua(INICIO_MAZMORRAS)}, {datos = {elementos = {}}})`), undefined);
  assert.equal(m.lua(`SnetForever.Guias.pasoEquivalente("No\\\\existe", SnetForever.Motor.paso(1))`), undefined);
  assert.equal(m.lua(`SnetForever.Guias.pasoEquivalente(${aLua(INICIO_MAZMORRAS)}, nil)`), undefined);
  sinErrores(m);
});

test('pasoEquivalente: la q y el mapa distinguen pasos con los mismos t', () => {
  const m = nuevaMaquina();
  const par = (q) => ({ elementos: [{ t: 'accept', q }, { t: 'goto', mapa: 1411, x: 1, y: 1 }] });
  m.ponerGuia(guiaDePrueba([par(1), par(2), par(3)], { clave: 'Prueba\\Firmas', grupo: 'Prueba', nombre: 'Firmas' }));
  const eq = (q, mapa = 1411) =>
    m.lua(
      `SnetForever.Guias.pasoEquivalente("Prueba\\\\Firmas", {datos = {elementos = {{t = "accept", q = ${q}}, {t = "goto", mapa = ${mapa}}}}})`,
    );
  assert.equal(eq(1), 1);
  assert.equal(eq(3), 3);
  assert.equal(eq(2, 1453), undefined);
  sinErrores(m);
});

test('cambiarVersion: en el paso 3 carga la otra guía en el paso de la misma firma y guarda «version»', () => {
  const m = nuevaMaquina();
  cargarGuia(m, INICIO);
  m.lua('SnetForever.Motor.irA(3)');
  assert.equal(estado(m).actual, 3);
  assert.equal(m.lua('SnetForever.Guias.cambiarVersion()'), true);
  assert.equal(estado(m).clave, INICIO_MAZMORRAS);
  assert.equal(estado(m).actual, 3);
  assert.equal(m.lua('SnetForever.Ajustes.get("version")'), 'mazmorras');
  assert.equal(pjGuardado(m).guia, INICIO_MAZMORRAS);
  // Y de vuelta.
  m.lua('SnetForever.Motor.irA(4)');
  assert.equal(m.lua('SnetForever.Guias.cambiarVersion()'), true);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(estado(m).actual, 4);
  assert.equal(m.lua('SnetForever.Ajustes.get("version")'), 'normal');
  sinErrores(m);
});

test('cambiarVersion: sin paso equivalente empieza en el paso 1; sin guía gemela o sin guía cargada da false', () => {
  const m = nuevaMaquina();
  const dif = (tipo, grupo, t) =>
    guiaDePrueba([{ elementos: [PASO_X] }, { elementos: [{ t }] }], {
      clave: `${grupo}\\01 Dif`,
      grupo,
      nombre: '01 Dif',
      faccion: 'Horde',
      tipo,
    });
  m.ponerGuia(dif('normal', 'Dif (H)', 'manual'));
  m.ponerGuia(dif('mazmorras', 'Dif (H) Mazmorras', 'nota'));
  cargarGuia(m, 'Dif (H)\\01 Dif');
  m.lua('SnetForever.Motor.irA(2)');
  assert.equal(estado(m).actual, 2);
  assert.equal(m.lua('SnetForever.Guias.cambiarVersion()'), true);
  assert.equal(estado(m).clave, 'Dif (H) Mazmorras\\01 Dif');
  // T1: empieza en el paso 1, pero ese solo tiene una nota (ya hecho): al cargar se pasa al 2.
  assert.equal(estado(m).actual, 2);
  // Elwynn no tiene gemela: no cambia nada.
  cargarGuia(m, ELWYNN);
  assert.equal(m.lua('SnetForever.Guias.cambiarVersion()'), false);
  assert.equal(estado(m).clave, ELWYNN);
  assert.equal(m.lua('SnetForever.Ajustes.get("version")'), 'mazmorras', 'el ajuste no se toca si no hay cambio');
  // Sin guía cargada y sin guía guardada.
  const vacia = nuevaMaquina({ entrar: false }); // sin entrar al mundo: el arranque aún no ha cargado la guía
  assert.equal(vacia.lua('SnetForever.Guias.cambiarVersion()'), false);
  sinErrores(m);
  sinErrores(vacia);
});

// ---------------------------------------------------------------------------------------------------
// Comprobación con los datos reales de la fase 1
// ---------------------------------------------------------------------------------------------------

const hayDatos = existsSync(TOC_RUTAS);
const opcionesReales = { skip: hayDatos ? false : 'no está addons/SnetForever_Rutas (la fase 1 no se ha generado)' };

// Combinaciones raza/clase del Classic (más las de Skyborne, que se prueban con las 9 clases en las dos facciones).
const CLASES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
const CLASSIC = {
  Human: ['Alliance', ['WARRIOR', 'PALADIN', 'ROGUE', 'PRIEST', 'MAGE', 'WARLOCK']],
  Dwarf: ['Alliance', ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST']],
  NightElf: ['Alliance', ['WARRIOR', 'HUNTER', 'ROGUE', 'PRIEST', 'DRUID']],
  Gnome: ['Alliance', ['WARRIOR', 'ROGUE', 'MAGE', 'WARLOCK']],
  Orc: ['Horde', ['WARRIOR', 'HUNTER', 'ROGUE', 'SHAMAN', 'WARLOCK']],
  Scourge: ['Horde', ['WARRIOR', 'ROGUE', 'PRIEST', 'MAGE', 'WARLOCK']],
  Tauren: ['Horde', ['WARRIOR', 'HUNTER', 'SHAMAN', 'DRUID']],
  Troll: ['Horde', ['WARRIOR', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE']],
};

function combinaciones() {
  const lista = [];
  for (const [raza, [faccion, clases]] of Object.entries(CLASSIC)) {
    for (const clase of clases) lista.push({ raza, clase, faccion, nivel: 1 });
  }
  for (const faccion of ['Horde', 'Alliance']) {
    for (const clase of CLASES) lista.push({ raza: 'Skyborne', clase, faccion, nivel: 1 });
  }
  return lista;
}

test('datos reales: cada raza/clase/facción tiene guía por defecto y aplica al personaje (en las dos versiones)', opcionesReales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  const fallos = [];
  for (const pj of combinaciones()) {
    const etiqueta = `${pj.raza} ${pj.clase} ${pj.faccion}`;
    for (const version of ['normal', 'mazmorras']) {
      const clave = porDefecto(m, pj, version);
      if (!clave) {
        fallos.push(`${etiqueta} (${version}): sin guía por defecto`);
        continue;
      }
      if (!m.lua(`SnetForever.Guias.existe(${aLua(clave)}, ${aLua(pj)})`)) {
        fallos.push(`${etiqueta} (${version}): ${clave} no aplica al personaje`);
      }
      const grupos = disponibles(m, pj);
      const grupo = grupos.find((g) => g.claves.includes(clave));
      if (!grupo) {
        fallos.push(`${etiqueta} (${version}): ${clave} no está en disponibles`);
      } else if (grupo.grupo.includes(pj.faccion === 'Horde' ? '(A)' : '(H)')) {
        fallos.push(`${etiqueta} (${version}): ${clave} sale en el grupo de la otra facción (${grupo.grupo})`);
      }
    }
  }
  assert.deepEqual(fallos, []);
  sinErrores(m);
});

test('datos reales: Skyborne de la Horda recibe la variante (H) y cazador y chamán tienen guía', opcionesReales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  for (const clase of ['HUNTER', 'SHAMAN', 'WARRIOR']) {
    const horda = { raza: 'Skyborne', clase, faccion: 'Horde', nivel: 1 };
    const clave = porDefecto(m, horda);
    assert.match(clave, /Zephras Isle$/, clase);
    const grupo = disponibles(m, horda).find((g) => g.claves.includes(clave));
    assert.match(grupo.grupo, /\(H\)/, `${clase}: el grupo de la variante de la Horda`);
    const alianza = { ...horda, faccion: 'Alliance' };
    assert.equal(porDefecto(m, alianza), clave, 'la misma guía para las dos facciones');
    assert.match(disponibles(m, alianza).find((g) => g.claves.includes(clave)).grupo, /\(A\)/);
  }
  sinErrores(m);
});

// Lote A (52-I1): raza × clase × nivel 1-60 × versión. La guía por defecto contiene el nivel (primero entre las de la
// versión pedida y luego entre las normales) o, si ninguna lo contiene, es la anterior más cercana. Nunca la de nivel 1
// para un nivel ≥ 10. El oráculo está escrito aparte, en Lua, con las mismas reglas de candidatas que la ventana: la
// guía existe para el personaje, no es de AoE y su porDefecto (si lo trae) le vale.
const ORACULO_POR_DEFECTO = `(function(pjs)
  local G, D, F = SnetForever.Guias, SnetForever.Datos, SnetForever.Filtros
  local fallos = {}
  local function aoe(g, pj)
    local v = G.variante(g, pj)
    return string.find(g.grupo or "", "AoE", 1, true) ~= nil or (v ~= nil and string.find(v.grupo or "", "AoE", 1, true) ~= nil)
  end
  for _, base in ipairs(pjs) do
    local candidatas = {}
    for _, c in ipairs(D.claves()) do
      local g = D.guia(c)
      if (g.tipo == "normal" or g.tipo == "mazmorras") and G.existe(c, base) and not aoe(g, base)
        and (g.porDefecto == nil or F.evaluar(g.porDefecto, base)) then
        candidatas[#candidatas + 1] = g
      end
    end
    for nivel = 1, 60 do
      local pj = {raza = base.raza, clase = base.clase, faccion = base.faccion, nivel = nivel}
      for _, version in ipairs({"normal", "mazmorras"}) do
        local etiqueta = base.raza .. " " .. base.clase .. " " .. string.format("%d", nivel) .. " " .. version
        local clave = G.porDefecto(pj, version)
        local g = clave and D.guia(clave)
        local hayDeLaVersion, hayNormal, previo = false, false, nil
        for _, c in ipairs(candidatas) do
          local mn, mx = G.niveles(c)
          if mn <= nivel and nivel <= mx then
            if c.tipo == version then hayDeLaVersion = true end
            if c.tipo == "normal" then hayNormal = true end
          elseif mx < nivel and (c.tipo == version or c.tipo == "normal") then
            previo = math.max(previo or 0, mx)
          end
        end
        if not g then
          fallos[#fallos + 1] = etiqueta .. ": sin guía"
        else
          local mn, mx = G.niveles(g)
          local contiene = mn <= nivel and nivel <= mx
          if hayDeLaVersion and not (contiene and g.tipo == version) then
            fallos[#fallos + 1] = etiqueta .. ": " .. clave .. " (hay una de la versión que contiene el nivel)"
          elseif not hayDeLaVersion and hayNormal and not (contiene and g.tipo == "normal") then
            fallos[#fallos + 1] = etiqueta .. ": " .. clave .. " (hay una normal que contiene el nivel)"
          elseif not hayDeLaVersion and not hayNormal and mx ~= previo then
            fallos[#fallos + 1] = etiqueta .. ": " .. clave .. " (no es la anterior más cercana)"
          elseif nivel >= 10 and mn <= 1 then
            fallos[#fallos + 1] = etiqueta .. ": " .. clave .. " (la de nivel 1)"
          end
        end
      end
    end
  end
  return fallos
end)`;

test('datos reales (lote A): la guía por defecto contiene el nivel o es la anterior más cercana, de 1 a 60 y en las dos versiones', opcionesReales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  const fallos = m.lua(`${ORACULO_POR_DEFECTO}(${aLua(combinaciones())})`) || [];
  assert.deepEqual(fallos, []);
  sinErrores(m);
});

test('datos reales (lote A): elfo de la noche de nivel 12-13 con la versión normal recibe la guía anterior más cercana, no 01-06', opcionesReales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  for (const nivel of [12, 13]) {
    const clave = porDefecto(m, { raza: 'NightElf', clase: 'WARRIOR', faccion: 'Alliance', nivel }, 'normal');
    assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(clave)}).niveles[2]`), 11, `${nivel}: ${clave}`);
  }
  sinErrores(m);
});

test('datos reales (lote A): con «mazmorras», un nivel 30 recibe una guía normal que contiene el 30 y la ve en el menú', opcionesReales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  for (const pj of [
    { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', nivel: 30 },
    { raza: 'Human', clase: 'MAGE', faccion: 'Alliance', nivel: 30 },
  ]) {
    const clave = porDefecto(m, pj, 'mazmorras');
    const g = m.lua(`SnetForever.Datos.guia(${aLua(clave)})`);
    assert.equal(g.tipo, 'normal', clave);
    assert.ok(g.niveles[0] <= 30 && 30 <= g.niveles[1], clave);
    const menu = delMenu(m, 'mazmorras', pj);
    const grupo = menu.find((x) => x.claves.includes(clave));
    assert.ok(grupo, `${clave} en el menú con mazmorras`);
    assert.equal(grupo.normal, true, 'marcada como normal');
  }
  sinErrores(m);
});

test('datos reales: cambiarVersion de la guía de inicio de un orco va a su gemela de mazmorras', opcionesReales, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  assert.equal(m.lua('SnetForever.Guias.volverPorDefecto()'), true);
  const normal = estado(m).clave;
  assert.equal(m.lua('SnetForever.Guias.cambiarVersion()'), true);
  const mazmorras = estado(m).clave;
  assert.notEqual(mazmorras, normal);
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(mazmorras)}).tipo`), 'mazmorras');
  assert.equal(m.lua('SnetForever.Guias.cambiarVersion()'), true);
  assert.equal(estado(m).clave, normal);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Avisos de cadenas de clase
// ---------------------------------------------------------------------------------------------------

const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 9 };
const cola = (m) => m.lua('SnetForever.Avisos.cola()');
const pendientes = (m) => m.lua('SnetForever.Avisos.pendientes()');

// Sube el nivel del jugador del banco y avisa con PLAYER_LEVEL_UP.
function subirA(m, nivel) {
  m.jugador({ nivel });
  m.disparar('PLAYER_LEVEL_UP', nivel);
}

test('avisos: sin SNF_RUTAS.avisos, PLAYER_LEVEL_UP no da error y la cola queda vacía', () => {
  const m = nuevaMaquina({ jugador: DRUIDA });
  assert.equal(m.lua('SNF_RUTAS.avisos'), undefined);
  subirA(m, 10);
  assert.deepEqual(cola(m), []);
  assert.deepEqual(pendientes(m), []);
  m.lua('SnetForever.Avisos.revisar(10)');
  assert.deepEqual(cola(m), []);
  sinErrores(m);
});

test('avisos: un druida que sube a 10 recibe 1 aviso (su clase y facción) y se emite SNF_AVISO', () => {
  const m = conAvisos(DRUIDA);
  const emitidos = contar(m, 'SNF_AVISO');
  assert.deepEqual(cola(m), [], 'a nivel 9 no toca nada');
  subirA(m, 10);
  const avisos = cola(m);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].id, 'druida-10-tormenta');
  assert.equal(avisos[0].texto.es, 'Cadena de druida: la tormenta de Claro de la Luna');
  assert.equal(emitidos().n, 1);
  assert.equal(emitidos().ultimo.id, 'druida-10-tormenta');
  // Un nuevo revisar no lo repite (ya está en la cola).
  m.lua('SnetForever.Avisos.revisar(10)');
  assert.equal(cola(m).length, 1);
  assert.equal(emitidos().n, 1);
  sinErrores(m);
});

test('avisos: la facción del aviso cuenta (un druida de la Alianza recibe también el suyo) y un guerrero no recibe ninguno', () => {
  const alianza = conAvisos({ ...DRUIDA, raza: 'NightElf', faccion: 'Alliance' });
  subirA(alianza, 10);
  assert.deepEqual(cola(alianza).map((a) => a.id), ['druida-10-tormenta', 'druida-10-alianza']);
  const guerrero = conAvisos({ clase: 'WARRIOR', nivel: 9 });
  subirA(guerrero, 10);
  subirA(guerrero, 25);
  assert.deepEqual(cola(guerrero), []);
  sinErrores(alianza);
  sinErrores(guerrero);
});

test('avisos: al entrar al mundo también se revisa con el nivel del personaje (y sube de golpe varios niveles)', () => {
  const m = conAvisos({ ...DRUIDA, nivel: 20 });
  // arrancar ya disparó PLAYER_ENTERING_WORLD con el druida de nivel 20.
  assert.deepEqual(cola(m).map((a) => a.id), ['druida-10-tormenta', 'druida-15-perdida', 'druida-20-sin-guia']);
  sinErrores(m);
});

test('avisos: masTarde lo pasa a pendientes, vacía la cola y un nuevo revisar no lo repite (tampoco tras recargar)', () => {
  const m = conAvisos(DRUIDA);
  subirA(m, 10);
  m.lua('SnetForever.Avisos.masTarde("druida-10-tormenta")');
  assert.deepEqual(cola(m), []);
  assert.deepEqual(pendientes(m).map((a) => a.id), ['druida-10-tormenta']);
  assert.equal(pjGuardado(m).avisos.vistos['druida-10-tormenta'], true);
  m.lua('SnetForever.Avisos.revisar(10)');
  assert.deepEqual(cola(m), []);
  // Dos veces «más tarde» no duplica.
  m.lua('SnetForever.Avisos.masTarde("druida-10-tormenta")');
  assert.equal(pendientes(m).length, 1);
  // Tras /reload, lo visto y lo pendiente se conservan y la cola no vuelve a llenarse con ello.
  sinErrores(m);
  const r = m.recargar();
  assert.deepEqual(cola(r), []);
  assert.deepEqual(pendientes(r).map((a) => a.id), ['druida-10-tormenta']);
  sinErrores(r);
});

test('avisos: con avisos.cadenas apagado, la cola queda vacía (y apagarlo después la vacía)', () => {
  const m = conAvisos(DRUIDA);
  m.lua('SnetForever.Ajustes.set("avisos.cadenas", false)');
  subirA(m, 10);
  assert.deepEqual(cola(m), []);
  m.lua('SnetForever.Ajustes.set("avisos.cadenas", true)');
  m.lua('SnetForever.Avisos.revisar(10)');
  assert.equal(cola(m).length, 1);
  m.lua('SnetForever.Ajustes.set("avisos.cadenas", false)');
  assert.deepEqual(cola(m), []);
  sinErrores(m);
});

test('avisos: ahora carga la guía del aviso, guarda volverA y marca visto; masTarde no carga nada', () => {
  const m = conAvisos(DRUIDA);
  cargarGuia(m, INICIO);
  subirA(m, 10);
  assert.equal(m.lua('SnetForever.Avisos.ahora("druida-10-tormenta")'), true);
  assert.equal(estado(m).clave, SIGUE);
  assert.equal(pjGuardado(m).guia, SIGUE);
  assert.equal(pjGuardado(m).volverA, INICIO);
  assert.deepEqual(cola(m), []);
  assert.equal(pjGuardado(m).avisos.vistos['druida-10-tormenta'], true);
  assert.equal(m.lua('SnetForever.Avisos.volverA()'), INICIO);
  sinErrores(m);
});

test('avisos: ahora desde pendientes lo saca de pendientes; la vuelta es una pila (T3, ronda 2): la lateral a medias encima de la principal', () => {
  const m = conAvisos({ ...DRUIDA, raza: 'NightElf', faccion: 'Alliance' });
  cargarGuia(m, CIELONATO);
  subirA(m, 10);
  m.lua('SnetForever.Avisos.masTarde("druida-10-tormenta")');
  assert.equal(estado(m).clave, CIELONATO, 'masTarde no carga');
  assert.equal(m.lua('SnetForever.Avisos.ahora("druida-10-tormenta")'), true);
  assert.deepEqual(pendientes(m), []);
  assert.equal(pjGuardado(m).volverA, CIELONATO);
  // Otro aviso desde la guía lateral a medias: la cima es esa lateral y la principal queda debajo.
  assert.equal(m.lua('SnetForever.Avisos.ahora("druida-10-alianza")'), true);
  assert.equal(estado(m).clave, ELWYNN);
  assert.equal(pjGuardado(m).volverA, SIGUE);
  assert.deepEqual(pjGuardado(m).vueltas, [CIELONATO]);
  // Volver a la cima la desapila: la siguiente, la principal, pasa a ser la de volver.
  assert.equal(m.lua('SnetForever.Avisos.volver()'), true);
  assert.equal(estado(m).clave, SIGUE);
  assert.equal(pjGuardado(m).volverA, CIELONATO);
  assert.equal(pjGuardado(m).vueltas, undefined);
  assert.equal(m.lua('SnetForever.Avisos.volver()'), true);
  assert.equal(estado(m).clave, CIELONATO);
  assert.equal(pjGuardado(m).volverA, undefined);
  sinErrores(m);
});

test('avisos: al acabar la guía lateral, el fin ofrece volver; volver carga la guía y cierra la vuelta', () => {
  const m = conAvisos(DRUIDA);
  cargarGuia(m, INICIO);
  subirA(m, 10);
  m.lua('SnetForever.Avisos.ahora("druida-10-tormenta")');
  assert.equal(m.lua('SnetForever.Avisos.ofrecerVuelta()'), undefined, 'aún no ha acabado');
  // Sigue (2 pasos, sin siguientes): se acaba.
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua('SnetForever.Motor.saltar(2)');
  assert.equal(estado(m).fin, true);
  assert.equal(m.lua('SnetForever.Avisos.ofrecerVuelta()'), INICIO);
  assert.equal(m.lua('SnetForever.Avisos.volver()'), true);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(pjGuardado(m).volverA, undefined);
  assert.equal(m.lua('SnetForever.Avisos.ofrecerVuelta()'), undefined);
  assert.equal(m.lua('SnetForever.Avisos.volver()'), false);
  sinErrores(m);
});

test('avisos: tieneGuia es falso para una guía inexistente o ausente; ahora sin guía solo lo marca visto', () => {
  const m = conAvisos({ ...DRUIDA, nivel: 20 });
  const tiene = (id) => m.lua(`SnetForever.Avisos.tieneGuia(SNF_RUTAS.avisos[${id}])`);
  assert.equal(tiene(1), true);
  assert.equal(tiene(3), false, 'guía inexistente');
  assert.equal(tiene(4), false, 'sin campo guia');
  assert.equal(m.lua('SnetForever.Avisos.tieneGuia("druida-10-tormenta")'), true, 'también por id');
  assert.equal(m.lua('SnetForever.Avisos.tieneGuia("no-existe")'), false);
  cargarGuia(m, INICIO);
  assert.equal(m.lua('SnetForever.Avisos.ahora("druida-15-perdida")'), false);
  assert.equal(estado(m).clave, INICIO, 'no cambia de guía');
  assert.equal(pjGuardado(m).volverA, undefined);
  assert.equal(pjGuardado(m).avisos.vistos['druida-15-perdida'], true);
  assert.ok(!cola(m).some((a) => a.id === 'druida-15-perdida'));
  assert.equal(m.lua('SnetForever.Avisos.ahora("no-existe")'), false);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Arreglos ronda 1
// ---------------------------------------------------------------------------------------------------

test('avisos: un cambio de guía a mano borra volverA; el aviso siguiente vuelve a la guía desde la que se atiende', () => {
  const casos = {
    cargar: (m) => cargarGuia(m, CIELONATO),
    // El motor carga la gemela de mazmorras por su cuenta (no es una carga a mano) y cambiarVersion vuelve a Inicio.
    cambiarVersion: (m) => {
      m.lua(`SnetForever.Motor.cargar(${aLua(INICIO_MAZMORRAS)})`);
      assert.equal(pjGuardado(m).volverA, INICIO);
      m.lua('SnetForever.Guias.cambiarVersion()');
    },
    volverPorDefecto: (m) => m.lua('SnetForever.Guias.volverPorDefecto()'),
  };
  for (const [nombre, manual] of Object.entries(casos)) {
    const m = conAvisos({ ...DRUIDA, raza: 'Human', faccion: 'Alliance', nivel: 9 });
    cargarGuia(m, INICIO);
    subirA(m, 10);
    m.lua('SnetForever.Avisos.ahora("druida-10-alianza")'); // X = Inicio -> lateral Elwynn
    assert.equal(pjGuardado(m).volverA, INICIO, nombre);
    manual(m);
    assert.equal(pjGuardado(m).volverA, undefined, `${nombre}: borra volverA`);
    const actualManual = estado(m).clave;
    m.lua('SnetForever.Avisos.ahora("druida-10-tormenta")');
    assert.equal(pjGuardado(m).volverA, actualManual, `${nombre}: vuelve a la guía desde la que se atendió`);
    sinErrores(m);
  }
});

test('disponibles: una variante sin grupo cae en el grupo de la guía', () => {
  const m = nuevaMaquina();
  m.ponerGuia(
    guiaDePrueba([{ elementos: [{ t: 'manual', texto: { en: 'x', es: 'x' } }] }], {
      clave: 'SinGrupo (H)\\01-02 V',
      grupo: 'SinGrupo (H)',
      nombre: '01-02 V',
      faccion: 'Horde',
      variantes: [{ clave: 'SinGrupo (H)\\01-02 V', titulo: { en: 'v', es: 'v' } }],
    }),
  );
  const g = disponibles(m, ORCO).find((x) => x.grupo === 'SinGrupo (H)');
  assert.deepEqual(g.claves, ['SinGrupo (H)\\01-02 V']);
  sinErrores(m);
});
