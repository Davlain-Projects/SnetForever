// F9m: el contador temporal de «Salen al día». Todo con datos inventados y carpetas temporales: ni datos reales, ni API,
// ni blizzard.dat de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { crearHistorial, cuentasDelPar, MIN_PARES } from '../src/comercio/historial.mjs';
import { crearProgramadorComercio } from '../src/comercio/programador.mjs';
import { construirComercio, fuenteDeComercio } from '../src/comercio/ia.mjs';
import {
  crearMedidorSalen, casasHordaDe, leerMedicion, COLUMNAS, HORAS_MEDIDA, TOPE_BYTES,
} from '../src/comercio/medir-salen.mjs';

const H = 3600;
const T0 = 1_790_000_000 - (1_790_000_000 % H);
const LANA = 2592;
const LINO = 2589;
const CSV = 'diag-salen-114.csv';
const sub = (id, item, cantidad, precio, tiempo = 'LONG') => ({ id, item, cantidad, precio, tiempo });
// Las carpetas temporales de cada prueba se quitan al acabarla (solo las que ha creado esta prueba).
const creadas = [];
const temporal = () => {
  const carpeta = fs.mkdtempSync(join(os.tmpdir(), 'snf-medir-'));
  creadas.push(carpeta);
  return carpeta;
};
const limpiar = () => {
  for (const carpeta of creadas.splice(0)) fs.rmSync(carpeta, { recursive: true, force: true, maxRetries: 5 });
};
const prueba = (nombre, fn) => test(nombre, (t) => {
  t.after(limpiar);
  return fn(t);
});

// Un mercado sencillo: cada objeto con 6 subastas de 20 u; cada hora se renueva la tercera parte (ids nuevos).
const OBJETOS = [LANA, LINO, ...Array.from({ length: 30 }, (_, i) => 3000 + i)];
function fotoMercado(k, objetos = OBJETOS) {
  const lista = [];
  for (const item of objetos) {
    const extra = item >= 3000 ? item - 3000 : 40; // unas con más unidades que otras
    for (let s = 0; s < 6; s++) {
      const gen = Math.floor((k + s) / 3);
      lista.push(sub(item * 100000 + s * 1000 + gen, item, 20 + extra, 100 + s * 5));
    }
  }
  return lista;
}

function montar({ casas = [114], carpeta = temporal(), usarFs = fs, tope } = {}) {
  const registro = [];
  const medidor = crearMedidorSalen({
    fs: usarFs, carpeta, casasHorda: () => casas, registrar: (nivel, texto) => registro.push([nivel, texto]),
    ...(tope ? { tope } : {}),
  });
  const h = crearHistorial({ fs: usarFs, carpeta, alPar: medidor.alPar });
  const ruta = join(carpeta, CSV);
  const leer = () => leerMedicion(fs.readFileSync(ruta, 'utf8'));
  return { carpeta, registro, medidor, h, ruta, leer };
}

// ---------- la app entera: programador, historial, ranuras y contexto de la IA ----------
const YO = { region: 'us', reino: 'Normal', faccion: 'Horde' };
const CONOCIDAS = { 'Normal|Horde': 114, 'Normal|Neutral': 117 };

function casasFalsas() {
  const desde = {};
  let seq = 0;
  return {
    enUso: () => ({ region: 'us', casas: [114, 117] }),
    identidad: () => YO,
    conocidas: () => ({ ...CONOCIDAS }),
    desde: (r, c) => desde[`${r}|${c}`],
    ponerDesde: (r, c, v) => { desde[`${r}|${c}`] = { ...v }; },
    porDescubrir: () => null,
    descubierto() {},
    aprender() {},
    sinCasa: () => undefined,
    ponerSinCasa() {},
    siguienteSeq: () => ++seq,
    guardar: async () => {},
  };
}

async function correrApp({ conMedidor, horas = 30 }) {
  const carpeta = temporal();
  fs.writeFileSync(join(carpeta, 'blizzard.dat'), 'NO-TOCAR');
  const rutas = [];
  const espia = new Proxy(fs, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return (...a) => {
        if (typeof a[0] === 'string') rutas.push(a[0]);
        return v.apply(t, a);
      };
    },
  });
  const casas = casasFalsas();
  const medidor = conMedidor
    ? crearMedidorSalen({ fs: espia, carpeta, casasHorda: () => casasHordaDe(casas.identidad(), casas.conocidas()), registrar() {} })
    : null;
  const h = crearHistorial({ fs: espia, carpeta, ...(medidor ? { alPar: medidor.alPar } : {}) });
  let t = (T0 + 25 * 60) * 1000;
  const llamadas = [];
  const responder = (tipo) => async (casa, { desde } = {}) => {
    llamadas.push([tipo, casa, t]);
    const foto = Math.floor(t / 3_600_000) * 3_600_000 + 21 * 60_000;
    if (desde && Date.parse(desde) >= foto) return { estado: 'igual' };
    const k = Math.round((foto / 1000 - T0) / H);
    const lista = tipo === 'mercancias' ? fotoMercado(k + casa) : [sub(900000 + k, 7777, 1, 5000)];
    return { estado: 'nueva', hora: new Date(foto).toUTCString(), subastas: lista };
  };
  const cliente = { subastas: responder('subastas'), mercancias: responder('mercancias'), objeto: async () => null };
  const catalogo = { completar: async () => {}, grupos: () => [], ficha: () => null };
  const ranuras = [];
  const prog = crearProgramadorComercio({
    cliente, historial: h, catalogo, casas, reloj: () => t, dormir: async () => {}, espacio: 0,
    escribir: async (textos) => { ranuras.push(JSON.stringify(textos)); },
  });
  for (let k = 0; k < horas; k++) {
    await prog.ahora();
    t += 3_600_000;
  }
  const fuente = fuenteDeComercio({ estado: casas, historial: h, catalogo, mensaje: { ctx: {} } });
  const ia = JSON.stringify(construirComercio({ ...fuente, inventarioIds: [LANA], mencionadas: [], enVivo: null }));
  return {
    carpeta, rutas, llamadas, ranuras, ia,
    bin114: fs.readFileSync(join(carpeta, 'historial-114.bin')),
    bin117: fs.readFileSync(join(carpeta, 'historial-117.bin')),
  };
}

