// Pruebas de app/src/mover.mjs (tarea 3 de la fase 5, vigilancia 3): mover sin pisar nunca, también entre unidades
// (EXDEV), con copia comprobada byte a byte antes de quitar el original. Todo en carpetas temporales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, copyFileSync, symlinkSync, linkSync,
  unlinkSync, utimesSync, lstatSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { moverSinPisar, moverDentro } from '../src/mover.mjs';

const AHORA = new Date(2026, 10, 10, 9, 5, 7); // sufijo -20261110-090507 (hora local)
const SUFIJO = '-20261110-090507';

function temporal() {
  return mkdtempSync(join(tmpdir(), 'snf-mover-'));
}

function exdev() {
  return Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
}
const renombrarExdev = () => { throw exdev(); };
// Otra unidad para archivos y carpetas: ni el enlace duro ni el renombre valen.
const OTRA_UNIDAD = { renombrar: renombrarExdev, enlazar: renombrarExdev };

// Carpeta SnetForever con 3 archivos, uno de ellos en «José Ñandú/», y una carpeta vacía.
function carpetaAddon(raiz) {
  const dir = join(raiz, 'SnetForever');
  mkdirSync(join(dir, 'José Ñandú'), { recursive: true });
  mkdirSync(join(dir, 'vacía'));
  writeFileSync(join(dir, 'SnetForever.toc'), '## Interface: 16001\n## Version: 0.5.0\n', 'utf8');
  writeFileSync(join(dir, 'nucleo.lua'), Buffer.from([0, 1, 2, 255, 254, 10, 13, 0x80]));
  writeFileSync(join(dir, 'José Ñandú', 'ñ.lua'), 'local ñ = "acentos: áéíóú"\n', 'utf8');
  return dir;
}

// Todos los archivos de una carpeta (rutas relativas con /) y sus bytes.
function contenido(dir, base = dir, salida = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    const rel = ruta.slice(base.length + 1).replace(/\\/g, '/');
    if (e.isDirectory()) {
      salida[`${rel}/`] = true;
      contenido(ruta, base, salida);
    } else salida[rel] = readFileSync(ruta).toString('base64');
  }
  return salida;
}

test('misma unidad: renombra el archivo y la carpeta y devuelve el destino', () => {
  const t = temporal();
  writeFileSync(join(t, 'a.txt'), 'uno');
  const final = moverSinPisar(join(t, 'a.txt'), join(t, 'cuarentena', 'sello', 'a.txt'));
  assert.equal(final, join(t, 'cuarentena', 'sello', 'a.txt'));
  assert.equal(readFileSync(final, 'utf8'), 'uno');
  assert.equal(existsSync(join(t, 'a.txt')), false);

  const dir = carpetaAddon(t);
  const antes = contenido(dir);
  const finalDir = moverSinPisar(dir, join(t, 'cuarentena', 'sello', 'SnetForever'));
  assert.deepEqual(contenido(finalDir), antes);
  assert.equal(existsSync(dir), false);
});

test('un destino que ya existe no se pisa: se usa una ruta con sufijo -AAAAMMDD-HHMMSS y luego un contador', () => {
  const t = temporal();
  const q = join(t, 'q');
  mkdirSync(q);
  writeFileSync(join(q, 'a.txt'), 'ya estaba');
  writeFileSync(join(t, 'a.txt'), 'nuevo 1');
  const f1 = moverSinPisar(join(t, 'a.txt'), join(q, 'a.txt'), { ahora: AHORA });
  assert.equal(f1, join(q, `a${SUFIJO}.txt`));
  writeFileSync(join(t, 'a.txt'), 'nuevo 2');
  const f2 = moverSinPisar(join(t, 'a.txt'), join(q, 'a.txt'), { ahora: AHORA });
  assert.equal(f2, join(q, `a${SUFIJO}-2.txt`));
  assert.equal(readFileSync(join(q, 'a.txt'), 'utf8'), 'ya estaba');
  assert.equal(readFileSync(f1, 'utf8'), 'nuevo 1');
  assert.equal(readFileSync(f2, 'utf8'), 'nuevo 2');

  // carpetas: lo mismo, y la que ya estaba queda entera
  mkdirSync(join(q, 'SnetForever'));
  writeFileSync(join(q, 'SnetForever', 'viejo.lua'), 'viejo');
  const dir = carpetaAddon(t);
  const antes = contenido(dir);
  const fd = moverSinPisar(dir, join(q, 'SnetForever'), { ahora: AHORA, renombrar: renombrarExdev });
  assert.equal(fd, join(q, `SnetForever${SUFIJO}`));
  assert.deepEqual(contenido(fd), antes);
  assert.deepEqual(contenido(join(q, 'SnetForever')), { 'viejo.lua': Buffer.from('viejo').toString('base64') });
});

