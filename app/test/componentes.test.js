// Pruebas de app/src/instalador/componentes.mjs (fase 5, tarea 8; vigilancia 1): instalar el addon y los datos con el
// juego cerrado, con vuelta atrás si el juego se abre a mitad o Windows da EBUSY/EPERM/EACCES al renombrar. Todo en
// carpetas temporales (un AddOns de prueba con acentos y espacios); nunca la carpeta real del juego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, renameSync, symlinkSync, lstatSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { empaquetar, extraerPaquete } from '../src/actualizar/paquete.mjs';
import { moverDentro } from '../src/mover.mjs';
import {
  ErrorInstalar, estadoInstalado, esquemasInstalados, instalarComponentes, PREPARANDO, MAX_RUTA_WINDOWS,
} from '../src/instalador/componentes.mjs';

function temporal() {
  return mkdtempSync(join(tmpdir(), 'snf-componentes-'));
}

// La marca de estado roto va por defecto a la carpeta de datos: en estas pruebas, nunca la de verdad.
process.env.SNF_DATOS = temporal();

test('la marca de estado roto, por defecto, va a la carpeta de datos (aquí, la temporal de SNF_DATOS)', async () => {
  const m = montar();
  const renombrar = (origen, destino) => {
    if (origen === join(m.addons, 'SnetForever') && !destino.endsWith('viejo-SnetForever')) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    if (origen === join(m.addons, 'SnetForever_Rutas')) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    return renameSync(origen, destino);
  };
  const e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, renombrar, dormir: sinEsperas(),
  }), 'ocupado');
  assert.equal(e.detalle.marca, join(process.env.SNF_DATOS, 'estado-roto.json'));
  assert.ok(existsSync(e.detalle.marca));
});

// Escribe `archivos` ({ruta con /: contenido}) bajo `raiz`.
function arbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}

// Con `esquema`, la línea «## X-SNF-EsquemaDatos» del .toc del addon (F5-2).
const toc = (titulo, version, esquema = null) => `## Interface: 16001\n## Title: ${titulo}\n## Version: ${version}\n`
  + `${esquema === null ? '' : `## X-SNF-EsquemaDatos: ${esquema}\n`}\nnucleo.lua\n`;
const nucleoRutas = (version, esquema = 1) => `-- datos\nSNF_RUTAS = {version="${version}",esquema=${esquema},guias={},grupos={}}\n`;
const nucleoMisiones = (version, esquema = 1) => `-- datos\nSNF_MISIONES = {version="${version}",esquema=${esquema},quest={}}\n`;

// El AddOns de prueba: SnetForever 0.4.0 (con un viejo.lua de más), SnetForever_Rutas 2026.11.09.7, RXPGuides y una ranura.
// `esquemaAddon`: la línea X-SNF-EsquemaDatos del addon 0.4.0 (null: un addon viejo sin ella). `rutas: false`: sin
// SnetForever_Rutas.
function montar(t = temporal(), { esquemaAddon = 1, rutas = true } = {}) {
  const addons = join(t, 'World of Warcraft', 'Jugón Ñ', '_forever_', 'Interface', 'AddOns');
  arbol(addons, {
    'SnetForever/SnetForever.toc': toc('SnetForever', '0.4.0', esquemaAddon),
    'SnetForever/nucleo.lua': 'SnetForever = {VERSION = "0.4.0"}\n',
    'SnetForever/viejo.lua': '-- solo en la 0.4.0\n',
    ...(rutas ? {
      'SnetForever_Rutas/SnetForever_Rutas.toc': toc('SnetForever - Rutas', '2026.11.09.7'),
      'SnetForever_Rutas/nucleo.lua': nucleoRutas('2026.11.09.7'),
    } : {}),
    'RXPGuides/x.lua': '-- de otro\n',
    'SnetForever_R001/buzon.lua': 'SNF_BUZON = nil\n',
  });
  const raizCuarentena = join(t, 'cuarentena');
  const llamadas = [];
  // Como cuarentenaComponentes: una carpeta nueva por llamada.
  const cuarentena = () => {
    const ruta = join(raizCuarentena, `q${llamadas.length + 1}`);
    mkdirSync(ruta, { recursive: true });
    llamadas.push(ruta);
    return ruta;
  };
  return { t, addons, raizCuarentena, cuarentena, llamadas };
}