prueba('con el contador y sin él, el historial, las ranuras y el contexto de la IA salen idénticos byte a byte', async () => {
  const sin = await correrApp({ conMedidor: false });
  const con = await correrApp({ conMedidor: true });
  assert.ok(fs.existsSync(join(con.carpeta, CSV)), 'el contador ha medido');
  assert.ok(sin.ranuras.length > 0);
  assert.ok(sin.bin114.equals(con.bin114), 'historial de la Horda');
  assert.ok(sin.bin117.equals(con.bin117), 'historial de la neutral');
  assert.deepEqual(con.ranuras, sin.ranuras);
  assert.equal(con.ia, sin.ia);
});

prueba('el contador recibe una copia: aunque la estropee, el historial no cambia', () => {
  const fotos = [0, 1, 2, 3].map((k) => fotoMercado(k));
  const correr = (alPar) => {
    const h = crearHistorial({ fs, carpeta: temporal(), ...(alPar ? { alPar } : {}) });
    fotos.forEach((f, k) => h.anadirFoto(114, T0 + k * H, [], f));
    return JSON.stringify([...h.todos(114)]);
  };
  let vistos = 0;
  const estropea = ({ par }) => {
    const { antes, ahora } = par();
    vistos += 1;
    for (const f of [antes, ahora]) for (const c of [f.ids, f.items, f.cant, f.corta, f.precio]) c.fill(0);
  };
  assert.equal(correr(estropea), correr(null));
  assert.equal(vistos, 3);
});

prueba('no hace ninguna llamada nueva a la API ni abre blizzard.dat', async () => {
  const sin = await correrApp({ conMedidor: false });
  const con = await correrApp({ conMedidor: true });
  assert.deepEqual(con.llamadas, sin.llamadas);
  assert.ok(!con.rutas.some((r) => /blizzard/i.test(r)), 'ninguna ruta con blizzard');
  assert.equal(fs.readFileSync(join(con.carpeta, 'blizzard.dat'), 'utf8'), 'NO-TOCAR');
  // lo único nuevo que toca son sus dos archivos
  const relativa = (r, carpeta) => r.replace(carpeta, '').replace(/\.tmp-\d+-[0-9a-f]+$/, '.tmp'); // el temporal lleva un nombre al azar
  const antes = new Set(sin.rutas.map((r) => relativa(r, sin.carpeta)));
  const nuevas = new Set(con.rutas.map((r) => relativa(r, con.carpeta)).filter((r) => !antes.has(r)));
  assert.deepEqual([...nuevas].map((r) => r.replace(/^[\\/]/, '')).sort(), [CSV, 'diag-salen-114.marca'].sort());
});

prueba('empieza con el primer par de la Horda, y reiniciar la app no reinicia las 48 horas', () => {
  const a = montar();
  a.h.anadirFoto(114, T0, [], fotoMercado(0));
  assert.ok(!fs.existsSync(a.ruta), 'con una foto sola no hay par');
  a.h.anadirFoto(114, T0 + H, [], fotoMercado(1));
  a.h.anadirFoto(114, T0 + 2 * H, [], fotoMercado(2));
  const uno = a.leer();
  assert.equal(uno.inicio, T0 + H);
  assert.deepEqual([...new Set(uno.filas.map((f) => f.hora))], [T0 + H, T0 + 2 * H]);

  // Reinicio: historial y contador nuevos sobre la misma carpeta. La misma foto otra vez no duplica filas.
  const b = montar({ carpeta: a.carpeta });
  b.h.anadirFoto(114, T0 + H, [], fotoMercado(1));
  b.h.anadirFoto(114, T0 + 2 * H, [], fotoMercado(2));
  b.h.anadirFoto(114, T0 + 3 * H, [], fotoMercado(3));
  const dos = b.leer();
  assert.equal(dos.inicio, T0 + H, 'la hora de inicio no cambia');
  assert.deepEqual(dos.objetos, uno.objetos);
  assert.deepEqual([...new Set(dos.filas.map((f) => f.hora))], [T0 + H, T0 + 2 * H, T0 + 3 * H]);
  const texto = fs.readFileSync(a.ruta, 'utf8');
  assert.equal(texto.split('\n').filter((l) => l.startsWith('#medir-salen')).length, 1);
  assert.equal(dos.filas.length, dos.objetos.length * 3, 'una línea por objeto y par, sin repetir');
});

prueba('a las 48 horas escribe el cierre y no vuelve a escribir nunca, también tras reiniciar', () => {
  const a = montar();
  for (let k = 0; k <= HORAS_MEDIDA + 1; k++) a.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
  const r = a.leer();
  assert.equal(r.cierre?.motivo, '48h');
  assert.equal(r.cierre.hora, T0 + H + HORAS_MEDIDA * H);
  const horas = [...new Set(r.filas.map((f) => f.hora))];
  assert.equal(horas.length, HORAS_MEDIDA);
  assert.equal(horas.at(-1), T0 + HORAS_MEDIDA * H);
  const tamano = fs.statSync(a.ruta).size;
  for (let k = HORAS_MEDIDA + 2; k < HORAS_MEDIDA + 6; k++) a.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
  assert.equal(fs.statSync(a.ruta).size, tamano);

  const b = montar({ carpeta: a.carpeta });
  for (let k = HORAS_MEDIDA + 6; k < HORAS_MEDIDA + 10; k++) b.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
  assert.equal(fs.statSync(a.ruta).size, tamano);
});

prueba('si el PC estuvo apagado, los huecos se quedan y la ventana no se alarga', () => {
  const a = montar();
  a.h.anadirFoto(114, T0, [], fotoMercado(0));
  a.h.anadirFoto(114, T0 + H, [], fotoMercado(1));
  // apagado 60 horas: al volver, dos fotos seguidas pero ya fuera de las 48 h
  a.h.anadirFoto(114, T0 + 60 * H, [], fotoMercado(60));
  a.h.anadirFoto(114, T0 + 61 * H, [], fotoMercado(61));
  const r = a.leer();
  assert.deepEqual([...new Set(r.filas.map((f) => f.hora))], [T0 + H]);
  assert.equal(r.cierre?.motivo, '48h');
});

