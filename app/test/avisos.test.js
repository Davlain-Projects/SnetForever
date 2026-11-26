// Fase 5, tarea 11: avisos de fallo. La app lee los avisos que el addon guarda en SnetForeverCuenta.fallos (en solo
// lectura), les quita lo que dice quién es el jugador y los deja en un archivo, en el portapapeles o en una URL de issue
// de GitHub (F5-3: primero el archivo y el portapapeles; la URL, en segundo lugar). Nada de red, ni portapapeles ni
// navegador de verdad: el `lanzar` es siempre falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerVariablesGuardadas, entradas } from '../src/base/leer-lua.mjs';
import {
  leerFallos, pendientes, marcarEnviados, urlIssue, archivoAvisos, textoAvisos, MAX_URL,
} from '../src/avisos.mjs';
import { abrirUrl, abrirCarpeta, copiarAlPortapapeles } from '../src/navegador.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_FIXTURE = join(AQUI, 'fixtures'); // contiene wtf\Account\<cuenta>\SavedVariables\SnetForever.lua
const REPO = 'alvarezalain262-create/SnetForever';
const PREFIJO = `https://github.com/${REPO}/issues/new?title=`;
const nadie = () => {};

function entorno() {
  const datos = mkdtempSync(join(tmpdir(), 'snf-avisos-'));
  return { SNF_DATOS: datos, SystemRoot: 'C:\\Windows', USERNAME: 'José Ñandú', USERPROFILE: 'C:\\Users\\José Ñandú', COMPUTERNAME: 'PC-DE-JOSE' };
}

// Una copia del fixture en una carpeta temporal, para poder añadirle cuentas sin tocar el original.
function copiaFixture() {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-juego-'));
  cpSync(join(RAIZ_FIXTURE, 'wtf'), join(raiz, 'WTF'), { recursive: true });
  return raiz;
}

function cuentaNueva(raiz, cuenta, texto) {
  const dir = join(raiz, 'WTF', 'Account', cuenta, 'SavedVariables');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SnetForever.lua'), texto, 'utf8');
}

// Un aviso como lo escribe Fallo.guardar (ui/fallo.lua), en el formato de WoW.
function falloLua({ texto = 'Algo falla', fecha = '2026-11-11 10:00', paso = 7, n = 3, extra = '' } = {}) {
  return `\t\t{\n\t\t\t["texto"] = "${texto}",\n\t\t\t["fecha"] = "${fecha}",\n\t\t\t["paso"] = ${paso},\n\t\t\t["n"] = ${n},\n`
    + `\t\t\t["guia"] = "Guia\\\\X",\n\t\t\t["personaje"] = "Tal Cual",\n\t\t\t["nivel"] = 10,\n${extra}\t\t}, -- [1]\n`;
}

// Un aviso ya leído, para las pruebas de la URL y del archivo.
function aviso(i, texto) {
  return {
    id: createHash('sha256').update(`x|${i}`).digest('hex').slice(0, 12),
    fecha: '2026-11-11 10:00', nivel: 10, raza: 'Humano', clase: 'Mago', faccion: 'Alliance', guia: 'Guia\\X', paso: i, n: i,
    addon: '0.5.0', datos: { rutas: '2026.11.10.6', misiones: '2026.11.10.6' }, texto, pos: { mapa: 1429, x: 1.5, y: -2 },
  };
}

const decodificada = (url) => {
  const q = new URL(url).searchParams;
  return { titulo: q.get('title'), cuerpo: q.get('body') };
};

// ---------- leerVariablesGuardadas ----------

