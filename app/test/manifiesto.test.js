// Pruebas de app/src/actualizar/manifiesto.mjs (fase 5, tarea 5; vigilancia 2): la firma Ed25519 del manifiesto sobre
// sus bytes exactos, la lectura del manifiesto (F1) con el esquema de datos de cada componente (F5-2), la comparación de
// versiones y las novedades frente a lo instalado. Las claves son temporales: se generan aquí con generateKeyPairSync.
// Nunca se usa ninguna clave de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, generateKeyPairSync, sign, createPublicKey } from 'node:crypto';
import {
  MAX_MANIFIESTO, MAX_FIRMA, ErrorManifiesto, compararVersiones, verificarFirma, validarManifiesto, leerManifiesto,
  novedades, comprobarPaquete, APP_CONOCE_COMERCIO,
} from '../src/actualizar/manifiesto.mjs';
import { CLAVE_PUBLICA } from '../src/actualizar/clave-publica.mjs';
import { empaquetar } from '../src/actualizar/paquete.mjs';

const H = 'a'.repeat(64);

// Pareja de claves de prueba (PEM SPKI la pública, como irá en clave-publica.mjs).
function claves() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publica: publicKey.export({ type: 'spki', format: 'pem' }), privada: privateKey };
}

// La firma tal como va en snetforever-manifiesto.json.sig: base64 de 64 bytes y un salto de línea.
function firmar(bytes, privada) {
  return `${sign(null, bytes, privada).toString('base64')}\n`;
}

// Un manifiesto F1 válido, con el esquema de datos (F5-2) en el addon y en los datos. `componentes` sustituye
// componentes enteros (null los quita) y el resto de claves sustituye las de arriba.
function f1({ componentes = {}, ...arriba } = {}) {
  const base = {
    addon: { version: '0.5.0', archivo: 'SnetForever-addon-0.5.0.snfpaq', tamano: 812345, sha256: H, appMinima: '0.5.0', esquemaDatos: 1 },
    rutas: { version: '2026.11.10.1', archivo: 'SnetForever-rutas-2026.11.10.1.snfpaq', tamano: 3123456, sha256: H, esquemaDatos: 1 },
    misiones: { version: '2026.11.10.1', archivo: 'SnetForever-misiones-2026.11.10.1.snfpaq', tamano: 3456789, sha256: H, esquemaDatos: 1 },
    app: { version: '0.5.0', archivo: 'SnetForever-app-0.5.0.snfpaq', tamano: 234567, sha256: H, nodeMinimo: '24.0.0' },
  };
  for (const [c, v] of Object.entries(componentes)) {
    if (v === null) delete base[c];
    else base[c] = v;
  }
  return {
    esquema: 1, producto: 'SnetForever', publicacion: 'v0.5.0-2026.11.10.1', fecha: '2026-11-10T12:00:00.000Z',
    componentes: base, notas: { es: 'Novedades', en: 'News' }, ...arriba,
  };
}

const bytes = (obj) => Buffer.from(`${JSON.stringify(obj, null, 2)}\n`, 'utf8');

function codigo(fn, esperado) {
  assert.throws(fn, (e) => {
    assert.ok(e instanceof ErrorManifiesto, `se esperaba ErrorManifiesto y salió ${e?.name}: ${e?.message}`);
    assert.equal(e.code, esperado, e.message);
    return true;
  });
}

// --- constantes y clave pública ---

test('MAX_MANIFIESTO es 64 KiB, MAX_FIRMA 1024 y la clave pública es una Ed25519 de verdad (la puso la T18)', () => {
  assert.equal(MAX_MANIFIESTO, 65536);
  assert.equal(MAX_FIRMA, 1024);
  assert.equal(typeof CLAVE_PUBLICA, 'string');
  assert.equal(createPublicKey(CLAVE_PUBLICA).asymmetricKeyType, 'ed25519');
});

// --- verificarFirma (vigilancia 2) ---

test('un manifiesto F1 firmado con la clave de prueba verifica', () => {
  const { publica, privada } = claves();
  const b = bytes(f1());
  assert.equal(verificarFirma(b, firmar(b, privada), publica), true);
  // sin el salto de línea final también vale (es la misma firma)
  assert.equal(verificarFirma(b, firmar(b, privada).trim(), publica), true);
  // y la firma puede llegar como Buffer (tal como la baja la red)
  assert.equal(verificarFirma(b, Buffer.from(firmar(b, privada)), publica), true);
});