prueba('solo la casa de la Horda y solo mercancías; sin casa de la Horda no empieza', () => {
  // La neutral y la Alianza no se miden.
  const a = montar();
  for (const casa of [117, 111]) {
    a.h.anadirFoto(casa, T0, [], fotoMercado(0));
    a.h.anadirFoto(casa, T0 + H, [], fotoMercado(1));
  }
  assert.deepEqual(fs.readdirSync(a.carpeta).filter((n) => n.startsWith('diag-')), []);

  // Sin casa de la Horda no empieza ni cuenta las 48 h: al descubrirla, empieza entonces.
  const casas = [];
  const b = montar({ casas });
  b.h.anadirFoto(114, T0, [], fotoMercado(0));
  b.h.anadirFoto(114, T0 + H, [], fotoMercado(1));
  assert.ok(!fs.existsSync(b.ruta));
  casas.push(114);
  b.h.anadirFoto(114, T0 + 2 * H, [], fotoMercado(2));
  assert.equal(b.leer().inicio, T0 + 2 * H);

  // Un par sin mercancías no empieza; y un objeto suelto, por muchas unidades que tenga, no entra en la lista.
  const c = montar();
  c.h.anadirFoto(114, T0, [sub(1, 7777, 5000, 10)], []);
  c.h.anadirFoto(114, T0 + H, [sub(1, 7777, 5000, 10)], []);
  assert.ok(!fs.existsSync(c.ruta));
  c.h.anadirFoto(114, T0 + 2 * H, [sub(1, 7777, 5000, 10)], fotoMercado(2));
  c.h.anadirFoto(114, T0 + 3 * H, [sub(1, 7777, 5000, 10)], fotoMercado(3));
  assert.ok(!c.leer().objetos.includes(7777));

  // De lo descubierto, solo «<reino>|Horde» y solo candidatas de la Horda.
  assert.deepEqual(casasHordaDe(YO, { 'Normal|Horde': 114, 'Normal|Neutral': 117, 'Normal|Alliance': 111 }), [114]);
  assert.deepEqual(casasHordaDe(YO, { 'Normal|Neutral': 117 }), []);
  assert.deepEqual(casasHordaDe(YO, { 'Normal|Horde': 117 }), [], 'una neutral apuntada como Horda no vale');
  assert.deepEqual(casasHordaDe(YO, { 'Otro|Horde': 120, 'Normal|Horde': '114' }), [114, 120], 'primero la de su reino');
});

prueba('la lista de objetos se fija al empezar: lana, lino y las 20 con más unidades', () => {
  const a = montar();
  a.h.anadirFoto(114, T0, [], fotoMercado(0));
  a.h.anadirFoto(114, T0 + H, [], fotoMercado(1));
  const esperadas = Array.from({ length: 20 }, (_, i) => 3029 - i); // las de más unidades del mercado inventado
  const { objetos } = a.leer();
  assert.deepEqual(objetos, [LANA, LINO, ...esperadas]);

  // Luego cambia el mercado: la lista no.
  const otro = [LANA, LINO, ...Array.from({ length: 5 }, (_, i) => 5000 + i)];
  a.h.anadirFoto(114, T0 + 2 * H, [], [...fotoMercado(2, otro), sub(99_000_001, 5000, 90000, 100)]);
  const r = a.leer();
  assert.deepEqual(r.objetos, objetos);
  assert.ok(!r.filas.some((f) => f.item === 5000));
  assert.equal(r.filas.filter((f) => f.hora === T0 + 2 * H).length, 22, 'una línea por objeto, aunque ya no esté');
});

prueba('el archivo no lleva ids de subasta, vendedores ni nombres', () => {
  const a = montar();
  const conDatos = (k) => fotoMercado(k).map((s) => ({ ...s, vendedor: 'Fulanito', nombre: 'Paño de lana', seller: 'Menganita' }));
  const fotos = [0, 1, 2].map(conDatos);
  fotos.forEach((f, k) => a.h.anadirFoto(114, T0 + k * H, [], f));
  const texto = fs.readFileSync(a.ruta, 'utf8');
  assert.ok(!/Fulanito|Menganita|Paño/.test(texto));
  const numeros = new Set(texto.match(/\d+/g));
  for (const f of fotos) for (const s of f) assert.ok(!numeros.has(String(s.id)), `id ${s.id}`);
  assert.equal(texto.split('\n')[1], COLUMNAS.join(','));
  assert.deepEqual(COLUMNAS, ['hora', 'hueco_s', 'item', 'unidades_a_la_venta', 'subastas', 'salen_u', 'descartadas_u', 'contadas_u',
    'parciales_u', 'caducadas_n', 'altura_P_pct', 'vuelven_lote_10pct_u', 'vuelven_bajo_minimo_u', 'vuelven_bajo_minimo_max_u', 'vuelven_hasta_minimo_max_u',
    'nuevas_bajo_minimo_u', 'nuevas_hasta_minimo_u']);
});

prueba('contadas y descartadas cuadran con lo que cuenta contarVentas en ese par', () => {
  // Un par a mano: intacta a 50; sale a 40 (cuenta), sale a 60 (por encima de P*: descartada), compra parcial, caducada.
  const a = montar();
  a.h.anadirFoto(114, T0, [], [
    sub(1, LANA, 10, 50), sub(2, LANA, 7, 40), sub(3, LANA, 9, 60), sub(4, LANA, 20, 45), sub(5, LANA, 4, 70, 'SHORT'),
  ]);
  a.h.anadirFoto(114, T0 + H, [], [sub(1, LANA, 10, 50), sub(4, LANA, 15, 45), sub(6, LANA, 7, 30)]);
  const f = a.leer().filas.find((x) => x.item === LANA);
  assert.equal(f.hueco_s, H);
  assert.equal(f.unidades_a_la_venta, 32);
  assert.equal(f.subastas, 3);
  assert.equal(f.contadas_u, 12); // 7 de la que sale a 40 y 5 de la parcial
  assert.equal(f.descartadas_u, 9);
  assert.equal(f.salen_u, 21);
  assert.equal(f.parciales_u, 5);
  assert.equal(f.caducadas_n, 1);
  // Por debajo de P* (50) había 27 de 50 unidades: la de 40 (7) y la de 45 (20).
  assert.equal(f.altura_P_pct, 54);
  // La de 40 vuelve con el mismo lote (7) a 30, por debajo del mínimo anterior (40).
  assert.equal(f.vuelven_bajo_minimo_u, 7);
  assert.equal(f.nuevas_bajo_minimo_u, 7);

  // Y sobre muchos pares, contra el historial de verdad: con el filtro (contadas) y sin él (salen).
  const b = montar();
  const sinFiltro = crearHistorial({ fs, carpeta: temporal() });
  const pares = MIN_PARES + 6;
  for (let k = 0; k <= pares; k++) {
    const f2 = fotoMercado(k);
    b.h.anadirFoto(114, T0 + k * H, [], f2);
    sinFiltro.anadirFoto(114, T0 + k * H, f2, []); // como objetos sueltos: no se les aplica P*
  }
  const { filas, objetos } = b.leer();
  const suma = (item, campo) => filas.filter((x) => x.item === item).reduce((n, x) => n + x[campo], 0);
  for (const item of objetos) {
    assert.equal(suma(item, 'contadas_u'), Math.round((b.h.resumen(114, item).vendidosDia * pares) / 24), `contadas de ${item}`);
    assert.equal(suma(item, 'salen_u'), Math.round((sinFiltro.resumen(114, item).vendidosDia * pares) / 24), `salen de ${item}`);
    assert.equal(suma(item, 'descartadas_u'), suma(item, 'salen_u') - suma(item, 'contadas_u'));
  }
});