test('leerVariablesGuardadas: lee la global pedida en el formato de WoW y salta las demás', () => {
  const texto = [
    '',
    'SnetForeverPJ = {',
    '\t["ia"] = {',
    '\t\t["chat"] = {',
    '\t\t\t{',
    '\t\t\t\t["pregunta"] = "¿dónde está?",',
    '\t\t\t}, -- [1]',
    '\t\t},',
    '\t},',
    '}',
    'OtraCadena = "hola \\"tú\\"\\nadiós"',
    'OtroNumero = -3.25',
    'OtroBool = false',
    'SnetForeverCuenta = {',
    '\t["fallos"] = {',
    '\t\t{',
    '\t\t\t["texto"] = "dice \\"no\\"\\ny más",',
    '\t\t\t["pos"] = {',
    '\t\t\t\t["x"] = -0.25,',
    '\t\t\t\t["y"] = 45.12,',
    '\t\t\t},',
    '\t\t}, -- [1]',
    '\t\t{',
    '\t\t}, -- [2]',
    '\t},',
    '\t["esquema"] = 1,',
    '}',
    '',
  ].join('\n');
  const cuenta = leerVariablesGuardadas(texto, 'SnetForeverCuenta');
  assert.equal(cuenta.esquema, 1);
  assert.equal(cuenta.fallos.length, 2);
  assert.equal(cuenta.fallos[0].texto, 'dice "no"\ny más');
  assert.deepEqual(cuenta.fallos[0].pos, { x: -0.25, y: 45.12 });
  assert.equal(leerVariablesGuardadas(texto, 'OtraCadena'), 'hola "tú"\nadiós');
  assert.equal(leerVariablesGuardadas(texto, 'OtroNumero'), -3.25);
  assert.equal(leerVariablesGuardadas(texto, 'OtroBool'), false);
  assert.equal(leerVariablesGuardadas(texto, 'NoEsta'), undefined);
  assert.equal(leerVariablesGuardadas('', 'SnetForeverCuenta'), undefined);
});

// WoW escribe los huecos de una lista como `nil` (visto el 14-nov en ultimoEscaneo.muestras: {[7] = 175, [8] = 209}
// salió como siete nil y 175, 209). Un hueco cuenta para la posición y no guarda nada.
test('leerVariablesGuardadas: los nil de una lista con huecos ocupan su posición y no se guardan', () => {
  const texto = [
    'SnetForeverCuenta = {',
    '	["comercio"] = {',
    '		["muestras"] = {',
    '			[6290] = {',
    '				nil, -- [1]',
    '				nil, -- [2]',
    '				175, -- [3]',
    '				209, -- [4]',
    '			},',
    '			[7] = {',
    '				1, -- [1]',
    '				nil, -- [2]',
    '				3, -- [3]',
    '				["nilo"] = 4,',
    '			},',
    '		},',
    '		["identidad"] = {',
    '			["region"] = "US",',
    '		},',
    '	},',
    '}',
  ].join('\n');
  const c = leerVariablesGuardadas(texto, 'SnetForeverCuenta').comercio;
  assert.deepEqual(entradas(c.muestras[6290]), [[3, 175], [4, 209]]);
  assert.deepEqual(entradas(c.muestras[7]), [[1, 1], [3, 3], ['nilo', 4]]);
  assert.equal(c.identidad.region, 'US');
});

test('leerVariablesGuardadas: los mismos errores «archivo:línea» que el intérprete de los datos', () => {
  assert.throws(() => leerVariablesGuardadas('A = 1\nB = {\n  ["x"] = nada,\n}', 'A', 'SnetForever.lua'), /^Error: SnetForever\.lua:3: /);
  assert.throws(() => leerVariablesGuardadas('A = {', 'A', 'SnetForever.lua'), /SnetForever\.lua:1: /);
  assert.throws(() => leerVariablesGuardadas('local A = 1', 'A', 'SnetForever.lua'), /SnetForever\.lua:1: /);
  assert.throws(() => leerVariablesGuardadas('A.b = 1', 'A', 'SnetForever.lua'), /SnetForever\.lua:1: /);
  assert.throws(() => leerVariablesGuardadas('A = 1 B', 'A', 'SnetForever.lua'), /SnetForever\.lua:1: /);
  // la última asignación manda, como en Lua
  assert.equal(leerVariablesGuardadas('A = 1\nA = 2', 'A'), 2);
});

// ---------- leerFallos ----------

