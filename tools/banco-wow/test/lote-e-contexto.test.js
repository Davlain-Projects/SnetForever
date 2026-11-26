// Lote E2: el contexto de la IA lleva el título de cada misión del registro tal como lo da el cliente (en el idioma del
// jugador), sin pasar el tope de 20.000 bytes. ia/contexto.lua y SNF.API.registroMisiones (nucleo/espacio.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const C = 'SnetForever.Contexto';
const porQ = (ctx, q) => ctx.registro.find((e) => e.q === q);

test('E2: cada misión del registro lleva `t`, el título del cliente («Caminos vigilados» para 95981)', () => {
  const m = nuevaMaquina({ jugador: { nivel: 22 } });
  m.nombreJuego('mision', 95981, 'Caminos vigilados');
  m.estadoMision(95981, { enDiario: true, objetivos: [{ texto: 'Explorador: 0/1', hecho: 0, pedido: 1, terminado: false }] });
  m.estadoMision(4641, { enDiario: true, completa: true });
  const ctx = m.lua(`${C}.construir()`);
  assert.deepEqual(porQ(ctx, 95981), { q: 95981, c: 0, o: [[0, 1]], t: 'Caminos vigilados' });
  assert.equal(porQ(ctx, 4641).t, 'Misión 4641');
  // También con la API vieja (GetQuestLogTitle).
  const vieja = nuevaMaquina({ jugador: { nivel: 22 }, sinApi: ['C_QuestLog.GetInfo'] });
  vieja.nombreJuego('mision', 95981, 'Caminos vigilados');
  vieja.estadoMision(95981, { enDiario: true });
  assert.equal(porQ(vieja.lua(`${C}.construir()`), 95981).t, 'Caminos vigilados');
  sinErrores(m);
  sinErrores(vieja);
});

test('E2: las misiones que se suman con una cabecera colapsada traen el título de C_QuestLog.GetTitleForQuestID', () => {
  const m = nuevaMaquina({ jugador: { nivel: 18 } });
  m.lua(`SnetForever.Guias.cargar(${aLua('Prueba (H)\\01-02 Inicio')})`);
  m.estadoMision(788, { enDiario: true }); // de la guía (paso 2) pero tapada
  m.nombreJuego('mision', 788, 'Título de la caché');
  m.registroColapsado([788]);
  const ctx = m.lua(`${C}.construir()`);
  assert.equal(ctx.registroIncompleto, true);
  assert.equal(porQ(ctx, 788).t, 'Título de la caché');
  sinErrores(m);
});

test('E2: un título secreto o vacío no sale (y no da error con vigilarSecretos); uno larguísimo se corta a 80 bytes', () => {
  const m = nuevaMaquina({ jugador: { nivel: 22 }, vigilarSecretos: ['ia/contexto.lua', 'nucleo/espacio.lua'] });
  m.estadoMision(95981, { enDiario: true });
  m.estadoMision(4641, { enDiario: true });
  m.estadoMision(788, { enDiario: true });
  m.lua('BANCO.nombresJuego.mision[95981] = BANCO.secreto()');
  m.nombreJuego('mision', 4641, '');
  m.nombreJuego('mision', 788, 'Ñ'.repeat(60));
  const ctx = m.lua(`${C}.construir()`);
  assert.equal(porQ(ctx, 95981).t, undefined);
  assert.equal(porQ(ctx, 4641).t, undefined);
  const largo = porQ(ctx, 788).t;
  assert.ok(Buffer.byteLength(largo, 'utf8') <= 80);
  assert.equal(largo, 'Ñ'.repeat(40));
  sinErrores(m);
});

test('E2: con 40 misiones de títulos largos el mensaje cabe en 20.000 bytes; «registro.t» es el último recorte', () => {
  const m = nuevaMaquina({ jugador: { nivel: 22 } });
  for (let k = 0; k < 40; k++) {
    m.estadoMision(9000 + k, { enDiario: true });
    m.nombreJuego('mision', 9000 + k, `Una misión con un título muy largo para llenar el registro ${k}`);
  }
  const ctx = m.lua(`${C}.construir()`);
  assert.equal(ctx.registro.length, 40);
  assert.ok(ctx.registro.every((e) => typeof e.t === 'string'));
  const msg = { v: 1, id: 'a3f1-2', pj: 'Tal Cual', idioma: 'es', modelo: 'haiku', texto: 'x'.repeat(500), ctx };
  const sale = m.lua(`${C}.recortar(${aLua(msg)}, ${C}.MAX_JSON)`);
  assert.ok(m.lua(`#SnetForever.JSON.codificar(${aLua(sale)})`) <= 20000);
  assert.ok(sale.ctx.registro.every((e) => typeof e.t === 'string'), 'cabe sin quitar los títulos');
  // Con un tope muy bajo, los títulos se quitan lo último (después de «inv»).
  const corto = m.lua(`${C}.recortar(${aLua({ ...msg, ctx: { ...ctx, inv: { bolsas: [], equipo: [] } } })}, 1500)`);
  assert.equal(corto.ctx.recorte[corto.ctx.recorte.length - 1], 'registro.t');
  assert.ok(corto.ctx.registro.every((e) => e.t === undefined));
  sinErrores(m);
});