prueba('una salida descartada reclama su republicación antes que una venta contada', () => {
  const fila = (fotoA, fotoB) => {
    const a = montar();
    a.h.anadirFoto(114, T0, [], fotoA);
    a.h.anadirFoto(114, T0 + H, [], fotoB);
    return a.leer().filas.find((x) => x.item === LANA);
  };
  // Vendida a 40 y cancelada a 60, las dos de 7 u; una sola subasta nueva de 7 u bajo el mínimo: es de la cancelada.
  const antes = [sub(1, LANA, 10, 50), sub(2, LANA, 7, 40), sub(3, LANA, 7, 60)];
  const una = fila(antes, [sub(1, LANA, 10, 50), sub(4, LANA, 7, 30)]);
  assert.equal(una.contadas_u, 7);
  assert.equal(una.descartadas_u, 7);
  assert.equal(una.nuevas_bajo_minimo_u, 7);
  assert.equal(una.vuelven_bajo_minimo_u, 0);
  // Con dos nuevas, una para cada una: ninguna se empareja dos veces.
  const dos = fila(antes, [sub(1, LANA, 10, 50), sub(4, LANA, 7, 30), sub(5, LANA, 7, 31)]);
  assert.equal(dos.vuelven_bajo_minimo_u, 7);
  // Lo mismo con el mismo lote a ±10 %.
  const lote = fila(
    [sub(1, LANA, 10, 56), sub(2, LANA, 7, 55), sub(3, LANA, 7, 60)],
    [sub(1, LANA, 10, 56), sub(4, LANA, 7, 58)],
  );
  assert.equal(lote.contadas_u, 7);
  assert.equal(lote.descartadas_u, 7);
  assert.equal(lote.vuelven_lote_10pct_u, 0);
});

prueba('un objeto que no estaba en la foto anterior no cuenta como nuevas bajo el mínimo', () => {
  const a = montar();
  a.h.anadirFoto(114, T0, [], [sub(1, LANA, 10, 50)]);
  a.h.anadirFoto(114, T0 + H, [], [sub(1, LANA, 10, 50), sub(2, LINO, 30, 20)]);
  const lino = a.leer().filas.find((x) => x.item === LINO);
  assert.equal(lino.unidades_a_la_venta, 30);
  assert.equal(lino.nuevas_bajo_minimo_u, 0);
});

// Las cotas del emparejamiento.
prueba('las dos cotas: con las descartadas primero y con las contadas primero', () => {
  const fila = (fotoB) => {
    const a = montar();
    a.h.anadirFoto(114, T0, [], [sub(1, LANA, 10, 50), sub(2, LANA, 7, 40), sub(3, LANA, 7, 60)]);
    a.h.anadirFoto(114, T0 + H, [], fotoB);
    return a.leer().filas.find((x) => x.item === LANA);
  };
  // Una sola nueva: no se sabe de quién es. Abajo 0 (es de la cancelada), arriba 7 (es de la vendida).
  const una = fila([sub(1, LANA, 10, 50), sub(4, LANA, 7, 30)]);
  assert.equal(una.vuelven_bajo_minimo_u, 0);
  assert.equal(una.vuelven_bajo_minimo_max_u, 7);
  // Con dos, una para cada una: las dos cotas coinciden y ninguna nueva se usa dos veces.
  const dos = fila([sub(1, LANA, 10, 50), sub(4, LANA, 7, 30), sub(5, LANA, 7, 31)]);
  assert.equal(dos.vuelven_bajo_minimo_u, 7);
  assert.equal(dos.vuelven_bajo_minimo_max_u, 7);
  // Con otro lote no empareja en ninguna.
  const otra = fila([sub(1, LANA, 10, 50), sub(4, LANA, 8, 30)]);
  assert.equal(otra.vuelven_bajo_minimo_u, 0);
  assert.equal(otra.vuelven_bajo_minimo_max_u, 0);
});