test('leerFallos: 3 avisos de las dos cuentas del fixture, con los campos del brief y nada más', () => {
  const avisos = leerFallos(RAIZ_FIXTURE, { env: entorno(), registrar: nadie });
  assert.equal(avisos.length, 3);
  const campos = ['id', 'fecha', 'nivel', 'raza', 'clase', 'faccion', 'guia', 'paso', 'n', 'addon', 'datos', 'texto', 'pos'].sort();
  for (const a of avisos) assert.deepEqual(Object.keys(a).sort(), campos);
  // en orden de fecha
  assert.deepEqual(avisos.map((a) => a.fecha), ['2026-11-09 21:14', '2026-11-10 08:02', '2026-11-10 19:45']);
  const [a, b, c] = avisos;
  assert.equal(a.texto, 'El paso dice que hable con Marshal Dughan, pero no está "en su sitio".\nLo busqué por toda la plaza.');
  assert.deepEqual(a.pos, { mapa: 1429, x: 42.07, y: 66.11 });
  assert.deepEqual(a.datos, { rutas: '2026.11.10.6', misiones: '2026.11.10.6' });
  assert.equal(a.guia, 'RestedXP Alianza 1-20\\01-10 Elwynn');
  assert.equal(a.paso, 1203);
  assert.equal(a.n, 14);
  assert.equal(a.nivel, 7);
  assert.equal(b.pos, null, 'sin posición (dentro de una instancia)');
  assert.equal(c.texto, 'No sale el objetivo de [Paño de lino]  en la lista.');
  assert.deepEqual(c.pos, { mapa: 1411, x: -0.25, y: 12.5 });
});

test('leerFallos: ningún campo lleva el personaje ni la carpeta de la cuenta', () => {
  const todo = JSON.stringify(leerFallos(RAIZ_FIXTURE, { env: entorno(), registrar: nadie }));
  for (const prohibido of ['Tal Cual', '111111111', '222222222', 'personaje', 'Account']) assert.ok(!todo.includes(prohibido), prohibido);
});

test('leerFallos: el id son los 12 primeros hexadecimales de sha256(fecha|guia|paso|texto) y no cambia entre lecturas', () => {
  const una = leerFallos(RAIZ_FIXTURE, { env: entorno(), registrar: nadie });
  const otra = leerFallos(RAIZ_FIXTURE, { env: { SNF_DATOS: 'x' }, registrar: nadie });
  assert.deepEqual(una.map((a) => a.id), otra.map((a) => a.id));
  for (const a of una) assert.match(a.id, /^[0-9a-f]{12}$/);
  assert.equal(new Set(una.map((a) => a.id)).size, 3);
  const crudo = 'El paso dice que hable con |cffff0000Marshal Dughan|r, pero no está "en su sitio".\nLo busqué por toda la plaza.';
  const esperado = createHash('sha256').update(`2026-11-09 21:14|RestedXP Alianza 1-20\\01-10 Elwynn|1203|${crudo}`, 'utf8').digest('hex').slice(0, 12);
  assert.equal(una[0].id, esperado);
});

test('leerFallos: un SnetForever.lua roto en una tercera cuenta se salta, se apunta (sin la cuenta) y salen los otros 3', () => {
  const raiz = copiaFixture();
  cuentaNueva(raiz, '333333333#1', 'SnetForeverCuenta = {\n\t["fallos"] = {\n\t\t{ ["texto"] = "sin cerrar\n');
  const apuntes = [];
  const avisos = leerFallos(raiz, { env: entorno(), registrar: (nivel, texto) => apuntes.push([nivel, texto]) });
  assert.equal(avisos.length, 3);
  assert.equal(apuntes.length, 1);
  assert.match(apuntes[0][1], /SnetForever\.lua:\d+/);
  assert.ok(!apuntes[0][1].includes('333333333'), apuntes[0][1]);
});

