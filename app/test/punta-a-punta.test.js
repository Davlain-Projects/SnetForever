// Tarea 21: prueba de punta a punta sin el juego. El addon (en el banco, con fengari) y la app (el núcleo con la IA
// falsa) hablan de verdad: el addon pinta la mini franja en el chat, la app la lee (franjaComoImagen → recorte como el
// del ayudante de captura → crearLector → núcleo), pregunta al claude (o al codex) FALSO, escribe el buzón en las
// ranuras y toca los timbres, y el addon carga la ranura y enseña la respuesta.
//
// Todo en carpetas temporales: AddOns con SnetForever, las 20 ranuras y los timbres (prepararAddOns), los datos de la
// app (SNF_DATOS) y la «raíz del volumen» para la cuarentena. NUNCA se ejecutan el claude ni el codex de verdad.
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { sinErrores } from '../../tools/banco-wow/test/ayuda.js';
import { cargarBase } from '../src/base/base.mjs';
import { puntosDeMision } from '../src/base/puntos.mjs';
import { prepararAddOns } from '../src/instalacion.mjs';
import { crearTimbres } from '../src/timbres.mjs';
import { crearHistorial } from '../src/historial.mjs';
import { crearNucleo } from '../src/nucleo.mjs';
import { crearLector } from '../src/captura.mjs';
import { construirRutaZona } from '../src/rutaZona.mjs';
import { olvidarOpciones as olvidarClaude } from '../src/claude.mjs';
import { olvidarOpciones as olvidarCodex } from '../src/codex.mjs';
import { franjaComoImagen } from './ayuda/franja-banco.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FALSO_CLAUDE = { ruta: join(AQUI, 'falso-claude', 'claude.mjs'), tipo: 'node' };
const FALSO_CODEX = { ruta: join(AQUI, 'falso-codex', 'codex.mjs'), tipo: 'node' };
const RUTAS_MINI = join(AQUI, '..', '..', 'tools', 'banco-wow', 'fixtures', 'rutas-mini.lua');
const MISIONES_APP = join(AQUI, 'fixtures', 'misiones-app.lua');
const COPIA = { ...process.env };
const RAIZ = mkdtempSync(join(tmpdir(), 'snf-punta-'));
const VUELTAS = 60;

// La base de la app: la misma misiones-app.lua que carga el addon en el banco.
const carpetaBase = join(RAIZ, 'base');
mkdirSync(carpetaBase);
copyFileSync(MISIONES_APP, join(carpetaBase, 'misiones-app.lua'));
writeFileSync(join(carpetaBase, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', ''].join('\n'));
const BASE = cargarBase(carpetaBase);

const OK = { estado: 'ok' };
const NO = { estado: 'sin_instalar' };
const PJ_BANCO = { nivel: 5 }; // el jugador por defecto del banco es un orco guerrero en Durotar (1411)

let n = 0;
let montajes = [];
after(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, COPIA);
  rmSync(RAIZ, { recursive: true, force: true });
});
beforeEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in COPIA)) delete process.env[k];
  Object.assign(process.env, COPIA);
  olvidarClaude();
  olvidarCodex();
  montajes = [];
});
afterEach(async () => {
  for (const x of montajes) {
    await x.timbres.parar();
    x.m.cerrar();
  }
});

/**
 * Monta el juego (banco) y la app sobre una carpeta de AddOns de prueba.
 *   modo        FALSO_MODO de los falsos (ruta, basura…)
 *   estados     lo que dan los comprobar() inyectados ({claude, codex})
 *   sonido      false: PlaySoundFile da siempre false en el banco (sin timbres)
 *   inventario  ia.inventario activado, con lino (2589) y una poción (118) en las bolsas
 *   llenas      además, las bolsas 1-4 llenas de objetos distintos (un mensaje de varias partes)
 */