// Un paquete de `componente` con su .toc y su nucleo.lua (y `extra`: {ruta dentro de la carpeta: contenido}).
function paquete(t, componente, version, { esquema = 1, extra = {} } = {}) {
  const raiz = mkdtempSync(join(t, 'fuente-'));
  const carpeta = { addon: 'SnetForever', rutas: 'SnetForever_Rutas', misiones: 'SnetForever_Misiones' }[componente];
  const nucleo = componente === 'addon' ? `SnetForever = {VERSION = "${version}"}\n`
    : componente === 'rutas' ? nucleoRutas(version, esquema) : nucleoMisiones(version, esquema);
  const archivos = {
    [`${carpeta}/${carpeta}.toc`]: toc(carpeta, version, componente === 'addon' ? esquema : null), [`${carpeta}/nucleo.lua`]: nucleo,
  };
  for (const [ruta, contenido] of Object.entries(extra)) archivos[`${carpeta}/${ruta}`] = contenido;
  arbol(raiz, archivos);
  return { componente, buffer: empaquetar({ componente, version, raiz, esquemaDatos: esquema }) };
}

// Todo lo que hay en una carpeta: {ruta relativa con /: bytes en base64, o 'carpeta' para las carpetas}.
function foto(dir, { sin = [] } = {}) {
  const salida = {};
  if (!existsSync(dir)) return salida;
  const recorrer = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = join(d, e.name);
      const rel = relative(dir, r).replace(/\\/g, '/');
      if (sin.includes(rel)) continue;
      if (e.isSymbolicLink()) salida[rel] = 'enlace'; // un enlace o una unión no se sigue
      else if (e.isDirectory()) {
        salida[`${rel}/`] = 'carpeta';
        recorrer(r);
      } else salida[rel] = readFileSync(r).toString('base64');
    }
  };
  recorrer(dir);
  return salida;
}

const archivosDe = (dir) => Object.entries(foto(dir)).filter(([, v]) => v !== 'carpeta').map(([k]) => k); // y los enlaces
const contar = (...dirs) => dirs.reduce((n, d) => n + archivosDe(d).length, 0);
// Rutas (relativas, con /; las carpetas acaban en /) de la cuarentena que acaban en `cola`.
const enCuarentena = (raiz, cola) => Object.keys(foto(raiz)).filter((r) => r === cola || r.endsWith(`/${cola}`));

const cerrado = async () => false;
const sinEsperas = (esperas = []) => async (ms) => { esperas.push(ms); };

async function rechaza(promesa, code) {
  try {
    await promesa;
  } catch (e) {
    assert.ok(e instanceof ErrorInstalar, `se esperaba ErrorInstalar y llegó ${e?.name}: ${e?.message}`);
    assert.equal(e.code, code, e.message);
    return e;
  }
  assert.fail(`se esperaba el error «${code}»`);
}