test('vigilancia 2: firmado con otra clave → falso', () => {
  const buena = claves();
  const otra = claves();
  const b = bytes(f1());
  assert.equal(verificarFirma(b, firmar(b, otra.privada), buena.publica), false);
});

test('vigilancia 2: un byte cambiado en el manifiesto o en la firma → falso', () => {
  const { publica, privada } = claves();
  const b = bytes(f1());
  const firma = firmar(b, privada);
  const cambiado = Buffer.from(b);
  cambiado[10] ^= 0x01;
  assert.equal(verificarFirma(cambiado, firma, publica), false);
  const firmaCruda = Buffer.from(firma.trim(), 'base64');
  firmaCruda[0] ^= 0x01;
  assert.equal(verificarFirma(b, `${firmaCruda.toString('base64')}\n`, publica), false);
  // un salto de línea de más al final del manifiesto también es otro manifiesto
  assert.equal(verificarFirma(Buffer.concat([b, Buffer.from('\n')]), firma, publica), false);
});

test('vigilancia 2: una firma de 63 bytes, una de 65, o un texto que no es base64 → falso', () => {
  const { publica, privada } = claves();
  const b = bytes(f1());
  const cruda = sign(null, b, privada);
  assert.equal(verificarFirma(b, `${cruda.subarray(0, 63).toString('base64')}\n`, publica), false);
  assert.equal(verificarFirma(b, `${Buffer.concat([cruda, Buffer.from([0])]).toString('base64')}\n`, publica), false);
  assert.equal(verificarFirma(b, 'esto no es base64 ¡!', publica), false);
  assert.equal(verificarFirma(b, `${cruda.toString('base64').slice(0, -2)}\n`, publica), false); // sin el relleno
  assert.equal(verificarFirma(b, `${cruda.toString('base64url')}\n`, publica), false); // base64url no es el formato
  assert.equal(verificarFirma(b, ` ${cruda.toString('base64')}\n`, publica), false);
  assert.equal(verificarFirma(b, '', publica), false);
  assert.equal(verificarFirma(b, `${cruda.toString('base64')}\n`.padEnd(MAX_FIRMA + 1, ' '), publica), false);
});

test('vigilancia 2: con la clave null (o una clave que no es Ed25519, o basura) → falso, y nunca lanza', () => {
  const { publica, privada } = claves();
  const b = bytes(f1());
  const firma = firmar(b, privada);
  assert.equal(verificarFirma(b, firma, null), false);
  assert.equal(verificarFirma(b, firma, undefined), false);
  assert.equal(verificarFirma(b, firma, 'no es una clave'), false);
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' });
  assert.equal(verificarFirma(b, firma, rsa), false);
  const privadaPem = privada.export({ type: 'pkcs8', format: 'pem' });
  assert.equal(verificarFirma(b, firma, privadaPem), false); // una privada no hace de pública
  assert.equal(verificarFirma('texto', firma, publica), false);
  assert.equal(verificarFirma(null, firma, publica), false);
  assert.equal(verificarFirma(b, null, publica), false);
  assert.equal(verificarFirma(b, 42, publica), false);
});

// --- compararVersiones ---

test('compararVersiones: numérica por partes y con ceros a la derecha', () => {
  assert.equal(compararVersiones('2026.11.10.2', '2026.11.10.10'), -1);
  assert.equal(compararVersiones('0.5.0', '0.5'), 0);
  assert.equal(compararVersiones('0.5.0.1', '0.5.0'), 1);
  assert.equal(compararVersiones('0.5.0', '0.5.0.1'), -1);
  assert.equal(compararVersiones('0.10.0', '0.9.9'), 1);
  assert.equal(compararVersiones('1.0', '1.0.0.0'), 0);
  assert.equal(compararVersiones('24.14.0', '99.0.0'), -1);
  assert.equal(compararVersiones('0.05', '0.5'), 0); // ceros a la izquierda: misma cifra
  assert.equal(compararVersiones('1.99999999999999999999', '1.99999999999999999998'), 1); // sin perder precisión
});