async function montar({ modo = 'ruta', estados = { claude: OK, codex: NO }, sonido, inventario = false, llenas = false } = {}) {
  n += 1;
  const dir = join(RAIZ, `t${n}`);
  const addons = join(dir, 'AddOns');
  mkdirSync(join(addons, 'SnetForever'), { recursive: true });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Interface: 16001\n## Title: SnetForever\n\nnucleo.lua\n');
  const raiz = join(dir, 'volumen');
  mkdirSync(raiz);
  const datos = join(dir, 'datos');
  // Con el juego cerrado: las ranuras y los timbres tienen que estar antes de «arrancar» el cliente.
  prepararAddOns(addons, { raizVolumen: raiz });

  process.env.SNF_DATOS = datos;
  process.env.FALSO_MODO = modo;
  process.env.FALSO_REGISTRO = join(dir, 'falso.json');
  // Una clave de API en el entorno de la app: el hijo no debe verla nunca.
  process.env.ANTHROPIC_API_KEY = 'sk-ant-clave-de-prueba';
  process.env.OPENAI_API_KEY = 'sk-clave-de-prueba';

  const m = crearMaquina({
    addonsDir: addons, codificacion: true, jugador: PJ_BANCO, datos: [RUTAS_MINI, MISIONES_APP],
    ...(sonido === false ? { sonido: false } : {}),
  });
  if (inventario) {
    m.itemInfo(2589, { nombre: 'Linen Cloth', calidad: 1, nivel: 5, precio: 13 });
    m.itemInfo(118, { nombre: 'Minor Healing Potion', calidad: 1, nivel: 1, precio: 5 });
    m.bolsa(0, 1, { id: 2589, n: 12 });
    m.bolsa(0, 2, { id: 118, n: 1 });
    m.lua('SnetForever.Ajustes.set("ia.inventario", true)');
  }
  if (llenas) {
    // Bolsas 1-4 llenas de objetos distintos con precios y niveles sin patrón: el cuerpo no cabe en una parte.
    let semilla = 12345;
    const azar = (max) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % max;
    };
    for (let b = 1; b <= 4; b++) {
      for (let h = 1; h <= 12; h++) {
        const id = 20000 + azar(30000);
        m.itemInfo(id, { nombre: `Objeto ${id}`, calidad: azar(5), nivel: 1 + azar(60), precio: azar(99999) });
        m.bolsa(b, h, { id, n: 1 + azar(20) });
      }
    }
  }

  // Los pulsos duermen en el tiempo del banco: el addon «oye» el timbre mientras falta.
  const timbres = crearTimbres(addons, {
    pulsoMs: { timbre: 600, recibido: 600, vivo: 600 },
    dormir: async (ms) => m.avanzar(ms / 1000),
    reloj: { cada: () => () => {} }, // la vida suena al empezar; el resto de pulsos de 10 s no hace falta aquí
    raizVolumen: raiz,
  });
  const nucleo = crearNucleo({
    base: Promise.resolve(BASE), addonsDir: addons, timbres, historial: crearHistorial(datos), datos,
    comprobar: { claude: async () => estados.claude, codex: async () => estados.codex },
    programas: { claude: FALSO_CLAUDE, codex: FALSO_CODEX }, raizVolumen: raiz, config: {},
  });
  // Como principal.mjs al arrancar: el estado en las 20 ranuras, sin timbre.
  await nucleo.publicarEstado();

  // El lector de la captura, con un núcleo que guarda la promesa de cada trama para poder esperarla.
  const promesas = [];
  const lector = crearLector({
    nucleo: {
      recibirTrama(bytes) {
        const p = nucleo.recibirTrama(bytes);
        promesas.push(p);
        return p;
      },
    },
  });
  const x = { m, dir, addons, datos, timbres, nucleo, lector, promesas, sonido };
  montajes.push(x);
  return x;
}

/**
 * Lo que manda el ayudante de captura: un recorte BGRA de ≈440 × 60 px alrededor de la franja, con x0/y0 (su origen en
 * el cliente). Sin franja en pantalla, un recorte de la esquina (no hay nada que leer).
 */
function recorte(m) {
  const img = franjaComoImagen(m);
  const ancho = 440;
  const alto = 60;
  const x0 = img.origen ? Math.max(0, Math.min(img.ancho - ancho, Math.round(img.origen.x) - 20)) : 0;
  const y0 = img.origen ? Math.max(0, Math.min(img.alto - alto, Math.round(img.origen.y) - 10)) : 0;
  const datos = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const o = ((y0 + y) * img.ancho + (x0 + x)) * 4;
      const d = (y * ancho + x) * 4;
      datos[d] = img.datos[o + 2];
      datos[d + 1] = img.datos[o + 1];
      datos[d + 2] = img.datos[o];
      datos[d + 3] = 255;
    }
  }
  return { ancho, alto, x0, y0, canales: 4, bgr: true, datos };
}