// El emparejamiento de referencia, subasta a subasta: el índice por lote tiene que dar exactamente lo mismo.
function referencia(antes, ahora, huecoAntes, hueco) {
  const salidas = [];
  cuentasDelPar(huecoAntes, antes, ahora, hueco, {
    parcial() {},
    sale(i, contada) {
      if (antes.items[i] === LANA) salidas.push({ cant: antes.cant[i], precio: antes.precio[i], contada });
    },
  });
  const previos = new Set(antes.ids);
  let minimo = Infinity;
  for (let i = 0; i < antes.ids.length; i++) if (antes.items[i] === LANA && antes.precio[i] > 0) minimo = Math.min(minimo, antes.precio[i]);
  const nuevas = [];
  for (let j = 0; j < ahora.ids.length; j++) {
    if (ahora.items[j] === LANA && ahora.precio[j] > 0 && !previos.has(ahora.ids[j])) nuevas.push({ cant: ahora.cant[j], precio: ahora.precio[j] });
  }
  const empareja = (orden, vale) => {
    const usadas = new Set();
    let unidades = 0;
    for (const turno of orden) {
      for (const s of salidas) {
        if (s.contada !== turno) continue;
        const k = nuevas.findIndex((n, x) => !usadas.has(x) && n.cant === s.cant && vale(n, s));
        if (k < 0) continue;
        usadas.add(k);
        if (s.contada) unidades += s.cant;
      }
    }
    return unidades;
  };
  const bajo = (n) => Number.isFinite(minimo) && n.precio < minimo;
  const hasta = (n) => Number.isFinite(minimo) && n.precio <= minimo;
  const unidades = (l) => l.reduce((x, n) => x + n.cant, 0);
  return {
    vuelven_lote_10pct_u: empareja([false, true], (n, s) => Math.abs(n.precio - s.precio) <= 0.1 * s.precio),
    vuelven_bajo_minimo_u: empareja([false, true], bajo),
    vuelven_bajo_minimo_max_u: empareja([true, false], bajo),
    vuelven_hasta_minimo_max_u: empareja([true, false], hasta),
    nuevas_bajo_minimo_u: unidades(nuevas.filter(bajo)),
    nuevas_hasta_minimo_u: unidades(nuevas.filter(hasta)),
  };
}

// Un par al azar, con muchos empates de lote y de precio.
function parAlAzar(r) {
  const lotes = [5, 7, 20];
  const fotoA = [];
  const fotoB = [];
  let id = 1;
  for (let i = 0; i < 80; i++) {
    const x = sub(id++, LANA, lotes[Math.floor(r() * 3)], 90 + Math.floor(r() * 50));
    fotoA.push(x);
    if (r() < 0.4) fotoB.push(x);
  }
  for (let i = 0; i < 50; i++) fotoB.push(sub(id++, LANA, lotes[Math.floor(r() * 3)], 80 + Math.floor(r() * 60)));
  return [fotoA, fotoB];
}
const azar = (semilla) => {
  let s = semilla;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
};
const filaDelPar = (fotoA, fotoB) => {
  const a = montar();
  a.h.anadirFoto(114, T0, [], fotoA);
  a.h.anadirFoto(114, T0 + H, [], fotoB);
  return a.leer().filas.find((x) => x.item === LANA);
};

prueba('las cotas van en orden: baja <= alta <= hasta el mínimo <= contadas', () => {
  const r = azar(777);
  let conEmpate = 0;
  for (let caso = 0; caso < 60; caso++) {
    const f = filaDelPar(...parAlAzar(r));
    assert.ok(f.vuelven_bajo_minimo_u <= f.vuelven_bajo_minimo_max_u, 'baja <= alta, caso ' + caso);
    assert.ok(f.vuelven_bajo_minimo_max_u <= f.vuelven_hasta_minimo_max_u, 'alta <= hasta, caso ' + caso);
    assert.ok(f.vuelven_hasta_minimo_max_u <= f.contadas_u, 'hasta <= contadas, caso ' + caso);
    assert.ok(f.nuevas_bajo_minimo_u <= f.nuevas_hasta_minimo_u, 'control, caso ' + caso);
    if (f.vuelven_hasta_minimo_max_u > f.vuelven_bajo_minimo_max_u) conEmpate += 1;
  }
  assert.ok(conEmpate > 0, 'la prueba tiene que pasar por algún empate con el mínimo');
});

prueba('el mismo par da siempre las mismas cifras', () => {
  const [fotoA, fotoB] = parAlAzar(azar(4242));
  assert.deepEqual(filaDelPar(fotoA, fotoB), filaDelPar(fotoA, fotoB));
});

prueba('el empate: 20 unidades republicadas justo al mínimo se ven en vuelven_hasta_minimo_max_u', () => {
  const f = filaDelPar([sub(1, LANA, 10, 50), sub(2, LANA, 20, 40)], [sub(1, LANA, 10, 50), sub(3, LANA, 20, 40)]);
  assert.equal(f.contadas_u, 20);
  assert.equal(f.vuelven_bajo_minimo_u, 0);
  assert.equal(f.vuelven_bajo_minimo_max_u, 0);
  assert.equal(f.vuelven_hasta_minimo_max_u, 20);
  assert.equal(f.nuevas_bajo_minimo_u, 0);
  assert.equal(f.nuevas_hasta_minimo_u, 20);
  // Dos salidas del mismo lote y una sola subasta nueva: no se empareja dos veces.
  const g = filaDelPar(
    [sub(1, LANA, 10, 50), sub(2, LANA, 20, 40), sub(3, LANA, 20, 41)],
    [sub(1, LANA, 10, 50), sub(4, LANA, 20, 40)],
  );
  assert.equal(g.contadas_u, 40);
  assert.equal(g.vuelven_hasta_minimo_max_u, 20);
  // Por encima del mínimo no entra.
  const h = filaDelPar([sub(1, LANA, 10, 50), sub(2, LANA, 20, 40)], [sub(1, LANA, 10, 50), sub(3, LANA, 20, 41)]);
  assert.equal(h.vuelven_hasta_minimo_max_u, 0);
  assert.equal(h.nuevas_hasta_minimo_u, 0);
});

prueba('48 horas de 22 objetos con cifras grandes caben en el tope de bytes', () => {
  const objetos = [LANA, LINO, ...Array.from({ length: 20 }, (_, i) => 3000 + i)];
  const foto = (k) => objetos.flatMap((item) => [
    sub(item * 1000 + 1, item, 900000, 300), // intacta: P*
    sub(item * 1000 + 2, item, 9000000 - k * 100000, 250), // compra parcial cada hora
    sub(item * 10000000 + k, item, 300000, 200 - k), // sale contada y la siguiente queda bajo el mínimo
    sub(item * 20000000 + k, item, 300000, 400), // sale descartada
  ]);
  const a = montar();
  for (let k = 0; k <= HORAS_MEDIDA + 1; k++) a.h.anadirFoto(114, T0 + k * H, [], foto(k));
  const r = a.leer();
  assert.equal(r.cierre?.motivo, '48h', 'cierra por las 48 h, no por el tope');
  assert.equal(r.filas.length, HORAS_MEDIDA * objetos.length);
  assert.ok(r.filas.some((f) => f.vuelven_hasta_minimo_max_u >= 300000), 'las columnas nuevas llevan cifras grandes');
  const tamano = fs.statSync(a.ruta).size;
  assert.ok(tamano < TOPE_BYTES, tamano + ' bytes');
});

