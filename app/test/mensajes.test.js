// Mensajes por partes y compresión: las partes salen del Lua del addon (banco) y la app las reúne con el JS.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { sinErrores } from '../../tools/banco-wow/test/ayuda.js';
import { leerTrama, crearReunidor, DATOS_MAX, PARTES_MAX, TIEMPO_PARTES, TIEMPO_REPETIDOS } from '../src/franja/mensajes.mjs';

const m = crearMaquina();
const mc = crearMaquina({ codificacion: true });
after(() => { m.cerrar(); mc.cerrar(); });

// Texto de Lua con los bytes dados, con escapes decimales (valen para cualquier byte).
const literalLua = (bytes) => `"${[...bytes].map((b) => `\\${String(b).padStart(3, '0')}`).join('')}"`;

// Lo que da Envio.partes en la máquina `maq`: {partes: Buffer[], error?}. Las partes viajan como hexadecimal (bytes sin pérdida).
function partesDeLua(maq, cuerpo, { pj = 'Tal Cual', id = 'a3f1-7', z = 0, r = 5, c = 12 } = {}) {
  const sal = maq.lua(`(function()
    local p, e = SnetForever.Envio.partes(${JSON.stringify(pj)}, ${JSON.stringify(id)}, ${literalLua(cuerpo)}, ${z}, ${r}, ${c})
    if not p then return {error = e} end
    local hex = {}
    for i, t in ipairs(p) do hex[i] = (t:gsub(".", function(ch) return string.format("%02x", ch:byte()) end)) end
    return {partes = hex}
  end)()`);
  if (sal.error) return { error: sal.error };
  return { partes: sal.partes.map((h) => Buffer.from(h, 'hex')) };
}

// Cuerpo JSON de `total` bytes con la «ñ» (2 bytes) en los bytes `ene` y `ene + 1` (1 = el primero del cuerpo).
function cuerpoConEne(total, ene) {
  const antes = Buffer.from('{"v":1,"id":"a3f1-7","texto":"', 'utf8');
  const relleno1 = Buffer.alloc(ene - 1 - antes.length, 'a');
  const despues = Buffer.from('"}', 'utf8');
  const relleno2 = Buffer.alloc(total - antes.length - relleno1.length - 2 - despues.length, 'b');
  return Buffer.concat([antes, relleno1, Buffer.from('ñ', 'utf8'), relleno2, despues]);
}

test('constantes: 1.300 bytes de datos por parte y 16 partes como mucho', () => {
  assert.equal(DATOS_MAX, 1300);
  assert.equal(PARTES_MAX, 16);
});

test('un cuerpo de 7.000 bytes con la «ñ» partida entre dos partes da 6 partes y vuelve entero, en desorden y con repetidas', () => {
  const cuerpo = cuerpoConEne(7000, 1300); // ñ en los bytes 1.300-1.301: justo en la frontera de la parte 1 y la 2
  assert.equal(cuerpo.length, 7000);
  assert.equal(cuerpo[1299], 0xc3);
  assert.equal(cuerpo[1300], 0xb1);
  const { partes } = partesDeLua(m, cuerpo);
  assert.equal(partes.length, 6);
  for (const p of partes) assert.ok(p.length <= 1400, `parte de ${p.length} bytes`);
  const tramas = partes.map((p) => leerTrama(p));
  assert.deepEqual(tramas.map((t) => t.parte), [1, 2, 3, 4, 5, 6]);
  assert.ok(tramas.every((t) => t.total === 6 && t.z === 0 && t.pj === 'Tal Cual' && t.id === 'a3f1-7' && t.r === 5 && t.c === 12));
  assert.ok(tramas.every((t) => t.datos.length <= 1300));
  assert.equal(tramas[0].datos.at(-1), 0xc3); // la «ñ» se parte por la mitad
  assert.equal(tramas[1].datos[0], 0xb1);

  const reunidor = crearReunidor();
  const resultados = [3, 1, 2, 1, 6, 5, 4].map((k) => reunidor.anadir(tramas[k - 1]));
  assert.deepEqual(resultados.slice(0, 5), [null, null, null, null, null]);
  assert.equal(resultados[5], null);
  const fin = resultados[6];
  assert.equal(fin.pj, 'Tal Cual');
  assert.equal(fin.id, 'a3f1-7');
  assert.equal(fin.r, 5);
  assert.equal(fin.c, 12);
  assert.equal(fin.mensaje.texto, cuerpo.subarray(0).toString('utf8').match(/"texto":"(.*)"\}$/)[1]);
  assert.ok(fin.mensaje.texto.includes('ñ'));
  sinErrores(m);
});