test('leerFallos: un SnetForever.lua de más de 5 MB se salta sin leerlo y se apunta', () => {
  const raiz = copiaFixture();
  cuentaNueva(raiz, '444444444#1', `${' '.repeat(5 * 1024 * 1024)}\nSnetForeverCuenta = {\n\t["fallos"] = {\n${falloLua()}\t},\n}\n`);
  const apuntes = [];
  const avisos = leerFallos(raiz, { env: entorno(), registrar: (nivel, texto) => apuntes.push(texto) });
  assert.equal(avisos.length, 3);
  assert.equal(apuntes.length, 1);
  assert.match(apuntes[0], /5 MB/);
});

test('leerFallos: sin WTF o sin avisos, ninguno; los avisos que no son tablas se saltan', () => {
  assert.deepEqual(leerFallos(mkdtempSync(join(tmpdir(), 'snf-vacio-')), { env: entorno(), registrar: nadie }), []);
  assert.deepEqual(leerFallos(join(tmpdir(), 'no-existe-snf-123'), { env: entorno(), registrar: nadie }), []);
  const raiz = mkdtempSync(join(tmpdir(), 'snf-juego-'));
  cuentaNueva(raiz, 'A', 'SnetForeverCuenta = {\n\t["esquema"] = 1,\n}\n');
  cuentaNueva(raiz, 'B', `SnetForeverCuenta = {\n\t["fallos"] = {\n\t\t"suelto",\n\t\t7,\n${falloLua()}\t},\n}\n`);
  cuentaNueva(raiz, 'C', 'OtraCosa = 1\n');
  const avisos = leerFallos(raiz, { env: entorno(), registrar: nadie });
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].raza, null, 'lo que falta es null');
});

test('privacidad: ni correo, ni usuario de Windows, ni C:\\Users\\<nombre>, ni personaje, ni cuenta, ni el chat', () => {
  const env = entorno();
  const raiz = mkdtempSync(join(tmpdir(), 'snf-juego-'));
  const texto = 'Mira C:\\\\Users\\\\José Ñandú\\\\Desktop\\\\captura.png y c:/users/otra persona/x.txt o D:\\\\Usuarios\\\\pepe\\\\a.txt; '
    + 'escríbeme a jose.nandu+wow@ejemplo.com. Soy José Ñandú (josé ñandú) en PC-DE-JOSE, mi personaje Tal Cual y la cuenta 555555555 en WTF\\\\Account\\\\555555555#1.';
  const extra = '\t\t\t["chat"] = "PREGUNTA SECRETA",\n\t\t\t["pregunta"] = "OTRA PREGUNTA",\n\t\t\t["respuesta"] = "RESPUESTA SECRETA",\n';
  cuentaNueva(raiz, '555555555#1', `SnetForeverPJ = {\n\t["ia"] = {\n\t\t["chat"] = {\n\t\t\t{\n\t\t\t\t["pregunta"] = "PREGUNTA DEL CHAT",\n\t\t\t\t["respuesta"] = "RESPUESTA DEL CHAT",\n\t\t\t}, -- [1]\n\t\t},\n\t},\n}\n`
    + `SnetForeverCuenta = {\n\t["fallos"] = {\n${falloLua({ texto, extra })}\t},\n}\n`);
  const avisos = leerFallos(raiz, { env, registrar: nadie });
  assert.equal(avisos.length, 1);
  const { cuerpo, titulo } = decodificada(urlIssue(REPO, avisos, 'es').url);
  const archivo = readFileSync(archivoAvisos(avisos, { env }), 'utf8');
  for (const salida of [JSON.stringify(avisos), cuerpo, titulo, archivo, textoAvisos(avisos)]) {
    for (const prohibido of ['José', 'josé', 'Ñandú', 'ejemplo.com', 'jose.nandu', 'otra persona', 'pepe', 'PC-DE-JOSE', 'Tal Cual', '555555555',
      'PREGUNTA', 'RESPUESTA', 'Users\\', 'users/', 'Usuarios\\']) {
      assert.ok(!salida.includes(prohibido), `${prohibido} en ${salida.slice(0, 80)}`);
    }
  }
  assert.ok(avisos[0].texto.includes('%USERPROFILE%\\Desktop\\captura.png'), avisos[0].texto);
  assert.ok(avisos[0].texto.includes('%USERPROFILE%/x.txt'), avisos[0].texto);
  assert.ok(avisos[0].texto.includes('[correo]'), avisos[0].texto);
});