test('instala el addon 0.5.0 y las rutas 2026.11.10.1: lo viejo a la cuarentena y lo ajeno sin tocar', async () => {
  const m = montar();
  const antesAjenos = { rxp: foto(join(m.addons, 'RXPGuides')), r001: foto(join(m.addons, 'SnetForever_R001')) };
  const antes = contar(m.addons, m.raizCuarentena);
  const paquetes = [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')];

  const r = await instalarComponentes(m.addons, paquetes, { cuarentena: m.cuarentena, juegoAbierto: cerrado, dormir: sinEsperas() });

  assert.deepEqual(r.instalados, ['addon', 'rutas']);
  assert.equal(m.llamadas.length, 1, 'una sola carpeta de cuarentena por instalación');
  assert.equal(r.cuarentena, m.llamadas[0]);
  assert.deepEqual(estadoInstalado(m.addons), { addon: '0.5.0', rutas: '2026.11.10.1', misiones: null, comercio: null });
  assert.deepEqual(esquemasInstalados(m.addons), { addon: 1, rutas: 1, misiones: null });
  // lo nuevo, tal cual viene en el paquete, y sin el viejo.lua de la 0.4.0
  assert.deepEqual(Object.keys(foto(join(m.addons, 'SnetForever'))).sort(), ['SnetForever.toc', 'nucleo.lua']);
  // lo viejo, entero, en la cuarentena
  assert.equal(enCuarentena(m.raizCuarentena, 'viejo-SnetForever/viejo.lua').length, 1);
  assert.equal(enCuarentena(m.raizCuarentena, 'viejo-SnetForever/SnetForever.toc').length, 1);
  assert.equal(enCuarentena(m.raizCuarentena, 'viejo-SnetForever_Rutas/').length, 1);
  const tocViejo = enCuarentena(m.raizCuarentena, 'viejo-SnetForever_Rutas/SnetForever_Rutas.toc');
  assert.match(readFileSync(join(m.raizCuarentena, tocViejo[0]), 'utf8'), /## Version: 2026\.11\.09\.7/);
  // lo ajeno, igual
  assert.deepEqual(foto(join(m.addons, 'RXPGuides')), antesAjenos.rxp);
  assert.deepEqual(foto(join(m.addons, 'SnetForever_R001')), antesAjenos.r001);
  // nunca se pierde nada y no queda nada preparado a medias
  assert.ok(contar(m.addons, m.raizCuarentena) >= antes);
  assert.deepEqual(readdirSync(join(m.addons, PREPARANDO)), []);
});

test('estadoInstalado: null si falta el addon, el .toc o su línea ## Version (con BOM y CRLF, la lee)', () => {
  const t = temporal();
  const addons = join(t, 'Interface', 'AddOns');
  arbol(addons, {
    'SnetForever/SnetForever.toc': '﻿## Interface: 16001\r\n## Version:  0.5.0 \r\n',
    'SnetForever_Rutas/SnetForever_Rutas.toc': '## Interface: 16001\n## Title: sin versión\n',
    'SnetForever_Misiones/nucleo.lua': nucleoMisiones('2026.11.10.1', 3),
  });
  assert.deepEqual(estadoInstalado(addons), { addon: '0.5.0', rutas: null, misiones: null, comercio: null });
  assert.deepEqual(estadoInstalado(join(t, 'no-existe')), { addon: null, rutas: null, misiones: null, comercio: null });
  // el esquema de los datos sale de su nucleo.lua (el mismo que comprueba el addon: SNF_RUTAS.esquema)
  assert.deepEqual(esquemasInstalados(addons), { addon: null, rutas: null, misiones: 3 });
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Version: 0.5.0\r\n## X-SNF-EsquemaDatos:  4 \r\n');
  assert.equal(esquemasInstalados(addons).addon, 4);
  writeFileSync(join(addons, 'SnetForever', 'SnetForever.toc'), '## Version: 0.5.0\n## X-SNF-EsquemaDatos: dos\n');
  assert.equal(esquemasInstalados(addons).addon, null);
});

test('vigilancia 1: con el juego abierto da «juego_abierto» y no toca nada, byte a byte', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const paquetes = [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')];
  await rechaza(instalarComponentes(m.addons, paquetes, { cuarentena: m.cuarentena, juegoAbierto: async () => true }), 'juego_abierto');
  assert.deepEqual(foto(m.addons), antes);
  assert.equal(m.llamadas.length, 0);
  // si no se puede saber (la consulta de procesos falla), cuenta como abierto
  const fallo = async () => { throw new Error('PowerShell no contesta'); };
  await rechaza(instalarComponentes(m.addons, paquetes, { cuarentena: m.cuarentena, juegoAbierto: fallo }), 'juego_abierto');
  assert.deepEqual(foto(m.addons), antes);
});

test('vigilancia 1: el juego se abre mientras se prepara → «juego_abierto», AddOns igual y lo preparado en la cuarentena', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const respuestas = [false, true];
  const juegoAbierto = async () => respuestas.shift();
  const paquetes = [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')];
  const e = await rechaza(instalarComponentes(m.addons, paquetes, { cuarentena: m.cuarentena, juegoAbierto }), 'juego_abierto');
  assert.equal(respuestas.length, 0, 'se mira dos veces: antes de preparar y antes de cambiar');
  assert.deepEqual(foto(m.addons, { sin: [PREPARANDO] }), antes);
  assert.deepEqual(readdirSync(join(m.addons, PREPARANDO)), []);
  const preparado = enCuarentena(m.raizCuarentena, 'SnetForever/SnetForever.toc');
  assert.equal(preparado.length, 1);
  assert.match(readFileSync(join(m.raizCuarentena, preparado[0]), 'utf8'), /## Version: 0\.5\.0/);
  assert.equal(enCuarentena(m.raizCuarentena, 'SnetForever_Rutas/nucleo.lua').length, 1);
  assert.equal(e.detalle?.cuarentena, m.llamadas[0]);
});

test('vigilancia 1: EBUSY 4 veces en el segundo componente → «ocupado», el primero vuelve a la 0.4.0 y no se pierde nada', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const antesN = contar(m.addons, m.raizCuarentena);
  const rutasEnAddons = join(m.addons, 'SnetForever_Rutas');
  let fallos = 0;
  const renombrar = (origen, destino) => {
    if (origen === rutasEnAddons && fallos < 4) {
      fallos += 1;
      throw Object.assign(new Error('EBUSY: resource busy or locked, rename'), { code: 'EBUSY' });
    }
    return renameSync(origen, destino);
  };
  const esperas = [];
  const paquetes = [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')];
  const e = await rechaza(instalarComponentes(m.addons, paquetes, {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, renombrar, dormir: sinEsperas(esperas),
  }), 'ocupado');
  assert.equal(fallos, 4);
  assert.deepEqual(esperas, [25, 50, 75]);
  assert.equal(e.detalle?.componente, 'rutas');
  assert.deepEqual(estadoInstalado(m.addons), { addon: '0.4.0', rutas: '2026.11.09.7', misiones: null, comercio: null });
  assert.deepEqual(foto(m.addons, { sin: [PREPARANDO] }), antes);
  assert.ok(contar(m.addons, m.raizCuarentena) >= antesN);
  assert.deepEqual(readdirSync(join(m.addons, PREPARANDO)), []);
});

test('vigilancia 1: si falla al poner lo nuevo (con lo viejo ya apartado), también se deshace todo', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const renombrar = (origen, destino) => {
    if (destino === join(m.addons, 'SnetForever_Rutas') && !origen.endsWith('viejo-SnetForever_Rutas')) {
      throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
    }
    return renameSync(origen, destino);
  };
  const paquetes = [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')];
  await rechaza(instalarComponentes(m.addons, paquetes, {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, renombrar, dormir: sinEsperas(),
  }), 'sin_permiso');
  assert.deepEqual(foto(m.addons, { sin: [PREPARANDO] }), antes);
});

test('un EBUSY que se pasa a la segunda espera no impide instalar', async () => {
  const m = montar();
  let fallos = 0;
  const renombrar = (origen, destino) => {
    if (origen === join(m.addons, 'SnetForever') && fallos < 2) {
      fallos += 1;
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    }
    return renameSync(origen, destino);
  };
  const esperas = [];
  const r = await instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, renombrar, dormir: sinEsperas(esperas),
  });
  assert.deepEqual(r.instalados, ['addon']);
  assert.deepEqual(esperas, [25, 50]);
  assert.equal(estadoInstalado(m.addons).addon, '0.5.0');
});

test('un renombre con EACCES → «sin_permiso» y AddOns igual', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const renombrar = () => { throw Object.assign(new Error('EACCES: permission denied, rename'), { code: 'EACCES' }); };
  const esperas = [];
  await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, renombrar, dormir: sinEsperas(esperas),
  }), 'sin_permiso');
  assert.deepEqual(esperas, [25, 50, 75]);
  assert.deepEqual(foto(m.addons, { sin: [PREPARANDO] }), antes);
});

