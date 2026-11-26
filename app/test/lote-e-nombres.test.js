// Lote E2: la IA nombra las misiones como salen en el registro del jugador (el título que da el cliente, en su idioma) y
// no enseña ids. contexto.mjs (nombre de cada misión: registro, si no el «es» de la base, si no el «en»), respuesta.mjs
// (quita el id que se cuela entre paréntesis detrás de un nombre de misión conocido) y sistema.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarBase } from '../src/base/base.mjs';
import { prepararTurno } from '../src/contexto.mjs';
import { procesarRespuesta, renderizar } from '../src/respuesta.mjs';
import { SISTEMA, construirEntrada } from '../src/prompt.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const carpeta = mkdtempSync(join(tmpdir(), 'snf-lote-e-'));
copyFileSync(join(FIXTURES, 'misiones-app.lua'), join(carpeta, 'misiones-app.lua'));
// 95981: una misión propia de Forever, sin nombre «es» en la base (en el juego del jugador se llama «Caminos vigilados»).
writeFileSync(join(carpeta, 'extra.lua'), 'local Q = SNF_MISIONES.quest\nQ[95981]={name="Watching the Roads",startedBy={{10176}},finishedBy={{10176}},requiredLevel=20,questLevel=22,'
  + 'requiredRaces=0,requiredClasses=0,objectivesText={},objectives={},sourceItemId=0,zoneOrSort=130,nextQuestInChain=0,questFlags=0,specialFlags=0,parentQuest=0}\n');
writeFileSync(join(carpeta, 'app.toc'), ['## Interface: 16001', '', 'misiones-app.lua', 'extra.lua', ''].join('\n'));
const base = cargarBase(carpeta);

function mensaje(registro, texto = '¿Qué hago ahora?') {
  return {
    v: 1, id: 'a3f1-9', pj: 'Tal Cual-Reino Prueba', idioma: 'es', modelo: 'haiku', texto,
    ctx: {
      pj: { nivel: 22, clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde' },
      lugar: { mapa: 1421, zona: 'Bosque de Argénteos', instancia: false },
      registro,
    },
  };
}

const REGISTRO = [
  { q: 95981, c: 0, o: [[0, 1]], t: 'Caminos vigilados' },
  { q: 4641, c: 0, o: [] },
  { q: 792, c: 0, o: [[0, 5]] },
];

test('E2: el nombre de una misión del registro es el título que da el cliente; si no, el «es» de la base; si no, el «en»', () => {
  const t = prepararTurno(base, mensaje(REGISTRO));
  const nombre = (q) => t.datos.registro.find((r) => r.q === q).nombre;
  assert.equal(nombre(95981), 'Caminos vigilados');
  assert.equal(nombre(4641), 'Tu lugar en el mundo', 'sin título del registro, el «es» de la base');
  assert.equal(nombre(792), 'Mineral fino para la forja', 'sin título del registro, el «es» de la base');
  // La entrada que recibe la IA lleva ese nombre; el inglés de la base solo va aparte, en nombreEn (13-nov: para cruzarlo
  // con las guías de internet, que están en inglés).
  const entrada = construirEntrada({ datos: t.datos, historial: [], texto: 'hola' });
  assert.ok(entrada.includes('"nombre":"Caminos vigilados"'));
  assert.equal(entrada.split('Watching the Roads').length - 1, entrada.split('"nombreEn":"Watching the Roads"').length - 1);
});

test('E2: un título vacío, raro o demasiado largo no se usa (sin «es» en la base, el «en»)', () => {
  const t = prepararTurno(base, mensaje([
    { q: 95981, c: 0, o: [], t: '' },
    { q: 4641, c: 0, o: [], t: 12 },
    { q: 792, c: 0, o: [], t: 'x'.repeat(300) },
  ]));
  const nombre = (q) => t.datos.registro.find((r) => r.q === q).nombre;
  assert.equal(nombre(95981), 'Watching the Roads');
  assert.equal(nombre(4641), 'Tu lugar en el mundo');
  assert.equal(nombre(792).length <= 100, true);
});

test('E2: «Watching the Roads (95981)» se pinta como «Caminos vigilados», sin el id; los otros ids de misión, fuera', () => {
  const t = prepararTurno(base, mensaje(REGISTRO));
  const r = procesarRespuesta('Te queda pendiente aquí, en este orden:\n- **Watching the Roads (95981)**: habla con el explorador.\n'
    + '- Tu lugar en el mundo (4641), y después «Mineral fino para la forja» (792).', t, 'es');
  assert.equal(r.texto, 'Te queda pendiente aquí, en este orden:\n- **Caminos vigilados**: habla con el explorador.\n'
    + '- Tu lugar en el mundo, y después «Mineral fino para la forja».');
  assert.ok(!renderizar(r.texto).includes('95981'));
});

test('E2: no se tocan otros números entre paréntesis ni ids que no van detrás de su misión', () => {
  const t = prepararTurno(base, mensaje(REGISTRO));
  const texto = 'Mata lobos (8) y recoge pieles (12). La misión 4641 (4641) sigue. Un id que no existe: Caminos vigilados (123456).';
  assert.equal(procesarRespuesta(texto, t, 'es').texto, texto);
  // Un nombre que no es el de ese id tampoco: no hay certeza.
  const otro = 'Tu lugar en el mundo (95981)';
  assert.equal(procesarRespuesta(otro, t, 'es').texto, otro);
});

test('E2: una misión de la base que no está en el turno también pierde su id detrás de su nombre', () => {
  const t = prepararTurno(base, mensaje([]));
  assert.equal(procesarRespuesta('Haz Watching the Roads (95981).', t, 'es').texto, 'Haz Watching the Roads.');
});

test('E2: sistema.md pide los nombres del registro y nada de ids en el texto para el jugador', () => {
  for (const frase of ['así se llaman en el registro del jugador', 'No escribas ids', 'solo van en el bloque `snet`']) {
    assert.ok(SISTEMA.includes(frase), `falta «${frase}»`);
  }
});