// ---------- pendientes y marcarEnviados ----------

test('pendientes tras marcarEnviados([a.id]) → 2, y la lista solo crece', () => {
  const env = entorno();
  const avisos = leerFallos(RAIZ_FIXTURE, { env, registrar: nadie });
  assert.equal(pendientes(avisos, { env }).length, 3);
  marcarEnviados([avisos[0].id], { env });
  const quedan = pendientes(avisos, { env });
  assert.equal(quedan.length, 2);
  assert.ok(!quedan.some((a) => a.id === avisos[0].id));
  marcarEnviados([avisos[1].id, avisos[0].id], { env });
  assert.equal(pendientes(avisos, { env }).length, 1);
  marcarEnviados([], { env });
  assert.equal(pendientes(avisos, { env }).length, 1, 'marcar nada no quita nada');
  // sin temporales sueltos: solo el archivo de la lista
  assert.deepEqual(readdirSync(env.SNF_DATOS), ['avisos-enviados.json']);
  const lista = JSON.parse(readFileSync(join(env.SNF_DATOS, 'avisos-enviados.json'), 'utf8'));
  assert.deepEqual([...lista.enviados].sort(), [avisos[0].id, avisos[1].id].sort());
});

test('marcarEnviados: los ids que no son de 12 hexadecimales no entran; una lista rota va a la cuarentena y no se pierde', () => {
  const env = entorno();
  marcarEnviados(['../x', 42, 'ABCDEF123456', '0123456789ab'], { env });
  assert.deepEqual(JSON.parse(readFileSync(join(env.SNF_DATOS, 'avisos-enviados.json'), 'utf8')).enviados, ['0123456789ab']);
  const env2 = entorno();
  writeFileSync(join(env2.SNF_DATOS, 'avisos-enviados.json'), '{roto', 'utf8');
  const avisos = leerFallos(RAIZ_FIXTURE, { env: env2, registrar: nadie });
  assert.equal(pendientes(avisos, { env: env2 }).length, 3, 'una lista rota no quita ninguno');
  marcarEnviados([avisos[0].id], { env: env2 });
  assert.equal(pendientes(avisos, { env: env2 }).length, 2);
  const cuarentena = join(env2.SNF_DATOS, 'cuarentena');
  const [sello] = readdirSync(cuarentena);
  assert.equal(readFileSync(join(cuarentena, sello, 'avisos-enviados.json'), 'utf8'), '{roto');
});

// ---------- urlIssue ----------

test('urlIssue: la URL de una issue nueva, con los textos limpios y todos los datos de cada aviso', () => {
  const avisos = leerFallos(RAIZ_FIXTURE, { env: entorno(), registrar: nadie });
  const { url, incluidos } = urlIssue(REPO, avisos, 'es');
  assert.ok(url.startsWith(PREFIJO), url.slice(0, 90));
  assert.ok(url.length <= MAX_URL);
  assert.deepEqual(incluidos, avisos.map((a) => a.id));
  const { titulo, cuerpo } = decodificada(url);
  assert.equal(titulo, 'Avisos de fallo (3)');
  assert.ok(!cuerpo.includes('|cffff0000') && !cuerpo.includes('|r') && !cuerpo.includes('|H') && !cuerpo.includes('|T'), cuerpo);
  for (const a of avisos) {
    for (const linea of a.texto.split('\n')) assert.ok(cuerpo.includes(`> ${linea}`), linea);
    for (const dato of [a.fecha, a.addon, a.datos.rutas, String(a.nivel), a.raza, a.clase, a.faccion, a.guia, String(a.paso), String(a.n), a.id]) {
      assert.ok(cuerpo.includes(dato), dato);
    }
  }
  assert.ok(cuerpo.includes('1429') && cuerpo.includes('42.07') && cuerpo.includes('66.11'), 'la posición');
});