test('un paquete con un hash malo → «paquete» (detalle «hash») y AddOns igual', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const bueno = paquete(m.t, 'rutas', '2026.11.10.1');
  const plano = gunzipSync(bueno.buffer);
  plano[plano.length - 2] ^= 0x01; // un byte del último archivo
  const malo = { componente: 'rutas', buffer: gzipSync(plano) };
  const e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0'), malo], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado,
  }), 'paquete');
  assert.equal(e.detalle, 'hash');
  assert.deepEqual(foto(m.addons), antes);
  assert.equal(m.llamadas.length, 0);
});

test('paquetes que no se instalan aquí → «paquete»: la app, uno repetido o uno que no es de su componente', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const addon = paquete(m.t, 'addon', '0.5.0');
  const opciones = { cuarentena: m.cuarentena, juegoAbierto: cerrado };
  let e = await rechaza(instalarComponentes(m.addons, [{ componente: 'app', buffer: addon.buffer }], opciones), 'paquete');
  assert.equal(e.detalle, 'componente');
  e = await rechaza(instalarComponentes(m.addons, [addon, addon], opciones), 'paquete');
  assert.equal(e.detalle, 'duplicado');
  e = await rechaza(instalarComponentes(m.addons, [{ componente: 'rutas', buffer: addon.buffer }], opciones), 'paquete');
  assert.equal(e.detalle, 'componente');
  assert.deepEqual(foto(m.addons), antes);
});