test('vigilancia 3, EXDEV: la carpeta SnetForever (con «José Ñandú/») llega entera y el original ya no existe', () => {
  const t = temporal();
  const dir = carpetaAddon(t);
  const antes = contenido(dir);
  assert.equal(Object.keys(antes).filter((k) => !k.endsWith('/')).length, 3);
  const destino = join(t, 'otra unidad', '_CUARENTENA', 'SnetForever', 'sello', 'SnetForever');
  const final = moverSinPisar(dir, destino, { renombrar: renombrarExdev });
  assert.equal(final, destino);
  assert.deepEqual(contenido(final), antes, 'los 3 archivos con los mismos bytes, y también la carpeta vacía');
  assert.equal(existsSync(dir), false, 'el original ya no existe');
  assert.deepEqual(readdirSync(t).sort(), ['otra unidad']);
});

test('EXDEV con un archivo suelto: se copia, se comprueba y se quita el original', () => {
  const t = temporal();
  writeFileSync(join(t, 'buzon.lua'), 'return {}');
  const final = moverSinPisar(join(t, 'buzon.lua'), join(t, 'q', 'buzon.lua'), OTRA_UNIDAD);
  assert.equal(readFileSync(final, 'utf8'), 'return {}');
  assert.equal(existsSync(join(t, 'buzon.lua')), false);
});

test('vigilancia 3, EXDEV: si la copia escribe un byte distinto, error code COPIA y el original sigue entero', () => {
  const t = temporal();
  const dir = carpetaAddon(t);
  const antes = contenido(dir);
  // copyFileSync simulado: copia bien, salvo el archivo de «José Ñandú/», al que le cambia un byte
  const copiar = (origen, destino, modo) => {
    copyFileSync(origen, destino, modo);
    if (basename(dirname(origen)) === 'José Ñandú') {
      const b = readFileSync(destino);
      b[0] ^= 1;
      writeFileSync(destino, b);
    }
  };
  assert.throws(() => moverSinPisar(dir, join(t, 'q', 'SnetForever'), { renombrar: renombrarExdev, copiar }),
    (e) => e.code === 'COPIA' && /SnetForever/.test(e.message));
  assert.deepEqual(contenido(dir), antes, 'el original sigue entero');
});

test('EXDEV: si la copia sale más corta (un archivo a medias), también COPIA y el original sigue entero', () => {
  const t = temporal();
  writeFileSync(join(t, 'a.lua'), 'contenido largo');
  const copiar = (origen, destino) => writeFileSync(destino, 'contenido');
  assert.throws(() => moverSinPisar(join(t, 'a.lua'), join(t, 'q', 'a.lua'), { ...OTRA_UNIDAD, copiar }),
    (e) => e.code === 'COPIA');
  assert.equal(readFileSync(join(t, 'a.lua'), 'utf8'), 'contenido largo');
});

test('EXDEV: una carpeta con un enlace o una unión dentro no se copia ni se quita (code COPIA), y lo de fuera no se toca',
  { skip: process.platform !== 'win32' }, () => {
    const t = temporal();
    const dir = carpetaAddon(t);
    const fuera = join(t, 'fuera');
    mkdirSync(fuera);
    writeFileSync(join(fuera, 'ajeno.txt'), 'no es nuestro');
    symlinkSync(fuera, join(dir, 'union'), 'junction');
    const antes = contenido(fuera);
    assert.throws(() => moverSinPisar(dir, join(t, 'q', 'SnetForever'), { renombrar: renombrarExdev }), (e) => e.code === 'COPIA');
    assert.deepEqual(contenido(fuera), antes);
    assert.ok(existsSync(join(dir, 'nucleo.lua')));
    assert.equal(existsSync(join(t, 'q', 'SnetForever')), false, 'no se empieza a copiar');
  });

test('un fallo que no es EXDEV (EBUSY, juego abierto) se lanza tal cual y no se toca nada', () => {
  const t = temporal();
  const dir = carpetaAddon(t);
  const antes = contenido(dir);
  const ocupado = () => { throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); };
  assert.throws(() => moverSinPisar(dir, join(t, 'q', 'SnetForever'), { renombrar: ocupado }), (e) => e.code === 'EBUSY');
  assert.deepEqual(contenido(dir), antes);
});

test('moverDentro: mueve dentro de la carpeta con el mismo nombre, sin pisar', () => {
  const t = temporal();
  const dir = carpetaAddon(t);
  const q = join(t, 'cuarentena', 'José Ñandú');
  const final = moverDentro(dir, q, { ahora: AHORA });
  assert.equal(final, join(q, 'SnetForever'));
  const otra = carpetaAddon(t);
  const final2 = moverDentro(otra, q, { ahora: AHORA, renombrar: renombrarExdev });
  assert.equal(final2, join(q, `SnetForever${SUFIJO}`));
  assert.ok(statSync(final2).isDirectory());
  assert.equal(existsSync(otra), false);
});