test('urlIssue: con un aviso, el título es «Aviso: <guia> paso <n>»; en inglés, otro título', () => {
  const [a] = leerFallos(RAIZ_FIXTURE, { env: entorno(), registrar: nadie });
  assert.equal(decodificada(urlIssue(REPO, [a], 'es').url).titulo, 'Aviso: RestedXP Alianza 1-20\\01-10 Elwynn paso 14');
  const en = decodificada(urlIssue(REPO, [a, a], 'en').url);
  assert.equal(en.titulo, 'Bug reports (2)');
  assert.ok(en.cuerpo.includes('Level'), en.cuerpo.slice(0, 200));
  // un repositorio que no vale cae en el de por defecto
  assert.ok(urlIssue('evil.com/../x?', [a], 'es').url.startsWith(PREFIJO));
  assert.ok(urlIssue('otro/repo', [a], 'es').url.startsWith('https://github.com/otro/repo/issues/new?title='));
});

test('urlIssue: 40 avisos de 500 caracteres → la URL cabe en 7.500 y entran los primeros que caben', () => {
  const avisos = Array.from({ length: 40 }, (_, i) => aviso(i + 1, `Fallo número ${i + 1}: ${'ñ'.repeat(480)}`.slice(0, 500)));
  const { url, incluidos } = urlIssue(REPO, avisos, 'es');
  assert.ok(url.length <= 7500, String(url.length));
  assert.ok(incluidos.length >= 1 && incluidos.length < 40, String(incluidos.length));
  assert.deepEqual(incluidos, avisos.slice(0, incluidos.length).map((a) => a.id));
  assert.equal(decodificada(url).titulo, `Avisos de fallo (${incluidos.length})`);
  // con uno más ya no cabría
  assert.ok(urlIssue(REPO, avisos.slice(0, incluidos.length + 1), 'es').incluidos.length === incluidos.length);
});

test('urlIssue: un aviso de 9.000 caracteres → entra recortado con «…» y la URL cabe', () => {
  const largo = aviso(1, `Empieza así ${'x'.repeat(9000)}`);
  const { url, incluidos } = urlIssue(REPO, [largo, aviso(2, 'otro')], 'es');
  assert.ok(url.length <= 7500, String(url.length));
  assert.deepEqual(incluidos, [largo.id]);
  const { cuerpo } = decodificada(url);
  assert.ok(cuerpo.includes('> Empieza así xxx'));
  assert.ok(cuerpo.includes('…'));
  assert.ok(!cuerpo.includes('otro'));
  assert.deepEqual(urlIssue(REPO, [], 'es'), { url: null, incluidos: [] });
});

test('revisión final, m6: si los campos cortos no caben ni con el texto vacío (un SnetForever.lua manipulado) → {url: null}', () => {
  const enorme = { ...aviso(1, 'corto'), guia: 'g'.repeat(8000) };
  assert.deepEqual(urlIssue(REPO, [enorme, aviso(2, 'otro')], 'es'), { url: null, incluidos: [] });
  // y uno normal sigue entrando
  assert.ok(urlIssue(REPO, [aviso(3, 'normal')], 'es').url.length <= MAX_URL);
});

// ---------- archivoAvisos y textoAvisos ----------

test('archivoAvisos: un archivo nuevo dentro de datos\\avisos\\, en UTF-8, con los 3 textos y el mismo cuerpo', () => {
  const env = entorno();
  const avisos = leerFallos(RAIZ_FIXTURE, { env, registrar: nadie });
  const ruta = archivoAvisos(avisos, { env });
  assert.equal(dirname(ruta), join(env.SNF_DATOS, 'avisos'));
  assert.match(basename(ruta), /^avisos-[0-9TZ-]+(?:-\d+)?\.txt$/);
  const texto = readFileSync(ruta, 'utf8');
  for (const a of avisos) for (const linea of a.texto.split('\n')) assert.ok(texto.includes(`> ${linea}`), linea);
  assert.equal(texto, textoAvisos(avisos, 'es'));
  assert.ok(texto.includes('Paño de lino'), 'UTF-8');
  assert.ok(!texto.includes('|cff'));
  // dos seguidos no se pisan
  const otra = archivoAvisos(avisos, { env });
  assert.notEqual(otra, ruta);
  assert.equal(readdirSync(join(env.SNF_DATOS, 'avisos')).length, 2);
  assert.equal(archivoAvisos([], { env }), null);
});