test('compararVersiones: una versión que no es válida lanza', () => {
  for (const mala of ['', '1', '1.2.3.4.5', 'v1.2', '1.2-beta', '1..2', ' 1.2', null, undefined, 1.2, '1.2.']) {
    codigo(() => compararVersiones(mala, '1.0'), 'version');
    codigo(() => compararVersiones('1.0', mala), 'version');
  }
});

// --- leerManifiesto (F1) ---

test('leerManifiesto acepta el F1 del plan y devuelve sus campos', () => {
  const m = leerManifiesto(bytes(f1()));
  assert.equal(m.esquema, 1);
  assert.equal(m.producto, 'SnetForever');
  assert.equal(m.publicacion, 'v0.5.0-2026.11.10.1');
  assert.equal(m.fecha, '2026-11-10T12:00:00.000Z');
  assert.deepEqual(Object.keys(m.componentes).sort(), ['addon', 'app', 'misiones', 'rutas']);
  assert.deepEqual(m.componentes.addon, {
    version: '0.5.0', archivo: 'SnetForever-addon-0.5.0.snfpaq', tamano: 812345, sha256: H, appMinima: '0.5.0', esquemaDatos: 1,
  });
  assert.deepEqual(m.componentes.app, {
    version: '0.5.0', archivo: 'SnetForever-app-0.5.0.snfpaq', tamano: 234567, sha256: H, nodeMinimo: '24.0.0',
  });
  assert.deepEqual(m.notas, { es: 'Novedades', en: 'News' });
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.componentes) && Object.isFrozen(m.componentes.addon));
});

test('leerManifiesto: faltan componentes → vale (se publica solo lo que cambia); sin notas → textos vacíos', () => {
  const { notas: _, ...sinNotas } = f1({ componentes: { rutas: null, misiones: null, app: null } });
  const m = leerManifiesto(bytes(sinNotas));
  assert.deepEqual(Object.keys(m.componentes), ['addon']);
  assert.deepEqual(m.notas, { es: '', en: '' });
  assert.deepEqual(Object.keys(leerManifiesto(bytes(f1({ componentes: { addon: null, rutas: null, misiones: null, app: null } }))).componentes), []);
});

test('leerManifiesto: un componente "otro" se ignora, y las claves que no conoce de un componente no pasan', () => {
  const m = leerManifiesto(bytes(f1({ componentes: { otro: { version: '1.0', cualquiera: true } } })));
  assert.ok(!Object.hasOwn(m.componentes, 'otro'));
  const conDeMas = f1();
  conDeMas.componentes.addon.destino = 'C:\\Windows';
  assert.ok(!Object.hasOwn(leerManifiesto(bytes(conDeMas)).componentes.addon, 'destino'));
  // ni __proto__ cuela nada
  const proto = Buffer.from(JSON.stringify(f1()).replace('"componentes":{', '"componentes":{"__proto__":{"version":"9.9"},'));
  const mp = leerManifiesto(proto);
  assert.deepEqual(Object.keys(mp.componentes).sort(), ['addon', 'app', 'misiones', 'rutas']);
  assert.equal(Object.getPrototypeOf(mp.componentes), Object.prototype);
});

test("leerManifiesto: archivo que no es el de su componente y versión → 'archivo'", () => {
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, archivo: 'SnetForever-addon-0.5.1.snfpaq', version: '0.5.0' } } }))), 'archivo');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, archivo: 'SnetForever-rutas-0.5.0.snfpaq' } } }))), 'archivo');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, archivo: '../SnetForever-addon-0.5.0.snfpaq' } } }))), 'archivo');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, archivo: 'SnetForever-addon-0.5.0.SNFPAQ' } } }))), 'archivo');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, archivo: 7 } } }))), 'archivo');
});

test("leerManifiesto: sha256 en mayúsculas, corto o que falta → 'hash'", () => {
  codigo(() => leerManifiesto(bytes(f1({ componentes: { rutas: { ...f1().componentes.rutas, sha256: 'A'.repeat(64) } } }))), 'hash');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { rutas: { ...f1().componentes.rutas, sha256: 'a'.repeat(63) } } }))), 'hash');
  const { sha256: _, ...sinHash } = f1().componentes.rutas;
  codigo(() => leerManifiesto(bytes(f1({ componentes: { rutas: sinHash } }))), 'hash');
});

