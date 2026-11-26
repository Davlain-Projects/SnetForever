// sistema.md (el chat de la IA del juego y el núcleo de TATI): una guía que está en la biblioteca va con `abrirGuia` en
// el bloque `snet` (la app la abre tal cual, sin que la IA copie sus pasos); `guiaNueva`, solo para las que arma la IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SISTEMA, SISTEMA_TATI } from '../src/prompt.mjs';
import { pedidoValido } from '../src/guiaBiblioteca.mjs';

const TEXTO = SISTEMA.replace(/\r\n/g, '\n');
const seccion = (titulo) => TEXTO.split(/^(?=## )/m).find((s) => s.startsWith(`## ${titulo}`)) ?? '';

test('sistema.md: la regla de abrirGuia, con su ejemplo válido; guiaNueva queda para las guías que arma la IA', () => {
  for (const frase of ['**Guías de la biblioteca con `abrirGuia`', 'no copies sus pasos', '`desde` y `hasta`', 'gana `abrirGuia`',
    'guías que armas tú', 'library guide', 'never copy its steps']) {
    assert.ok(TEXTO.includes(frase), `falta «${frase}»`);
  }
  const ejemplos = [...TEXTO.matchAll(/```snet\n([\s\S]*?)\n```/g)].map((m) => m[1]).filter((b) => b.includes('abrirGuia'));
  assert.equal(ejemplos.length, 1);
  assert.ok(pedidoValido(JSON.parse(ejemplos[0]).abrirGuia), ejemplos[0]);
  // la línea del bloque con los campos lo nombra
  assert.ok(TEXTO.split('\n').some((l) => l.startsWith('  - `abrirGuia`:')));
});

test('sistema.md: el ejemplo «creame una guía…» y la regla de buscar_guias ya no obligan a copiar pasos con leer_guia', () => {
  const herramientas = seccion('Herramientas de SnetForever');
  const ejemplo = herramientas.split('\n').find((l) => l.startsWith('- Ejemplo. Pregunta: «creame una guía'));
  assert.ok(ejemplo);
  assert.match(ejemplo, /`abrirGuia`/);
  assert.doesNotMatch(ejemplo, /Después, `leer_guia` de la que encaje\. Y solo entonces la respuesta, con `guiaNueva`/);
  const obligatorio = herramientas.split('\n').find((l) => l.includes('es OBLIGATORIO antes de contestar'));
  assert.match(obligatorio, /`abrirGuia`/);
  assert.doesNotMatch(obligatorio, /y contestas con sus pasos/);
  // TATI como cerebro también lo ve: va en el núcleo
  assert.ok(SISTEMA_TATI.includes('`abrirGuia`'));
});