/** El bucle de la prueba: captura → lector → núcleo, con 0,25 s del banco por vuelta, hasta que `listo()` (≤ 60). */
async function bucle(x, listo) {
  for (let i = 0; i < VUELTAS; i++) {
    x.lector.alImagen(recorte(x.m));
    while (x.promesas.length > 0) await x.promesas.shift();
    if (listo()) return i;
    x.m.avanzar(0.25);
    await new Promise((r) => setImmediate(r));
  }
  assert.fail(`la respuesta no llegó en ${VUELTAS} vueltas (fase ${x.m.lua('SnetForever.Envio.estado().fase')})`);
}

const MC = 'SnetForever.Chat.marcos';
const sinColor = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '');
const lineas = (m) => (m.lua(`(function()
  local s, t = ${MC}.mensajes, {}
  for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
  return t
end)()`) || []).map(sinColor);
const fase = (m) => m.lua('SnetForever.Envio.estado().fase');
const respondido = (m) => () => fase(m) === 'libre' && lineas(m).some((l) => l.startsWith('IA:'));

// Abre el chat, envía `texto` y da vueltas hasta la respuesta. → {vueltas, total: partes del mensaje, segundos: tiempo del
// banco desde el envío}. Con sonido llega por los timbres antes del primer repaso (5 s); sin sonido, por los repasos.
async function preguntar(x, texto) {
  const { m } = x;
  m.lua('SnetForever.Chat.abrir()');
  assert.deepEqual(m.lua(`{SnetForever.Envio.enviar(${JSON.stringify(texto)})}`), [true]);
  assert.equal(fase(m), 'enviando');
  assert.equal(m.lua('SnetForever.Franja.visible()'), true);
  const t0 = m.lua('GetTime()');
  const total = m.lua('SnetForever.Envio.estado().detalle.total');
  const cargas = m.llamadas('C_AddOns.LoadAddOn').length;
  const vueltas = await bucle(x, respondido(m));
  const segundos = m.lua('GetTime()') - t0;
  assert.equal(m.lua('SnetForever.Franja.visible()'), false, 'la franja ya no se ve');
  // Una ranura por mensaje: el «recibido» va por su timbre, no por un buzón aparte.
  assert.equal(m.llamadas('C_AddOns.LoadAddOn').length, cargas + 1, 'una sola ranura cargada');
  if (x.sonido === false) assert.ok(segundos >= 5, `sin sonido llega por los repasos (${segundos} s)`);
  else assert.ok(segundos < 5, `con sonido llega por los timbres (${segundos} s)`);
  return { vueltas, total, segundos };
}

const loApuntado = (x) => JSON.parse(readFileSync(process.env.FALSO_REGISTRO, 'utf8'));
const tras = (argv, opcion) => argv[argv.indexOf(opcion) + 1];
const fueras = (x) => readdirSync(join(x.addons, 'SnetForever', 'senales')).filter((f) => f.endsWith('.fuera'));

// La tabla de puntos que vio la IA (sin coordenadas), sacada de la entrada que apuntó el falso.
function tablaDePuntos(stdin) {
  const m = [...stdin.matchAll(/<datos_juego id="([0-9a-f]+)">\n([\s\S]*?)\n<\/datos_juego id="\1">/g)].at(-1);
  return JSON.parse(m[2]).puntos || [];
}

async function terminar(x) {
  await x.nucleo.inactivo();
  await x.timbres.parar();
  assert.deepEqual(fueras(x), [], 'ningún timbre se queda en .fuera');
  sinErrores(x.m);
}

// ---------------------------------------------------------------------------------------------------------------
// El camino entero
// ---------------------------------------------------------------------------------------------------------------