prueba('el índice por lote da lo mismo que emparejar subasta a subasta', () => {
  const r = azar(12345);
  for (let caso = 0; caso < 60; caso++) {
    const [fotoA, fotoB] = parAlAzar(r);
    let esperado = null;
    const carpeta = temporal();
    const medidor = crearMedidorSalen({ fs, carpeta, casasHorda: () => [114] });
    const h = crearHistorial({
      fs, carpeta,
      alPar: (d) => {
        const { antes, ahora } = d.par();
        esperado = referencia(antes, ahora, d.huecoAntes, d.hueco);
        medidor.alPar(d);
      },
    });
    h.anadirFoto(114, T0, [], fotoA);
    h.anadirFoto(114, T0 + H, [], fotoB);
    const f = leerMedicion(fs.readFileSync(join(carpeta, CSV), 'utf8')).filas.find((x) => x.item === LANA);
    for (const campo of Object.keys(esperado)) assert.equal(f[campo], esperado[campo], campo + ' en el caso ' + caso);
  }
});

prueba('un par enorme del mismo lote se mide sin coste cuadrático', () => {
  const n = 60000;
  const fotoA = [sub(1, LANA, 7, 105)];
  const fotoB = [sub(1, LANA, 7, 105)];
  for (let i = 0; i < n; i++) fotoA.push(sub(10 + i, LANA, 20, i % 2 ? 110 : 100)); // la mitad contadas, la mitad descartadas
  for (let i = 0; i < 45000; i++) fotoB.push(sub(10 + n + i, LANA, 20, 99));
  const carpeta = temporal();
  const medidor = crearMedidorSalen({ fs, carpeta, casasHorda: () => [114] });
  let ms = 0;
  const h = crearHistorial({
    fs, carpeta,
    alPar: (d) => {
      const t = performance.now();
      medidor.alPar(d);
      ms = performance.now() - t;
    },
  });
  h.anadirFoto(114, T0, [], fotoA);
  h.anadirFoto(114, T0 + H, [], fotoB);
  const f = leerMedicion(fs.readFileSync(join(carpeta, CSV), 'utf8')).filas.find((x) => x.item === LANA);
  assert.equal(f.contadas_u, 30000 * 20);
  assert.equal(f.descartadas_u, 30000 * 20);
  assert.equal(f.vuelven_bajo_minimo_u, 15000 * 20); // 45000 nuevas: 30000 para las descartadas y 15000 para las contadas
  assert.equal(f.vuelven_bajo_minimo_max_u, 30000 * 20);
  assert.equal(f.vuelven_lote_10pct_u, 15000 * 20);
  assert.ok(ms < 3000, 'el par ha tardado ' + Math.round(ms) + ' ms');
});

prueba('un archivo de otra versión no se mezcla: se para, lo apunta una vez y no escribe nada', () => {
  for (const version of [1, 2]) {
    const carpeta = temporal();
    const ruta = join(carpeta, CSV);
    const viejo = '#medir-salen v' + version + ' casa=114 inicio=' + (T0 + H) + ' objetos=2592,2589\n'
      + 'hora,hueco_s,item,unidades_a_la_venta,subastas,salen_u,descartadas_u,contadas_u,parciales_u,caducadas_n,altura_P_pct,'
      + 'vuelven_lote_10pct_u,vuelven_bajo_minimo_u,nuevas_bajo_minimo_u\n'
      + (T0 + H) + ',3600,2592,100,5,20,0,20,0,0,10,0,0,0\n';
    fs.writeFileSync(ruta, viejo);
    const a = montar({ carpeta });
    const limpio = crearHistorial({ fs, carpeta: temporal() });
    for (let k = 2; k < 6; k++) {
      assert.equal(a.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k)), true);
      limpio.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
    }
    assert.equal(fs.readFileSync(ruta, 'utf8'), viejo, 'el archivo no cambia');
    const avisos = a.registro.filter(([n]) => n === 'aviso').map(([, texto]) => texto);
    assert.equal(avisos.length, 1);
    assert.ok(avisos[0].includes('v' + version), avisos[0]);
    assert.equal(JSON.stringify([...a.h.todos(114)]), JSON.stringify([...limpio.todos(114)]));
  }
});