// ---------- navegador: abrirUrl, abrirCarpeta y copiarAlPortapapeles ----------

function lanzadorFalso() {
  const llamadas = [];
  const lanzar = (exe, args, opciones) => {
    const hijo = new EventEmitter();
    hijo.unref = () => {};
    llamadas.push({ exe, args, opciones, hijo });
    return hijo;
  };
  return { llamadas, lanzar };
}

test('abrirUrl: lanza <SystemRoot>\\explorer.exe con [url], sin shell', () => {
  const { llamadas, lanzar } = lanzadorFalso();
  const [a] = leerFallos(RAIZ_FIXTURE, { env: entorno(), registrar: nadie });
  const { url } = urlIssue(REPO, [a], 'es');
  assert.equal(abrirUrl(url, { repo: REPO, lanzar, env: { SystemRoot: 'C:\\Windows' } }), true);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].exe, 'C:\\Windows\\explorer.exe');
  assert.deepEqual(llamadas[0].args, [url]);
  assert.ok(!llamadas[0].opciones?.shell);
  // con comillas, paréntesis y asteriscos en el texto, la URL sigue siendo válida
  const rara = urlIssue(REPO, [aviso(1, "dice 'hola' (sí) * ¡ya! \"x\" <b> & %20 #1 @alguien")], 'es').url;
  assert.equal(abrirUrl(rara, { repo: REPO, lanzar, env: { SystemRoot: 'C:\\Windows' } }), true);
  // y una @ no avisa a nadie en GitHub: lleva detrás un espacio de ancho cero
  assert.ok(decodificada(rara).cuerpo.includes("> dice 'hola' (sí) * ¡ya! \"x\" <b> & %20 #1 @\u200balguien"));
});

test('abrirUrl: se niega (falso y sin lanzar nada) con lo que no es una issue nueva del repositorio', () => {
  const { llamadas, lanzar } = lanzadorFalso();
  const env = { SystemRoot: 'C:\\Windows' };
  for (const malo of [
    'https://evil.com/issues/new?title=x', 'https://github.com/otro/repo/issues/new?title=x', 'javascript:alert(1)',
    `https://github.com/${REPO}/settings`, `https://github.com/${REPO}/issues/new`, `https://github.com/${REPO}/issues/new?title=a b`,
    `https://github.com/${REPO}/issues/new?title="x"`, `https://github.com/${REPO}.evil.com/issues/new?title=x`, `https://github.com/${REPO}/issues/new?${'a'.repeat(7600)}`,
    null, 42,
  ]) {
    assert.equal(abrirUrl(malo, { repo: REPO, lanzar, env }), false, String(malo).slice(0, 80));
  }
  assert.equal(llamadas.length, 0);
  // el repositorio que no vale es el de por defecto, nunca otro
  assert.equal(abrirUrl('https://github.com/x/y/issues/new?title=a', { repo: '../x', lanzar, env }), false);
  assert.equal(llamadas.length, 0);
});

test('abrirUrl: si lanzar falla, falso (y un error del proceso no tumba la app)', () => {
  const env = { SystemRoot: 'C:\\Windows' };
  const url = `https://github.com/${REPO}/issues/new?title=a&body=b`;
  assert.equal(abrirUrl(url, { repo: REPO, lanzar: () => { throw new Error('ENOENT'); }, env }), false);
  const { llamadas, lanzar } = lanzadorFalso();
  assert.equal(abrirUrl(url, { repo: REPO, lanzar, env }), true);
  assert.doesNotThrow(() => llamadas[0].hijo.emit('error', new Error('x')), 'hay quien escucha el error');
});