// ---------- ronda 1 de la revisión ----------

test('ronda 1: un archivo ajeno que aparece en el destino entre rutaLibre y el movimiento no se pisa (EEXIST → otra ruta)', () => {
  const t = temporal();
  const q = join(t, 'q');
  writeFileSync(join(t, 'a.lua'), 'nuestro');
  let llamadas = 0;
  // enlazar simulado: la primera vez, «otro» crea el destino justo antes del enlace duro
  const enlazar = (origen, final) => {
    llamadas += 1;
    if (llamadas === 1) writeFileSync(final, 'ajeno');
    linkSync(origen, final);
  };
  const final = moverSinPisar(join(t, 'a.lua'), join(q, 'a.lua'), { enlazar, ahora: AHORA });
  assert.equal(llamadas, 2);
  assert.equal(final, join(q, `a${SUFIJO}.lua`));
  assert.equal(readFileSync(join(q, 'a.lua'), 'utf8'), 'ajeno', 'el ajeno queda intacto');
  assert.equal(readFileSync(final, 'utf8'), 'nuestro');
  assert.equal(existsSync(join(t, 'a.lua')), false);
});

test('ronda 1: sin enlaces duros (FAT/exFAT), plan B: se reserva el nombre con wx y se renombra sobre la reserva', () => {
  for (const codigo of ['EPERM', 'ENOTSUP', 'ENOSYS', 'EINVAL', 'EISDIR']) {
    const t = temporal();
    writeFileSync(join(t, 'a.lua'), codigo);
    const sinEnlaces = () => { throw Object.assign(new Error(codigo), { code: codigo }); };
    const final = moverSinPisar(join(t, 'a.lua'), join(t, 'q', 'a.lua'), { enlazar: sinEnlaces });
    assert.equal(final, join(t, 'q', 'a.lua'), codigo);
    assert.equal(readFileSync(final, 'utf8'), codigo);
    assert.equal(existsSync(join(t, 'a.lua')), false, codigo);
  }
});

test('ronda 1: plan B con un ajeno que aparece antes de la reserva: no se pisa y se usa otra ruta', () => {
  const t = temporal();
  const q = join(t, 'q');
  writeFileSync(join(t, 'a.lua'), 'nuestro');
  let llamadas = 0;
  const enlazar = (origen, final) => {
    llamadas += 1;
    writeFileSync(final, 'ajeno');
    throw Object.assign(new Error('ENOTSUP'), { code: 'ENOTSUP' });
  };
  const final = moverSinPisar(join(t, 'a.lua'), join(q, 'a.lua'), { enlazar, ahora: AHORA });
  assert.equal(llamadas, 1, 'tras saber que no hay enlaces duros, ya no se prueba otra vez');
  assert.equal(readFileSync(join(q, 'a.lua'), 'utf8'), 'ajeno');
  assert.equal(final, join(q, `a${SUFIJO}.lua`));
  assert.equal(readFileSync(final, 'utf8'), 'nuestro');
  assert.equal(existsSync(join(t, 'a.lua')), false);
});

test('ronda 1: plan B y otra unidad: se copia sobre la reserva propia, se comprueba y se quita el original', () => {
  const t = temporal();
  writeFileSync(join(t, 'a.lua'), 'a la memoria');
  const sinEnlaces = () => { throw Object.assign(new Error('ENOTSUP'), { code: 'ENOTSUP' }); };
  const final = moverSinPisar(join(t, 'a.lua'), join(t, 'q', 'a.lua'), { enlazar: sinEnlaces, renombrar: renombrarExdev });
  assert.equal(final, join(t, 'q', 'a.lua'));
  assert.equal(readFileSync(final, 'utf8'), 'a la memoria');
  assert.equal(existsSync(join(t, 'a.lua')), false);
});

test('ronda 1: un archivo enlazado cuyo original no se puede quitar: el error lleva copia = la ruta final', () => {
  const t = temporal();
  writeFileSync(join(t, 'a.lua'), 'x');
  const ocupado = () => { throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); };
  assert.throws(() => moverSinPisar(join(t, 'a.lua'), join(t, 'q', 'a.lua'), { quitar: ocupado }),
    (e) => e.code === 'EBUSY' && e.copia === join(t, 'q', 'a.lua'));
  assert.equal(readFileSync(join(t, 'a.lua'), 'utf8'), 'x');
  assert.equal(readFileSync(join(t, 'q', 'a.lua'), 'utf8'), 'x');
});