prueba('un fallo de escritura deja una línea clara con la hora y el hueco, y al arrancar sigue la misma medición', () => {
  let llamadas = 0;
  const fsRoto = new Proxy(fs, {
    get(t, k) {
      if (k === 'appendFileSync') {
        return (...args) => {
          llamadas += 1;
          if (llamadas === 3) throw Object.assign(new Error('disco'), { code: 'EBUSY' });
          return t.appendFileSync(...args);
        };
      }
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const a = montar({ usarFs: fsRoto });
  for (let k = 0; k < 5; k++) a.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
  assert.equal(llamadas, 3, 'tras el fallo no escribe más en esta ejecución');
  const avisos = a.registro.filter(([n]) => n === 'aviso').map(([, texto]) => texto);
  assert.equal(avisos.length, 1);
  const horaFallo = new Date((T0 + 2 * H) * 1000).toISOString().slice(0, 16);
  for (const trozo of ['casa 114', 'EBUSY', horaFallo, 'próximo arranque', '48 h', 'hueco']) {
    assert.ok(avisos[0].includes(trozo), `falta «${trozo}» en: ${avisos[0]}`);
  }
  const b = montar({ carpeta: a.carpeta });
  b.h.anadirFoto(114, T0 + 5 * H, [], fotoMercado(5));
  b.h.anadirFoto(114, T0 + 6 * H, [], fotoMercado(6));
  const r = b.leer();
  assert.equal(r.inicio, T0 + H);
  assert.deepEqual([...new Set(r.filas.map((f) => f.hora))], [T0 + H, T0 + 6 * H], 'el hueco se queda como hueco');
});

prueba('un fallo dentro del contador se apunta una vez, lo apaga y el historial se guarda igual', async () => {
  const fotos = [0, 1, 2, 3, 4].map((k) => fotoMercado(k));
  let intentos = 0;
  const fsRoto = new Proxy(fs, {
    get(t, k) {
      if (k === 'appendFileSync') {
        return () => {
          intentos += 1;
          throw Object.assign(new Error('disco'), { code: 'EIO' });
        };
      }
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const a = montar({ usarFs: fsRoto });
  const limpio = crearHistorial({ fs, carpeta: temporal() });
  fotos.forEach((f, k) => {
    assert.equal(a.h.anadirFoto(114, T0 + k * H, [], f), true);
    limpio.anadirFoto(114, T0 + k * H, [], f);
  });
  await a.h.guardar(114);
  assert.equal(intentos, 1, 'no lo vuelve a intentar en esta ejecución');
  assert.equal(a.registro.filter(([n]) => n === 'aviso').length, 1);
  assert.match(a.registro.find(([n]) => n === 'aviso')[1], /EIO/);
  assert.equal(JSON.stringify([...a.h.todos(114)]), JSON.stringify([...limpio.todos(114)]));
  assert.ok(fs.existsSync(join(a.carpeta, 'historial-114.bin')));

  // Aunque el propio gancho lanzara, la foto entra igual.
  const h = crearHistorial({ fs, carpeta: temporal(), alPar: () => { throw new Error('gancho'); } });
  const otro = crearHistorial({ fs, carpeta: temporal() });
  fotos.forEach((f, k) => {
    assert.equal(h.anadirFoto(114, T0 + k * H, [], f), true);
    otro.anadirFoto(114, T0 + k * H, [], f);
  });
  assert.equal(JSON.stringify([...h.todos(114)]), JSON.stringify([...otro.todos(114)]));
});

prueba('al llegar al tope de bytes se cierra', () => {
  const tope = 6000;
  const a = montar({ tope });
  for (let k = 0; k < 12; k++) a.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
  const r = a.leer();
  assert.equal(r.cierre?.motivo, 'tope');
  const tamano = fs.statSync(a.ruta).size;
  assert.ok(tamano <= tope, `${tamano} bytes`);
  assert.ok(r.filas.length > 0);

  const b = montar({ carpeta: a.carpeta, tope });
  for (let k = 12; k < 16; k++) b.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
  assert.equal(fs.statSync(a.ruta).size, tamano);
});

// Ronda 4: la marca aparte, la fecha límite y solo la 114.
const MARCA = 'diag-salen-114.marca';
const LIMITE = Date.UTC(2026, 11, 21) / 1000;
const correr = (m, desde, hasta) => {
  for (let k = desde; k <= hasta; k++) m.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
};
const diags = (carpeta) => fs.readdirSync(carpeta).filter((n) => n.startsWith('diag-')).sort();
function terminada() {
  const a = montar();
  correr(a, 0, HORAS_MEDIDA + 1);
  assert.equal(a.leer().cierre?.motivo, '48h');
  return a;
}

prueba('terminada la medición, mover el CSV no vuelve a empezar', () => {
  const a = terminada();
  const rutaMarca = join(a.carpeta, MARCA);
  assert.equal(fs.readFileSync(rutaMarca, 'utf8'), String(T0 + H), 'la marca lleva solo la hora de inicio');
  fs.renameSync(a.ruta, a.ruta + '.movido');
  const b = montar({ carpeta: a.carpeta });
  correr(b, HORAS_MEDIDA + 5, HORAS_MEDIDA + 9);
  assert.ok(!fs.existsSync(a.ruta), 'no se vuelve a crear');
  assert.equal(fs.readFileSync(rutaMarca, 'utf8'), String(T0 + H));
});

prueba('un CSV vaciado, con CRLF o en UTF-16 no reinicia la medición ni se toca', () => {
  const cambios = {
    vaciado: () => Buffer.alloc(0),
    CRLF: (t) => Buffer.from(t.replaceAll('\n', '\r\n')),
    'UTF-16': (t) => Buffer.from('﻿' + t, 'utf16le'),
  };
  const preparar = {
    terminada,
    'en marcha': () => {
      const a = montar();
      correr(a, 0, 3);
      return a;
    },
  };
  for (const [estado, crear] of Object.entries(preparar)) {
    for (const [nombre, cambiar] of Object.entries(cambios)) {
      const a = crear();
      const guardado = cambiar(fs.readFileSync(a.ruta, 'utf8'));
      fs.writeFileSync(a.ruta, guardado);
      const b = montar({ carpeta: a.carpeta });
      correr(b, HORAS_MEDIDA + 5, HORAS_MEDIDA + 8);
      assert.ok(fs.readFileSync(a.ruta).equals(guardado), `${estado}, ${nombre}: el archivo no cambia`);
      assert.equal(fs.readFileSync(join(a.carpeta, MARCA), 'utf8'), String(T0 + H), `${estado}, ${nombre}: la marca no cambia`);
    }
  }
  // Sin marca y con un archivo que no se entiende: tampoco empieza ni crea la marca.
  for (const nombre of ['CRLF', 'UTF-16']) {
    const a = terminada();
    const guardado = cambios[nombre](fs.readFileSync(a.ruta, 'utf8'));
    fs.writeFileSync(a.ruta, guardado);
    fs.rmSync(join(a.carpeta, MARCA));
    const b = montar({ carpeta: a.carpeta });
    correr(b, HORAS_MEDIDA + 5, HORAS_MEDIDA + 8);
    assert.ok(fs.readFileSync(a.ruta).equals(guardado), `${nombre} sin marca: el archivo no cambia`);
    assert.ok(!fs.existsSync(join(a.carpeta, MARCA)), `${nombre} sin marca: no se crea`);
  }
});

prueba('si se corta entre la cabecera y la marca, al volver sigue con el mismo inicio', () => {
  const carpeta = temporal();
  const inicio = T0 + H;
  fs.writeFileSync(join(carpeta, CSV), `#medir-salen v3 casa=114 inicio=${inicio} objetos=2592,2589\n${COLUMNAS.join(',')}\n`);
  const a = montar({ carpeta });
  correr(a, 2, 4);
  const r = a.leer();
  assert.equal(r.inicio, inicio);
  assert.deepEqual(r.objetos, [LANA, LINO]);
  assert.deepEqual([...new Set(r.filas.map((f) => f.hora))], [T0 + 3 * H, T0 + 4 * H]);
  assert.equal(fs.readFileSync(join(carpeta, MARCA), 'utf8'), String(inicio));
  correr(a, 5, HORAS_MEDIDA + 2);
  assert.equal(a.leer().cierre?.hora, inicio + HORAS_MEDIDA * H, 'las 48 horas cuentan desde la cabecera');
});

prueba('sin poder escribir la marca no escribe filas', () => {
  const carpeta = temporal();
  let anadidos = 0;
  const fsSinMarca = new Proxy(fs, {
    get(t, k) {
      if (k === 'writeFileSync') {
        return (ruta, ...resto) => {
          if (String(ruta).endsWith('.marca')) throw Object.assign(new Error('sin permiso'), { code: 'EACCES' });
          return t.writeFileSync(ruta, ...resto);
        };
      }
      if (k === 'appendFileSync') {
        return (...args) => {
          anadidos += 1;
          return t.appendFileSync(...args);
        };
      }
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const a = montar({ carpeta, usarFs: fsSinMarca });
  correr(a, 0, 4);
  const r = a.leer();
  assert.equal(r.inicio, T0 + H);
  assert.equal(r.filas.length, 0, 'ninguna fila sin marca');
  assert.equal(anadidos, 1, 'solo la cabecera');
  const avisos = a.registro.filter(([n]) => n === 'aviso').map(([, texto]) => texto);
  assert.equal(avisos.length, 1);
  assert.ok(avisos[0].includes('EACCES'), avisos[0]);
  assert.ok(!fs.existsSync(join(carpeta, MARCA)));

  // En el arranque siguiente, con la marca ya posible, sigue con el mismo inicio.
  const b = montar({ carpeta });
  correr(b, 5, 6);
  assert.equal(b.leer().inicio, T0 + H);
  assert.equal(fs.readFileSync(join(carpeta, MARCA), 'utf8'), String(T0 + H));
  assert.ok(b.leer().filas.length > 0);
});

prueba('después de la fecha límite no empieza, y una medición en marcha acaba sus 48 horas', () => {
  // El primer par llegaría justo en la fecha límite: no empieza.
  const a = montar();
  a.h.anadirFoto(114, LIMITE - H, [], fotoMercado(0));
  a.h.anadirFoto(114, LIMITE, [], fotoMercado(1));
  a.h.anadirFoto(114, LIMITE + H, [], fotoMercado(2));
  assert.deepEqual(diags(a.carpeta), []);

  // Empezada una hora antes, sigue pasada la fecha hasta sus 48 horas.
  const b = montar();
  for (let k = 0; k <= HORAS_MEDIDA + 1; k++) b.h.anadirFoto(114, LIMITE - 2 * H + k * H, [], fotoMercado(k));
  const r = b.leer();
  assert.equal(r.inicio, LIMITE - H);
  assert.equal(r.cierre?.motivo, '48h');
  assert.equal(r.cierre.hora, LIMITE - H + HORAS_MEDIDA * H);
  assert.equal(new Set(r.filas.map((f) => f.hora)).size, HORAS_MEDIDA);
});

prueba('con la 113 y la 114 descubiertas, solo mide la 114 y la 113 no crea archivo', () => {
  const a = montar({ casas: [113, 114] });
  for (const casa of [113, 114]) {
    for (let k = 0; k < 3; k++) a.h.anadirFoto(casa, T0 + k * H, [], fotoMercado(k));
  }
  assert.deepEqual(diags(a.carpeta), [CSV, MARCA].sort());
  assert.equal(a.leer().casa, 114);

  // La 113 ni siquiera pide la copia de las fotos.
  const b = montar({ casas: [113, 114] });
  let copias = 0;
  b.medidor.alPar({
    casa: 113, hora: T0 + H, hueco: H, huecoAntes: 0,
    par() {
      copias += 1;
      return {};
    },
  });
  assert.equal(copias, 0);
  assert.deepEqual(diags(b.carpeta), []);

  // Con solo la 113 descubierta no se mide nada, tampoco una foto de la 114.
  const c = montar({ casas: [113] });
  for (const casa of [113, 114]) {
    for (let k = 0; k < 3; k++) c.h.anadirFoto(casa, T0 + k * H, [], fotoMercado(k));
  }
  assert.deepEqual(diags(c.carpeta), []);
});

prueba('una línea a medias al final del archivo no rompe la lectura al reiniciar', () => {
  const a = montar();
  for (let k = 0; k < 3; k++) a.h.anadirFoto(114, T0 + k * H, [], fotoMercado(k));
  const antes = a.leer();
  // Un corte de luz a mitad de la última línea.
  fs.truncateSync(a.ruta, fs.statSync(a.ruta).size - 7);
  const cortado = a.leer();
  assert.equal(cortado.filas.length, antes.filas.length - 1, 'la línea a medias no se lee');

  const b = montar({ carpeta: a.carpeta });
  b.h.anadirFoto(114, T0 + 3 * H, [], fotoMercado(3));
  b.h.anadirFoto(114, T0 + 4 * H, [], fotoMercado(4));
  const r = b.leer();
  assert.equal(r.inicio, antes.inicio);
  assert.deepEqual(r.objetos, antes.objetos);
  assert.equal(r.filas.length, cortado.filas.length + antes.objetos.length); // tras reiniciar, el primer par es el de la hora 4
  assert.equal(r.filas.filter((f) => f.hora === T0 + 4 * H).length, antes.objetos.length);
  for (const f of r.filas) for (const c of COLUMNAS) if (c !== 'altura_P_pct') assert.ok(Number.isFinite(f[c]), `${c} en ${f.hora}`);

  // Con la primera línea a medias aún no había empezado: empieza ahora, sin reescribir lo que había.
  const c = temporal();
  const trozo = '#medir-salen v3 casa=114 ini';
  fs.writeFileSync(join(c, CSV), trozo);
  const d = montar({ carpeta: c });
  d.h.anadirFoto(114, T0 + 5 * H, [], fotoMercado(5));
  d.h.anadirFoto(114, T0 + 6 * H, [], fotoMercado(6));
  assert.equal(d.leer().inicio, T0 + 6 * H);
  assert.ok(fs.readFileSync(d.ruta, 'utf8').startsWith(trozo), 'solo añade al final');
});
