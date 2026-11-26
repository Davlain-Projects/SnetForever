// Pruebas del instalador del addon: carpetas temporales propias, nunca el juego real ni E:\_CUARENTENA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const INSTALAR = path.join(AQUI, '..', 'src', 'instalar.js');
const ORIGEN = path.resolve(AQUI, '..', '..', '..', 'addons', 'SnetForever');
const ORIGEN_COMERCIO = path.resolve(AQUI, '..', '..', '..', 'addons', 'SnetForever_Comercio');

function temporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'snf-instalar-'));
}

function listar(dir, base = dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) listar(ruta, base, salida);
    else salida.push(path.relative(base, ruta).split(path.sep).join('/'));
  }
  return salida.sort();
}

function ejecutar(addons, cuarentena) {
  return spawnSync(process.execPath, [INSTALAR], {
    encoding: 'utf8',
    env: { ...process.env, SNF_ADDONS: addons, SNF_CUARENTENA: cuarentena },
  });
}

function preparar({ datos = true } = {}) {
  const addons = temporal();
  const cuarentena = temporal();
  if (datos) {
    fs.mkdirSync(path.join(addons, 'SnetForever_Rutas'));
    fs.mkdirSync(path.join(addons, 'SnetForever_Misiones'));
  }
  return { addons, cuarentena };
}

test('instalar.js copia SnetForever y SnetForever_Comercio', () => {
  const { addons, cuarentena } = preparar();
  const r = ejecutar(addons, cuarentena);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const [nombre, origen] of [['SnetForever', ORIGEN], ['SnetForever_Comercio', ORIGEN_COMERCIO]]) {
    const destino = path.join(addons, nombre);
    assert.deepEqual(listar(destino), listar(origen), nombre);
    for (const f of listar(origen)) {
      assert.ok(fs.readFileSync(path.join(origen, f)).equals(fs.readFileSync(path.join(destino, f))), `${nombre}/${f}`);
    }
    assert.match(r.stdout, new RegExp(`${nombre}: origen y destino coinciden`), nombre);
  }
  // las letras y los gráficos (no son .lua) también viajan
  assert.ok(fs.existsSync(path.join(addons, 'SnetForever_Comercio', 'recursos', 'letras', 'Roboto-Regular.ttf')));
  assert.ok(fs.existsSync(path.join(addons, 'SnetForever_Comercio', 'recursos', 'iconos.tga')));
  // los de datos no son de este instalador: ni se copian ni se tocan
  assert.deepEqual(fs.readdirSync(addons).sort(), ['SnetForever', 'SnetForever_Comercio', 'SnetForever_Misiones', 'SnetForever_Rutas']);
  assert.deepEqual(fs.readdirSync(cuarentena), []);
});

test('instalar.js: un .lua sobrante del comercio va a la cuarentena (SnetForever_Comercio dentro del sello), no se borra y el núcleo queda igual', () => {
  const { addons, cuarentena } = preparar();
  const destino = path.join(addons, 'SnetForever_Comercio');
  fs.mkdirSync(path.join(destino, 'ui'), { recursive: true });
  fs.writeFileSync(path.join(destino, 'ui', 'viejo.lua'), '-- sobrante del comercio');
  fs.writeFileSync(path.join(destino, 'notas.txt'), 'mío'); // no es .lua: se queda, como en el núcleo
  const r = ejecutar(addons, cuarentena);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fs.existsSync(path.join(destino, 'ui', 'viejo.lua')), false);
  assert.equal(fs.readFileSync(path.join(destino, 'notas.txt'), 'utf8'), 'mío');
  assert.match(r.stdout, /Sobrante a cuarentena: ui\/viejo\.lua/);
  const [sello] = fs.readdirSync(cuarentena);
  assert.equal(fs.readFileSync(path.join(cuarentena, sello, 'SnetForever_Comercio', 'ui', 'viejo.lua'), 'utf8'), '-- sobrante del comercio');
  assert.equal(fs.existsSync(path.join(cuarentena, sello, 'SnetForever')), false, 'el núcleo no tenía sobrantes');
  // reinstalar con otro sobrante en el mismo sello: no pisa el primero
  fs.writeFileSync(path.join(destino, 'ui', 'viejo.lua'), '-- sobrante 2');
  const r2 = spawnSync(process.execPath, [INSTALAR], {
    encoding: 'utf8',
    env: { ...process.env, SNF_ADDONS: addons, SNF_CUARENTENA: cuarentena, SNF_SELLO: sello },
  });
  assert.equal(r2.status, 0, r2.stderr + r2.stdout);
  const movido = path.join(cuarentena, sello, 'SnetForever_Comercio', 'ui', 'viejo.lua');
  assert.equal(fs.readFileSync(movido, 'utf8'), '-- sobrante del comercio');
  assert.equal(fs.readdirSync(path.dirname(movido)).filter((n) => n.startsWith('viejo.lua')).length, 2);
});