test("leerManifiesto: tamano 0, 1.5, negativo, de texto o de más de 150 MiB → 'tamano'", () => {
  for (const tamano of [0, 1.5, -3, '812345', 157286401, null]) {
    codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, tamano } } }))), 'tamano');
  }
  assert.equal(leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, tamano: 157286400 } } }))).componentes.addon.tamano, 157286400);
  assert.equal(leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, tamano: 1 } } }))).componentes.addon.tamano, 1);
});

test("leerManifiesto: esquema 2 (o que falta) → 'esquema'", () => {
  codigo(() => leerManifiesto(bytes(f1({ esquema: 2 }))), 'esquema');
  codigo(() => leerManifiesto(bytes(f1({ esquema: '1' }))), 'esquema');
  const { esquema: _, ...sin } = f1();
  codigo(() => leerManifiesto(bytes(sin)), 'esquema');
});

test("leerManifiesto: publicacion 'latest' u otra que no cumple el patrón → 'publicacion'", () => {
  for (const publicacion of ['latest', 'v0.5', '0.5.0', 'v0.5.0-', 'v0.5.0-abc', 'v0.5.0/../x', 5]) {
    codigo(() => leerManifiesto(bytes(f1({ publicacion }))), 'publicacion');
  }
  assert.equal(leerManifiesto(bytes(f1({ publicacion: 'v0.5.0' }))).publicacion, 'v0.5.0');
});

test("leerManifiesto: producto que no es SnetForever → 'producto'", () => {
  codigo(() => leerManifiesto(bytes(f1({ producto: 'OtroAddon' }))), 'producto');
  codigo(() => leerManifiesto(bytes(f1({ producto: 'snetforever' }))), 'producto');
});

test("leerManifiesto: fecha que no es ISO 8601 en UTC, o que no existe → 'fecha'", () => {
  for (const fecha of ['2026-11-10', '2026-11-10T12:00:00+01:00', '2026-02-30T12:00:00.000Z', 'ayer', 1731240000000, '2026-11-10T25:00:00Z']) {
    codigo(() => leerManifiesto(bytes(f1({ fecha }))), 'fecha');
  }
  assert.equal(leerManifiesto(bytes(f1({ fecha: '2026-11-10T12:00:00Z' }))).fecha, '2026-11-10T12:00:00Z');
});

test("leerManifiesto: versión, appMinima o nodeMinimo no válidos → 'version'", () => {
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, version: '0.5.0-beta', archivo: 'SnetForever-addon-0.5.0-beta.snfpaq' } } }))), 'version');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, appMinima: 'cero' } } }))), 'version');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { app: { ...f1().componentes.app, nodeMinimo: 24 } } }))), 'version');
});

test("leerManifiesto: componentes que no son un objeto, o un componente que no es un objeto → 'componente'", () => {
  const { componentes: _, ...sinComponentes } = f1();
  codigo(() => leerManifiesto(bytes(sinComponentes)), 'componente');
  codigo(() => leerManifiesto(bytes({ ...f1(), componentes: [] })), 'componente');
  codigo(() => leerManifiesto(bytes({ ...f1(), componentes: 'addon' })), 'componente');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: 'SnetForever-addon-0.5.0.snfpaq' } }))), 'componente');
});

test("leerManifiesto: no es JSON, no es un objeto, no es UTF-8 o pasa de 64 KiB → 'json'", () => {
  codigo(() => leerManifiesto(Buffer.from('{"esquema":1,')), 'json');
  codigo(() => leerManifiesto(Buffer.from('[1,2]')), 'json');
  codigo(() => leerManifiesto(Buffer.from('null')), 'json');
  codigo(() => leerManifiesto(Buffer.from([0x7b, 0xff, 0x7d])), 'json');
  codigo(() => leerManifiesto('{"esquema":1}'), 'json'); // tiene que ser un Buffer: lo firmado son bytes
  const grande = f1({ notas: { es: 'x'.repeat(MAX_MANIFIESTO), en: '' } });
  codigo(() => leerManifiesto(bytes(grande)), 'json');
});

// --- F5-2: esquema de datos ---