test('un cuerpo de 25.000 bytes da nil y «grande»', () => {
  const r = partesDeLua(m, Buffer.alloc(25000, 'x'));
  assert.equal(r.error, 'grande');
  assert.equal(r.partes, undefined);
});

test('16 partes exactas valen y 17 dan nil y «grande»', () => {
  const justo = partesDeLua(m, Buffer.alloc(16 * 1300, 'x'));
  assert.equal(justo.partes.length, 16);
  const mas = partesDeLua(m, Buffer.alloc(16 * 1300 + 1, 'x'));
  assert.equal(mas.error, 'grande');
});

test('un cuerpo vacío da una sola parte', () => {
  const { partes } = partesDeLua(m, Buffer.alloc(0));
  assert.equal(partes.length, 1);
  const t = leerTrama(partes[0]);
  assert.equal(t.parte, 1);
  assert.equal(t.total, 1);
  assert.equal(t.datos.length, 0);
});

test('con codificación, comprimir de 15.000 bytes repetitivos da base64 y la app lo infla al mismo JSON', () => {
  const json = JSON.stringify({ v: 1, id: 'a3f1-8', pj: 'Tal Cual', texto: 'hola', registro: Array.from({ length: 250 }, (_, i) => ({ q: 100 + (i % 7), c: 0, o: [{ hecho: 0, pedido: 8 }] })) });
  const cuerpo = Buffer.from(json.padEnd(15000, ' '), 'utf8');
  assert.equal(cuerpo.length, 15000);
  const b64 = mc.lua(`SnetForever.Envio.comprimir(${literalLua(cuerpo)})`);
  assert.equal(typeof b64, 'string');
  assert.match(b64, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(b64.length < cuerpo.length / 5, `salen ${b64.length} bytes`);

  const { partes } = partesDeLua(mc, Buffer.from(b64, 'latin1'), { id: 'a3f1-8', z: 1 });
  const reunidor = crearReunidor();
  let fin = null;
  for (const p of partes) fin = reunidor.anadir(leerTrama(p));
  assert.equal(fin.mensaje.texto, 'hola');
  assert.equal(fin.mensaje.registro.length, 250);
  sinErrores(mc);
});

test('sin C_EncodingUtil, comprimir da nil', () => {
  assert.equal(m.lua('SnetForever.Envio.comprimir(string.rep("a", 500))'), undefined);
  sinErrores(m);
});

test('comprimir da nil si no sale más corto o si no es texto', () => {
  assert.equal(mc.lua('SnetForever.Envio.comprimir("{}")'), undefined);
  assert.equal(mc.lua('SnetForever.Envio.comprimir(nil)'), undefined);
  sinErrores(mc);
});

test('comprimir da nil si la vuelta atrás no devuelve el texto exacto', () => {
  const mm = crearMaquina({ codificacion: true });
  try {
    mm.lua('C_EncodingUtil.DecompressString = function() return "otra cosa" end');
    assert.equal(mm.lua('SnetForever.Envio.comprimir(string.rep("a", 500))'), undefined);
    mm.lua('C_EncodingUtil.DecompressString = function() error("falla") end');
    assert.equal(mm.lua('SnetForever.Envio.comprimir(string.rep("a", 500))'), undefined);
    sinErrores(mm);
  } finally { mm.cerrar(); }
});

// Una trama de JS a mano.
const US = '\x1f';
function trama({ pj = 'Ana', id = 'x-1', parte = 1, total = 1, z = 0, r = 1, c = 0, datos = '{}' } = {}) {
  return Buffer.concat([Buffer.from(['SNF1', pj, id, parte, total, z, r, c, ''].join(US), 'utf8'), Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'utf8')]);
}

test('el mismo id otra vez da null durante 24 horas y vuelve a valer después', () => {
  let t = 1_000_000;
  const reunidor = crearReunidor({ ahora: () => t });
  const a = reunidor.anadir(leerTrama(trama({ datos: '{"texto":"uno"}' })));
  assert.equal(a.mensaje.texto, 'uno');
  assert.equal(reunidor.anadir(leerTrama(trama({ datos: '{"texto":"uno"}' }))), null);
  t += TIEMPO_REPETIDOS - 1000;
  assert.equal(reunidor.anadir(leerTrama(trama({ datos: '{"texto":"uno"}' }))), null);
  // otro personaje con el mismo id no es repetido
  assert.ok(reunidor.anadir(leerTrama(trama({ pj: 'Bea', datos: '{"texto":"dos"}' }))));
  t += 2000;
  assert.equal(reunidor.anadir(leerTrama(trama({ datos: '{"texto":"tres"}' }))).mensaje.texto, 'tres');
});

