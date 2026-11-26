// El bloque `snet` del chat del juego admite `abrirGuia: {guia, desde?, hasta?}`: abrir tal cual una guía de la
// biblioteca (la expande el núcleo con guiaBiblioteca.mjs). Aquí solo la forma; si viene con `guiaNueva`, gana abrirGuia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesarRespuesta, direccionesWeb } from '../src/respuesta.mjs';

const turno = () => ({ puntos: new Map(), inventarioIds: new Set(), guias: new Map(), datos: {} });
const bloque = (json, prosa = 'Te abro tu guía.') => `${prosa}\n\`\`\`snet\n${JSON.stringify(json)}\n\`\`\``;
const GUIA_NUEVA = { titulo: 'X', pasos: [{ texto: 'a', web: { zona: 'Durotar', x: 1, y: 2, url: 'https://a.ejemplo.com/1' } }] };

test('abrirGuia con su forma pasa tal cual (solo guia, desde y hasta)', () => {
  const r = procesarRespuesta(bloque({ abrirGuia: { guia: '0123abcd', desde: 12, hasta: 40 } }), turno(), 'es');
  assert.deepEqual(r.abrirGuia, { guia: '0123abcd', desde: 12, hasta: 40 });
  assert.deepEqual(r.quitados, []);
  assert.equal(r.texto, 'Te abro tu guía.');
  assert.deepEqual(procesarRespuesta(bloque({ abrirGuia: { guia: '0123abcd' } }), turno(), 'es').abrirGuia, { guia: '0123abcd' });
});

test('abrirGuia que no vale: se quita y lo dice; ni pasos ni puntos de la IA pasan por ahí', () => {
  for (const malo of [{ guia: 'XYZ' }, { guia: '0123abcd', desde: 0 }, { guia: '0123abcd', pasos: [{ texto: 'x', punto: 'B:n1' }] }, 'abcd0123', [1]]) {
    const r = procesarRespuesta(bloque({ abrirGuia: malo }), turno(), 'es');
    assert.equal(r.abrirGuia, undefined, JSON.stringify(malo));
    assert.ok(r.quitados.includes('abrirGuia'), JSON.stringify(r.quitados));
    assert.ok(!r.quitados.some((q) => q.startsWith('campo:')), 'abrirGuia es un campo del bloque');
  }
});

test('con abrirGuia y guiaNueva a la vez gana abrirGuia: la guiaNueva ni se mira (ni sus páginas)', () => {
  const json = { abrirGuia: { guia: '0123abcd' }, guiaNueva: GUIA_NUEVA };
  const r = procesarRespuesta(bloque(json), turno(), 'es');
  assert.deepEqual(r.abrirGuia, { guia: '0123abcd' });
  assert.equal(r.guiaNueva, undefined);
  assert.ok(!r.quitados.includes('guiaNueva'));
  assert.deepEqual(direccionesWeb(bloque(json)), []);
  // también si el abrirGuia no vale: la regla es simple (si el bloque trae abrirGuia, la guiaNueva no cuenta)
  const malo = procesarRespuesta(bloque({ abrirGuia: { guia: 'x' }, guiaNueva: GUIA_NUEVA }), turno(), 'es');
  assert.equal(malo.guiaNueva, undefined);
  // sin abrirGuia, la guiaNueva de siempre
  assert.ok(procesarRespuesta(bloque({ guiaNueva: GUIA_NUEVA }), turno(), 'es').guiaNueva);
  assert.deepEqual(direccionesWeb(bloque({ guiaNueva: GUIA_NUEVA })), ['https://a.ejemplo.com/1']);
});

test('M2: con abrirGuia en el bloque (valga o no), la rutaZona del mismo bloque tampoco se mira', () => {
  for (const pedido of [{ guia: '0123abcd' }, { guia: '0123abcd', desde: '5' }]) {
    const r = procesarRespuesta(bloque({ abrirGuia: pedido, rutaZona: { zona: 'Durotar' } }), turno(), 'es');
    assert.equal(r.rutaZona, undefined, JSON.stringify(pedido));
  }
  assert.deepEqual(procesarRespuesta(bloque({ rutaZona: { zona: 'Durotar' } }), turno(), 'es').rutaZona, { zona: 'Durotar' });
});
