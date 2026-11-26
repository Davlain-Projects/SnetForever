// Fase 5, tarea 13, ronda 1 (Importante 1): la lectura y la comprobación de los paquetes de `{app}\paquetes` en un único
// sitio (src/instalador/paquetes.mjs), que usan la CLI del instalador (`instalar`) y R17 (principal.mjs). Con una
// publicación hecha aquí mismo (empaquetar y una clave temporal) en una carpeta temporal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { empaquetar } from '../src/actualizar/paquete.mjs';
import { COMPONENTES_ADDONS, ErrorPaquetes, MANIFIESTO, leerPaquetes } from '../src/instalador/paquetes.mjs';

const RAIZ = mkdtempSync(join(tmpdir(), 'snf-paquetes-'));
let n = 0;
const nueva = (nombre) => {
  n += 1;
  const d = join(RAIZ, `${nombre}-${n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

function claves() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publica: publicKey.export({ type: 'spki', format: 'pem' }), privada: privateKey };
}
const BUENA = claves();
const OTRA = claves();

function arbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}
const toc = (titulo, version) => `## Interface: 16001\n## Title: ${titulo}\n## Version: ${version}\n\nnucleo.lua\n`;
const ARCHIVOS = {
  addon: (v) => ({ 'SnetForever/SnetForever.toc': `${toc('SnetForever', v)}`, 'SnetForever/nucleo.lua': `SnetForever = {VERSION = "${v}"}\n` }),
  rutas: (v) => ({ 'SnetForever_Rutas/SnetForever_Rutas.toc': toc('SnetForever_Rutas', v), 'SnetForever_Rutas/nucleo.lua': `SNF_RUTAS = {version="${v}",esquema=1}\n` }),
  misiones: (v) => ({ 'SnetForever_Misiones/SnetForever_Misiones.toc': toc('SnetForever_Misiones', v), 'SnetForever_Misiones/nucleo.lua': `SNF_MISIONES = {version="${v}",esquema=1}\n` }),
  comercio: (v) => ({ 'SnetForever_Comercio/SnetForever_Comercio.toc': toc('SnetForever_Comercio', v), 'SnetForever_Comercio/ui/comercio.lua': '-- comercio\n' }),
};
const VERSIONES = { addon: '0.5.0', rutas: '2026.11.10.1', misiones: '2026.11.10.1', comercio: '0.5.0' };

// Lo que Inno deja en `{app}\paquetes`: el manifiesto, su firma (con `privada`) y los cuatro paquetes de AddOns (el
// comercio, sin esquema de datos). `sin`: un componente que no va en el manifiesto (una publicación de una 0.6.x).
function publicacion({ privada = BUENA.privada, sin = null } = {}) {
  const dir = nueva('paquetes');
  const componentes = {};
  for (const [c, version] of Object.entries(VERSIONES)) {
    if (c === sin) continue;
    const datos = c === 'comercio' ? {} : { esquemaDatos: 1 };
    const buffer = empaquetar({ componente: c, version, raiz: arbol(nueva('fuente'), ARCHIVOS[c](version)), ...datos });
    const archivo = `SnetForever-${c}-${version}.snfpaq`;
    componentes[c] = { version, archivo, tamano: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), ...datos };
    writeFileSync(join(dir, archivo), buffer);
  }
  const manifiesto = { esquema: 1, producto: 'SnetForever', publicacion: 'v0.5.0-2026.11.10.1', fecha: '2026-11-10T12:00:00.000Z', componentes, notas: { es: 'a', en: 'b' } };
  const bytes = Buffer.from(`${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
  writeFileSync(join(dir, MANIFIESTO), bytes);
  writeFileSync(join(dir, `${MANIFIESTO}.sig`), `${sign(null, bytes, privada).toString('base64')}\n`);
  return { dir, componentes };
}

const conDetalle = (detalle) => (e) => e instanceof ErrorPaquetes && e.code === 'paquete' && e.detalle === detalle;

test('COMPONENTES_ADDONS (Task 8): el addon, los datos y el comercio, en ese orden (el comercio depende del addon)', () => {
  assert.deepEqual([...COMPONENTES_ADDONS], ['addon', 'rutas', 'misiones', 'comercio']);
  assert.ok(Object.isFrozen(COMPONENTES_ADDONS));
});

test('leerPaquetes: con la firma buena da los cuatro paquetes de AddOns, en orden, con su buffer', () => {
  const { dir } = publicacion();
  const r = leerPaquetes(dir, { clavePublica: BUENA.publica });
  assert.deepEqual(r.map((p) => p.componente), ['addon', 'rutas', 'misiones', 'comercio']);
  for (const p of r) assert.ok(Buffer.isBuffer(p.buffer) && p.buffer.length > 0);
});

test('leerPaquetes: la firma de otra clave → «firma»; sin .sig → «falta_firma»; sin manifiesto → «falta_manifiesto»', () => {
  const { dir } = publicacion({ privada: OTRA.privada });
  assert.throws(() => leerPaquetes(dir, { clavePublica: BUENA.publica }), conDetalle('firma'));
  renameSync(join(dir, `${MANIFIESTO}.sig`), join(nueva('aparte'), 'firma.sig'));
  assert.throws(() => leerPaquetes(dir, { clavePublica: BUENA.publica }), conDetalle('falta_firma'));
  renameSync(join(dir, MANIFIESTO), join(nueva('aparte'), MANIFIESTO));
  assert.throws(() => leerPaquetes(dir, { clavePublica: null }), conDetalle('falta_manifiesto'));
});

test('leerPaquetes: sin clave (null) bastan el tamaño y el SHA-256; un paquete cambiado → «hash» de comprobarPaquete', () => {
  const { dir, componentes } = publicacion({ privada: OTRA.privada });
  assert.equal(leerPaquetes(dir, { clavePublica: null }).length, 4);
  const ruta = join(dir, componentes.rutas.archivo);
  const otro = Buffer.alloc(componentes.rutas.tamano, 7);
  writeFileSync(ruta, otro);
  assert.throws(() => leerPaquetes(dir, { clavePublica: null }), (e) => e.code === 'hash');
});

test('leerPaquetes: solo los componentes pedidos; uno que falta en la carpeta → «falta_<c>»', () => {
  const { dir, componentes } = publicacion();
  renameSync(join(dir, componentes.addon.archivo), join(nueva('aparte'), componentes.addon.archivo));
  const r = leerPaquetes(dir, { clavePublica: BUENA.publica, componentes: ['misiones'] });
  assert.deepEqual(r.map((p) => p.componente), ['misiones']);
  assert.throws(() => leerPaquetes(dir, { clavePublica: BUENA.publica }), conDetalle('falta_addon'));
});

test('leerPaquetes: con `error`, el error es el de quien llama (la CLI usa el suyo)', () => {
  const { dir } = publicacion({ privada: OTRA.privada });
  class Mio extends Error {}
  assert.throws(() => leerPaquetes(dir, { clavePublica: BUENA.publica, error: (detalle) => Object.assign(new Mio(detalle), { detalle }) }),
    (e) => e instanceof Mio && e.detalle === 'firma');
});

test('Task 8: sin el comercio en el manifiesto (un manifiesto de una 0.6.x), pedirlo da «sin_comercio»', () => {
  const { dir } = publicacion({ sin: 'comercio' });
  assert.throws(() => leerPaquetes(dir, { clavePublica: BUENA.publica }), conDetalle('sin_comercio'));
});

test('Task 8: con `opcionales`, un componente que el manifiesto no trae se salta (sin error) y los demás se leen', () => {
  const { dir } = publicacion({ sin: 'comercio' });
  const r = leerPaquetes(dir, { clavePublica: BUENA.publica, componentes: ['misiones', 'comercio'], opcionales: ['comercio'] });
  assert.deepEqual(r.map((p) => p.componente), ['misiones']);
  // lo que no es opcional sigue fallando
  assert.throws(() => leerPaquetes(dir, { clavePublica: BUENA.publica, componentes: ['misiones', 'comercio'], opcionales: ['rutas'] }),
    conDetalle('sin_comercio'));
  // y uno opcional que sí está en el manifiesto se lee (y, si falta su archivo, sigue siendo «falta_<c>»)
  const completa = publicacion();
  assert.deepEqual(leerPaquetes(completa.dir, { clavePublica: BUENA.publica, opcionales: ['comercio'] }).map((p) => p.componente),
    ['addon', 'rutas', 'misiones', 'comercio']);
  renameSync(join(completa.dir, completa.componentes.comercio.archivo), join(nueva('aparte'), 'comercio.snfpaq'));
  assert.throws(() => leerPaquetes(completa.dir, { clavePublica: BUENA.publica, opcionales: ['comercio'] }), conDetalle('falta_comercio'));
});
