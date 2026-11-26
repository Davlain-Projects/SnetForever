// Tarea 15c: elección de motor (Claude Code o Codex) y despacho de la pregunta. Con stubs de `comprobar` y `preguntar`:
// nunca se lanza el claude ni el codex de verdad.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { elegirMotor, traducirModelo, preguntar, estadoMotor, neutralizarError } from '../src/motor.mjs';
import { textoMotor, textoSinMotor, textoError } from '../src/textos.mjs';

// El registro de la app (avisos de config.motor) va a una carpeta de prueba, nunca a la de datos de verdad.
const DATOS = mkdtempSync(join(tmpdir(), 'snf-motor-'));
const DATOS_ANTES = process.env.SNF_DATOS;
process.env.SNF_DATOS = DATOS;
after(() => {
  if (DATOS_ANTES === undefined) delete process.env.SNF_DATOS;
  else process.env.SNF_DATOS = DATOS_ANTES;
  rmSync(DATOS, { recursive: true, force: true });
});
const avisosMotor = () => {
  const ruta = join(DATOS, 'registro.log');
  return existsSync(ruta) ? readFileSync(ruta, 'utf8').split('\n').filter((l) => l.includes('config.motor')) : [];
};

const OK = { estado: 'ok' };
const NO_OK = ['sin_instalar', 'sin_sesion', 'pago_por_uso', 'desconocido'];
const est = (claude, codex) => ({ claude: { estado: claude }, codex: { estado: codex } });

// Módulos falsos: apuntan lo que reciben y contestan con la forma de resultado de claude.mjs / codex.mjs.
function falsos() {
  const llamadas = [];
  const modulo = (nombre) => ({
    preguntar: async (c, opciones) => {
      llamadas.push({ motor: nombre, c, opciones });
      return { ok: true, texto: `respuesta de ${nombre}`, ms: 5 };
    },
  });
  return { llamadas, modulos: { claude: modulo('claude'), codex: modulo('codex') }, programas: { claude: { ruta: 'c' }, codex: { ruta: 'x' } } };
}

test('auto: Claude si está ok; si no, Codex si está ok; si no, sin_motor', () => {
  assert.deepEqual(elegirMotor({ motor: 'auto' }, est('ok', 'ok')), { motor: 'claude', modelo: 'haiku', esfuerzo: null });
  assert.equal(elegirMotor({ motor: 'auto' }, est('ok', 'sin_sesion')).motor, 'claude');
  assert.equal(elegirMotor({ motor: 'auto' }, est('sin_sesion', 'ok')).motor, 'codex');
  const e = est('sin_instalar', 'pago_por_uso');
  assert.deepEqual(elegirMotor({ motor: 'auto' }, e), { error: 'sin_motor', estados: e });
});

test('motor ausente o no válido vale auto', () => {
  for (const motor of [undefined, null, '', 'otro', 5, {}]) {
    assert.equal(elegirMotor({ motor }, est('sin_sesion', 'ok')).motor, 'codex', String(motor));
    assert.equal(elegirMotor({ motor }, est('ok', 'ok')).motor, 'claude');
  }
  assert.equal(elegirMotor(undefined, est('ok', 'ok')).motor, 'claude');
  assert.equal(elegirMotor(null, est('sin_sesion', 'ok')).motor, 'codex');
});

// Revisión final, Minor 8: un config.motor que no es auto|claude|codex cae a auto, pero lo dice en el registro (una vez).
test('un config.motor no válido registra un aviso una sola vez por valor; ausente o válido, ninguno', () => {
  const antes = avisosMotor().length;
  for (let k = 0; k < 3; k++) assert.equal(elegirMotor({ motor: 'Claude' }, est('ok', 'ok')).motor, 'claude');
  const tras = avisosMotor().slice(antes);
  assert.equal(tras.length, 1, tras.join(' / '));
  assert.match(tras[0], /\[aviso\] config\.motor no válido \("Claude"\): se usa «auto»/);
  for (const motor of [undefined, 'auto', 'claude', 'codex']) elegirMotor({ motor }, est('ok', 'ok'));
  elegirMotor(undefined, est('ok', 'ok'));
  assert.equal(avisosMotor().length - antes, 1, 'ausente o válido no avisa');
  elegirMotor({ motor: 'chatgpt' }, est('ok', 'ok'));
  elegirMotor({ motor: 'chatgpt' }, est('ok', 'ok'));
  assert.equal(avisosMotor().length - antes, 2, 'otro valor no válido, otro aviso (una vez)');
  elegirMotor({ motor: 'x'.repeat(500) }, est('ok', 'ok'));
  const largo = avisosMotor().at(-1);
  assert.ok(largo.length < 200, 'el valor se recorta en el registro');
});