test('F5-2: el addon y los datos llevan esquemaDatos (entero de 1 en adelante) y la app no', () => {
  const { esquemaDatos: _, ...addonSin } = f1().componentes.addon;
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: addonSin } }))), 'componente');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { rutas: { ...f1().componentes.rutas, esquemaDatos: 0 } } }))), 'componente');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { misiones: { ...f1().componentes.misiones, esquemaDatos: 1.5 } } }))), 'componente');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { misiones: { ...f1().componentes.misiones, esquemaDatos: '1' } } }))), 'componente');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { app: { ...f1().componentes.app, esquemaDatos: 1 } } }))), 'componente');
});

test("F5-2: el addon y los datos publicados con esquemas distintos → 'compatibilidad'", () => {
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, esquemaDatos: 2 } } }))), 'compatibilidad');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { addon: null, misiones: { ...f1().componentes.misiones, esquemaDatos: 2 } } }))), 'compatibilidad');
  // todos en 2 → vale; solo el addon (sin datos en el manifiesto) → vale aquí (lo de lo instalado lo mira la tarea 9)
  const todos2 = f1();
  for (const c of ['addon', 'rutas', 'misiones']) todos2.componentes[c].esquemaDatos = 2;
  assert.equal(leerManifiesto(bytes(todos2)).componentes.rutas.esquemaDatos, 2);
  const soloAddon = f1({ componentes: { rutas: null, misiones: null } });
  soloAddon.componentes.addon.esquemaDatos = 3;
  assert.equal(leerManifiesto(bytes(soloAddon)).componentes.addon.esquemaDatos, 3);
});

test('validarManifiesto hace lo mismo que leerManifiesto sobre un objeto ya leído (para las herramientas)', () => {
  assert.deepEqual(validarManifiesto(f1()), leerManifiesto(bytes(f1())));
  codigo(() => validarManifiesto(f1({ esquema: 2 })), 'esquema');
  codigo(() => validarManifiesto(null), 'json');
});

// --- F5-2: cada paquete coincide con su entrada del manifiesto y con su cabecera ---

function paqueteDe(componente, version, esquemaDatos) {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-manifiesto-'));
  const carpeta = { addon: 'SnetForever', rutas: 'SnetForever_Rutas', misiones: 'SnetForever_Misiones', comercio: 'SnetForever_Comercio', app: 'app' }[componente];
  const ruta = join(raiz, carpeta, 'x.lua');
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `-- ${componente} ${version}\n`);
  return empaquetar({ componente, version, raiz, ...(componente === 'app' || componente === 'comercio' ? {} : { esquemaDatos }) });
}

function manifiestoPara(componente, buffer, entrada = {}) {
  const version = entrada.version ?? '0.5.1';
  const m = f1({ componentes: { addon: null, rutas: null, misiones: null, app: null } });
  m.componentes[componente] = {
    version, archivo: `SnetForever-${componente}-${version}.snfpaq`, tamano: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    ...(componente === 'app' || componente === 'comercio' ? {} : { esquemaDatos: 1 }), ...entrada,
  };
  return leerManifiesto(bytes(m));
}

test('comprobarPaquete: tamaño, SHA-256, componente, versión y esquema de datos iguales → devuelve el paquete abierto', () => {
  const buf = paqueteDe('addon', '0.5.1', 1);
  const abierto = comprobarPaquete(manifiestoPara('addon', buf), 'addon', buf);
  assert.equal(abierto.componente, 'addon');
  assert.equal(abierto.version, '0.5.1');
  assert.equal(abierto.esquemaDatos, 1);
  const app = paqueteDe('app', '0.5.1');
  assert.equal(comprobarPaquete(manifiestoPara('app', app), 'app', app).version, '0.5.1');
});

test("comprobarPaquete (vigilancia 2): otro tamaño → 'tamano', otro SHA-256 → 'hash', y sin abrirlo", () => {
  const buf = paqueteDe('rutas', '2026.11.10.2', 1);
  const m = manifiestoPara('rutas', buf, { version: '2026.11.10.2' });
  codigo(() => comprobarPaquete(m, 'rutas', Buffer.concat([buf, Buffer.from([0])])), 'tamano');
  const cambiado = Buffer.from(buf);
  cambiado[cambiado.length - 1] ^= 0x01;
  codigo(() => comprobarPaquete(m, 'rutas', cambiado), 'hash');
  codigo(() => comprobarPaquete(m, 'rutas', 'no es un buffer'), 'tamano');
});

