// Prueba permanente de cumplimiento de tools/empaquetar (restricciones de la fase 5, tarea 14):
// - sin red y sin subir nada: ni módulos de red (node:http, https, net…), ni fetch(, ni gh, git push, curl,
//   Invoke-WebRequest, Invoke-RestMethod ni WebClient. Publicar en GitHub lo hace solo el jugador;
// - única excepción de red: src/simular-actualizacion.mjs (tarea 17) puede usar node:http, y solo con
//   listen(0, '127.0.0.1');
// - el PEM privado solo sale (export( con type: 'pkcs8') en src/firma/clave.mjs;
// - ningún borrado (unlink, rm…) en src/;
// - la clave de firma de TATI (.tati-firma) no se nombra en ningún archivo, salvo en esta prueba.
// Se revisan todos los archivos de tools/empaquetar, saltando dist/ y node_modules/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const EMPAQUETAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESTA_PRUEBA = fileURLToPath(import.meta.url);

const SIMULADOR = 'src/simular-actualizacion.mjs';
const CLAVE = 'src/firma/clave.mjs';
const EXTENSIONES_JS = ['.mjs', '.js', '.cjs'];

// Reglas para cualquier archivo (código, plantillas, Inno, textos): [descripción, expresión].
const REGLAS_TEXTO = [
  ['fetch(', /\bfetch\s*\(/],
  ['gh (la orden de GitHub)', /(?<![\w.-])gh\s+\w/],
  ['git push', /\bgit\s+push\b/i],
  ['curl', /\bcurl\b/i],
  ['wget', /\bwget\b/i],
  ['Invoke-WebRequest', /Invoke-WebRequest/i],
  ['Invoke-RestMethod', /Invoke-RestMethod/i],
  ['WebClient', /WebClient/i],
  ['Start-BitsTransfer', /Start-BitsTransfer/i],
  ['Net.Http', /Net\.Http/i],
  ['DownloadFile', /DownloadFile/i],
];

// Módulos de red entre comillas (import, require o import()).
const MODULO_RED = /['"`]((?:node:)?(?:https?|http2|net|dgram|tls|dns(?:\/promises)?))['"`]/g;
const LISTEN = /\.listen\s*\(/g;
const LISTEN_LOCAL = /^\.listen\s*\(\s*0\s*,\s*['"`]127\.0\.0\.1['"`]/;

// Borrados en src/ (JavaScript).
const BORRADOS_JS = [
  ['unlink, unlinkSync, rmdir, rmdirSync o rmSync', /\b(?:unlink|unlinkSync|rmdir|rmdirSync|rmSync)\b/],
  ['.rm(', /\.rm\s*\(/],
  ['rm( suelto', /(?<![\w.$])rm\s*\(/],
  ['rm importado', /import\s*\{[^}]*\brm\b[^}]*\}\s*from/],
  ['rm sacado con require', /\{[^}]*\brm\b[^}]*\}\s*=\s*require\s*\(/],
];
// Borrados en src/ (PowerShell, Inno y demás): sin comentarios de PowerShell.
const BORRADOS_PS1 = [
  ['Remove-Item', /Remove-Item/i],
  ['alias de borrar (rm, del, ri, rd, erase, rmdir)', /(?:^|[|;{(&])\s*(?:rm|del|ri|rd|erase|rmdir)(?=\s|$)/im],
  ['[IO.File]::Delete o [IO.Directory]::Delete', /\[(?:System\.)?IO\.(?:File|Directory)\]::Delete/i],
  ['.Delete(', /\.Delete\s*\(/i],
];

// El PEM privado (pkcs8, o jwk, que también saca la privada) solo en clave.mjs.
const SALIDA_PRIVADA = [
  ["export( con type: 'pkcs8'", /\bpkcs8\b/i],
  ['privateKeyEncoding', /\bprivateKeyEncoding\b/],
  ["export( con format: 'jwk'", /\bjwk\b/i],
];

const FIRMA_TATI = Buffer.from('.tati-firma');

/** ¿Nombra el texto (o los bytes) la carpeta de la clave de firma de TATI? Sin distinguir mayúsculas. */
export function nombraFirmaTati(texto) {
  if (!Buffer.isBuffer(texto)) return /\.tati-firma/i.test(texto);
  const bajo = Buffer.from(texto);
  for (let i = 0; i < bajo.length; i++) if (bajo[i] >= 0x41 && bajo[i] <= 0x5a) bajo[i] += 0x20;
  return bajo.includes(FIRMA_TATI);
}

const SIN_REVISAR = new Set(['dist', 'node_modules']);

/** Todos los archivos de `raiz`, saltando dist/ y node_modules/ a cualquier profundidad. */
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

const esJs = (ruta) => EXTENSIONES_JS.some((e) => ruta.toLowerCase().endsWith(e));
const sinComentariosPs = (texto) => texto.replace(/<#[\s\S]*?#>/g, '').replace(/#[^\n]*/g, '');

/**
 * Infracciones de un archivo de tools/empaquetar. `ruta` es relativa a tools/empaquetar, con «/»
 * (src/firma/clave.mjs, inno/SnetForever.iss…). `texto` es su contenido en UTF-8.
 */
export function infracciones(ruta, texto) {
  const r = ruta.replace(/\\/g, '/');
  const f = [];
  if (nombraFirmaTati(texto)) f.push('nombra .tati-firma');
  for (const [descripcion, expresion] of REGLAS_TEXTO) if (expresion.test(texto)) f.push(`incumple «${descripcion}»`);
  for (const [, modulo] of texto.matchAll(MODULO_RED)) {
    if (r !== SIMULADOR) f.push(`usa el módulo de red «${modulo}» (solo ${SIMULADOR}, y solo node:http)`);
    else if (modulo !== 'node:http') f.push(`${SIMULADOR} solo puede usar «node:http», no «${modulo}»`);
  }
  for (const m of texto.matchAll(LISTEN)) {
    if (r !== SIMULADOR) f.push('usa .listen( fuera de ' + SIMULADOR);
    else if (!LISTEN_LOCAL.test(texto.slice(m.index))) f.push(`${SIMULADOR}: .listen( que no es listen(0, '127.0.0.1')`);
  }
  if (/\bcreateServer\b/.test(texto) && r !== SIMULADOR) f.push('usa createServer fuera de ' + SIMULADOR);
  if (r !== CLAVE) for (const [descripcion, expresion] of SALIDA_PRIVADA) if (expresion.test(texto)) f.push(`${descripcion} fuera de ${CLAVE}`);
  if (r.startsWith('src/')) {
    const reglas = esJs(r) ? BORRADOS_JS : BORRADOS_PS1;
    const codigo = esJs(r) ? texto : sinComentariosPs(texto);
    for (const [descripcion, expresion] of reglas) if (expresion.test(codigo)) f.push(`borra en src/ («${descripcion}»)`);
  }
  return f;
}

test('los detectores detectan lo prohibido (prueba de la propia prueba)', () => {
  const malos = [
    "import http from 'node:http'", "import https from 'https'", "import https from 'node:https'", "import net from 'node:net'",
    "const d = require('dgram')", "import tls from 'node:tls'", "await import('node:http2')", "import { lookup } from 'dns/promises'",
    'fetch(url)', 'await fetch (u)', 'gh release create v0.5.0', 'git push origin main', 'GIT PUSH', 'curl -L https://x',
    'Invoke-WebRequest -Uri $u', 'Invoke-RestMethod $u', 'New-Object Net.WebClient', 'wget https://x', 'Start-BitsTransfer $u',
    '[System.Net.Http.HttpClient]::new()', '$c.DownloadFile($u, $r)', 'srv.listen(80)', 'http.createServer(f)',
  ];
  for (const texto of malos) assert.ok(infracciones('src/publicar.mjs', texto).length > 0, texto);
  // el texto de prueba con la clave de TATI
  for (const texto of ["join(homedir(), '.tati-firma')", 'C:\\Users\\x\\.TATI-FIRMA\\clave', '$r = "~/.tati-firma"']) {
    assert.ok(nombraFirmaTati(texto), texto);
    assert.ok(infracciones('src/firma/clave.mjs', texto).length > 0, texto);
    assert.ok(infracciones('plantillas/LEEME-PUBLICAR.txt', texto).length > 0, texto);
    assert.ok(infracciones(SIMULADOR, texto).length > 0, texto);
  }
  assert.ok(nombraFirmaTati(Buffer.from([0, 0xff, ...Buffer.from('x/.Tati-Firma/y'), 0x80])));
  assert.equal(nombraFirmaTati("join(homedir(), '.snetforever-firma')"), false);
  assert.equal(nombraFirmaTati(Buffer.from('.tati_firma')), false);
  // lo que no es red ni subida
  const buenos = [
    "import { sign } from 'node:crypto'", "import { join } from 'node:path'", "const u = 'https://github.com/x/releases'",
    'const alto = high(1); though(2)', 'const ghost = 1', "if (u.protocol !== 'https:') return", 'process.stdout.write(x)',
    'Get-Process | Select-Object Id', 'const curlew = 1',
  ];
  for (const texto of buenos) assert.deepEqual(infracciones('src/publicar.mjs', texto), [], texto);
});

test('la única excepción de red: el simulador, solo con node:http y listen(0, \'127.0.0.1\')', () => {
  const bueno = "import http from 'node:http';\nconst s = http.createServer(f);\ns.listen(0, '127.0.0.1', listo);";
  assert.deepEqual(infracciones(SIMULADOR, bueno), []);
  assert.deepEqual(infracciones(SIMULADOR, 's.listen( 0 , "127.0.0.1")'), []);
  for (const malo of ["import https from 'node:https'", "import http from 'http'", "import net from 'node:net'", 's.listen(8080)',
    "s.listen(0, '0.0.0.0')", "s.listen(0)", "s.listen({ port: 0, host: '127.0.0.1' })", "s.listen(0, '127.0.0.1'); t.listen(0, '::')", 'fetch(u)']) {
    assert.ok(infracciones(SIMULADOR, malo).length > 0, malo);
  }
  // en cualquier otro archivo, ni siquiera node:http con 127.0.0.1
  for (const otro of ['src/publicar.mjs', 'src/simular.mjs', 'test/punta-a-punta.test.js', 'simular-actualizacion.mjs']) {
    assert.ok(infracciones(otro, bueno).length > 0, otro);
  }
});

test("export( con type: 'pkcs8' (o jwk, o privateKeyEncoding) solo en src/firma/clave.mjs", () => {
  const sacar = "const pem = privada.export({ type: 'pkcs8', format: 'pem' })";
  assert.deepEqual(infracciones(CLAVE, sacar), []);
  for (const otro of ['src/firma/firmar.mjs', 'src/publicar.mjs', 'test/firma.test.js', 'clave.mjs']) {
    assert.ok(infracciones(otro, sacar).length > 0, otro);
  }
  for (const malo of ["generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })",
    "k.export({ format: 'jwk' })", "k.export({ type: 'PKCS8', format: 'der' })"]) {
    assert.ok(infracciones('src/publicar.mjs', malo).length > 0, malo);
  }
  assert.deepEqual(infracciones('src/publicar.mjs', "pub.export({ type: 'spki', format: 'pem' })"), []);
});

test('ningún borrado en src/ (JavaScript y PowerShell); fuera de src/ (las pruebas) sí se puede', () => {
  const malosJs = ['fs.unlinkSync(r)', 'await unlink(r)', 'fs.rmSync(r)', 'fsp.rm(r, { recursive: true })', 'rm(r)', 'fs.rmdirSync(r)',
    "import { rm } from 'node:fs/promises'", "const { rm } = require('node:fs')", 'await fsp.unlink(r)'];
  for (const malo of malosJs) assert.ok(infracciones('src/publicar.mjs', malo).length > 0, malo);
  const malosPs = ['Remove-Item $r -Recurse', 'rm $ruta', 'if ($a) { del $b }', '[IO.File]::Delete($r)', '(Get-Item $r).Delete()'];
  for (const malo of malosPs) assert.ok(infracciones('src/firma/dpapi.ps1', malo).length > 0, malo);
  for (const bueno of ['const forma = form(1); arm(2); confirm(3)', "import { renameSync } from 'node:fs'"]) {
    assert.deepEqual(infracciones('src/publicar.mjs', bueno), [], bueno);
  }
  assert.deepEqual(infracciones('src/firma/dpapi.ps1', '# rm no se usa aqui\n$del = 1'), []);
  assert.deepEqual(infracciones('test/firma.test.js', 'rmSync(raiz, { recursive: true, force: true })'), []);
});

test('la búsqueda salta dist/ y node_modules/', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'snf-cumple-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  for (const d of ['dist', 'node_modules', join('src', 'dist'), 'src']) mkdirSync(join(raiz, d), { recursive: true });
  for (const r of [join('dist', 'node.exe'), join('node_modules', 'x.js'), join('src', 'dist', 'a.js'), join('src', 'b.mjs'), 'c.md']) {
    writeFileSync(join(raiz, r), 'x');
  }
  assert.deepEqual(archivosRevisables(raiz).map((r) => relative(raiz, r)).sort(), ['c.md', join('src', 'b.mjs')].sort());
});

test('ningún archivo de tools/empaquetar incumple las reglas (salvo esta prueba)', () => {
  const lista = archivosRevisables(EMPAQUETAR).filter((ruta) => ruta !== ESTA_PRUEBA);
  assert.ok(lista.some((r) => r.endsWith('clave.mjs')), 'no está src/firma/clave.mjs');
  // tarea 15: también publicar.mjs y la plantilla del LEEME (ni gh, ni curl, ni git push en los textos)
  // tarea 16: el instalador, el guion de Inno, sus plantillas y los avisos de Node (sin http en el .iss: su prueba)
  for (const rel of ['src/publicar.mjs', 'plantillas/LEEME-PUBLICAR.txt', 'src/instalador.mjs', 'inno/SnetForever.iss',
    'plantillas/SnetForever.vbs', 'plantillas/LICENCIAS.txt', 'terceros/node/LICENSE', 'terceros/node/AVISO.txt',
    // tarea 17: el simulador (la única excepción de red) y la prueba de punta a punta, que no puede tener servidor
    SIMULADOR, 'test/punta-a-punta.test.js']) {
    assert.ok(lista.some((r) => relative(EMPAQUETAR, r).replace(/\\/g, '/') === rel), `no está ${rel}`);
  }
  const fallos = [];
  for (const ruta of lista) {
    const rel = relative(EMPAQUETAR, ruta).replace(/\\/g, '/');
    const bytes = readFileSync(ruta);
    if (nombraFirmaTati(bytes)) fallos.push(`${rel}: nombra .tati-firma`);
    for (const f of infracciones(rel, bytes.toString('utf8'))) if (f !== 'nombra .tati-firma') fallos.push(`${rel}: ${f}`);
  }
  assert.deepEqual(fallos, []);
});

test('src/firma: los cuatro archivos existen', () => {
  for (const nombre of ['dpapi.ps1', 'clave.mjs', 'crear.mjs', 'firmar.mjs']) {
    assert.ok(statSync(join(EMPAQUETAR, 'src', 'firma', nombre)).isFile(), nombre);
  }
});