test('instalar.js: los sobrantes del núcleo y del comercio de una misma pasada van al mismo sello de la cuarentena', () => {
  const { addons, cuarentena } = preparar();
  for (const nombre of ['SnetForever', 'SnetForever_Comercio']) {
    fs.mkdirSync(path.join(addons, nombre), { recursive: true });
    fs.writeFileSync(path.join(addons, nombre, 'sobrante.lua'), `-- ${nombre}`);
  }
  const r = ejecutar(addons, cuarentena);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const sellos = fs.readdirSync(cuarentena);
  assert.equal(sellos.length, 1, 'un solo sello para toda la pasada');
  for (const nombre of ['SnetForever', 'SnetForever_Comercio']) {
    assert.equal(fs.readFileSync(path.join(cuarentena, sellos[0], nombre, 'sobrante.lua'), 'utf8'), `-- ${nombre}`);
  }
});

test('instalar: copia el addon entero y dice que origen y destino coinciden', () => {
  const { addons, cuarentena } = preparar();
  const r = ejecutar(addons, cuarentena);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const destino = path.join(addons, 'SnetForever');
  assert.deepEqual(listar(destino), listar(ORIGEN));
  for (const f of listar(ORIGEN)) {
    assert.ok(fs.readFileSync(path.join(ORIGEN, f)).equals(fs.readFileSync(path.join(destino, f))), f);
  }
  assert.match(r.stdout, /coinciden/);
  assert.deepEqual(fs.readdirSync(cuarentena), []);
});

test('instalar: sobrescribe sin borrar lo que ya había', () => {
  const { addons, cuarentena } = preparar();
  const destino = path.join(addons, 'SnetForever');
  fs.mkdirSync(destino);
  fs.writeFileSync(path.join(destino, 'arranque.lua'), '-- viejo');
  fs.writeFileSync(path.join(destino, 'notas.txt'), 'mío');
  const r = ejecutar(addons, cuarentena);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(fs.readFileSync(path.join(destino, 'arranque.lua')).equals(fs.readFileSync(path.join(ORIGEN, 'arranque.lua'))));
  assert.equal(fs.readFileSync(path.join(destino, 'notas.txt'), 'utf8'), 'mío');
});

test('instalar: sin los addons de datos falla con código 1 y no copia nada', () => {
  const { addons, cuarentena } = preparar({ datos: false });
  fs.mkdirSync(path.join(addons, 'SnetForever_Rutas'));
  const r = ejecutar(addons, cuarentena);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SnetForever_Misiones/);
  assert.match(r.stderr, /SnetForever_Rutas/);
  assert.equal(fs.existsSync(path.join(addons, 'SnetForever')), false);
  assert.equal(fs.existsSync(path.join(addons, 'SnetForever_Comercio')), false, 'tampoco el comercio');
});

test('instalar: un .lua sobrante se mueve a la cuarentena (con sufijo si ya existe) y se avisa', () => {
  const { addons, cuarentena } = preparar();
  const destino = path.join(addons, 'SnetForever');
  fs.mkdirSync(path.join(destino, 'ui'), { recursive: true });
  fs.writeFileSync(path.join(destino, 'ui', 'viejo.lua'), '-- sobrante 1');
  const r1 = ejecutar(addons, cuarentena);
  assert.equal(r1.status, 0, r1.stderr + r1.stdout);
  assert.equal(fs.existsSync(path.join(destino, 'ui', 'viejo.lua')), false);
  assert.match(r1.stdout, /viejo\.lua/);
  assert.match(r1.stdout, /cuarentena/i);
  const [sello] = fs.readdirSync(cuarentena);
  const movido = path.join(cuarentena, sello, 'SnetForever', 'ui', 'viejo.lua');
  assert.equal(fs.readFileSync(movido, 'utf8'), '-- sobrante 1');

  // Segundo sobrante igual, en la misma cuarentena (mismo sello forzado): no pisa el anterior.
  fs.writeFileSync(path.join(destino, 'ui', 'viejo.lua'), '-- sobrante 2');
  const r2 = spawnSync(process.execPath, [INSTALAR], {
    encoding: 'utf8',
    env: { ...process.env, SNF_ADDONS: addons, SNF_CUARENTENA: cuarentena, SNF_SELLO: sello },
  });
  assert.equal(r2.status, 0, r2.stderr + r2.stdout);
  assert.equal(fs.readFileSync(movido, 'utf8'), '-- sobrante 1');
  const hermanos = fs.readdirSync(path.dirname(movido)).filter((n) => n.startsWith('viejo.lua'));
  assert.equal(hermanos.length, 2);
});