// T3 (S2): con una guía cargada, solo una ruta pedida (o «dónde entrego», ronda 1: I1) sale como ruta; si no, pines.
test('«¿Dónde entrego Tu lugar en el mundo?»: IA y propuesta en el chat; Aceptar pone P2 y P1 con las coordenadas de la base', async () => {
  const x = await montar();
  const { m } = x;
  await preguntar(x, '¿Dónde entrego Tu lugar en el mundo?');

  const ls = lineas(m);
  assert.ok(ls.some((l) => l.startsWith('IA:') && l.includes('Primero ve al segundo punto')), ls.join('\n'));
  assert.ok(!ls.some((l) => l.includes('```')), 'el bloque snet no llega al chat');
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), true);
  assert.match(m.lua(`${MC}.propuesta.texto:GetText()`), /ruta de 2 paradas/);

  // Lo que vio y usó el falso: el modelo rápido (haiku) y ninguna clave de API.
  const apuntado = loApuntado(x);
  assert.equal(tras(apuntado.argv, '--model'), 'haiku');
  assert.equal(apuntado.env.ANTHROPIC_API_KEY, undefined);
  assert.ok(!Object.keys(apuntado.env).some((k) => /^ANTHROPIC_/.test(k)), Object.keys(apuntado.env).join(', '));
  const tabla = tablaDePuntos(apuntado.stdin);
  assert.ok(tabla.length >= 2, JSON.stringify(tabla));
  assert.ok(tabla.every((p) => p.x === undefined && p.y === undefined && p.mapa === undefined), 'la IA no ve coordenadas');

  m.lua(`${MC}.propuesta.aceptar:Click()`);
  const puntos = m.lua('SnetForever.Capa.puntos("ia")');
  assert.equal(puntos.length, 2);
  // En el orden de la IA (P2 y luego P1) y en el sitio que da la base para esa misión y ese papel.
  const pj = { faccion: 'Horde', clase: 'WARRIOR' };
  ['P2', 'P1'].forEach((id, i) => {
    const fila = tabla.find((p) => p.id === id);
    const sitio = puntosDeMision(BASE, fila.q, pj, 'es', 1411).find((s) => s.papel === fila.papel);
    assert.ok(sitio, `${id}: la base tiene sitio`);
    assert.equal(puntos[i].q, fila.q);
    assert.equal(puntos[i].mapa, sitio.mapa, `${id}: mapa`);
    assert.equal(puntos[i].x, sitio.x, `${id}: x`);
    assert.equal(puntos[i].y, sitio.y, `${id}: y`);
    // Lote F: son pines numerados (sin `seguir`); la flecha sigue la guía de la ruta, con un paso por parada.
    assert.equal(puntos[i].seguir === true, false);
  });
  assert.match(m.lua('SnetForever.Motor.estado().clave'), /^IA\\Paradas /);
  assert.equal(m.lua('#SnetForever.Datos.guia(SnetForever.Motor.estado().clave).pasos'), 2);
  const destino = m.lua('SnetForever.Navegacion.destino().punto');
  assert.equal(destino.origen, 'guia');
  assert.equal(destino.orden, 1);
  assert.deepEqual([destino.mapa, destino.x, destino.y], [puntos[0].mapa, puntos[0].x, puntos[0].y]);
  await terminar(x);
});

// Ronda 1 (M9): la misma respuesta de la IA, con la guía del addon cargada y un mensaje que no pide ruta: pines, sin guía de
// la ruta, y el texto dice que no cambia su guía.
test('«¿Qué me falta de Tu lugar en el mundo?» con la guía cargada: la ruta de la IA llega como pines y la guía no cambia', async () => {
  const x = await montar();
  const { m } = x;
  const antes = m.lua('SnetForever.Motor.estado().clave');
  await preguntar(x, '¿Qué me falta de Tu lugar en el mundo?');
  assert.match(m.lua(`${MC}.propuesta.texto:GetText()`), /2 pines/);
  assert.ok(lineas(m).some((l) => l.includes('sin cambiar tu guía')), lineas(m).join('\n'));
  m.lua(`${MC}.propuesta.aceptar:Click()`);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), antes, 'la guía cargada sigue mandando');
  await terminar(x);
});

