// Prueba de humo de la CLI sobre el origen real: convierte a una carpeta temporal, carga los dos
// addons con fengari en el orden de sus .toc y comprueba las cifras. Se salta si no hay origen.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ORIGEN, COMBINACIONES } from '../src/config.js';
import { cargarLua } from './ayuda/cargar-lua.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const VERSION = '2026.11.09.3';
const LIMITE_BYTES = 500000;
const hayOrigen = existsSync(ORIGEN);

const archivosToc = (dir, nombre) => readFileSync(join(dir, `${nombre}.toc`), 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('##')).map((f) => join(dir, f));

describe('CLI sobre el origen real', { skip: !hayOrigen }, () => {
  let tmp;
  let proceso;
  let datos;

  before(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'snf-cli-'));
    proceso = spawnSync(process.execPath, [
      cli, '--version', VERSION, '--salida', join(tmp, 'addons'), '--informe', join(tmp, 'informe.md'),
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (proceso.status === 0) {
      const dirR = join(tmp, 'addons', 'SnetForever_Rutas');
      const dirM = join(tmp, 'addons', 'SnetForever_Misiones');
      datos = await cargarLua([
        ...archivosToc(dirR, 'SnetForever_Rutas'),
        ...archivosToc(dirM, 'SnetForever_Misiones'),
      ]);
    }
  });
  after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  test('termina con código 0 y escribe el informe', () => {
    assert.equal(proceso.status, 0, `${proceso.stdout}\n${proceso.stderr}`);
    assert.ok(existsSync(join(tmp, 'informe.md')));
  });

  test('los dos addons cargan y llevan la versión pedida', () => {
    assert.equal(datos.SNF_RUTAS.version, VERSION);
    assert.equal(datos.SNF_MISIONES.version, VERSION);
  });

  // 170 guías en las fuentes de la fase 1, pero «24-25 Class quests» (Skyrim Horda) lleva #som y no se emite en
  // Forever (decisión tomada): quedan 169. A ellas se suman las de profesión (también en Rutas).
  test('SNF_RUTAS.guias sigue teniendo las 169 guías de RestedXP, más las de profesión', () => {
    const claves = Object.keys(datos.SNF_RUTAS.guias);
    assert.equal(claves.filter((c) => !c.startsWith('Profesiones\\')).length, 169);
    assert.ok(claves.filter((c) => c.startsWith('Profesiones\\')).length >= 3);
  });

  test('toda combinación del Classic tiene llega60', () => {
    const informe = readFileSync(join(tmp, 'informe.md'), 'utf8');
    assert.match(informe, /Errores: 0\./);
    assert.ok(COMBINACIONES.filter((c) => c.classic !== false).length > 0);
    assert.match(informe, /### Cadenas que no llegan a 60\n\nNinguno\./);
  });

  test('hay más de 5000 misiones', () => {
    assert.ok(Object.keys(datos.SNF_MISIONES.quest).length > 5000);
  });

  test('las cadenas de clase del druida existen para las dos facciones, sin verificar', () => {
    for (const f of ['H', 'A']) {
      const g = datos.SNF_MISIONES.guias[`Cadenas de clase (${f})\\druida-oso`];
      assert.ok(g, `falta la cadena druida-oso (${f})`);
      assert.equal(g.tipo, 'cadena');
      assert.equal(g.sinVerificar, true);
    }
  });

  test('el índice de mazmorras trae Shadowfang Keep (209) con su nivel mínimo 18', () => {
    assert.equal(datos.SNF_MISIONES.porMazmorra['209'].niveles.min, 18);
  });

  test('la guía de Herbalism está en Rutas', () => {
    assert.ok(datos.SNF_RUTAS.guias['Profesiones\\01-300 Herbalism (H)']);
  });

  test('cada addon lleva su tipo de guía: profesiones en Rutas; cadenas, mejoras y mazmorras en Misiones', () => {
    // Las de mejora (lote «Cadenas de mejoras») salen de la base GPLv3, como las de cadena: van en Misiones (R2).
    const deMisiones = ['cadena', 'mejora', 'mazmorra'];
    for (const g of Object.values(datos.SNF_RUTAS.guias)) {
      assert.ok(!deMisiones.includes(g.tipo), `${g.clave} (${g.tipo}) no va en Rutas`);
    }
    const lateralesRutas = Object.values(datos.SNF_RUTAS.guias).filter((g) => g.tipo === 'profesion');
    assert.ok(lateralesRutas.length >= 3);
    const enMisiones = Object.values(datos.SNF_MISIONES.guias);
    assert.ok(enMisiones.length > 0);
    for (const g of enMisiones) assert.ok(deMisiones.includes(g.tipo), `${g.clave} (${g.tipo}) no va en Misiones`);
    for (const tipo of deMisiones) assert.ok(enMisiones.some((g) => g.tipo === tipo), `no hay ninguna guía de ${tipo}`);
  });

  test('todo aviso con guía apunta a una guía que existe y todo aviso con área, a una del índice', () => {
    const avisos = datos.SNF_RUTAS.avisos;
    assert.ok(avisos.length > 0);
    for (const a of avisos) {
      if (a.guia !== undefined) {
        assert.ok(datos.SNF_RUTAS.guias[a.guia] || datos.SNF_MISIONES.guias[a.guia], `aviso ${a.id}: no existe la guía ${a.guia}`);
      }
      if (a.area !== undefined) assert.ok(datos.SNF_MISIONES.porMazmorra[String(a.area)], `aviso ${a.id}: el área ${a.area} no está en porMazmorra`);
    }
  });

  test('las cadenas de clase no dejan nada sin resolver', () => {
    const informe = readFileSync(join(tmp, 'informe.md'), 'utf8');
    assert.match(informe, /## Cadenas sin resolver\n\nNinguno\./);
  });

  test('ningún requisito de nivel de las profesiones pasa de 60', () => {
    for (const g of Object.values(datos.SNF_RUTAS.guias).filter((x) => x.tipo === 'profesion')) {
      for (const p of g.pasos) {
        for (const r of p.requisitos ?? []) {
          if (r.t === 'nivel') assert.ok(r.n <= 60, `${g.clave}: paso ${p.n} pide nivel ${r.n}`);
        }
      }
    }
  });

  test('ningún archivo de datos pasa de 500.000 bytes y los dos addons llevan la licencia de OpenMap', () => {
    for (const nombre of ['SnetForever_Rutas', 'SnetForever_Misiones']) {
      const dir = join(tmp, 'addons', nombre);
      for (const f of readdirSync(dir)) {
        assert.ok(statSync(join(dir, f)).size <= LIMITE_BYTES, `${nombre}/${f} pasa de ${LIMITE_BYTES} bytes`);
      }
      assert.ok(existsSync(join(dir, 'LICENSE-OpenMap.txt')), `${nombre} no lleva LICENSE-OpenMap.txt`);
    }
  });
});