test('abrirCarpeta: solo carpetas dentro de la carpeta de datos', () => {
  const env = entorno();
  const { llamadas, lanzar } = lanzadorFalso();
  assert.equal(abrirCarpeta('C:\\Windows', { env, lanzar }), false);
  assert.equal(abrirCarpeta(join(env.SNF_DATOS, '..'), { env, lanzar }), false);
  assert.equal(abrirCarpeta(join(env.SNF_DATOS, 'avisos', '..', '..', 'x'), { env, lanzar }), false);
  assert.equal(abrirCarpeta(join(env.SNF_DATOS, 'no-existe'), { env, lanzar }), false);
  writeFileSync(join(env.SNF_DATOS, 'archivo.txt'), 'x');
  assert.equal(abrirCarpeta(join(env.SNF_DATOS, 'archivo.txt'), { env, lanzar }), false, 'un archivo se abriría con su programa');
  assert.equal(abrirCarpeta(42, { env, lanzar }), false);
  assert.equal(llamadas.length, 0);
  const ruta = dirname(archivoAvisos([aviso(1, 'x')], { env }));
  assert.equal(abrirCarpeta(ruta, { env, lanzar }), true);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].exe, 'C:\\Windows\\explorer.exe');
  assert.deepEqual(llamadas[0].args.map((r) => resolve(r).toLowerCase()), [resolve(ruta).toLowerCase()]);
  assert.ok(!llamadas[0].opciones?.shell);
});

function clipFalso(codigo = 0) {
  const llamadas = [];
  const lanzar = (exe, args, opciones) => {
    const trozos = [];
    const hijo = new EventEmitter();
    hijo.kill = () => {};
    hijo.stdin = new Writable({
      write(trozo, _c, listo) { trozos.push(trozo); listo(); },
      final(listo) { listo(); setImmediate(() => hijo.emit('close', codigo)); },
    });
    llamadas.push({ exe, args, opciones, bytes: () => Buffer.concat(trozos) });
    return hijo;
  };
  return { llamadas, lanzar };
}

test('copiarAlPortapapeles: <SystemRoot>\\System32\\clip.exe recibe el texto en UTF-16LE con BOM', async () => {
  const { llamadas, lanzar } = clipFalso();
  const texto = textoAvisos(leerFallos(RAIZ_FIXTURE, { env: entorno(), registrar: nadie }), 'es');
  assert.equal(await copiarAlPortapapeles(texto, { lanzar, env: { SystemRoot: 'C:\\Windows' } }), true);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].exe, 'C:\\Windows\\System32\\clip.exe');
  assert.deepEqual(llamadas[0].args, []);
  assert.ok(!llamadas[0].opciones?.shell);
  const bytes = llamadas[0].bytes();
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(bytes.subarray(2).toString('utf16le'), texto);
});

test('copiarAlPortapapeles: falso si clip.exe sale mal, si no arranca o si el texto no es texto', async () => {
  const env = { SystemRoot: 'C:\\Windows' };
  assert.equal(await copiarAlPortapapeles('x', { lanzar: clipFalso(1).lanzar, env }), false);
  assert.equal(await copiarAlPortapapeles('x', { lanzar: () => { throw new Error('ENOENT'); }, env }), false);
  const conError = (exe, args) => {
    const hijo = new EventEmitter();
    hijo.kill = () => {};
    hijo.stdin = new Writable({ write(_t, _c, listo) { listo(); } });
    setImmediate(() => hijo.emit('error', new Error('ENOENT')));
    return hijo;
  };
  assert.equal(await copiarAlPortapapeles('x', { lanzar: conError, env }), false);
  const { llamadas, lanzar } = clipFalso();
  assert.equal(await copiarAlPortapapeles(42, { lanzar, env }), false);
  assert.equal(llamadas.length, 0);
});

test('el fixture sigue intacto (las pruebas solo escriben en carpetas temporales)', () => {
  const cuentas = readdirSync(join(RAIZ_FIXTURE, 'wtf', 'Account')).sort();
  assert.deepEqual(cuentas, ['111111111#1', '222222222#1']);
  assert.ok(!existsSync(join(RAIZ_FIXTURE, 'wtf', 'Account', '111111111#1', 'SavedVariables', 'SnetForever.lua.tmp')));
});