test('una carpeta que no acaba en \\Interface\\AddOns, o que no existe → «carpeta»', async () => {
  const m = montar();
  const otra = join(m.t, 'otra');
  mkdirSync(otra);
  const opciones = { cuarentena: m.cuarentena, juegoAbierto: cerrado };
  const paquetes = [paquete(m.t, 'addon', '0.5.0')];
  await rechaza(instalarComponentes(otra, paquetes, opciones), 'carpeta');
  assert.deepEqual(readdirSync(otra), []);
  await rechaza(instalarComponentes(join(m.t, 'nada', 'Interface', 'AddOns'), paquetes, opciones), 'carpeta');
  // sin distinguir mayúsculas y con la barra del final, sí vale
  const r = await instalarComponentes(`${m.addons.replace(/Interface\\AddOns$/, 'interface\\ADDONS')}\\`, paquetes, opciones);
  assert.deepEqual(r.instalados, ['addon']);
});

test('lo que quedó de antes en .snetforever-preparando acaba en la cuarentena', async () => {
  const m = montar();
  arbol(join(m.addons, PREPARANDO), { 'viejo-resto/algo.lua': '-- de una instalación cortada\n' });
  await instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], { cuarentena: m.cuarentena, juegoAbierto: cerrado });
  const resto = enCuarentena(m.raizCuarentena, 'viejo-resto/algo.lua');
  assert.equal(resto.length, 1);
  assert.equal(readFileSync(join(m.raizCuarentena, resto[0]), 'utf8'), '-- de una instalación cortada\n');
  assert.deepEqual(readdirSync(join(m.addons, PREPARANDO)), []);
});

test('rutas largas: si un archivo pasaría de 259 caracteres al prepararlo, «ruta_larga» y AddOns igual', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const largo = `${'a'.repeat(MAX_RUTA_WINDOWS - m.addons.length - 40)}.lua`;
  const e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0', { extra: { [largo]: '--\n' } })], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado,
  }), 'ruta_larga');
  assert.ok(e.detalle.longitud > MAX_RUTA_WINDOWS);
  assert.deepEqual(foto(m.addons), antes);
});

test('F5-2: no instala un addon que pide otro esquema que los datos que se quedan', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.6.0', { esquema: 2 })], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado,
  }), 'compatibilidad');
  assert.deepEqual(e.detalle, { componente: 'rutas', esquema: 1, pide: 2 });
  assert.deepEqual(foto(m.addons), antes);
  // con sus datos nuevos en la misma tanda, sí
  const r = await instalarComponentes(m.addons, [
    paquete(m.t, 'addon', '0.6.0', { esquema: 2 }), paquete(m.t, 'rutas', '2026.12.01.1', { esquema: 2 }),
  ], { cuarentena: m.cuarentena, juegoAbierto: cerrado });
  assert.deepEqual(r.instalados, ['addon', 'rutas']);
  assert.deepEqual(esquemasInstalados(m.addons), { addon: 2, rutas: 2, misiones: null });
});

