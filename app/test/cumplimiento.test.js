// Prueba permanente de cumplimiento (restricciones globales de las fases 4 y 5): la app no usa red salvo la excepción
// acotada de app/src/actualizar/red.mjs (solo node:https; obtener y obtenerPagina solo GET, enviar solo GET o POST a los sitios de Blizzard), no borra salvo mover.mjs
// (tras comprobar la copia byte a byte), no teclea, no hace clics, no lee la memoria del juego y nunca nombra la clave de
// firma de TATI. Cubre todo app/src/**/*.{mjs,js,cjs}, app/arranque/**/*.{mjs,js,cjs}, los .ps1 de app/ayudantes y
// app/arranque y, para la clave de TATI, todos los archivos de app/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESTA_PRUEBA = fileURLToPath(import.meta.url);

// Los archivos se nombran por su ruta relativa a app/, con «/» (src/claude.mjs, src/actualizar/red.mjs,
// arranque/arranque.mjs). Un nombre sin carpeta se toma como de app/src (claude.mjs = src/claude.mjs).
function clave(ruta) {
  const r = ruta.replace(/\\/g, '/');
  return r.includes('/') ? r : `src/${r}`;
}

// La única excepción de red (R5) y la única de borrado (mover tras copia comprobada).
const RED = 'src/actualizar/red.mjs';
const MOVER = 'src/mover.mjs';
const MODULO_RED_PERMITIDO = 'node:https';

