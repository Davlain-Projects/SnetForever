import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
if (!windows && process.platform !== 'linux') {
  throw new Error('Run verify on Linux and Windows for full platform coverage.');
}

function run(script, env = {}) {
  console.log(`Running npm run ${script}`);
  execFileSync(process.execPath, [process.env.npm_execpath, 'run', script], {
    cwd: root, stdio: 'inherit', env: { ...process.env, SNF_TEST_CONCURRENCY: '2', ...env },
  });
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

run('bootstrap');
run('build:app');
const generated = ['app/src', 'app/arranque'];
const changed = git('status', '--porcelain', '--untracked-files=all', '--', ...generated);
if (changed) throw new Error(`Commit the regenerated desktop modules before verification:\n${changed}`);
for (const module of git('ls-files', '-z', '--', ...generated).split('\0')) {
  if (!module.endsWith('.mjs')) continue;
  const source = join(root, 'app/typescript', module.slice(4, -4) + '.mts');
  if (!existsSync(source)) throw new Error(`Missing TypeScript source for ${module}`);
}

run('check');
if (windows) {
  run('test:app');
  run('test:packaging');
} else {
  run('test:converters');
  run('test:addons', { SNF_TEST_CONCURRENCY: '1', NODE_OPTIONS: '--max-old-space-size=5120' });
}
