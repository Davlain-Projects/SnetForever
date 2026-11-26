// Precio regional (regional.mjs): el equivalente de DBRegionMarketAvg de TSM con las fotos de la API de Blizzard. El
// cálculo, el archivo, la ranura (precios-lua.mjs: R[item]) y el turno de casas del programador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearRegional, FOTOS_POR_CASA, VIGENCIA_S, CADA_PROPIA_S } from '../src/comercio/regional.mjs';
import { textosPrecios } from '../src/comercio/precios-lua.mjs';
import { crearProgramadorComercio } from '../src/comercio/programador.mjs';
import { crearEstadoComercio } from '../src/comercio/estado.mjs';

const HORA = 3600;
const carpeta = () => mkdtempSync(join(tmpdir(), 'snf-regional-'));
// Una subasta: `cantidad` unidades a `precio` cobre la unidad.
const s = (id, item, precio, cantidad = 1) => ({ id, item, cantidad, precio, tiempo: 'LONG' });

test('el precio regional es la mediana entre casas: una casa pequeña y cara no lo arrastra', () => {
  const r = crearRegional({ fs: nodeFs, carpeta: carpeta() });
  const t0 = 1_800_000_000;
  r.anotar(110, t0, [s(1, 1, 100)], []);
  r.anotar(111, t0, [s(2, 1, 120)], []);
  r.anotar(125, t0, [s(3, 1, 900)], []);
  assert.equal(r.valores(t0).valores[1], 120, 'la mediana de 100, 120 y 900 (la media daría 373)');
});

test('el precio regional es la mediana entre casas de la mediana de cada casa', () => {
  const r = crearRegional({ fs: nodeFs, carpeta: carpeta() });
  const t0 = 1_800_000_000;
  // Casa 110: el objeto 1 a 100, 300 y 200 en tres fotos (mediana 200). Casa 112: a 400 (una foto).
  r.anotar(110, t0, [s(1, 1, 100)], []);
  r.anotar(110, t0 + HORA, [s(2, 1, 300)], []);
  r.anotar(110, t0 + 2 * HORA, [s(3, 1, 200)], []);
  r.anotar(112, t0, [], [s(4, 1, 400), s(5, 2, 50)]);
  const v = r.valores(t0 + 3 * HORA);
  assert.equal(v.casas, 2);
  assert.equal(v.valores[1], 300, '(200 + 400) / 2');
  assert.equal(v.valores[2], 50, 'un objeto que solo trae una casa vale lo de esa casa');
  assert.equal(v.desde, t0);
  assert.equal(v.hora, t0 + 2 * HORA);
});

test('el valor de cada foto es el de la hora del historial: el tramo barato sin los raros', () => {
  const r = crearRegional({ fs: nodeFs, carpeta: carpeta() });
  // 10 unidades: tramo barato = 3 (30 %, mínimo 3): las de 5, 100 y 100; el precio del medio es 100 y la de 5 es un raro
  // (menos de la mitad). Las de 110 y 900 quedan fuera del tramo.
  r.anotar(110, 1_800_000_000, [s(1, 7, 5), s(2, 7, 100), s(3, 7, 100), s(4, 7, 110), s(5, 7, 900, 6)], []);
  assert.equal(r.valores(1_800_000_000).valores[7], 100, 'media de 100 y 100 (el 5 no cuenta)');
  // Con 20 unidades el tramo son 6: 100, 100, 110, 110, 120 y 400 (raro: más del doble de 110) -> media 108.
  r.anotar(112, 1_800_000_000, [s(6, 8, 100, 2), s(7, 8, 110, 2), s(8, 8, 120), s(9, 8, 400, 15)], []);
  assert.equal(r.valores(1_800_000_000).valores[8], 108);
});

test('solo cuentan las fotos de los últimos 7 días y las últimas FOTOS_POR_CASA de cada casa', () => {
  const r = crearRegional({ fs: nodeFs, carpeta: carpeta() });
  const t0 = 1_800_000_000;
  r.anotar(110, t0, [s(1, 1, 1000)], []);
  for (let i = 1; i <= FOTOS_POR_CASA; i++) r.anotar(110, t0 + i * HORA, [s(10 + i, 1, 100)], []);
  assert.equal(r.resumen()['110'].fotos, FOTOS_POR_CASA, 'la más vieja se olvida');
  assert.equal(r.valores(t0 + 10 * HORA).valores[1], 100);
  r.anotar(112, t0, [s(20, 3, 500)], []);
  assert.equal(r.valores(t0 + VIGENCIA_S + HORA).valores[3], undefined, 'una casa sin fotos vigentes no cuenta');
  assert.equal(r.valores(t0 + 100 * VIGENCIA_S), null, 'sin ninguna casa vigente, nada');
});