test('claude forzado: solo si está ok; si no, error con su estado y nunca pasa a codex', () => {
  assert.equal(elegirMotor({ motor: 'claude' }, est('ok', 'ok')).motor, 'claude');
  for (const s of NO_OK) assert.deepEqual(elegirMotor({ motor: 'claude' }, est(s, 'ok')), { error: s, motor: 'claude' }, s);
});

test('codex forzado: solo si está ok; si no, error con su estado y nunca pasa a claude', () => {
  assert.equal(elegirMotor({ motor: 'codex' }, est('ok', 'ok')).motor, 'codex');
  for (const s of NO_OK) assert.deepEqual(elegirMotor({ motor: 'codex' }, est('ok', s)), { error: s, motor: 'codex' }, s);
});

test('seguridad: ningún estado que no sea exactamente ok elige motor', () => {
  const raros = ['OK', 'ok ', 'okay', '', undefined, null, true, 1, {}, 'limite'];
  for (const modo of ['auto', 'claude', 'codex']) {
    for (const s of [...NO_OK, ...raros]) {
      assert.ok(elegirMotor({ motor: modo }, est(s, s)).error, `${modo}/${String(s)}`);
    }
  }
  // estados que faltan o no son objetos
  assert.ok(elegirMotor({ motor: 'auto' }, {}).error);
  assert.ok(elegirMotor({ motor: 'auto' }, undefined).error);
  assert.ok(elegirMotor({ motor: 'auto' }, { claude: 'ok', codex: 'ok' }).error);
});

test('traducirModelo: haiku/sonnet/opus con Claude; rapido/listo con Codex (opus usa el listo); lo raro cae en el seguro', () => {
  assert.equal(traducirModelo('claude', 'haiku'), 'haiku');
  assert.equal(traducirModelo('claude', 'sonnet'), 'sonnet');
  assert.equal(traducirModelo('claude', 'opus'), 'opus');
  assert.equal(traducirModelo('codex', 'haiku'), 'rapido');
  assert.equal(traducirModelo('codex', 'sonnet'), 'listo');
  // Codex no tiene un tercer nivel: «El más capaz» usa el mejor que tiene, el listo.
  assert.equal(traducirModelo('codex', 'opus'), 'listo');
  for (const raro of ['fable', 'OPUS', 'opus ', 'gpt-5', '', undefined, null, 3, 'SONNET', 'listo', 'rapido', {}]) {
    assert.equal(traducirModelo('claude', raro), 'haiku', String(raro));
    assert.equal(traducirModelo('codex', raro), 'rapido', String(raro));
  }
});

test('elegirMotor lleva el modelo traducido a la elección', () => {
  assert.equal(elegirMotor({ motor: 'auto' }, est('ok', 'ok'), 'sonnet').modelo, 'sonnet');
  assert.equal(elegirMotor({ motor: 'auto' }, est('sin_sesion', 'ok'), 'sonnet').modelo, 'listo');
  assert.equal(elegirMotor({ motor: 'auto' }, est('ok', 'ok'), 'opus').modelo, 'opus');
  assert.equal(elegirMotor({ motor: 'auto' }, est('sin_sesion', 'ok'), 'opus').modelo, 'listo');
  assert.equal(elegirMotor({ motor: 'auto' }, est('sin_sesion', 'ok'), 'cualquiera').modelo, 'rapido');
});

test('preguntar con Claude: despacha a claude, con su modelo, y añade motor', async () => {
  const f = falsos();
  const r = await preguntar({ config: {}, estados: est('ok', 'ok'), iaModelo: 'sonnet', sistema: 'S', entrada: 'E', ...f });
  assert.deepEqual(r, { ok: true, texto: 'respuesta de claude', ms: 5, motor: 'claude' });
  assert.equal(f.llamadas.length, 1);
  assert.deepEqual(f.llamadas[0].c, { ruta: 'c' });
  assert.equal(f.llamadas[0].opciones.modelo, 'sonnet');
  assert.equal(f.llamadas[0].opciones.sistema, 'S');
  assert.equal(f.llamadas[0].opciones.entrada, 'E');
});