// Reglas del código JavaScript: [descripción, expresión, rutas donde se permite]. Cada una se prueba contra el texto entero.
const MODULOS_RED = '(?:node:)?(?:https?|http2|net|dgram|tls|dns(?:/promises)?)';
const MODULO_RED = new RegExp(`['"\`](${MODULOS_RED})['"\`]`, 'g');
const REGLAS_JS = [
  ['fetch(', /\bfetch\s*\(/],
  ['WebSocket', /\bWebSocket\b/],
  ['createServer', /\bcreateServer\b/],
  ['.listen(', /\.listen\s*\(/],
  ['borrado síncrono (unlinkSync, rmdirSync) fuera de mover.mjs', /\b(?:unlinkSync|rmdirSync)\b/, [MOVER]],
  ['rmSync', /\brmSync\b/],
  ['borrado con fs, fsp o promises (.rm(, .rmdir(, .unlink()', /\.(?:rm|rmdir|unlink)\s*\(/],
  ['borrado importado suelto (rm(, rmdir(, unlink()', /(?<![\w.$])(?:rm|rmdir|unlink)\s*\(/],
  ['borrado importado de node:fs o node:fs/promises (rm, rmdir, unlink, rmSync)', /import\s*\{[^}]*\b(?:rm|rmdir|unlink|rmSync)\b[^}]*\}\s*from/],
  ['borrado síncrono importado fuera de mover.mjs', /import\s*\{[^}]*\b(?:unlinkSync|rmdirSync)\b[^}]*\}\s*from/, [MOVER]],
  ['borrado sacado con require', /\b(?:rm|rmdir|unlink|unlinkSync|rmSync|rmdirSync)\b[^;\n]*=\s*require\s*\(/],
  // sin claves ni red propia (tarea 15b de la fase 4): ni claves escritas ni direcciones de las API de pago
  ['clave de API escrita (sk-…)', /\bsk-[A-Za-z0-9_-]{6,}/],
  ['dirección de una API (api.openai.com, api.anthropic.com, chatgpt.com/backend-api)', /api\.openai\.com|api\.anthropic\.com|chatgpt\.com\/backend-api/i],
  // fase 5 (R5): los atajos de las pruebas de red solo existen dentro de red.mjs
  ['permitirLocal fuera de red.mjs', /\bpermitirLocal\b/, [RED]],
  ['transporte: fuera de red.mjs', /\btransporte\s*:/, [RED]],
  // la clave de firma de TATI no se lee, no se usa y no se nombra
  ['nombra .tati-firma', /\.tati-firma/i],
  // los sitios de Blizzard (R5) solo se nombran en origen.mjs; los demás archivos usan HOSTS_BLIZZARD
  ['sitio de Blizzard fuera de origen.mjs', /oauth\.battle\.net|[a-z]{2}\.api\.blizzard\.com/i, ['src/actualizar/origen.mjs']],
];
// Solo para red.mjs: obtener (GitHub) es solo GET y sin cuerpo; enviar (Blizzard) admite además POST con cuerpo, y nada
// más (ni PUT, DELETE ni PATCH, ni .write(, ni cookies). Authorization no se nombra aquí: la pone quien llama y enviar
// solo deja pasar los sitios de HOSTS_BLIZZARD (las cabeceras HTTP no distinguen mayúsculas).
const REGLAS_RED = [
  ["método 'PUT', 'DELETE' o 'PATCH'", /['"`](?:PUT|DELETE|PATCH)['"`]/i],
  ['cabecera Authorization', /\bauthorization\b/i],
  ['cabecera Cookie', /\bcookie\b/i],
  ['escribe un cuerpo (.write()', /\.write\s*\(/],
  // ronda 1: un cuerpo en .end(…) solo es el `cuerpo` de enviar, y el method solo 'GET' literal o la variable `metodo`
  // (que enviar ya limitó a GET o POST)
  ['escribe un cuerpo (.end(…)) que no es `cuerpo`', /\.end\s*\(\s*(?!cuerpo\s*\))[^)\s]/],
  ["method que no es 'GET' literal ni `metodo`", /\bmethod\b(?!\s*:\s*(?:['"`]GET['"`]|metodo\b))/i],
];
const REGLAS_PS1 = [
  'SendKeys', 'SendInput', 'keybd_event', 'mouse_event', 'PostMessage', 'SendMessage', 'ReadProcessMemory', 'WriteProcessMemory',
  'OpenProcess', 'SetForegroundWindow', 'Invoke-WebRequest', 'WebClient', 'Remove-Item',
  // fase 5: ninguna otra forma de bajar nada desde PowerShell
  'Invoke-RestMethod', 'Start-BitsTransfer', 'Net.Http', 'DownloadFile', '.tati-firma',
];
// ronda 1: borrados con los alias de PowerShell (solo como orden: al empezar una línea o tras | ; { ( &) y con .NET.
// Antes se quitan los comentarios (# … y <# … #>), para que «la carpeta del juego» no cuente.
const REGLAS_PS1_RE = [
  ['alias de borrar (rm, del, ri, rd, erase, rmdir)', /(?:^|[|;{(&])\s*(?:rm|del|ri|rd|erase|rmdir)(?=\s|$)/im],
  ['[IO.File]::Delete o [IO.Directory]::Delete', /\[(?:System\.)?IO\.(?:File|Directory)\]::Delete/i],
  ['.Delete(', /\.Delete\s*\(/i],
];
const PUEDEN_USAR_CHILD_PROCESS = new Set([
  'src/proceso.mjs', 'src/claude.mjs', 'src/captura.mjs', 'src/bandeja.mjs',
  'src/juego.mjs', 'src/navegador.mjs', 'src/actualizar/propia.mjs', 'arranque/arranque.mjs', 'src/comercio/credenciales.mjs',
  'src/inicio.mjs',
  'src/tati/relevo.mjs', // el relevo de TATI, que abre la app con wscript.exe (shell: false); decisión del plan, 4.7/S7
]);
const PUEDE_NOMBRAR_CLAVE = new Set(['src/claude.mjs']);
const PUEDE_NOMBRAR_CLAVE_OPENAI = new Set(['src/codex.mjs']);
const EXTENSIONES_JS = ['.mjs', '.js', '.cjs'];

function archivos(dir, extensiones) {
  if (!existsSync(dir)) return [];
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, extensiones));
    else if (!extensiones || extensiones.some((e) => nombre.endsWith(e))) salida.push(ruta);
  }
  return salida;
}

const FIRMA_TATI = Buffer.from('.tati-firma');

/**
 * ¿Nombra el texto (o los bytes) la carpeta de la clave de firma de TATI? Con un Buffer se busca en los bytes
 * (Buffer.includes, sin pasarlo a texto), sin distinguir mayúsculas.
 */
export function nombraFirmaTati(texto) {
  if (!Buffer.isBuffer(texto)) return /\.tati-firma/i.test(texto);
  const bajo = Buffer.from(texto);
  for (let i = 0; i < bajo.length; i++) if (bajo[i] >= 0x41 && bajo[i] <= 0x5a) bajo[i] += 0x20;
  return bajo.includes(FIRMA_TATI);
}

// Carpetas que no se revisan al buscar .tati-firma: lo construido (dist/, con el Node portátil) y node_modules/.
const SIN_REVISAR = new Set(['dist', 'node_modules']);

/** Todos los archivos de `raiz`, saltando las carpetas dist/ y node_modules/ (a cualquier profundidad). */
export function archivosRevisables(raiz) {
  const salida = [];
  for (const nombre of readdirSync(raiz)) {
    const ruta = join(raiz, nombre);
    if (statSync(ruta).isDirectory()) {
      if (!SIN_REVISAR.has(nombre.toLowerCase())) salida.push(...archivosRevisables(ruta));
    } else salida.push(ruta);
  }
  return salida;
}

// Infracciones de un archivo de JavaScript. «ruta» es relativa a app/ (o solo el nombre, para los de app/src).
export function infraccionesJs(ruta, texto) {
  const k = clave(ruta);
  const f = [];
  for (const [descripcion, expresion, permitidos = []] of REGLAS_JS) {
    if (!permitidos.includes(k) && expresion.test(texto)) f.push(`incumple «${descripcion}»`);
  }
  for (const [, modulo] of texto.matchAll(MODULO_RED)) {
    if (k !== RED) f.push(`importa el módulo de red «${modulo}» fuera de ${RED}`);
    else if (modulo !== MODULO_RED_PERMITIDO) f.push(`${RED} solo puede usar «${MODULO_RED_PERMITIDO}», no «${modulo}»`);
  }
  if (k === RED) for (const [descripcion, expresion] of REGLAS_RED) if (expresion.test(texto)) f.push(`${RED}: ${descripcion}`);
  if (texto.includes('child_process') && !PUEDEN_USAR_CHILD_PROCESS.has(k)) {
    f.push(`usa child_process fuera de ${[...PUEDEN_USAR_CHILD_PROCESS].join(', ')}`);
  }
  if (texto.includes('ANTHROPIC_API_KEY') && !PUEDE_NOMBRAR_CLAVE.has(k)) f.push('nombra ANTHROPIC_API_KEY fuera de claude.mjs');
  if (/OPENAI_API_KEY/i.test(texto) && !PUEDE_NOMBRAR_CLAVE_OPENAI.has(k)) f.push('nombra OPENAI_API_KEY fuera de codex.mjs');
  return f;
}

// Infracciones de un .ps1 (PowerShell no distingue mayúsculas).
export function infraccionesPs1(texto) {
  const bajo = texto.toLowerCase();
  const f = REGLAS_PS1.filter((p) => bajo.includes(p.toLowerCase())).map((p) => `contiene «${p}»`);
  const sinComentarios = texto.replace(/<#[\s\S]*?#>/g, '').replace(/#[^\n]*/g, '');
  for (const [descripcion, expresion] of REGLAS_PS1_RE) if (expresion.test(sinComentarios)) f.push(`incumple «${descripcion}»`);
  return f;
}

test('los detectores detectan lo prohibido (prueba de la propia prueba)', () => {
  const malos = [
    "import http from 'node:http'", "import https from 'https'", "import net from 'node:net'", "const d = require('dgram')",
    "import tls from 'node:tls'", "import h2 from 'node:http2'", 'fetch(url)', 'fetch (url)', 'new WebSocket(u)', 'http.createServer(f)',
    's.listen(80)', 's.listen (80)', 'fs.unlinkSync(r)', 'fs.rmSync(r)', 'fs.rmdirSync(r)', 'fs.rm(r)', 'fs.unlink(r, cb)',
    "import { rm } from 'node:fs/promises'; await rm(r)", "import fsp from 'node:fs/promises'; await fsp.rm(r)",
    "import { promises as fsp } from 'node:fs'; await fsp.rmdir(r)", "import { unlink } from 'fs'", 'await unlink (r)',
    "const { rm } = require('node:fs/promises')",
  ];
  for (const texto of malos) assert.ok(infraccionesJs('otro.mjs', texto).length > 0, texto);
  assert.ok(infraccionesJs('otro.mjs', "import cp from 'node:child_process'").length > 0);
  assert.equal(infraccionesJs('claude.mjs', "import cp from 'node:child_process'; delete env.ANTHROPIC_API_KEY").length, 0);
  assert.equal(infraccionesJs('proceso.mjs', "import cp from 'node:child_process'").length, 0);
  assert.equal(infraccionesJs('captura.mjs', "import cp from 'node:child_process'").length, 0);
  assert.equal(infraccionesJs('bandeja.mjs', "import cp from 'node:child_process'").length, 0);
  assert.ok(infraccionesJs('captura.mjs', 'ANTHROPIC_API_KEY').length > 0);
  assert.ok(infraccionesJs('claude.mjs', 'OPENAI_API_KEY').length > 0);
  assert.equal(infraccionesJs('codex.mjs', 'const QUITAR = /OPENAI_API_KEY/').length, 0);
  assert.ok(infraccionesJs('codex.mjs', "import cp from 'node:child_process'").length > 0, 'codex.mjs lanza a través de proceso.mjs');
  assert.ok(infraccionesJs('codex.mjs', "const k = 'sk-proj-abcdef123'").length > 0);
  assert.ok(infraccionesJs('codex.mjs', "const u = 'https://api.openai.com/v1/responses'").length > 0);
  assert.ok(infraccionesJs('claude.mjs', "const u = 'https://api.anthropic.com/v1/messages'").length > 0);
  for (const p of REGLAS_PS1) assert.ok(infraccionesPs1(`x ${p.toUpperCase()} y`).length > 0, p);
  const buenos = [
    "import { renameSync, readFileSync } from 'node:fs'", "import { platform } from 'node:os'", 'const forma = form(1); const norma = x.format(2)',
    'const r = confirm(1); arm(2); const alarm = 3', "import { netmask } from './netmask.mjs'", "if (u.protocol !== 'https:') return",
  ];
  for (const texto of buenos) assert.deepEqual(infraccionesJs('ok.mjs', texto), [], texto);
  assert.deepEqual(infraccionesPs1('Get-Process | Select-Object Id'), []);
});

test('ronda 1: en los .ps1 tampoco los alias de borrar (rm, del, ri, rd, erase, rmdir) ni [IO.File]::Delete', () => {
  const malos = [
    'rm $ruta', 'del "C:\\x"', 'ri $r -Recurse', 'rd $carpeta', 'erase $a', 'rmdir $c', '  RM $x', 'Get-ChildItem | del',
    'if ($a) { rm $b }', '$x = 1; del $y', '[IO.File]::Delete($r)', '[System.IO.File]::Delete($r)', '[IO.Directory]::Delete($r, $true)',
    '[System.IO.Directory]::Delete($r)', '(Get-Item $r).Delete()',
  ];
  for (const texto of malos) assert.ok(infraccionesPs1(texto).length > 0, texto);
  const buenos = [
    '# carpeta del juego: rm no se usa aquí', '$del = 1', 'Write-Output "rd"', '$ruta = Join-Path $a "rm"', 'Get-Process -Name Wow',
    '<# del bloque\n rm $x #>', '$form.Controls.Add($b)', '$x.rdo = 2',
  ];
  for (const texto of buenos) assert.deepEqual(infraccionesPs1(texto), [], texto);
});

test('fase 5: la red solo en actualizar/red.mjs, y allí solo node:https, con GET (GitHub) y POST solo para Blizzard', () => {
  // un módulo de red fuera de red.mjs
  assert.ok(infraccionesJs('otro.mjs', "import https from 'node:https'").length > 0);
  assert.ok(infraccionesJs('src/actualizar/otro.mjs', "import https from 'node:https'").length > 0);
  assert.ok(infraccionesJs('red.mjs', "import https from 'node:https'").length > 0, 'src/red.mjs no es src/actualizar/red.mjs');
  assert.ok(infraccionesJs('arranque/arranque.mjs', "import https from 'node:https'").length > 0);
  // en red.mjs, solo node:https
  assert.deepEqual(infraccionesJs(RED, "import https from 'node:https'; https.get(u, { headers }, cb)"), []);
  for (const otro of ["import https from 'https'", "import http from 'node:http'", "import net from 'node:net'", "import tls from 'node:tls'",
    "import https from 'node:https'; import h2 from 'node:http2'"]) {
    assert.ok(infraccionesJs(RED, otro).length > 0, otro);
  }
  // en red.mjs: ni otros métodos, ni Authorization, ni Cookie, ni cuerpo
  for (const malo of ["https.request(u, { method: 'PUT' })", 'const m = "PUT"', 'x = `DELETE`', "{ method: 'patch' }",
    "headers: { Authorization: 'x' }", "headers: { 'authorization': t }", "headers: { Cookie: c }", "h['set-cookie']", 'peticion.write(cuerpo)',
    'fetch(u)', "require('node:http2').connect(u)", 'srv.listen(0)', 'https.createServer()']) {
    assert.ok(infraccionesJs(RED, `import https from 'node:https'; ${malo}`).length > 0, malo);
  }
  // ronda 1: tampoco un cuerpo con .end(…), ni un método que no sea 'GET' literal (con una variable no se sabe)
  for (const malo of ['peticion.end(otro)', "req.end( 'x')", '{ method: opciones.metodo }', '{ method: m }', '{ "method": "GET" }',
    'o.method = m', "{ method: 'POST' }"]) {
    assert.ok(infraccionesJs(RED, `import https from 'node:https'; ${malo}`).length > 0, malo);
  }
  assert.deepEqual(infraccionesJs(RED, "import https from 'node:https'; const p = https.request(u, { method: 'GET', headers }); p.end();"), []);
  assert.deepEqual(infraccionesJs(RED, "import https from 'node:https'; https.get(u, { method:\"GET\" }).end( )"), []);
  // enviar (Blizzard): la variable `metodo` (GET o POST) y el cuerpo en .end(cuerpo)
  assert.deepEqual(infraccionesJs(RED, "import https from 'node:https'; if (metodo !== 'POST') x(); t(u, { method: metodo, headers }); p.end(cuerpo);"), []);
  // los sitios de Blizzard: solo en origen.mjs
  for (const sitio of ["const u = 'https://oauth.battle.net/token'", "const u = 'https://eu.api.blizzard.com/data'", "'us.api.blizzard.com'"]) {
    assert.ok(infraccionesJs('src/actualizar/otro.mjs', sitio).length > 0, sitio);
    assert.ok(infraccionesJs(RED, sitio).length > 0, sitio);
    assert.deepEqual(infraccionesJs('src/actualizar/origen.mjs', sitio), [], sitio);
  }
  // ronda 1: node:dns tampoco, ni siquiera en red.mjs
  for (const k of ['otro.mjs', RED]) {
    assert.ok(infraccionesJs(k, "import dns from 'node:dns'").length > 0, k);
    assert.ok(infraccionesJs(k, "import { lookup } from 'dns/promises'").length > 0, k);
  }
  // fuera de red.mjs, esas palabras no son de la red (p. ej. process.stdout.write) y no se miran
  assert.deepEqual(infraccionesJs('otro.mjs', "process.stdout.write('x'); const m = 'POST'"), []);
  // permitirLocal y transporte: solo en red.mjs
  assert.ok(infraccionesJs('src/actualizar/actualizador.mjs', 'comprobar({ permitirLocal: true })').length > 0);
  assert.ok(infraccionesJs('actualizador.mjs', 'comprobar({ transporte: falso })').length > 0);
  assert.deepEqual(infraccionesJs(RED, "import https from 'node:https'; export function pedir({ permitirLocal = false, transporte: t } = {}) {}"), []);
});

test('biblioteca: red.mjs exporta obtenerPagina, la tercera puerta, y sigue sin más red que node:https ni más método que GET', () => {
  const texto = readFileSync(join(APP, RED), 'utf8');
  assert.match(texto, /export function obtenerPagina\(/);
  assert.deepEqual(infraccionesJs(RED, texto), []);
  assert.ok(infraccionesJs(RED, `${texto}
import dns from 'node:dns'`).length > 0);
  assert.ok(infraccionesJs(RED, `${texto}
import http from 'node:http'`).length > 0);
  assert.ok(infraccionesJs(RED, `${texto}
const m = 'PUT'`).length > 0);
});

test('fase 5: los borrados solo en mover.mjs (unlinkSync, rmdirSync) y rmSync o fs.rm( en ninguna parte', () => {
  assert.ok(infraccionesJs('otro.mjs', 'fs.unlinkSync(r)').length > 0);
  assert.ok(infraccionesJs('otro.mjs', "import { unlinkSync } from 'node:fs'").length > 0);
  assert.ok(infraccionesJs('src/actualizar/mover.mjs', 'unlinkSync(r)').length > 0, 'solo src/mover.mjs');
  assert.deepEqual(infraccionesJs(MOVER, "import { copyFileSync, unlinkSync, rmdirSync } from 'node:fs'; unlinkSync(a); rmdirSync(b)"), []);
  assert.deepEqual(infraccionesJs('mover.mjs', 'unlinkSync(a)'), [], 'mover.mjs es src/mover.mjs');
  for (const malo of ['fs.rmSync(r)', "import { rmSync } from 'node:fs'", 'fs.rm(r, cb)', "import { rm } from 'node:fs/promises'", 'fsp.unlink(r)',
    "const { unlinkSync } = require('node:fs')"]) {
    assert.ok(infraccionesJs(MOVER, malo).length > 0, `mover.mjs: ${malo}`);
  }
});

test('fase 5: child_process también en juego.mjs, navegador.mjs, actualizar/propia.mjs y arranque/arranque.mjs', () => {
  const cp = "import { spawn } from 'node:child_process'";
  for (const k of ['juego.mjs', 'navegador.mjs', 'src/actualizar/propia.mjs', 'arranque/arranque.mjs', 'src/comercio/credenciales.mjs', 'src/inicio.mjs']) assert.deepEqual(infraccionesJs(k, cp), [], k);
  for (const k of ['propia.mjs', 'src/arranque/arranque.mjs', 'arranque/otro.mjs', 'src/actualizar/red.mjs', 'src/comercio/otro.mjs', 'credenciales.mjs', 'src/comercio/programador.mjs', 'src/comercio/estado.mjs']) assert.ok(infraccionesJs(k, cp).length > 0, k);
});

test('comercio: secreto.ps1 existe, es solo ASCII, cumple las reglas de PowerShell y usa DPAPI con la entropía fija', () => {
  const ruta = join(APP, 'ayudantes', 'secreto.ps1');
  assert.ok(existsSync(ruta), 'falta app/ayudantes/secreto.ps1');
  const texto = readFileSync(ruta, 'utf8');
  assert.deepEqual(infraccionesPs1(texto), []);
  assert.ok(!/[^\x00-\x7f]/.test(texto), 'secreto.ps1 tiene caracteres que no son ASCII');
  assert.ok(texto.includes('ProtectedData') && texto.includes('CurrentUser') && texto.includes('SnetForever-blizzard-1'));
});

test('comercio, Task 8: inicio.ps1 existe, es solo ASCII, cumple las reglas de PowerShell y mueve (no borra) el acceso directo', () => {
  const ruta = join(APP, 'ayudantes', 'inicio.ps1');
  assert.ok(existsSync(ruta), 'falta app/ayudantes/inicio.ps1');
  const texto = readFileSync(ruta, 'utf8');
  assert.deepEqual(infraccionesPs1(texto), []);
  assert.ok(!/[^\x00-\x7f]/.test(texto), 'inicio.ps1 tiene caracteres que no son ASCII');
  assert.ok(texto.includes('Move-Item') && texto.includes('SnetForever.lnk') && texto.includes('wscript.exe'));
  // el programador del comercio no lanza procesos: la red va por red.mjs y las credenciales por credenciales.mjs
  for (const nombre of ['programador.mjs', 'estado.mjs']) {
    const js = readFileSync(join(APP, 'src', 'comercio', nombre), 'utf8');
    assert.deepEqual(infraccionesJs(`src/comercio/${nombre}`, js), [], nombre);
    assert.ok(!js.includes('child_process'), nombre);
  }
});

test('fase 5: .tati-firma no se nombra en ningún archivo', () => {
  for (const texto of ["join(homedir(), '.tati-firma')", 'ruta = "~/.TATI-FIRMA/clave"']) {
    assert.ok(nombraFirmaTati(texto), texto);
    assert.ok(infraccionesJs('otro.mjs', texto).length > 0, texto);
    assert.ok(infraccionesJs(RED, texto).length > 0, texto);
    assert.ok(infraccionesJs(MOVER, texto).length > 0, texto);
  }
  assert.ok(infraccionesPs1("$r = Join-Path $HOME '.tati-firma'").length > 0);
  assert.equal(nombraFirmaTati("join(homedir(), '.snetforever-firma')"), false);
  // ronda 1: se busca en los bytes (Buffer.includes), sin pasar a texto, y sin distinguir mayúsculas
  assert.ok(nombraFirmaTati(Buffer.from([0, 0xff, ...Buffer.from('x/.Tati-Firma/y'), 0x80])));
  assert.equal(nombraFirmaTati(Buffer.from('.tati_firma')), false);
});

test('ronda 1: la búsqueda de .tati-firma salta dist/ y node_modules/', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-firma-'));
  for (const d of ['dist', 'node_modules', join('src', 'dist'), 'src']) mkdirSync(join(raiz, d), { recursive: true });
  for (const r of [join('dist', 'node.exe'), join('node_modules', 'x.js'), join('src', 'dist', 'a.js'), join('src', 'b.mjs'), 'c.md']) {
    writeFileSync(join(raiz, r), '.tati-firma');
  }
  const vistos = archivosRevisables(raiz).map((r) => relative(raiz, r)).sort();
  assert.deepEqual(vistos, ['c.md', join('src', 'b.mjs')].sort());
});

test('ningún JavaScript de app/src ni de app/arranque (.mjs, .js, .cjs) incumple las reglas', () => {
  const lista = [...archivos(join(APP, 'src'), EXTENSIONES_JS), ...archivos(join(APP, 'arranque'), EXTENSIONES_JS)];
  assert.ok(lista.length > 0, 'no hay archivos que revisar');
  const fallos = [];
  for (const ruta of lista) {
    const rel = relative(APP, ruta).replace(/\\/g, '/');
    for (const f of infraccionesJs(rel, readFileSync(ruta, 'utf8'))) fallos.push(`${rel}: ${f}`);
  }
  assert.deepEqual(fallos, []);
});

// Revisión final de la fase 5, m10: un BOM literal dentro del código no se ve al leerlo (una expresión que lo quita parece
// /^/).
test('revisión final, m10: ningún JavaScript de app/src ni de app/arranque lleva un BOM (U+FEFF) literal: se escribe \\uFEFF', () => {
  const lista = [...archivos(join(APP, 'src'), EXTENSIONES_JS), ...archivos(join(APP, 'arranque'), EXTENSIONES_JS)];
  const con = lista.filter((ruta) => readFileSync(ruta, 'utf8').includes('\uFEFF')).map((ruta) => relative(APP, ruta).replace(/\\/g, '/'));
  assert.deepEqual(con, []);
});

test('ningún .ps1 de app/ayudantes ni de app/arranque incumple las reglas', () => {
  const fallos = [];
  for (const ruta of [...archivos(join(APP, 'ayudantes'), ['.ps1']), ...archivos(join(APP, 'arranque'), ['.ps1'])]) {
    for (const f of infraccionesPs1(readFileSync(ruta, 'utf8'))) fallos.push(`${relative(APP, ruta)}: ${f}`);
  }
  assert.deepEqual(fallos, []);
});

test('ningún archivo de app/ nombra .tati-firma (salvo esta prueba)', () => {
  const fallos = archivosRevisables(APP)
    .filter((ruta) => ruta !== ESTA_PRUEBA)
    .filter((ruta) => nombraFirmaTati(readFileSync(ruta)))
    .map((ruta) => relative(APP, ruta));
  assert.deepEqual(fallos, []);
});

test('codex.mjs (motor Codex) existe y cumple: sin claves, sin red propia y sin child_process directo', () => {
  const ruta = join(APP, 'src', 'codex.mjs');
  assert.ok(existsSync(ruta), 'falta app/src/codex.mjs');
  const texto = readFileSync(ruta, 'utf8');
  assert.deepEqual(infraccionesJs('codex.mjs', texto), []);
  assert.ok(!texto.includes('child_process'));
});

test('motor.mjs (elección de motor) existe y cumple: sin claves, sin red propia, sin borrar y sin child_process', () => {
  const ruta = join(APP, 'src', 'motor.mjs');
  assert.ok(existsSync(ruta), 'falta app/src/motor.mjs');
  const texto = readFileSync(ruta, 'utf8');
  assert.deepEqual(infraccionesJs('motor.mjs', texto), []);
  assert.ok(!texto.includes('child_process'));
  assert.ok(!/ANTHROPIC_API_KEY|OPENAI_API_KEY/i.test(texto));
});

test('mover.mjs existe, cumple y es el único que borra (fase 5, tarea 3)', () => {
  const ruta = join(APP, 'src', 'mover.mjs');
  assert.ok(existsSync(ruta), 'falta app/src/mover.mjs');
  const texto = readFileSync(ruta, 'utf8');
  assert.deepEqual(infraccionesJs(MOVER, texto), []);
  assert.ok(!texto.includes('child_process'));
});

test('los archivos de la bandeja y del arranque existen y cumplen (tarea 20)', () => {
  for (const nombre of ['bandeja.mjs', 'principal.mjs']) {
    const ruta = join(APP, 'src', nombre);
    assert.ok(existsSync(ruta), `falta app/src/${nombre}`);
    assert.deepEqual(infraccionesJs(nombre, readFileSync(ruta, 'utf8')), [], nombre);
  }
  const ps1 = join(APP, 'ayudantes', 'bandeja.ps1');
  assert.ok(existsSync(ps1), 'falta app/ayudantes/bandeja.ps1');
  assert.deepEqual(infraccionesPs1(readFileSync(ps1, 'utf8')), []);
  // PowerShell 5.1 lee sin BOM como ANSI: el ayudante es solo ASCII.
  assert.ok(!/[^\x00-\x7f]/.test(readFileSync(ps1, 'utf8')), 'bandeja.ps1 tiene caracteres que no son ASCII');
  // principal.mjs no lanza procesos por su cuenta ni nombra claves: eso va por proceso.mjs, bandeja.mjs y los motores.
  const principal = readFileSync(join(APP, 'src', 'principal.mjs'), 'utf8');
  assert.ok(!principal.includes('child_process'));
  assert.ok(!/ANTHROPIC_API_KEY|OPENAI_API_KEY/i.test(principal));
  assert.ok(existsSync(join(APP, 'SnetForever.vbs')), 'falta app/SnetForever.vbs');
});