test('una casa seguida entra como mucho cada 12 h; una foto vacía no cuenta pero sí se apunta como probada', () => {
  const r = crearRegional({ fs: nodeFs, carpeta: carpeta() });
  const t0 = 1_800_000_000;
  assert.equal(r.anotar(114, t0, [s(1, 1, 100)], [], { cada: CADA_PROPIA_S }), true);
  assert.equal(r.anotar(114, t0 + HORA, [s(2, 1, 100)], [], { cada: CADA_PROPIA_S }), false);
  assert.equal(r.anotar(114, t0 + CADA_PROPIA_S, [s(3, 1, 100)], [], { cada: CADA_PROPIA_S }), true);
  assert.equal(r.anotar(115, t0, [], []), false, 'una casa vacía no da precio');
  assert.equal(r.siguiente([115, 116], []), 116, '115 ya se probó: toca 116');
});

test('el turno: la candidata que hace más que no se mira, sin las que se siguen', () => {
  const r = crearRegional({ fs: nodeFs, carpeta: carpeta() });
  const t0 = 1_800_000_000;
  assert.equal(r.siguiente([113, 110, 112], [110]), 112, 'a igualdad, la de número menor (110 se sigue)');
  r.anotar(112, t0, [s(1, 1, 1)], []);
  assert.equal(r.siguiente([110, 112, 113], [110]), 113);
  r.probada(113, t0 + HORA);
  assert.equal(r.siguiente([110, 112, 113], [110]), 112, 'la 112 se miró antes que la 113');
  assert.equal(r.siguiente([110], [110]), null);
});

test('se guarda y se vuelve a leer; un archivo roto se aparta y se empieza de cero', async () => {
  const dir = carpeta();
  const r = crearRegional({ fs: nodeFs, carpeta: dir });
  r.anotar(110, 1_800_000_000, [s(1, 1, 100)], []);
  await r.guardar();
  const otra = crearRegional({ fs: nodeFs, carpeta: dir });
  assert.equal(otra.valores(1_800_000_000).valores[1], 100);

  writeFileSync(join(dir, 'regional.json.gz'), 'no es gzip');
  const avisos = [];
  const rota = crearRegional({ fs: nodeFs, carpeta: dir, registrar: (n, t) => avisos.push(t) });
  assert.equal(rota.valores(1_800_000_000), null);
  assert.ok(readdirSync(dir).some((n) => n.startsWith('regional.json.gz.roto-')), 'apartado, no borrado');
  assert.equal(existsSync(join(dir, 'regional.json.gz')), false);
  assert.match(avisos.join('\n'), /roto/);
});

// ---------- la ranura ----------

const base = { seq: 7, generado: 1_800_000_000, region: 'us', casas: { 114: { 2589: [100, 5, 100, 0, null, null, true, 3, false] } } };

test('la ranura lleva el precio regional en R[item] y su resumen en p1', () => {
  const textos = textosPrecios({ ...base, regional: { valores: { 2589: 123, 7: 45 }, casas: 9, desde: 1_799_000_000, hora: 1_800_000_000 } });
  assert.match(textos[0], /regional = \{\}, regionalInfo = \{casas = 9, desde = 1799000000, hora = 1800000000\}/);
  const datos = textos.slice(1).join('');
  assert.match(datos, /local Q, N, R, c = P\.casas, P\.nombres, P\.regional/);
  assert.match(datos, /R\[2589\]=123\n/);
  assert.match(datos, /R\[7\]=45\n/);
});

test('sin precio regional la ranura no cambia (ni regional ni regionalInfo)', () => {
  const textos = textosPrecios(base);
  assert.doesNotMatch(textos[0], /regional/);
  assert.doesNotMatch(textos.slice(1).join(''), /R\[/);
});

// ---------- el programador ----------

const MIN = 60_000;
const H = 60 * MIN;
const en = (hh, mm) => Date.UTC(2026, 10, 13, hh, mm);
const texto = (ms) => new Date(ms).toUTCString();
const hasta = async (cond, ms = 3000) => {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error('la condición no se cumplió a tiempo');
    await new Promise((ok) => setImmediate(ok));
  }
};