test("comprobarPaquete: la cabecera dice otra versión → 'version'; otro esquema de datos → 'compatibilidad'", () => {
  const buf = paqueteDe('addon', '0.5.2', 1);
  codigo(() => comprobarPaquete(manifiestoPara('addon', buf, { version: '0.5.1' }), 'addon', buf), 'version');
  const buf2 = paqueteDe('misiones', '2026.11.10.3', 2);
  codigo(() => comprobarPaquete(manifiestoPara('misiones', buf2, { version: '2026.11.10.3' }), 'misiones', buf2), 'compatibilidad');
});

test("comprobarPaquete: un componente que no está en el manifiesto → 'componente'; el paquete de otro componente → error del paquete", () => {
  const buf = paqueteDe('addon', '0.5.1', 1);
  const m = manifiestoPara('addon', buf);
  codigo(() => comprobarPaquete(m, 'rutas', buf), 'componente');
  // el manifiesto dice «rutas» con los bytes de un paquete del addon: abrirPaquete se niega
  const mal = manifiestoPara('rutas', buf, { version: '0.5.1' });
  assert.throws(() => comprobarPaquete(mal, 'rutas', buf), (e) => e.name === 'ErrorPaquete' && e.code === 'componente');
});

// --- novedades ---

const instaladoBase = { addon: '0.5.0', rutas: '2026.11.10.1', misiones: '2026.11.10.1' };
const ctx = (extra = {}) => ({ instalado: instaladoBase, versionApp: '0.5.0', versionNode: '24.14.0', ultimaFecha: null, ...extra });

test('novedades: el addon de 0.5.0 a 0.5.1 → [{componente: addon, de: 0.5.0, a: 0.5.1}]', () => {
  const m = leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, version: '0.5.1', archivo: 'SnetForever-addon-0.5.1.snfpaq' } } })));
  assert.deepEqual(novedades(m, ctx()), { antiguo: false, lista: [{ componente: 'addon', de: '0.5.0', a: '0.5.1' }] });
});

test('novedades: versiones iguales → lista vacía; una versión instalada más nueva tampoco entra (no hay vuelta atrás)', () => {
  const m = leerManifiesto(bytes(f1()));
  assert.deepEqual(novedades(m, ctx()), { antiguo: false, lista: [] });
  assert.deepEqual(novedades(m, ctx({ instalado: { ...instaladoBase, addon: '0.5' } })).lista, []);
  assert.deepEqual(novedades(m, ctx({ instalado: { ...instaladoBase, addon: '0.6.0' }, versionApp: '0.6.0' })).lista, []);
});

test('novedades: un componente no instalado (null) entra', () => {
  const m = leerManifiesto(bytes(f1()));
  assert.deepEqual(novedades(m, ctx({ instalado: { ...instaladoBase, misiones: null } })).lista,
    [{ componente: 'misiones', de: null, a: '2026.11.10.1' }]);
});

test('novedades: la fecha anterior a ultimaFecha → antiguo y no se ofrece nada; la misma fecha o una posterior → no', () => {
  const m = leerManifiesto(bytes(f1({ componentes: { addon: { ...f1().componentes.addon, version: '0.5.1', archivo: 'SnetForever-addon-0.5.1.snfpaq' } } })));
  assert.deepEqual(novedades(m, ctx({ ultimaFecha: '2026-11-10T12:00:00.001Z' })), { antiguo: true, lista: [] });
  assert.equal(novedades(m, ctx({ ultimaFecha: '2026-11-10T12:00:00.000Z' })).antiguo, false);
  assert.equal(novedades(m, ctx({ ultimaFecha: '2026-11-09T23:59:59Z' })).antiguo, false);
  assert.equal(novedades(m, ctx({ ultimaFecha: undefined })).antiguo, false);
  assert.throws(() => novedades(m, ctx({ ultimaFecha: 'ayer' })), TypeError);
});

