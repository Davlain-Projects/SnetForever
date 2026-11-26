// Task 8: R17 (primerArranque.mjs) con el addon de comercio. El comercio es opcional para el primer arranque: si el
// `{app}\paquetes` que dejó el instalador es de una 0.6.x (su manifiesto no trae `comercio`), no es un error ni hay nada
// que instalar; si es de la 0.7.0, lo que falte de comercio se instala. Todo en carpetas temporales, con el juego y la
// clave de mentira (clave null: bastan los SHA-256).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { empaquetar } from '../src/actualizar/paquete.mjs';
import { crearPrimerArranque } from '../src/primerArranque.mjs';

const RAIZ = mkdtempSync(join(tmpdir(), 'snf-r17-comercio-'));
let n = 0;
const nueva = (nombre) => {
  n += 1;
  const d = join(RAIZ, `${nombre}-${n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

function arbol(raiz, archivos) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const final = join(raiz, ...ruta.split('/'));
    mkdirSync(dirname(final), { recursive: true });
    writeFileSync(final, contenido);
  }
  return raiz;
}

const toc = (titulo, version, extra = '') => `## Interface: 16001\n## Title: ${titulo}\n## Version: ${version}\n${extra}\nnucleo.lua\n`;
const ARCHIVOS = {
  addon: (v) => ({ 'SnetForever/SnetForever.toc': toc('SnetForever', v, '## X-SNF-EsquemaDatos: 1\n'), 'SnetForever/nucleo.lua': `SnetForever = {VERSION = "${v}"}\n` }),
  rutas: (v) => ({ 'SnetForever_Rutas/SnetForever_Rutas.toc': toc('SnetForever_Rutas', v), 'SnetForever_Rutas/nucleo.lua': `SNF_RUTAS = {version="${v}",esquema=1}\n` }),
  misiones: (v) => ({ 'SnetForever_Misiones/SnetForever_Misiones.toc': toc('SnetForever_Misiones', v), 'SnetForever_Misiones/nucleo.lua': `SNF_MISIONES = {version="${v}",esquema=1}\n` }),
  comercio: (v) => ({ 'SnetForever_Comercio/SnetForever_Comercio.toc': toc('SnetForever_Comercio', v, '## Dependencies: SnetForever\n'), 'SnetForever_Comercio/ui/comercio.lua': '-- comercio\n' }),
};
const VERSIONES = { addon: '0.7.0', rutas: '2026.11.10.1', misiones: '2026.11.10.1', comercio: '0.7.0' };

// Lo que Inno deja en `{app}\paquetes`. `sin`: los componentes que no van en el manifiesto (una publicación de una 0.6.x).
function paquetes(dir, { sin = [] } = {}) {
  mkdirSync(dir, { recursive: true });
  const componentes = {};
  for (const [c, version] of Object.entries(VERSIONES)) {
    if (sin.includes(c)) continue;
    const datos = c === 'comercio' ? {} : { esquemaDatos: 1 };
    const buffer = empaquetar({ componente: c, version, raiz: arbol(nueva('fuente'), ARCHIVOS[c](version)), ...datos });
    const archivo = `SnetForever-${c}-${version}.snfpaq`;
    componentes[c] = { version, archivo, tamano: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), ...datos };
    writeFileSync(join(dir, archivo), buffer);
  }
  const manifiesto = {
    esquema: 1, producto: 'SnetForever', publicacion: 'v0.7.0-2026.11.10.1', fecha: '2026-11-10T12:00:00.000Z', componentes,
    notas: { es: 'a', en: 'b' },
  };
  writeFileSync(join(dir, 'snetforever-manifiesto.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);
}

// Un PC de prueba: AddOns con lo de `instalado`, la instalación con sus paquetes y config.instalada.
function pc({ instalado, sin = [] }) {
  const t = nueva('pc');
  const addons = join(t, 'Juegos Ñ', 'World of Warcraft', '_forever_', 'Interface', 'AddOns');
  mkdirSync(addons, { recursive: true });
  for (const c of instalado) arbol(addons, ARCHIVOS[c](VERSIONES[c]));
  const instalacion = join(t, 'Programs', 'SnetForever');
  paquetes(join(instalacion, 'paquetes'), { sin });
  const datos = join(t, 'Datos');
  mkdirSync(datos, { recursive: true });
  writeFileSync(join(datos, 'config.json'), JSON.stringify({ addons, instalada: true }));
  const env = { SNF_DATOS: datos, SNF_CUARENTENA: join(t, 'Cuarentena') };
  return { addons, instalacion, env };
}

function arranque(m) {
  const consultas = { juego: 0 };
  const primer = crearPrimerArranque({
    env: m.env, instalacion: m.instalacion, clavePublica: null,
    juegoAbierto: async () => {
      consultas.juego += 1;
      return false;
    },
  });
  return { primer, consultas };
}

test('R17: con paquetes de una 0.6.x (sin comercio) y solo el comercio por instalar, no pasa nada ni se pregunta más por el juego', async () => {
  const m = pc({ instalado: ['addon', 'rutas', 'misiones'], sin: ['comercio'] });
  const { primer, consultas } = arranque(m);
  assert.equal(await primer.intentar(m.addons), null);
  assert.notEqual(primer.estado, 'fallo', 'no es un fallo: el comercio es opcional para R17');
  assert.equal(existsSync(join(m.addons, 'SnetForever_Comercio')), false);
  const preguntas = consultas.juego;
  assert.equal(await primer.intentar(m.addons), null);
  assert.equal(consultas.juego, preguntas, 'una vez visto que los paquetes no traen el comercio, no se vuelve a mirar el juego');
});

test('R17: con paquetes de una 0.6.x, lo que falta de verdad (las misiones) se instala y el comercio se deja', async () => {
  const m = pc({ instalado: ['addon', 'rutas'], sin: ['comercio'] });
  const { primer } = arranque(m);
  const r = await primer.intentar(m.addons);
  assert.deepEqual(r, { instalados: ['misiones'] });
  assert.equal(primer.estado, 'hecho');
  assert.ok(existsSync(join(m.addons, 'SnetForever_Misiones', 'SnetForever_Misiones.toc')));
  assert.equal(existsSync(join(m.addons, 'SnetForever_Comercio')), false);
});

test('R17: con paquetes de la 0.7.0, a un AddOns sin SnetForever_Comercio se le instala solo el comercio', async () => {
  const m = pc({ instalado: ['addon', 'rutas', 'misiones'] });
  const antes = readFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), 'utf8');
  const { primer } = arranque(m);
  const r = await primer.intentar(m.addons);
  assert.deepEqual(r, { instalados: ['comercio'] });
  assert.match(readFileSync(join(m.addons, 'SnetForever_Comercio', 'SnetForever_Comercio.toc'), 'utf8'), /## Version: 0\.7\.0/);
  assert.ok(existsSync(join(m.addons, 'SnetForever_Comercio', 'ui', 'comercio.lua')));
  assert.equal(readFileSync(join(m.addons, 'SnetForever', 'SnetForever.toc'), 'utf8'), antes, 'lo que ya estaba no se toca');
});
