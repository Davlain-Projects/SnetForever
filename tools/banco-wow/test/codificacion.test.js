// Opción codificacion: true del banco: C_EncodingUtil (deflate crudo y base64 con node:zlib) y Enum.CompressionMethod.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores } from './ayuda.js';

test('sin la opción, C_EncodingUtil no existe', () => {
  const m = crearMaquina();
  try {
    assert.throws(() => m.lua('C_EncodingUtil.EncodeBase64("a")'), /C_EncodingUtil/);
  } finally { m.cerrar(); }
});

test('con la opción: Enum.CompressionMethod y base64 sin perder bytes', () => {
  const m = crearMaquina({ codificacion: true });
  try {
    assert.deepEqual(m.lua('Enum.CompressionMethod'), { Deflate: 0, Zlib: 1, Gzip: 2 });
    assert.equal(m.lua('C_EncodingUtil.EncodeBase64("Man")'), 'TWFu');
    assert.equal(m.lua('C_EncodingUtil.DecodeBase64("TWFu")'), 'Man');
    // todos los bytes, también 0x00, 0x1F y 0xFF
    assert.equal(m.lua(`(function()
      local t = {}
      for i = 0, 255 do t[#t + 1] = string.char(i) end
      local s = table.concat(t)
      return C_EncodingUtil.DecodeBase64(C_EncodingUtil.EncodeBase64(s)) == s
        and C_EncodingUtil.DecompressString(C_EncodingUtil.CompressString(s, 0), 0) == s
    end)()`), true);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('los tres métodos comprimen y descomprimen, y Deflate es crudo', () => {
  const m = crearMaquina({ codificacion: true });
  try {
    for (const metodo of [0, 1, 2]) {
      assert.equal(m.lua(`(function()
        local s = string.rep("hola ñandú ", 200)
        local c = C_EncodingUtil.CompressString(s, ${metodo})
        return #c < #s and C_EncodingUtil.DecompressString(c, ${metodo}) == s
      end)()`), true, `método ${metodo}`);
    }
    // el crudo no lleva cabecera de zlib (0x78) ni de gzip (0x1F 0x8B)
    assert.equal(m.lua('C_EncodingUtil.CompressString(string.rep("a", 100), 0):byte(1) ~= 0x78'), true);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('sobrevive a recargar() y no cuenta como global nueva', () => {
  const m = crearMaquina({ codificacion: true });
  const r = m.recargar();
  try {
    assert.equal(r.lua('C_EncodingUtil.EncodeBase64("Man")'), 'TWFu');
    assert.deepEqual(r.globalesNuevas().filter((g) => /Encoding|Enum/.test(g)), []);
  } finally { r.cerrar(); }
});