// Contrato con el addon (mapa/dibujos.lua): los dibujos del bloque snet llegan al juego con las coordenadas de la base, se
// ponen sin pedir aceptar y el chat lo dice.
test('«Dibújame Tu lugar en el mundo»: la flecha y el círculo de la zona llegan al mapa con las coordenadas de la base', async () => {
  const x = await montar();
  const { m } = x;
  await preguntar(x, 'Dibújame dónde está Tu lugar en el mundo');
  const ls = lineas(m);
  assert.ok(ls.some((l) => l.startsWith('IA:') && l.includes('Te lo dibujo en el mapa')), ls.join('\n'));
  assert.ok(!ls.some((l) => l.includes('```')), 'el bloque snet no llega al chat');
  assert.ok(ls.some((l) => l.includes('Dibujado en el mapa: 2 trazo(s)') && l.includes('Por aquí')), ls.join('\n'));
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), false, 'sin pedir aceptar');
  assert.equal(m.lua('SnetForever.Dibujos.cuantos()'), 2);

  const tabla = tablaDePuntos(loApuntado(x).stdin);
  assert.ok(tabla.every((p) => p.x === undefined && p.sitios === undefined), 'la IA no ve coordenadas ni sitios');
  const objetivo = tabla.find((p) => p.papel === 'objetivo');
  const pj = { faccion: 'Horde', clase: 'WARRIOR' };
  const base = puntosDeMision(BASE, objetivo.q, pj, 'es', 1411, { conObjetivo: true, conSitios: true });
  const recoger = base.find((p) => p.papel === 'recoger');
  const zona = base.find((p) => p.papel === 'objetivo');
  assert.ok(zona.sitios.length >= 2, 'el objetivo tiene varios sitios en la base');
  const trazos = Object.values(m.lua('SnetForeverPJ.dibujos.porMapa[1411]') ?? {}).sort((a, b) => a.orden - b.orden);
  assert.equal(trazos.length, 2);
  const [flecha, circulo] = trazos;
  assert.equal(flecha.tipo, 'flecha');
  assert.equal(flecha.tinta, 2);
  assert.equal(flecha.texto, 'Por aquí');
  assert.deepEqual(Object.values(flecha.puntos), [recoger.x, recoger.y, zona.x, zona.y]);
  assert.equal(circulo.tipo, 'circulo');
  assert.equal(circulo.tinta, 5);
  const cx = zona.sitios.reduce((s, [sx]) => s + sx, 0) / zona.sitios.length;
  const cy = zona.sitios.reduce((s, [, sy]) => s + sy, 0) / zona.sitios.length;
  assert.deepEqual(Object.values(circulo.puntos), [Math.round(cx * 100) / 100, Math.round(cy * 100) / 100]);
  const lejos = Math.max(...zona.sitios.map(([sx, sy]) => Math.hypot(sx - cx, sy - cy)));
  assert.ok(circulo.radio > lejos && circulo.radio <= lejos + 1.1, `radio ${circulo.radio} (el sitio más lejano a ${lejos})`);
  await terminar(x);
});

test('con ia.inventario, «¿qué vendo?» marca el lino (2589) para vender y su tooltip lleva la línea', async () => {
  const x = await montar({ inventario: true });
  const { m } = x;
  await preguntar(x, '¿qué vendo?');
  assert.ok(loApuntado(x).stdin.includes('"id":2589'), 'el inventario llegó a la IA');
  assert.equal(m.lua('SnetForever.Marcas.de(2589)'), 'vender');
  assert.equal(m.lua('SnetForever.Marcas.de(118)'), undefined);
  const vender = m.lua('SnetForever.L.t("MARCA_VENDER")');
  // Con el comercio cargado, el tooltip lleva además nuestras secciones (Task 20d): importa que el nombre vaya primero, que la
  // línea de la IA salga una sola vez, justo después del nombre y antes que las de comercio.
  const lineasTooltip = m.tooltipObjeto(2589);
  assert.equal(lineasTooltip[0], 'Linen Cloth');
  assert.equal(lineasTooltip[1], `|cFFFFD040${vender}|r`, 'la línea de la IA va justo después del nombre');
  assert.equal(lineasTooltip.filter((l) => l.includes(vender)).length, 1, 'y sale una sola vez');
  const titulo = 'SnetForever · Información general'; // T1b: el título del primer apartado
  assert.ok(lineasTooltip.includes(titulo), `nuestras secciones de comercio también salen: ${JSON.stringify(lineasTooltip)}`);
  assert.ok(lineasTooltip.indexOf(titulo) > 1, 'y van después de la marca');
  await terminar(x);
});

test('dos preguntas seguidas: cada una gasta su ranura (R001 y R002) y la segunda lleva el historial de la primera', async () => {
  const x = await montar();
  const { m } = x;
  await preguntar(x, '¿Dónde entrego Tu lugar en el mundo?');
  m.lua(`${MC}.propuesta.descartar:Click()`);
  await preguntar(x, '¿Y después qué hago?');
  assert.deepEqual(m.llamadas('C_AddOns.LoadAddOn').map((a) => a[0]), ['SnetForever_R001', 'SnetForever_R002']);
  const stdin = loApuntado(x).stdin;
  assert.ok(stdin.includes('Jugador: ¿Dónde entrego Tu lugar en el mundo?'), 'la primera pregunta va en el historial');
  assert.ok(stdin.includes('IA: Primero ve al segundo punto'), 'y su respuesta, sin el bloque');
  assert.equal(lineas(m).filter((l) => l.startsWith('IA:')).length, 2);
  await terminar(x);
});