test('preguntar con Codex: modelo rapido/listo, config.codex pasada y motor en el resultado', async () => {
  const f = falsos();
  const config = { codex: { rapido: 'a', listo: 'b' } };
  const r = await preguntar({ config, estados: est('sin_sesion', 'ok'), iaModelo: 'sonnet', sistema: 'S', entrada: 'E', tiempoMax: 1234, ...f });
  assert.deepEqual(r, { ok: true, texto: 'respuesta de codex', ms: 5, motor: 'codex' });
  assert.equal(f.llamadas[0].motor, 'codex');
  assert.equal(f.llamadas[0].opciones.modelo, 'listo');
  assert.equal(f.llamadas[0].opciones.config, config);
  assert.equal(f.llamadas[0].opciones.tiempoMax, 1234);
  const g = falsos();
  await preguntar({ config, estados: est('sin_sesion', 'ok'), iaModelo: 'raro', sistema: 'S', entrada: 'E', ...g });
  assert.equal(g.llamadas[0].opciones.modelo, 'rapido');
});

test('tarea 14: las herramientas se le pasan a Claude y nunca a Codex', async () => {
  const herramientas = { mcpConfig: 'C:\\datos\\herramientas\\mcp.json', nombres: ['buscar_guias'] };
  const f = falsos();
  await preguntar({ config: {}, estados: est('ok', 'ok'), iaModelo: 'haiku', sistema: 'S', entrada: 'E', herramientas, ...f });
  assert.equal(f.llamadas[0].opciones.herramientas, herramientas);
  await preguntar({ config: { motor: 'codex' }, estados: est('ok', 'ok'), iaModelo: 'haiku', sistema: 'S', entrada: 'E', herramientas, ...f });
  assert.equal(f.llamadas[1].motor, 'codex');
  assert.ok(!('herramientas' in f.llamadas[1].opciones));
  // Sin herramientas pedidas, Claude tampoco las recibe (todo como antes).
  await preguntar({ config: {}, estados: est('ok', 'ok'), iaModelo: 'haiku', sistema: 'S', entrada: 'E', ...f });
  assert.ok(!('herramientas' in f.llamadas[2].opciones));
});

test('el campo motor también va en los errores del módulo', async () => {
  const f = falsos();
  f.modulos.claude.preguntar = async () => ({ ok: false, tipo: 'limite', detalle: 'x' });
  f.modulos.codex.preguntar = async () => ({ ok: false, tipo: 'tiempo', detalle: 'y' });
  assert.deepEqual(await preguntar({ config: {}, estados: est('ok', 'ok'), iaModelo: 'haiku', sistema: '', entrada: 'e', ...f }), { ok: false, tipo: 'limite', detalle: 'x', motor: 'claude' });
  assert.deepEqual(await preguntar({ config: { motor: 'codex' }, estados: est('ok', 'ok'), iaModelo: 'haiku', sistema: '', entrada: 'e', ...f }), { ok: false, tipo: 'tiempo', detalle: 'y', motor: 'codex' });
});

test('sin motor: devuelve el estado o sin_motor, con motor, y no lanza nada', async () => {
  for (const s of NO_OK) {
    const f = falsos();
    const r = await preguntar({ config: { motor: 'claude' }, estados: { claude: { estado: s, motivo: 'por qué' }, codex: OK }, iaModelo: 'haiku', sistema: '', entrada: 'e', ...f });
    assert.equal(r.ok, false);
    assert.equal(r.tipo, s);
    assert.equal(r.motor, 'claude');
    assert.equal(typeof r.detalle, 'string');
    assert.equal(f.llamadas.length, 0, `no debe preguntar con ${s}`);
  }
  const f = falsos();
  const r = await preguntar({ config: { motor: 'codex' }, estados: { claude: OK, codex: { estado: 'sin_sesion' } }, iaModelo: 'haiku', sistema: '', entrada: 'e', ...f });
  assert.equal(r.tipo, 'sin_sesion');
  assert.equal(r.motor, 'codex');
  assert.equal(f.llamadas.length, 0);
  const g = falsos();
  const a = await preguntar({ config: {}, estados: est('sin_instalar', 'pago_por_uso'), iaModelo: 'haiku', sistema: '', entrada: 'e', ...g });
  assert.deepEqual([a.ok, a.tipo, a.motor], [false, 'sin_motor', null]);
  assert.equal(g.llamadas.length, 0);
});