test('ronda 1: EXDEV y un unlinkSync que falla a mitad: el error lleva copia y la copia está entera (mover a medias)', () => {
  const t = temporal();
  const dir = carpetaAddon(t);
  const antes = contenido(dir);
  let quitados = 0;
  const quitar = (ruta) => {
    quitados += 1;
    if (quitados === 2) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    unlinkSync(ruta);
  };
  const destino = join(t, 'q', 'SnetForever');
  assert.throws(() => moverSinPisar(dir, destino, { ...OTRA_UNIDAD, quitar }), (e) => e.code === 'EBUSY' && e.copia === destino);
  assert.deepEqual(contenido(destino), antes, 'la copia completa y comprobada está en e.copia');
  assert.ok(existsSync(dir), 'el original queda a medias, no desaparece');
});

test('ronda 1: tras un COPIA con la copia empezada, e.copia dice dónde quedó lo copiado a medias', () => {
  const t = temporal();
  const dir = carpetaAddon(t);
  const copiar = (origen, destino, modo) => {
    copyFileSync(origen, destino, modo);
    if (basename(origen) === 'nucleo.lua') writeFileSync(destino, 'otra cosa');
  };
  const destino = join(t, 'q', 'SnetForever');
  assert.throws(() => moverSinPisar(dir, destino, { ...OTRA_UNIDAD, copiar }), (e) => e.code === 'COPIA' && e.copia === destino);
  assert.ok(existsSync(destino));
});

test('ronda 1: si el original cambia (tamaño o fecha) después de comprobar la copia, COPIA y el original se queda', () => {
  const t = temporal();
  const dir = carpetaAddon(t);
  const antes = contenido(dir);
  // la copia es idéntica en bytes, pero «el juego» toca la fecha del original mientras tanto
  const copiar = (origen, destino, modo) => {
    copyFileSync(origen, destino, modo);
    if (basename(origen) === 'SnetForever.toc') utimesSync(origen, new Date(2020, 0, 1), new Date(2020, 0, 1));
  };
  assert.throws(() => moverSinPisar(dir, join(t, 'q', 'SnetForever'), { ...OTRA_UNIDAD, copiar }),
    (e) => e.code === 'COPIA' && e.copia === join(t, 'q', 'SnetForever') && /cambiado/.test(e.message));
  assert.deepEqual(contenido(dir), antes, 'el original sigue entero');
});

test('ronda 1: archivos de más de 1 MB se comparan por trozos (iguales se mueven; un byte distinto al final da COPIA)', () => {
  const t = temporal();
  const grande = Buffer.alloc(2_500_000);
  for (let i = 0; i < grande.length; i++) grande[i] = (i * 31) & 0xff;
  writeFileSync(join(t, 'grande.bin'), grande);
  const f = moverSinPisar(join(t, 'grande.bin'), join(t, 'q', 'grande.bin'), OTRA_UNIDAD);
  assert.ok(readFileSync(f).equals(grande));
  assert.equal(existsSync(join(t, 'grande.bin')), false);

  writeFileSync(join(t, 'grande2.bin'), grande);
  const copiar = (origen, destino, modo) => {
    copyFileSync(origen, destino, modo);
    const b = readFileSync(destino);
    b[2_400_000] ^= 1;
    writeFileSync(destino, b);
  };
  assert.throws(() => moverSinPisar(join(t, 'grande2.bin'), join(t, 'q', 'grande2.bin'), { ...OTRA_UNIDAD, copiar }), (e) => e.code === 'COPIA');
  assert.ok(readFileSync(join(t, 'grande2.bin')).equals(grande));
});

test('ronda 1: un origen que no existe lanza ENOENT y no crea nada en el destino', () => {
  const t = temporal();
  assert.throws(() => moverSinPisar(join(t, 'no está'), join(t, 'q', 'x', 'no está')), (e) => e.code === 'ENOENT');
  assert.deepEqual(readdirSync(t), []);
});

test('ronda 1: EXDEV con una unión en la raíz del origen: COPIA sin copiar nada, sin e.copia, y lo de fuera intacto',
  { skip: process.platform !== 'win32' }, () => {
    const t = temporal();
    const fuera = join(t, 'fuera');
    mkdirSync(fuera);
    writeFileSync(join(fuera, 'ajeno.txt'), 'no es nuestro');
    symlinkSync(fuera, join(t, 'SnetForever'), 'junction');
    assert.throws(() => moverSinPisar(join(t, 'SnetForever'), join(t, 'q', 'SnetForever'), OTRA_UNIDAD),
      (e) => e.code === 'COPIA' && e.copia === undefined);
    assert.deepEqual(contenido(fuera), { 'ajeno.txt': Buffer.from('no es nuestro').toString('base64') });
    assert.ok(lstatSync(join(t, 'SnetForever')).isSymbolicLink(), 'la unión se queda');
    assert.equal(existsSync(join(t, 'q', 'SnetForever')), false);
  });