test('una parte suelta con 121 s después se descarta', () => {
  let t = 5_000;
  const reunidor = crearReunidor({ ahora: () => t });
  assert.equal(reunidor.anadir(leerTrama(trama({ id: 'p-1', parte: 1, total: 2, datos: '{"texto":' }))), null);
  t += 121_000;
  assert.equal(TIEMPO_PARTES, 120_000);
  assert.equal(reunidor.anadir(leerTrama(trama({ id: 'p-1', parte: 2, total: 2, datos: '"x"}' }))), null);
  // la parte 2 arrancó una espera nueva: con la 1 a tiempo se completa
  const fin = reunidor.anadir(leerTrama(trama({ id: 'p-1', parte: 1, total: 2, datos: '{"texto":' })));
  assert.equal(fin.mensaje.texto, 'x');
});

test('un JSON roto da {error: json}', () => {
  const reunidor = crearReunidor();
  assert.deepEqual(reunidor.anadir(leerTrama(trama({ id: 'j-1', datos: '{"texto":' }))), { error: 'json', pj: 'Ana', id: 'j-1' });
  // un JSON que no es objeto también
  assert.equal(reunidor.anadir(leerTrama(trama({ id: 'j-2', datos: '[1,2]' }))).error, 'json');
  // y repetirlo da null
  assert.equal(reunidor.anadir(leerTrama(trama({ id: 'j-1', datos: '{"texto":' }))), null);
});

test('z = 1 con base64 que no infla da {error: inflado}; si infla a más de 64 KB, también', () => {
  const reunidor = crearReunidor();
  assert.deepEqual(reunidor.anadir(leerTrama(trama({ id: 'z-1', z: 1, datos: 'AAAA' }))), { error: 'inflado', pj: 'Ana', id: 'z-1' });
  const bomba = Buffer.from(JSON.stringify({ texto: 'a'.repeat(70000) }));
  const b64 = deflateRawSync(bomba).toString('base64');
  assert.ok(b64.length <= 1300);
  assert.equal(reunidor.anadir(leerTrama(trama({ id: 'z-2', z: 1, datos: b64 }))).error, 'inflado');
  const bueno = deflateRawSync(Buffer.from('{"texto":"ñ"}')).toString('base64');
  assert.equal(reunidor.anadir(leerTrama(trama({ id: 'z-3', z: 1, datos: bueno }))).mensaje.texto, 'ñ');
});

test('leerTrama: null si no empieza por SNF1 o le faltan campos', () => {
  assert.equal(leerTrama(Buffer.from(['XXX1', 'Ana', 'x-1', 1, 1, 0, 1, 0, '{}'].join(US))), null);
  assert.equal(leerTrama(Buffer.from(['SNF1', 'Ana', 'x-1', 1, 1, 0, 1].join(US))), null);
  assert.equal(leerTrama(Buffer.from(['SNF1', 'Ana', 'x-1', 'a', 1, 0, 1, 0, '{}'].join(US))), null);
  assert.equal(leerTrama(Buffer.from(['SNF1', 'Ana', 'x-1', 3, 2, 0, 1, 0, '{}'].join(US))), null, 'parte mayor que total');
  assert.equal(leerTrama(Buffer.from(['SNF1', 'Ana', 'x-1', 1, 17, 0, 1, 0, '{}'].join(US))), null, 'más de 16 partes');
  assert.equal(leerTrama(Buffer.from(['SNF1', 'Ana', 'x-1', 1, 1, 2, 1, 0, '{}'].join(US))), null, 'z solo vale 0 o 1');
  assert.equal(leerTrama(Buffer.alloc(0)), null);
  assert.equal(leerTrama(null), null);
  const t = leerTrama(trama({ datos: Buffer.from([0x7b, 0x1f, 0xff, 0x7d]) }));
  assert.deepEqual([...t.datos], [0x7b, 0x1f, 0xff, 0x7d], 'los datos conservan sus bytes, también el US');
});

test('leerTrama de una carga de Lua trae los campos tal cual', () => {
  const { partes } = partesDeLua(m, Buffer.from('{"v":1}'), { pj: 'Tal Cual', id: 'ab12-9', r: 101, c: 345 });
  const t = leerTrama(partes[0]);
  assert.deepEqual({ ...t, datos: t.datos.toString() }, { pj: 'Tal Cual', id: 'ab12-9', parte: 1, total: 1, z: 0, r: 101, c: 345, datos: '{"v":1}' });
});