test('novedades: la app con nodeMinimo 99.0.0 → requiereInstalador', () => {
  const m = leerManifiesto(bytes(f1({ componentes: { app: { ...f1().componentes.app, version: '0.6.0', archivo: 'SnetForever-app-0.6.0.snfpaq', nodeMinimo: '99.0.0' } } })));
  assert.deepEqual(novedades(m, ctx()).lista, [{ componente: 'app', de: '0.5.0', a: '0.6.0', requiereInstalador: true }]);
  // con un nodeMinimo que se cumple, la app entra sin más
  const m2 = leerManifiesto(bytes(f1({ componentes: { app: { ...f1().componentes.app, version: '0.6.0', archivo: 'SnetForever-app-0.6.0.snfpaq', nodeMinimo: '24.14.0' } } })));
  assert.deepEqual(novedades(m2, ctx()).lista, [{ componente: 'app', de: '0.5.0', a: '0.6.0' }]);
});

test('novedades: addon con appMinima 0.6.0 y la app 0.6.0 en el manifiesto → entran los dos; sin la app → saltado app_minima', () => {
  const addon = { ...f1().componentes.addon, version: '0.6.0', archivo: 'SnetForever-addon-0.6.0.snfpaq', appMinima: '0.6.0' };
  const app = { ...f1().componentes.app, version: '0.6.0', archivo: 'SnetForever-app-0.6.0.snfpaq' };
  const conApp = leerManifiesto(bytes(f1({ componentes: { addon, app } })));
  assert.deepEqual(novedades(conApp, ctx()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.6.0' },
    { componente: 'app', de: '0.5.0', a: '0.6.0' },
  ]);
  const sinApp = leerManifiesto(bytes(f1({ componentes: { addon, app: null } })));
  assert.deepEqual(novedades(sinApp, ctx()).lista, [{ componente: 'addon', de: '0.5.0', a: '0.6.0', saltado: 'app_minima' }]);
});

test('novedades: si la app nueva pide el instalador, la que queda es la de ahora → el addon que pide la nueva se salta', () => {
  const addon = { ...f1().componentes.addon, version: '0.6.0', archivo: 'SnetForever-addon-0.6.0.snfpaq', appMinima: '0.6.0' };
  const app = { ...f1().componentes.app, version: '0.6.0', archivo: 'SnetForever-app-0.6.0.snfpaq', nodeMinimo: '99.0.0' };
  const m = leerManifiesto(bytes(f1({ componentes: { addon, app } })));
  assert.deepEqual(novedades(m, ctx()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.6.0', saltado: 'app_minima' },
    { componente: 'app', de: '0.5.0', a: '0.6.0', requiereInstalador: true },
  ]);
});

test('F5-2 en novedades: si el addon nuevo se salta, los datos que entran con él también se saltan (no quedan datos sin su addon)', () => {
  const addon = { ...f1().componentes.addon, version: '0.6.0', archivo: 'SnetForever-addon-0.6.0.snfpaq', appMinima: '0.6.0', esquemaDatos: 2 };
  const rutas = { ...f1().componentes.rutas, version: '2026.12.01.1', archivo: 'SnetForever-rutas-2026.12.01.1.snfpaq', esquemaDatos: 2 };
  const m = leerManifiesto(bytes(f1({ componentes: { addon, rutas, misiones: null, app: null } })));
  assert.deepEqual(novedades(m, ctx()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.6.0', saltado: 'app_minima' },
    { componente: 'rutas', de: '2026.11.10.1', a: '2026.12.01.1', saltado: 'app_minima' },
  ]);
});

test('novedades: los datos solos (sin addon nuevo) entran aunque la app sea vieja', () => {
  const rutas = { ...f1().componentes.rutas, version: '2026.12.01.1', archivo: 'SnetForever-rutas-2026.12.01.1.snfpaq' };
  const m = leerManifiesto(bytes(f1({ componentes: { rutas, app: null } })));
  assert.deepEqual(novedades(m, ctx({ versionApp: '0.4.0' })).lista, [{ componente: 'rutas', de: '2026.11.10.1', a: '2026.12.01.1' }]);
});

// --- Task 8: el comercio es un componente más (SnetForever_Comercio), sin esquema de datos ---

const entradaComercio = (version = '0.7.0', extra = {}) => ({
  version, archivo: `SnetForever-comercio-${version}.snfpaq`, tamano: 345678, sha256: H, appMinima: '0.7.0', ...extra,
});

