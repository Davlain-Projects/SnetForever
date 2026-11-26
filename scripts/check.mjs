import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const addons = { name: 'WoW addon', directory: 'tools/banco-wow' };
const app = { name: 'Desktop app', directory: 'app', preload: ['./test/aislar.mjs'] };
const packaging = { name: 'Windows packaging', directory: 'tools/empaquetar' };

const checks = {
  smoke: [
    { ...addons, files: ['ia-andamio', 'piezas', 'tema', 'field-guide'].map(testFile) },
    { ...app, files: ['manifiesto', 'ordenRutaIA', 'tati-correo', 'comercio-precios-lua'].map(testFile) },
    { ...packaging, files: [testFile('cumplimiento')] },
  ],
  addons: [addons],
  app: [{ ...app, files: ['test/*.test.js'] }],
  packaging: [{ ...packaging, files: ['test/*.test.js'] }],
  converters: [
    { name: 'Game data converter', directory: 'tools/conversor' },
    { name: 'Guide converter', directory: 'tools/misguias-rxp' },
  ],
};

function testFile(name) {
  return `test/${name}.test.js`;
}

const suite = process.argv[2] ?? 'smoke';
const concurrency = Number(process.env.SNF_TEST_CONCURRENCY ?? 4);
if (!Object.hasOwn(checks, suite) || !Number.isSafeInteger(concurrency) || concurrency < 1) {
  console.error('Choose smoke, addons, app, packaging or converters. SNF_TEST_CONCURRENCY must be a positive integer.');
  process.exit(2);
}

const root = new URL('../', import.meta.url);
for (const check of checks[suite]) {
  console.log(`\n${check.name} · ${check.directory}`);
  const args = [
    ...(check.preload ?? []).flatMap((file) => ['--import', file]),
    '--test', '--test-reporter=tap', `--test-concurrency=${concurrency}`, '--test-force-exit', '--test-timeout=120000',
    ...(check.files ?? []),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: fileURLToPath(new URL(`${check.directory}/`, root)),
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    if (result.signal) console.error(`${check.name} stopped with signal ${result.signal}`);
    process.exitCode = result.status ?? 1;
    break;
  }
}
