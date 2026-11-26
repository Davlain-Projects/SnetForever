// Diagnóstico de los #next sin resolver de una biblioteca local de Forever (rxp/diagnostico.js), con guías sintéticas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importarRXP } from '../src/importar-rxp.js';

function biblioteca(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'snet-rxp-diag-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  mkdirSync(join(raiz, 'Guides', 'forever'), { recursive: true });
  mkdirSync(join(raiz, 'DB', 'forever'), { recursive: true });
  writeFileSync(join(raiz, 'DB', 'forever', 'db.lua'), 'addon.mapId = {["Durotar"] = 1411}');
  writeFileSync(join(raiz, 'LICENSE'), 'Fixture sintético.');
  writeFileSync(join(raiz, 'Guides', 'forever', 'ruta.lua'), String.raw`
addon:RegisterGuide([[
#group Ruta sintética
#forever
#name 10-12 Primer tramo
#next 12-14 Tramo de otra edición
step
    +Primera parada
]])
addon:RegisterGuide([[
#group Ruta sintética
#forever
#name 12-14 Segundo tramo
#next 14-16 Tramo que no existe
step
    +Segunda parada
]])
addon:RegisterGuide([[
#group Ruta sintética
#forever
#name 14-16 Tramo parecido
step
    +Tercera parada
]])
`);
  writeFileSync(join(raiz, 'Guides', 'Clasica.lua'), String.raw`
error("El Lua de origen no se ejecuta")
addon:RegisterGuide([[
#group Ruta sintética
#classic
#tbc
#name 12-14 Tramo de otra edición
step
    .goto Durotar,50,50
]])
`);
  return raiz;
}

test('explica cada #next sin resolver: el nombre solo está en otra edición o no existe en ninguna', (t) => {
  const raiz = biblioteca(t);
  const r = importarRXP(raiz, raiz, '2026.01.01.1');
  assert.equal(r.enlacesSinResolver, 2);
  const [otraEdicion, sinTramo] = r.enlacesSinResolverDetalle;
  assert.deepEqual(otraEdicion, {
    desde: 'RXP\\Ruta sintética\\10-12 Primer tramo', archivo: 'Guides/forever/ruta.lua', linea: 6,
    destino: '12-14 Tramo de otra edición', motivo: 'solo-en-otra-edicion',
    candidatos: [{ archivo: 'Guides/Clasica.lua', linea: 7, grupo: 'Ruta sintética', ediciones: ['classic', 'tbc'] }],
    parecidos: [{ clave: 'RXP\\Ruta sintética\\12-14 Segundo tramo', enlazada: false }],
  });
  assert.equal(sinTramo.motivo, 'sin-tramo');
  assert.deepEqual(sinTramo.candidatos, []);
  assert.deepEqual(sinTramo.parecidos, [{ clave: 'RXP\\Ruta sintética\\14-16 Tramo parecido', enlazada: false }]);
  assert.equal(r.guias, 3, 'el tramo de otra edición no se añade');
});