test('comercio (Task 8): el manifiesto lo admite sin esquema de datos y con appMinima; con esquema de datos no', () => {
  const m = leerManifiesto(bytes(f1({ componentes: { comercio: entradaComercio() } })));
  assert.deepEqual({ ...m.componentes.comercio }, entradaComercio());
  assert.ok(!Object.hasOwn(m.componentes.comercio, 'esquemaDatos'));
  codigo(() => leerManifiesto(bytes(f1({ componentes: { comercio: entradaComercio('0.7.0', { esquemaDatos: 1 }) } }))), 'componente');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { comercio: entradaComercio('0.7.0', { archivo: 'SnetForever-addon-0.7.0.snfpaq' }) } }))), 'archivo');
  codigo(() => leerManifiesto(bytes(f1({ componentes: { comercio: entradaComercio('0.7.0', { appMinima: 'nueva' }) } }))), 'version');
  // el esquema de datos del addon y de los datos no se mezcla con el comercio
  assert.equal(m.componentes.addon.esquemaDatos, 1);
});

test('comercio (Task 8): comprobarPaquete lo abre con su versión y sin esquema de datos', () => {
  const buf = paqueteDe('comercio', '0.7.0');
  const abierto = comprobarPaquete(manifiestoPara('comercio', buf, { version: '0.7.0' }), 'comercio', buf);
  assert.equal(abierto.componente, 'comercio');
  assert.equal(abierto.esquemaDatos, undefined);
  const mal = paqueteDe('comercio', '0.7.1');
  codigo(() => comprobarPaquete(manifiestoPara('comercio', mal, { version: '0.7.0' }), 'comercio', mal), 'version');
});

test('comercio (Task 8): novedades lo ofrece después del addon y antes de la app', () => {
  const addon = { ...f1().componentes.addon, version: '0.7.0', archivo: 'SnetForever-addon-0.7.0.snfpaq', appMinima: '0.7.0' };
  const app = { ...f1().componentes.app, version: '0.7.0', archivo: 'SnetForever-app-0.7.0.snfpaq' };
  const m = leerManifiesto(bytes(f1({ componentes: { addon, app, comercio: entradaComercio() } })));
  const r = novedades(m, ctx({ instalado: { ...instaladoBase, comercio: null } }));
  assert.deepEqual(r.lista.map((i) => i.componente), ['addon', 'comercio', 'app']);
  assert.deepEqual(r.lista[1], { componente: 'comercio', de: null, a: '0.7.0' });
  // ya instalado y al día: no se vuelve a ofrecer; sin la clave `comercio` en lo instalado, entra
  assert.deepEqual(novedades(m, ctx({ instalado: { ...instaladoBase, addon: '0.7.0', comercio: '0.7.0' }, versionApp: '0.7.0' })).lista, []);
  assert.deepEqual(novedades(m, ctx({ instalado: { ...instaladoBase, addon: '0.7.0' }, versionApp: '0.7.0' })).lista.map((i) => i.componente), ['comercio']);
});

test('comercio (Task 8): si el addon se salta por la app mínima, el comercio se salta con él (nunca el comercio nuevo con el núcleo viejo)', () => {
  const addon = { ...f1().componentes.addon, version: '0.7.0', archivo: 'SnetForever-addon-0.7.0.snfpaq', appMinima: '0.7.0' };
  const m = leerManifiesto(bytes(f1({ componentes: { addon, comercio: entradaComercio(), app: null } })));
  assert.deepEqual(novedades(m, ctx()).lista, [
    { componente: 'addon', de: '0.5.0', a: '0.7.0', saltado: 'app_minima' },
    { componente: 'comercio', de: null, a: '0.7.0', saltado: 'app_minima' },
  ]);
  // el comercio con su propia appMinima más alta que la app que queda también se salta
  const solo = leerManifiesto(bytes(f1({ componentes: { comercio: entradaComercio('0.7.0', { appMinima: '0.8.0' }), app: null } })));
  assert.deepEqual(novedades(solo, ctx()).lista, [{ componente: 'comercio', de: null, a: '0.7.0', saltado: 'app_minima' }]);
});

test('Task 8, ronda 1: APP_CONOCE_COMERCIO es la 0.7.0 y la app de esta rama ya la conoce', async () => {
  const { VERSION } = await import('../src/version.mjs');
  assert.equal(APP_CONOCE_COMERCIO, '0.7.0');
  assert.ok(compararVersiones(VERSION, APP_CONOCE_COMERCIO) >= 0, `la app es la ${VERSION}`);
});