test('sin paquetes no se mira el juego ni se toca nada', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const juegoAbierto = async () => assert.fail('no hace falta mirar el juego');
  const r = await instalarComponentes(m.addons, [], { cuarentena: m.cuarentena, juegoAbierto });
  assert.deepEqual(r, { instalados: [], cuarentena: null });
  assert.deepEqual(foto(m.addons), antes);
});

// ---------- ronda 1 ----------

test('ronda 1 (F5-2): unos datos que llegan solos tienen que ser del esquema que pide el addon instalado', async () => {
  // addon de esquema 1 (su .toc lo dice) y llegan solas unas rutas de esquema 2 → no se toca nada
  let m = montar();
  let antes = foto(m.addons);
  let e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'rutas', '2026.12.01.1', { esquema: 2 })], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado,
  }), 'compatibilidad');
  assert.deepEqual(e.detalle, { componente: 'rutas', esquema: 2, pide: 1 });
  assert.deepEqual(foto(m.addons), antes);
  assert.equal(m.llamadas.length, 0);
  // el esquema del .toc manda aunque no haya datos instalados
  m = montar(undefined, { rutas: false });
  const r = await instalarComponentes(m.addons, [paquete(m.t, 'rutas', '2026.11.10.1')], { cuarentena: m.cuarentena, juegoAbierto: cerrado });
  assert.deepEqual(r.instalados, ['rutas']);

  // un addon viejo sin la línea: vale el esquema de los datos instalados antes del cambio
  m = montar(undefined, { esquemaAddon: null });
  antes = foto(m.addons);
  e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'rutas', '2026.12.01.1', { esquema: 2 })], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado,
  }), 'compatibilidad');
  assert.deepEqual(e.detalle, { componente: 'rutas', esquema: 2, pide: 1 });
  assert.deepEqual(foto(m.addons), antes);
  const bien = await instalarComponentes(m.addons, [paquete(m.t, 'rutas', '2026.11.10.1')], { cuarentena: m.cuarentena, juegoAbierto: cerrado });
  assert.deepEqual(bien.instalados, ['rutas']);

  // sin la línea y sin datos instalados no se sabe qué pide el addon: no se instalan datos solos
  m = montar(undefined, { esquemaAddon: null, rutas: false });
  antes = foto(m.addons);
  e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'rutas', '2026.11.10.1')], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado,
  }), 'compatibilidad');
  assert.deepEqual(e.detalle, { componente: 'rutas', esquema: 1, pide: null });
  assert.deepEqual(foto(m.addons), antes);
});

