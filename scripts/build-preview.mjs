import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

assert.equal(process.platform, 'win32', 'The installer compiler and package signing require Windows.');
assert.equal(process.arch, 'x64', 'Use the x64 Node distribution for the Windows x64 installer.');

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'snetforever-preview-'));
const source = join(scratch, 'source');
const snapshot = join(scratch, 'source.zip');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
execFileSync('git', ['archive', '--format=zip', '-o', snapshot, revision, 'app', 'addons', 'tools/empaquetar'], { cwd: root });
mkdirSync(source);
execFileSync('tar.exe', ['-xf', snapshot, '-C', source]);

const load = (relative) => import(pathToFileURL(join(source, relative)).href);
const { crearClave } = await load('tools/empaquetar/src/firma/clave.mjs');
const { publicar } = await load('tools/empaquetar/src/publicar.mjs');
const { buscarIscc, compilar, prepararRaiz } = await load('tools/empaquetar/src/instalador.mjs');
const env = { ...process.env, SNF_FIRMA_DIR: join(scratch, 'preview-signing') };
const compiler = buscarIscc(env);
assert.ok(compiler, 'Inno Setup 6 was not found. Set SNF_ISCC if it is installed outside its default path.');

const nodeLicense = process.env.SNF_NODE_LICENSE || join(dirname(process.execPath), 'LICENSE');
assert.ok(existsSync(nodeLicense), 'Supply the LICENSE from the exact Node binary distribution in SNF_NODE_LICENSE.');

const { publicaPem } = crearClave({ env });
writeFileSync(join(source, 'app/src/actualizar/clave-publica.mjs'), `export const CLAVE_PUBLICA = ${JSON.stringify(publicaPem)};\n`);
const installerCli = join(source, 'app/src/instalador/cli.mjs');
const installerSource = readFileSync(installerCli, 'utf8');
const autoUpdate = 'actualizaciones: { auto: true, ...(esObjeto(config.actualizaciones) ? config.actualizaciones : {}) }';
assert.equal(installerSource.split(autoUpdate).length, 2, 'The installer update setting changed. Review the preview build.');
writeFileSync(installerCli, installerSource.replace(
  autoUpdate,
  'actualizaciones: { ...(esObjeto(config.actualizaciones) ? config.actualizaciones : {}), auto: false }',
));

// The preview uses the same signed package and installer checks as production.
const settings = {
  raiz: source,
  salida: join(scratch, 'publication'),
  notas: { en: 'Internal Windows preview', es: 'Vista previa interna para Windows' },
  comprobarGit: false,
  claveApp: publicaPem,
  env,
};
publicar({ ...settings, soloApp: true, ahora: new Date(Date.now() - 3000) });
const release = publicar(settings);
const version = release.manifiesto.componentes.app.version;
const payload = prepararRaiz({
  env,
  publicacionDir: release.carpeta,
  nodeExe: process.execPath,
  nodeLicencia: nodeLicense,
  salida: join(scratch, 'payload'),
  clavePublica: publicaPem,
});
const executable = compilar({ raiz: payload, version, iscc: compiler, salida: join(scratch, 'compiled'), env });

if (process.env.GITHUB_ACTIONS === 'true') {
  const profile = join(scratch, 'test-profile');
  const installed = join(profile, 'program');
  const client = join(profile, 'game', '_forever_');
  const addons = join(client, 'Interface', 'AddOns');
  const data = join(profile, 'data');
  mkdirSync(addons, { recursive: true });
  writeFileSync(join(client, 'Wow.exe'), '');
  const installLog = join(scratch, 'install.log');
  try {
    execFileSync(executable, [
      '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=', `/DIR=${installed}`, `/LOG=${installLog}`,
    ], {
      env: { ...env, LOCALAPPDATA: join(profile, 'local'), SNF_DATOS: data, SNF_ADDONS: addons },
      timeout: 300_000,
      windowsHide: true,
    });
  } catch (error) {
    if (existsSync(installLog)) console.error(readFileSync(installLog, 'utf8').split(/\r?\n/).slice(-35).join('\n'));
    throw error;
  }
  assert.ok(existsSync(join(installed, 'actual.txt')), 'The Windows installer did not activate the app.');
  for (const addon of ['SnetForever', 'SnetForever_Comercio', 'SnetForever_Misiones', 'SnetForever_Rutas']) {
    assert.ok(existsSync(join(addons, addon, `${addon}.toc`)), `The installer did not install ${addon}.`);
  }
  assert.equal(JSON.parse(readFileSync(join(data, 'config.json'), 'utf8')).actualizaciones.auto, false);
  console.log('The compiled executable installed the app and four addons in a disposable Windows profile.');
}

const output = join(root, 'artifacts', 'preview');
const filename = `SnetForever-${version}-Preview-Windows-x64.exe`;
mkdirSync(output, { recursive: true });
copyFileSync(executable, join(output, filename), constants.COPYFILE_EXCL);
const hash = createHash('sha256').update(readFileSync(join(output, filename))).digest('hex');
writeFileSync(join(output, 'SHA256SUMS.txt'), `${hash}  ${filename}\n`, { flag: 'wx' });
writeFileSync(join(output, 'build-info.json'), JSON.stringify({
  revision, version, node: process.version, platform: 'Windows x64',
  packageSigning: 'isolated Ed25519 key', automaticUpdates: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Created ${filename} for ${revision}`);