test('Codex: ninguna línea de la entrada empieza por ERROR:; con Claude la entrada no cambia', async () => {
  const entrada = 'ERROR: uno\nhola\r\nERROR: dos\n  ERROR: tres\nmedio ERROR: no\nERROR:';
  const f = falsos();
  await preguntar({ config: {}, estados: est('sin_sesion', 'ok'), iaModelo: 'haiku', sistema: 'ERROR: del sistema', entrada, ...f });
  const enviada = f.llamadas[0].opciones.entrada;
  assert.ok(!enviada.split(/\r?\n/).some((l) => l.startsWith('ERROR:')), enviada);
  assert.equal(enviada, ' ERROR: uno\nhola\r\n ERROR: dos\n  ERROR: tres\nmedio ERROR: no\n ERROR:');
  assert.ok(!f.llamadas[0].opciones.sistema.split(/\r?\n/).some((l) => l.startsWith('ERROR:')));
  const g = falsos();
  await preguntar({ config: {}, estados: est('ok', 'ok'), iaModelo: 'haiku', sistema: 'ERROR: s', entrada, ...g });
  assert.equal(g.llamadas[0].opciones.entrada, entrada);
  assert.equal(g.llamadas[0].opciones.sistema, 'ERROR: s');
  assert.equal(neutralizarError('a ERROR: b'), 'a  ERROR: b');
});

test('estadoMotor: el motor que se usaría y su texto, en es y en', () => {
  const a = estadoMotor({}, est('ok', 'ok'));
  assert.deepEqual(a, { motor: 'claude', estado: 'ok', texto: 'Motor: Claude' });
  assert.deepEqual(estadoMotor({}, est('sin_sesion', 'ok')), { motor: 'codex', estado: 'ok', texto: 'Motor: ChatGPT (Codex)' });
  assert.equal(estadoMotor({}, est('ok', 'ok'), 'en').texto, 'Engine: Claude');
  assert.equal(estadoMotor({}, est('sin_sesion', 'ok'), 'en').texto, 'Engine: ChatGPT (Codex)');
});

test('estadoMotor sin motor: «No hay ningún motor listo» con los dos estados; forzado reutiliza el texto P6', () => {
  const n = estadoMotor({}, est('sin_instalar', 'pago_por_uso'));
  assert.equal(n.motor, null);
  assert.equal(n.estado, 'sin_motor');
  assert.match(n.texto, /^No hay ningún motor listo: /);
  assert.equal(n.texto, textoSinMotor(est('sin_instalar', 'pago_por_uso'), 'es'));
  assert.match(estadoMotor({}, est('sin_sesion', 'desconocido'), 'en').texto, /^No engine is ready: /);
  const f = estadoMotor({ motor: 'codex' }, { claude: OK, codex: { estado: 'sin_sesion' } });
  assert.deepEqual(f, { motor: null, estado: 'sin_sesion', texto: textoError('sin_sesion', '', 'es', 'codex') });
  const d = estadoMotor({ motor: 'claude' }, { claude: { estado: 'desconocido', motivo: 'xyz' }, codex: OK }, 'en');
  assert.equal(d.texto, textoError('desconocido', 'xyz', 'en', 'claude'));
  assert.equal(textoMotor('claude', 'es'), 'Motor: Claude');
  assert.equal(textoMotor('codex', 'es'), 'Motor: ChatGPT (Codex)');
});

test('elegirMotor: un estado «ok» heredado por prototipo no cuenta', async () => {
  const { elegirMotor } = await import('../src/motor.mjs');
  const r = elegirMotor({ motor: 'auto' }, { claude: Object.create({ estado: 'ok' }), codex: Object.create({ estado: 'ok' }) });
  assert.equal(r.error, 'sin_motor');
});