test('ronda 1: un deshacer a medias deja la marca estado-roto.json, y la tanda entera lo repara y la archiva', async () => {
  const m = montar();
  const marcaRoto = join(m.t, 'datos', 'estado-roto.json');
  const antesN = contar(m.addons, m.raizCuarentena);
  const addonEnAddons = join(m.addons, 'SnetForever');
  // las rutas siempre ocupadas, y al devolver el addon nuevo a su sitio de preparación, EPERM
  const renombrar = (origen, destino) => {
    if (origen === join(m.addons, 'SnetForever_Rutas')) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    if (origen === addonEnAddons && !destino.endsWith('viejo-SnetForever')) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    return renameSync(origen, destino);
  };
  const paquetes = [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')];
  const e = await rechaza(instalarComponentes(m.addons, paquetes, {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, renombrar, dormir: sinEsperas(), marcaRoto,
  }), 'ocupado');
  assert.equal(e.detalle.deshecho, false);
  assert.deepEqual(e.detalle.pendientes, ['addon']);
  assert.equal(e.detalle.marca, marcaRoto);
  const marca = JSON.parse(readFileSync(marcaRoto, 'utf8'));
  assert.equal(marca.addons, m.addons);
  assert.equal(marca.codigo, 'ocupado');
  assert.equal(marca.pendientes.length, 1);
  assert.equal(marca.pendientes[0].componente, 'addon');
  assert.equal(marca.pendientes[0].estado, 'nuevo_puesto');
  // el estado roto, tal cual: el addon nuevo puesto, lo viejo en el sello (no se movió a la cuarentena) y nada perdido
  assert.deepEqual(estadoInstalado(m.addons), { addon: '0.5.0', rutas: '2026.11.09.7', misiones: null, comercio: null });
  assert.equal(readFileSync(join(marca.pendientes[0].viejo, 'viejo.lua'), 'utf8'), '-- solo en la 0.4.0\n');
  assert.ok(marca.pendientes[0].viejo.startsWith(join(m.addons, PREPARANDO)));
  assert.ok(contar(m.addons, m.raizCuarentena) >= antesN);

  // la tanda entera, con Windows ya libre, lo deja bien y archiva la marca en la cuarentena
  const antesN2 = contar(m.addons, m.raizCuarentena, join(m.t, 'datos'));
  const r = await instalarComponentes(m.addons, paquetes, { cuarentena: m.cuarentena, juegoAbierto: cerrado, marcaRoto });
  assert.deepEqual(r.instalados, ['addon', 'rutas']);
  assert.deepEqual(estadoInstalado(m.addons), { addon: '0.5.0', rutas: '2026.11.10.1', misiones: null, comercio: null });
  assert.equal(existsSync(marcaRoto), false);
  assert.equal(enCuarentena(m.raizCuarentena, 'estado-roto.json').length, 1);
  assert.equal(enCuarentena(m.raizCuarentena, 'viejo-SnetForever/viejo.lua').length, 1);
  assert.ok(contar(m.addons, m.raizCuarentena, join(m.t, 'datos')) >= antesN2);
  assert.deepEqual(readdirSync(join(m.addons, PREPARANDO)), []);
});

test('ronda 1: una tanda que no cubre lo pendiente no archiva la marca', async () => {
  const m = montar();
  const marcaRoto = join(m.t, 'datos', 'estado-roto.json');
  arbol(join(m.t, 'datos'), { 'estado-roto.json': JSON.stringify({ pendientes: [{ componente: 'misiones' }] }) });
  await instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], { cuarentena: m.cuarentena, juegoAbierto: cerrado, marcaRoto });
  assert.equal(existsSync(marcaRoto), true);
});

test('ronda 1: un error que no es de bloqueo ni de permiso → «fs», con el estado de AddOns en detalle', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const renombrar = (origen, destino) => {
    if (origen === join(m.addons, 'SnetForever_Rutas')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return renameSync(origen, destino);
  };
  const e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, renombrar, dormir: sinEsperas(),
  }), 'fs');
  assert.deepEqual(e.detalle, {
    etapa: 'cambiar', componente: 'rutas', code: 'ENOENT', deshecho: true, pendientes: [], cuarentena: m.llamadas[0],
  });
  assert.deepEqual(foto(m.addons, { sin: [PREPARANDO] }), antes);
});

test('ronda 1: extraer a medias (disco lleno) → «fs», lo escrito a la cuarentena y AddOns igual', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const extraer = (abierto, destino, opciones) => {
    if (abierto.componente !== 'rutas') return extraerPaquete(abierto, destino, opciones);
    mkdirSync(destino);
    writeFileSync(join(destino, 'a-medias.lua'), '-- cortado\n');
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  };
  const e = await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0'), paquete(m.t, 'rutas', '2026.11.10.1')], {
    cuarentena: m.cuarentena, juegoAbierto: cerrado, extraer,
  }), 'fs');
  assert.equal(e.detalle.etapa, 'preparar');
  assert.equal(e.detalle.code, 'ENOSPC');
  assert.equal(e.detalle.deshecho, true);
  assert.deepEqual(foto(m.addons, { sin: [PREPARANDO] }), antes);
  assert.deepEqual(readdirSync(join(m.addons, PREPARANDO)), []);
  assert.equal(enCuarentena(m.raizCuarentena, 'SnetForever_Rutas/a-medias.lua').length, 1);
  assert.equal(enCuarentena(m.raizCuarentena, 'SnetForever/SnetForever.toc').length, 1);
});

