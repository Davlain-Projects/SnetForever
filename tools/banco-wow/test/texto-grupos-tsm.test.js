// Importar una exportación de grupos de TSM pegada como texto (comercio/texto-grupos.lua). La exportación se fabrica aquí
// con el mismo formato que TSM (LibSerialize v1 + deflate sin cabecera + el alfabeto imprimible de LibDeflate), con datos
// inventados. Solo entran los grupos y los objetos: las operaciones de TSM se ignoran.
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const T = 'SnetForever.TextoGrupos';
const A = 'SnetForever.Arbol';
const q = (t) => JSON.stringify(t);

// ---- un serializador mínimo de LibSerialize (versión 1): lo que usan las exportaciones de grupos ----
function serializar(valores) {
  const out = [1];
  const refs = new Map();
  const bytes = (...b) => out.push(...b);
  const str = (s) => {
    const b = Buffer.from(s, 'utf8');
    if (b.length > 2 && refs.has(s)) return bytes(26 * 8, refs.get(s)); // STRINGREF_8
    if (b.length < 16) bytes(b.length * 16 + 2); // cadena con el largo dentro
    else bytes(14 * 8, b.length); // STR_8
    out.push(...b);
    if (b.length > 2) refs.set(s, refs.size + 1);
  };
  const obj = (v) => {
    if (v === true) return bytes(12 * 8);
    if (v === false) return bytes(13 * 8);
    if (typeof v === 'string') return str(v);
    if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= 0 && v < 128) return bytes(v * 2 + 1);
      const d = Buffer.alloc(8);
      d.writeDoubleBE(v);
      return bytes(9 * 8, ...d); // NUM_FLOAT
    }
    const pares = Object.entries(v);
    if (pares.length < 16) bytes(pares.length * 16 + 6); // tabla con la cuenta dentro
    else bytes(18 * 8, pares.length >> 8, pares.length & 255); // TABLE_16
    for (const [k, x] of pares) {
      obj(k);
      obj(x);
    }
  };
  for (const v of valores) obj(v);
  return Buffer.from(out);
}

const ALF = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()';
function imprimible(buf) {
  let s = '';
  let i = 0;
  for (; i + 3 <= buf.length; i += 3) {
    const v = buf[i] + buf[i + 1] * 256 + buf[i + 2] * 65536;
    s += ALF[v & 63] + ALF[(v >> 6) & 63] + ALF[(v >> 12) & 63] + ALF[(v >> 18) & 63];
  }
  let cache = 0;
  let bits = 0;
  for (; i < buf.length; i++) {
    cache += buf[i] * 2 ** bits;
    bits += 8;
  }
  while (bits > 0) {
    s += ALF[cache & 63];
    cache = Math.floor(cache / 64);
    bits -= 6;
  }
  return s;
}

const exportar = (valores) => imprimible(deflateRawSync(serializar(valores)));

const EXPORTACION = exportar([
  'TSM_EXPORT', 1, 'Mi grupo',
  {
    'i:2589': '', 'i:2592': 'Telas', 'i:4306': 'Telas`Seda', 'i:8838::r42': 'Telas', 'p:1124:10:3': 'Mascotas',
    'i:14047': 'Telas`Seda', basura: '',
  },
  { '': true, Telas: true, 'Telas`Seda': true, Mascotas: true, Vacio: true },
  { '': { Auctioning: { 1: 'Op', override: true } } },
  { Auctioning: { Op: { bidPercent: 0.95, minPrice: '80% dbmarket' } } },
  {},
]);

const maquina = () => {
  const m = nuevaMaquina({ codificacion: true });
  m.lua(`${A}.preparar()`);
  return m;
};

test('una exportación de grupos de TSM se lee: sus grupos y objetos, sin operaciones', () => {
  const m = maquina();
  const r = m.lua(`(function() local d = ${T}.leer(${q(EXPORTACION)})
    local rutas = {} for i, g in ipairs(d.g) do rutas[i] = g.r .. "=" .. #g.o end
    return {rutas = rutas, resumen = ${T}.resumen(d), ops = #(d.p or {})} end)()`);
  assert.deepEqual(r.rutas, ['Mi grupo=1', 'Mi grupo`Mascotas=1', 'Mi grupo`Telas=2', 'Mi grupo`Telas`Seda=2', 'Mi grupo`Vacio=0']);
  assert.equal(r.resumen.grupos, 5);
  assert.equal(r.resumen.objetos, 6);
  assert.equal(r.resumen.operaciones, 0, 'las operaciones de TSM no entran');
  assert.equal(r.resumen.noReconocidos, 1, '«basura» no es un objeto');
  sinErrores(m);
});

test('importar una exportación de TSM pone los objetos en sus grupos, con la variante y la mascota tal cual', () => {
  const m = maquina();
  const r = m.lua(`(function() local d = ${T}.leer(${q(EXPORTACION)}) return ${T}.importar(d, {}) end)()`);
  assert.equal(r.grupos, 5);
  assert.equal(m.lua(`${A}.objeto("i:2589")`), 'Mi grupo');
  assert.equal(m.lua(`${A}.objeto("i:4306")`), 'Mi grupo`Telas`Seda');
  assert.equal(m.lua(`${A}.objeto("i:8838::r42")`), 'Mi grupo`Telas');
  assert.equal(m.lua(`${A}.objeto("p:1124:10:3")`), 'Mi grupo`Mascotas');
  assert.equal(m.lua(`${A}.existe("Mi grupo\`Vacio")`), true, 'también los grupos vacíos');
  sinErrores(m);
});

test('una cadena de TSM rota, o sin C_EncodingUtil en el cliente, da el aviso de TSM y no importa nada', () => {
  const m = maquina();
  const rota = EXPORTACION.slice(0, 40) + 'zzzz' + EXPORTACION.slice(60);
  for (const texto of [rota, 'abcdefghijklmnopqrstuvwxyz0123']) {
    const r = m.lua(`(function() local d, e, c = ${T}.leer(${q(texto)}) return {d == nil, c} end)()`);
    assert.deepEqual(r, [true, 'tsm'], texto.slice(0, 20));
  }
  const otra = exportar(['OTRA_COSA', 1, 'x', {}, {}]);
  assert.deepEqual(m.lua(`(function() local d, e, c = ${T}.leer(${q(otra)}) return {d == nil, c} end)()`), [true, 'tsm']);
  const sin = nuevaMaquina();
  assert.deepEqual(sin.lua(`(function() local d, e, c = ${T}.leer(${q(EXPORTACION)}) return {d == nil, c} end)()`), [true, 'tsm']);
  sinErrores(m);
});