test('vigilancia 3: sin sonido (sin timbres), la misma pregunta llega por los plazos', async () => {
  const x = await montar({ sonido: false });
  const { m } = x;
  await preguntar(x, '¿Dónde entrego Tu lugar en el mundo?');
  assert.ok(lineas(m).some((l) => l.startsWith('IA:') && l.includes('Primero ve al segundo punto')));
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), true);
  await terminar(x);
});

for (const sonido of [true, false]) {
  test(`un mensaje de varias partes se reúne por la captura (${sonido ? 'con' : 'sin'} sonido)`, async () => {
    const x = await montar({ inventario: true, llenas: true, sonido });
    const { m } = x;
    const { total } = await preguntar(x, '¿qué vendo?');
    assert.ok(total >= 2, `el mensaje va en ${total} partes`);
    assert.equal(m.lua('SnetForever.Marcas.de(2589)'), 'vender');
    assert.ok(loApuntado(x).stdin.includes('"id":2589'));
    await terminar(x);
  });
}

test('vigilancia 4: con el falso en «basura», el chat enseña el error «fallo» y la entrada queda activa', async () => {
  const x = await montar({ modo: 'basura' });
  const { m } = x;
  m.lua('SnetForever.Chat.abrir()');
  assert.deepEqual(m.lua('{SnetForever.Envio.enviar("hola")}'), [true]);
  await bucle(x, () => fase(m) === 'error');
  assert.equal(m.lua('SnetForever.Envio.estado().tipo'), 'fallo');
  const ls = lineas(m);
  assert.ok(ls.some((l) => l.includes('La IA no ha podido contestar')), ls.join('\n'));
  assert.equal(m.lua(`${MC}.entrada:IsEnabled()`), true);
  await terminar(x);
});

// ---------------------------------------------------------------------------------------------------------------
// Ruta de zona y motor Codex
// ---------------------------------------------------------------------------------------------------------------

// Sin misiones de Durotar a nivel 5 en la base del fixture, la ruta de zona no se puede probar.
const rutaDurotar = construirRutaZona(BASE, { zona: 1411 }, {
  datos: { personaje: { faccion: 'Horde', raza: 'Orc', clase: 'WARRIOR', nivel: 5 }, lugar: { mapa: 1411, zona: 'Durotar' }, registro: [] },
}, 'es');
const sinRutaZona = !rutaDurotar.guia && `la base del fixture no da ruta de Durotar (${rutaDurotar.texto})`;

test('ruta de zona: «quiero hacer todas las misiones de esta zona» → fila «La IA propone la ruta de…» y Abrir la abre como lateral', { skip: sinRutaZona }, async () => {
  const x = await montar();
  const { m } = x;
  await preguntar(x, 'quiero hacer todas las misiones de esta zona');
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), true);
  const texto = m.lua(`${MC}.rutaZona.texto:GetText()`);
  assert.match(texto, /^La IA propone la ruta de Durotar: /, texto);
  const clave = 'IA\\Ruta de Durotar (Horda)';
  assert.equal(m.lua('SnetForever.Ruta.guiaPendiente().clave'), clave);
  m.lua(`${MC}.rutaZona.abrir:Click()`);
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), false);
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), clave);
  assert.equal(m.lua('SnetForeverPJ.lateral'), clave);
  assert.equal(m.lua(`SnetForever.Guias.esLateral(${JSON.stringify(clave)})`), true);
  await terminar(x);
});

test('motor Codex: con Claude sin instalar y Codex ok, la respuesta llega igual y el buzón dice motor = ok y motorNombre = codex', async () => {
  const x = await montar({ estados: { claude: NO, codex: OK } });
  const { m } = x;
  await preguntar(x, '¿Dónde entrego Tu lugar en el mundo?');
  assert.ok(lineas(m).some((l) => l.startsWith('IA:') && l.includes('Primero ve al segundo punto')));
  assert.equal(m.lua(`${MC}.propuesta:IsVisible()`), true);
  const apuntado = loApuntado(x);
  assert.equal(apuntado.argv[0], 'exec', 'contestó el codex falso');
  assert.equal(apuntado.env.OPENAI_API_KEY, undefined);
  assert.equal(apuntado.env.ANTHROPIC_API_KEY, undefined);
  const estado = m.lua('SnetForever.Buzon.estadoApp()');
  assert.equal(estado.motor, 'ok');
  assert.equal(estado.motorNombre, 'codex');
  assert.equal(m.lua('SnetForeverPJ.ia.motor'), 'codex');
  await terminar(x);
});