test('ronda 1: si cuarentena() falla → «cuarentena» y AddOns igual, byte a byte', async () => {
  const m = montar();
  const antes = foto(m.addons);
  const cuarentena = () => { throw Object.assign(new Error('EACCES: permission denied, mkdir'), { code: 'EACCES' }); };
  await rechaza(instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], { cuarentena, juegoAbierto: cerrado }), 'cuarentena');
  assert.deepEqual(foto(m.addons), antes);
});

test('ronda 1: una carpeta de preparación que es un archivo se aparta entera y se instala', async () => {
  const m = montar();
  writeFileSync(join(m.addons, PREPARANDO), 'no soy una carpeta');
  const r = await instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], { cuarentena: m.cuarentena, juegoAbierto: cerrado });
  assert.deepEqual(r.instalados, ['addon']);
  const apartado = enCuarentena(m.raizCuarentena, PREPARANDO);
  assert.equal(apartado.length, 1);
  assert.equal(readFileSync(join(m.raizCuarentena, apartado[0]), 'utf8'), 'no soy una carpeta');
  assert.ok(lstatSync(join(m.addons, PREPARANDO)).isDirectory());
});

test('ronda 1: una carpeta de preparación que es una unión se aparta sin entrar (lo de fuera sigue igual)', { skip: process.platform !== 'win32' }, async () => {
  const m = montar();
  const fuera = arbol(join(m.t, 'fuera'), { 'importante.txt': 'de otro' });
  symlinkSync(fuera, join(m.addons, PREPARANDO), 'junction');
  const r = await instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], { cuarentena: m.cuarentena, juegoAbierto: cerrado });
  assert.deepEqual(r.instalados, ['addon']);
  assert.deepEqual(foto(fuera), { 'importante.txt': Buffer.from('de otro').toString('base64') });
  assert.equal(enCuarentena(m.raizCuarentena, PREPARANDO).length, 1);
  const prep = lstatSync(join(m.addons, PREPARANDO));
  assert.ok(prep.isDirectory() && !prep.isSymbolicLink());
  assert.deepEqual(readdirSync(join(m.addons, PREPARANDO)), []);
});

test('ronda 1: si el paso a la cuarentena da COPIA o CAMBIADO, se instala igual, se apunta el aviso y nada se pierde', async () => {
  for (const code of ['COPIA', 'CAMBIADO']) {
    const m = montar();
    const prep = join(m.addons, PREPARANDO);
    const llamadas = [];
    const mover = (origen, destino, opciones) => {
      if (dirname(origen) === prep) {
        llamadas.push(origen);
        throw Object.assign(new Error(`${code}: no se pudo`), { code, ...(code === 'CAMBIADO' ? { copia: join(destino, 'x') } : {}) });
      }
      return moverDentro(origen, destino, opciones);
    };
    const r = await instalarComponentes(m.addons, [paquete(m.t, 'addon', '0.5.0')], {
      cuarentena: m.cuarentena, juegoAbierto: cerrado, mover, dormir: async () => assert.fail('no se reintenta'),
    });
    assert.deepEqual(r.instalados, ['addon']);
    assert.equal(r.cuarentena, null);
    assert.equal(llamadas.length, 1, code);
    assert.equal(r.avisos.length, 1);
    assert.equal(r.avisos[0].code, code);
    assert.equal(r.avisos[0].origen, llamadas[0]);
    assert.match(r.avisos[0].mensaje, new RegExp(code));
    // lo viejo sigue en el sello, dentro de .snetforever-preparando
    assert.equal(readFileSync(join(llamadas[0], 'viejo-SnetForever', 'viejo.lua'), 'utf8'), '-- solo en la 0.4.0\n');
  }
});