function relojFalso(t) {
  const r = { t, esperas: [] };
  r.ahora = () => r.t;
  r.dormir = (ms) => new Promise((ok) => r.esperas.push({ ms, ok }));
  r.pasar = async () => {
    await hasta(() => r.esperas.length > 0);
    const e = r.esperas.shift();
    r.t += e.ms;
    e.ok();
    await hasta(() => r.esperas.length > 0);
  };
  return r;
}

function servidor(reloj) {
  const srv = { llamadas: [] };
  const foto = (t) => {
    const h0 = Math.floor(t / H) * H;
    return t >= h0 + 21 * MIN ? h0 + 21 * MIN : h0 - H + 21 * MIN;
  };
  const responder = (tipo) => async (casa, { desde } = {}) => {
    srv.llamadas.push({ t: reloj.t, tipo, casa, desde });
    const f = foto(reloj.t);
    if (desde && Date.parse(desde) >= f) return { estado: 'igual' };
    // Cada casa pone el objeto 2589 a un precio distinto: 100 + la casa.
    return { estado: 'nueva', hora: texto(f), subastas: [s(`${casa}-${tipo}-${f}`, 2589, 100 + casa)] };
  };
  srv.subastas = responder('subastas');
  srv.mercancias = responder('mercancias');
  return srv;
}

function historialFalso() {
  const f = { fotos: [] };
  f.anadirFoto = (casa, hora, subastas, mercancias) => {
    f.fotos.push({ casa, hora, subastas, mercancias });
    return true;
  };
  f.guardar = async () => {};
  f.todos = (casa) => {
    const ultima = f.fotos.filter((x) => x.casa === casa).at(-1);
    if (!ultima) return new Map();
    return new Map([[2589, { precio: 100, cantidad: 5, subastas: 3, normal: 100, poco: true, tendencia: null, ritmo: null, vendidosDia: null, hora: ultima.hora }]]);
  };
  return f;
}

test('el programador anota las casas seguidas y, tras publicar, baja una casa más de la región por hora', async () => {
  const reloj = relojFalso(en(10, 5));
  const e = crearEstadoComercio({ fs: nodeFs, carpeta: carpeta() });
  e.aprender('Normal', 'Horde', 114);
  e.aprender('Normal', 'Neutral', 117);
  e.ponerIdentidad({ region: 'US', reino: 'Normal', faccion: 'Horde' });
  const srv = servidor(reloj);
  const regional = crearRegional({ fs: nodeFs, carpeta: carpeta() });
  const escritos = [];
  const p = crearProgramadorComercio({
    cliente: () => srv,
    historial: historialFalso(),
    catalogo: { completar: async () => ({}), grupos: () => [], ficha: () => null },
    casas: e,
    escribir: async (textos) => { escritos.push(textos); },
    reloj: reloj.ahora,
    dormir: reloj.dormir,
    espacio: 0,
    regional,
  });
  p.arrancar();
  await reloj.pasar(); // 10:20: aún la foto de las 9:21 (nueva: no hay desde)
  const a20 = srv.llamadas.filter((l) => l.t === en(10, 20));
  assert.deepEqual([...new Set(a20.map((l) => l.casa))], [114, 117, 110], 'las dos seguidas y una de la región (la 110)');
  const deLaRegion = a20.filter((l) => l.casa === 110);
  assert.equal(deLaRegion.length, 2, 'subastas y mercancías');
  assert.ok(deLaRegion.every((l) => l.desde === undefined), 'la de la región se pide entera');
  assert.equal(escritos.length, 1);
  // Al publicar ya estaban anotadas las seguidas (114: 214; 117: 217): la media es 215,5 -> 216.
  assert.match(escritos[0].slice(1).join(''), /R\[2589\]=216\n/);
  assert.match(escritos[0][0], /regionalInfo = \{casas = 2,/);
  assert.equal(regional.valores(en(10, 20) / 1000).casas, 3, 'después ya cuenta la 110');

  await reloj.pasar(); // 10:22: foto nueva de las seguidas; en esta hora ya se bajó la de la región
  assert.equal(srv.llamadas.filter((l) => l.t === en(10, 22) && ![114, 117].includes(l.casa)).length, 0);
  assert.match(escritos.at(-1).slice(1).join(''), /R\[2589\]=/);

  await reloj.pasar(); // 11:20
  const a1120 = srv.llamadas.filter((l) => l.t === en(11, 20));
  assert.ok(a1120.some((l) => l.casa === 111), 'la hora siguiente toca la 111');
  p.parar();
});
