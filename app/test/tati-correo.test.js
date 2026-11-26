// Canal de archivos entre la app y TATI: sobres JSON fijos por canal (<canal>.pedido.json / <canal>.respuesta.json),
// reescritos con temporal y renombre. Sin red, sin borrar y sin que nada se acumule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fsReal from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { escribirSobre, leerSobre, nuevoId, pedir, atender, CADUCA_MS, DETENER_ESPERA_MS } from '../src/tati/correo.mjs';

function carpeta() {
  const c = join(mkdtempSync(join(tmpdir(), 'snf-tati-correo-')), 'puente-tati');
  mkdirSync(c, { recursive: true });
  return c;
}
const pedido = (c, canal) => join(c, `${canal}.pedido.json`);
const respuesta = (c, canal) => join(c, `${canal}.respuesta.json`);
const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const tanda = () => new Promise((r) => setImmediate(r));

// Reloj de prueba: `dormir` avanza el tiempo sin esperar y, si se le da, llama a `alDormir` (el «otro lado»).
function relojFalso(alDormir = async () => {}) {
  let t = 1_000_000;
  const dormidas = [];
  return {
    ahora: () => t,
    dormidas,
    dormir: async (ms) => {
      dormidas.push(ms);
      t += ms;
      await tanda();
      await alDormir(t);
    },
  };
}

// Un fs real que apunta las llamadas de borrar (y las rechaza).
function fsVigilado() {
  const borrados = [];
  const prohibido = (nombre) => (...args) => {
    borrados.push(nombre);
    throw new Error(`${nombre} no se usa`);
  };
  const fs = { ...fsReal };
  for (const n of ['unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync']) fs[n] = prohibido(n);
  fs.promises = { ...fsReal.promises, unlink: prohibido('promises.unlink'), rm: prohibido('promises.rm'), rmdir: prohibido('promises.rmdir') };
  return { fs, borrados };
}

test('el ejemplo del plan: un relevo pide, la app atiende; con nadie atendiendo, sin_acuse', async () => {
  const c = carpeta();
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => ({ estado: 'hecho', eco: p.x }), { cada: 5 });
  try {
    const r = await pedir(c, 'relevo-42', { x: 7 }, { cada: 5, tiempoMs: 1000 });
    assert.equal(r.estado, 'hecho');
    assert.equal(r.eco, 7);
  } finally {
    await a.parar();
  }
  assert.equal((await pedir(c, 'tati', { x: 1 }, { cada: 5, acuseMs: 30 })).tipo, 'sin_acuse'); // nadie atiende
});

test('el pedido lleva {v: 1, id, cuando, ...cuerpo} y la respuesta {v: 1, id, cuando, estado, ...}', async () => {
  const c = carpeta();
  let visto = null;
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => {
    visto = { canal, p };
    return { estado: 'hecho', dato: 3 };
  }, { cada: 5 });
  try {
    const r = await pedir(c, 'relevo-7', { tipo: 'herramienta', nombre: 'estado_juego' }, { cada: 5, tiempoMs: 1000 });
    assert.equal(visto.canal, 'relevo-7');
    assert.equal(visto.p.v, 1);
    assert.match(visto.p.id, /^[0-9a-f]{16}$/);
    assert.equal(typeof visto.p.cuando, 'number');
    assert.equal(visto.p.tipo, 'herramienta');
    assert.equal(visto.p.nombre, 'estado_juego');
    assert.equal(r.id, visto.p.id);
    assert.equal(r.v, 1);
    assert.equal(typeof r.cuando, 'number');
    assert.equal(r.dato, 3);
    const enDisco = leerJson(respuesta(c, 'relevo-7'));
    assert.deepEqual({ v: enDisco.v, id: enDisco.id, estado: enDisco.estado, dato: enDisco.dato }, { v: 1, id: visto.p.id, estado: 'hecho', dato: 3 });
  } finally {
    await a.parar();
  }
});

test('nuevoId: 16 hex y distintos', () => {
  const ids = new Set(Array.from({ length: 50 }, () => nuevoId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^[0-9a-f]{16}$/);
});

test('leerSobre: null si falta, si está a medias o si no es {v: 1, id: string}', async () => {
  const c = carpeta();
  const r = join(c, 'x.respuesta.json');
  assert.equal(leerSobre(r), null);
  writeFileSync(r, '{"v": 1, "id": "abc", "est');
  assert.equal(leerSobre(r), null);
  writeFileSync(r, '');
  assert.equal(leerSobre(r), null);
  for (const malo of [{ v: 2, id: 'a' }, { v: 1, id: 5 }, { v: 1 }, [1], 'texto', null, { v: '1', id: 'a' }]) {
    writeFileSync(r, JSON.stringify(malo));
    assert.equal(leerSobre(r), null, JSON.stringify(malo));
  }
  await escribirSobre(r, { v: 1, id: 'abc', estado: 'hecho' });
  assert.deepEqual(leerSobre(r), { v: 1, id: 'abc', estado: 'hecho' });
});

test('escribirSobre: temporal fijo <ruta>.tmp renombrado encima; reintenta 5 veces a 50 ms ante EPERM, EBUSY o EACCES', async () => {
  const c = carpeta();
  const r = join(c, 'tati.pedido.json');
  let renombres = [];
  let fallar = ['EPERM', 'EBUSY', 'EACCES'];
  const fs = {
    ...fsReal,
    renameSync: (a, b) => {
      renombres.push([a, b]);
      const code = fallar.shift();
      if (code) throw Object.assign(new Error('ocupado'), { code });
      return fsReal.renameSync(a, b);
    },
  };
  const dormidas = [];
  const dormir = async (ms) => { dormidas.push(ms); };
  await escribirSobre(r, { v: 1, id: 'a1' }, { fs, dormir });
  assert.deepEqual(renombres.map(([a]) => a), Array(4).fill(`${r}.tmp`));
  assert.deepEqual(renombres.map(([, b]) => b), Array(4).fill(r));
  assert.deepEqual(dormidas, [50, 50, 50]);
  assert.deepEqual(leerJson(r), { v: 1, id: 'a1' });
  assert.equal(existsSync(`${r}.tmp`), false);

  // siempre ocupado: el primer intento y 5 reintentos, y falla con el código
  renombres = [];
  dormidas.length = 0;
  fallar = Array(20).fill('EBUSY');
  await assert.rejects(() => escribirSobre(r, { v: 1, id: 'a2' }, { fs, dormir }), { code: 'EBUSY' });
  assert.equal(renombres.length, 6);
  assert.deepEqual(dormidas, [50, 50, 50, 50, 50]);
  assert.deepEqual(leerJson(r), { v: 1, id: 'a1' }, 'lo de antes sigue entero');

  // otro error: sin reintentos
  renombres = [];
  dormidas.length = 0;
  fallar = ['ENOENT'];
  await assert.rejects(() => escribirSobre(r, { v: 1, id: 'a3' }, { fs, dormir }), { code: 'ENOENT' });
  assert.equal(renombres.length, 1);
  assert.deepEqual(dormidas, []);
});

test('pedir: sin acuse en acuseMs da sin_acuse (reloj de prueba)', async () => {
  const c = carpeta();
  const reloj = relojFalso();
  const r = await pedir(c, 'tati', { tipo: 'turno' }, { ahora: reloj.ahora, dormir: reloj.dormir, cada: 250, acuseMs: 5000, tiempoMs: 400_000 });
  assert.deepEqual({ estado: r.estado, tipo: r.tipo }, { estado: 'error', tipo: 'sin_acuse' });
  assert.equal(reloj.dormidas.length, 20, '5000 ms a 250 ms la vuelta');
  assert.ok(reloj.dormidas.every((ms) => ms === 250));
  // el pedido quedó escrito para quien atienda
  const p = leerJson(pedido(c, 'tati'));
  assert.equal(p.v, 1);
  assert.equal(p.tipo, 'turno');
});

test('pedir: con acuse y sin resultado, tiempo (tiempoMs cuenta desde el pedido)', async () => {
  const c = carpeta();
  const reloj = relojFalso(async () => {
    const p = leerSobre(pedido(c, 'tati'));
    if (p && !existsSync(respuesta(c, 'tati'))) await escribirSobre(respuesta(c, 'tati'), { v: 1, id: p.id, cuando: 0, estado: 'recibido' });
  });
  const r = await pedir(c, 'tati', { tipo: 'turno' }, { ahora: reloj.ahora, dormir: reloj.dormir, cada: 250, acuseMs: 500, tiempoMs: 3000 });
  assert.deepEqual({ estado: r.estado, tipo: r.tipo }, { estado: 'error', tipo: 'tiempo' });
  assert.equal(reloj.dormidas.length, 12, '3000 ms desde el pedido a 250 ms la vuelta');
});

test('pedir: un resultado que llega sin haber visto el acuse también cuenta', async () => {
  const c = carpeta();
  const reloj = relojFalso(async () => {
    const p = leerSobre(pedido(c, 'tati'));
    await escribirSobre(respuesta(c, 'tati'), { v: 1, id: p.id, cuando: 0, estado: 'hecho', texto: 'hola' });
  });
  const r = await pedir(c, 'tati', {}, { ahora: reloj.ahora, dormir: reloj.dormir, cada: 250, acuseMs: 5000, tiempoMs: 10_000 });
  assert.equal(r.estado, 'hecho');
  assert.equal(r.texto, 'hola');
  assert.equal(reloj.dormidas.length, 1);
});

test('pedir: una respuesta con otro id (la de un pedido anterior) no cuenta', async () => {
  const c = carpeta();
  // la respuesta de un pedido anterior ya está en disco, con resultado
  await escribirSobre(respuesta(c, 'tati'), { v: 1, id: 'aaaaaaaaaaaaaaaa', cuando: 0, estado: 'hecho', texto: 'vieja' });
  let vueltas = 0;
  const reloj = relojFalso(async () => {
    vueltas++;
    const p = leerSobre(pedido(c, 'tati'));
    if (vueltas === 3) await escribirSobre(respuesta(c, 'tati'), { v: 1, id: 'bbbbbbbbbbbbbbbb', cuando: 0, estado: 'hecho', texto: 'otra' });
    if (vueltas === 6) await escribirSobre(respuesta(c, 'tati'), { v: 1, id: p.id, cuando: 0, estado: 'hecho', texto: 'buena' });
  });
  const r = await pedir(c, 'tati', {}, { ahora: reloj.ahora, dormir: reloj.dormir, cada: 250, acuseMs: 5000, tiempoMs: 10_000 });
  assert.equal(r.texto, 'buena');
  assert.equal(vueltas, 6);

  // y si solo hay respuestas viejas, es como si nadie contestase
  const reloj2 = relojFalso();
  const r2 = await pedir(c, 'tati', {}, { ahora: reloj2.ahora, dormir: reloj2.dormir, cada: 250, acuseMs: 1000, tiempoMs: 10_000 });
  assert.equal(r2.tipo, 'sin_acuse');
});

test('pedir: un acuse viejo (otro id) no evita sin_acuse', async () => {
  const c = carpeta();
  await escribirSobre(respuesta(c, 'tati'), { v: 1, id: 'cccccccccccccccc', cuando: 0, estado: 'recibido' });
  const reloj = relojFalso();
  const r = await pedir(c, 'tati', {}, { ahora: reloj.ahora, dormir: reloj.dormir, cada: 250, acuseMs: 1000, tiempoMs: 10_000 });
  assert.equal(r.tipo, 'sin_acuse');
});

test('pedir: dos pedidos seguidos sobre el mismo canal no se pisan (el segundo espera al primero)', async () => {
  const c = carpeta();
  const vistos = [];
  let enCurso = 0;
  let maximo = 0;
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => {
    enCurso++;
    maximo = Math.max(maximo, enCurso);
    vistos.push(p.x);
    // mientras se atiende el primero, el pedido en disco sigue siendo el primero
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(leerSobre(pedido(c, canal)).x, p.x);
    enCurso--;
    return { estado: 'hecho', eco: p.x };
  }, { cada: 5 });
  try {
    const [r1, r2] = await Promise.all([
      pedir(c, 'relevo-1', { x: 1 }, { cada: 5, tiempoMs: 2000 }),
      pedir(c, 'relevo-1', { x: 2 }, { cada: 5, tiempoMs: 2000 }),
    ]);
    assert.equal(r1.eco, 1);
    assert.equal(r2.eco, 2);
    assert.deepEqual(vistos, [1, 2]);
    assert.equal(maximo, 1);
  } finally {
    await a.parar();
  }
});

test('pedir: el primero que falla no bloquea la cola del canal', async () => {
  const c = carpeta();
  const r1 = pedir(c, 'tati', {}, { cada: 5, acuseMs: 20 });
  const a = atender(c, /^tati$/, async () => ({ estado: 'hecho', ok: true }), { cada: 5 });
  try {
    // el primero puede salir bien o sin acuse según llegue el que atiende; el segundo sale siempre bien
    await r1;
    const r2 = await pedir(c, 'tati', {}, { cada: 5, tiempoMs: 2000 });
    assert.equal(r2.ok, true);
  } finally {
    await a.parar();
  }
});

test('atender: un canal que no casa con el patrón no se atiende', async () => {
  const c = carpeta();
  const vistos = [];
  const a = atender(c, /^relevo-\d+$/, async (canal) => {
    vistos.push(canal);
    return { estado: 'hecho' };
  }, { cada: 5 });
  try {
    for (const canal of ['tati', 'relevo-x', 'relevo-42-bis', 'otro-relevo-3']) {
      assert.equal((await pedir(c, canal, {}, { cada: 5, acuseMs: 30 })).tipo, 'sin_acuse', canal);
      assert.equal(existsSync(respuesta(c, canal)), false, canal);
    }
    assert.deepEqual(vistos, []);
  } finally {
    await a.parar();
  }
});

test('atender: un patrón con la bandera g casa siempre (no arrastra lastIndex); una vuelta atiende todos los canales', async () => {
  const c = carpeta();
  // reloj de prueba: las vueltas se dan a mano
  let pendiente = null;
  const reloj = { ahora: () => 5, setTimeout: (fn) => { pendiente = fn; return 1; }, clearTimeout: () => { pendiente = null; } };
  const vistos = [];
  const a = atender(c, /^relevo-\d+$/g, async (canal, p) => {
    vistos.push(canal);
    return { estado: 'hecho', eco: p.x };
  }, { cada: 250, reloj });
  try {
    for (const x of [1, 2, 3]) await escribirSobre(pedido(c, `relevo-${x}`), { v: 1, id: `id-${x}`, cuando: 0, x });
    const vuelta = pendiente;
    pendiente = null;
    vuelta();
    while (!pendiente) await tanda(); // acaba la vuelta y programa la siguiente
    assert.deepEqual(vistos, ['relevo-1', 'relevo-2', 'relevo-3']);
    for (const x of [1, 2, 3]) {
      assert.deepEqual(leerJson(respuesta(c, `relevo-${x}`)), { estado: 'hecho', eco: x, v: 1, id: `id-${x}`, cuando: 5 });
    }
  } finally {
    await a.parar();
  }
  assert.equal(pendiente, null, 'parar quita el reloj');
});

// Reloj a mano para `atender`: las vueltas se dan con `vuelta()`, que espera a que acabe y se programe la siguiente.
function relojAMano(t = 50_000_000) {
  let pendiente = null;
  const reloj = { ahora: () => t, setTimeout: (fn) => { pendiente = fn; return 1; }, clearTimeout: () => { pendiente = null; } };
  return {
    reloj,
    vuelta: async () => {
      const fn = pendiente;
      pendiente = null;
      fn();
      while (!pendiente) await tanda();
    },
  };
}

test('atender al arrancar: un pedido ya contestado antes (resultado o solo acuse) no se repite', async () => {
  const c = carpeta();
  const { reloj, vuelta } = relojAMano();
  const ahora = reloj.ahora();
  await escribirSobre(pedido(c, 'relevo-1'), { v: 1, id: 'id-hecho', cuando: ahora - 1000, x: 1 });
  await escribirSobre(respuesta(c, 'relevo-1'), { v: 1, id: 'id-hecho', cuando: ahora - 900, estado: 'hecho', eco: 1 });
  await escribirSobre(pedido(c, 'relevo-2'), { v: 1, id: 'id-acuse', cuando: ahora - 1000, x: 2 });
  await escribirSobre(respuesta(c, 'relevo-2'), { v: 1, id: 'id-acuse', cuando: ahora - 900, estado: 'recibido' });
  // y uno cuya respuesta es de otro pedido: ese sí se atiende
  await escribirSobre(pedido(c, 'relevo-3'), { v: 1, id: 'id-nuevo', cuando: ahora - 1000, x: 3 });
  await escribirSobre(respuesta(c, 'relevo-3'), { v: 1, id: 'id-viejo', cuando: ahora - 5000, estado: 'hecho' });
  const antes = [1, 2].map((x) => readFileSync(respuesta(c, `relevo-${x}`), 'utf8'));
  const vistos = [];
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => {
    vistos.push(p.id);
    return { estado: 'hecho', eco: p.x };
  }, { cada: 250, reloj });
  try {
    await vuelta();
    await vuelta();
    assert.deepEqual(vistos, ['id-nuevo']);
    assert.deepEqual([1, 2].map((x) => readFileSync(respuesta(c, `relevo-${x}`), 'utf8')), antes);
    assert.equal(leerJson(respuesta(c, 'relevo-3')).eco, 3);
  } finally {
    await a.parar();
  }
});

test('atender: un pedido sin respuesta de hace más de 10 minutos da caducado sin llamar a manejar', async () => {
  const c = carpeta();
  const { reloj, vuelta } = relojAMano();
  const ahora = reloj.ahora();
  assert.equal(CADUCA_MS, 10 * 60_000);
  await escribirSobre(pedido(c, 'relevo-1'), { v: 1, id: 'id-viejo', cuando: ahora - CADUCA_MS - 1, x: 1 });
  await escribirSobre(pedido(c, 'relevo-2'), { v: 1, id: 'id-sin-cuando', x: 2 });
  await escribirSobre(pedido(c, 'relevo-3'), { v: 1, id: 'id-justo', cuando: ahora - CADUCA_MS, x: 3 });
  // un pedido viejo cuya respuesta es de otro id también caduca
  await escribirSobre(pedido(c, 'relevo-4'), { v: 1, id: 'id-viejo-4', cuando: ahora - 2 * CADUCA_MS, x: 4 });
  await escribirSobre(respuesta(c, 'relevo-4'), { v: 1, id: 'id-anterior', cuando: ahora - 3 * CADUCA_MS, estado: 'hecho' });
  const vistos = [];
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => {
    vistos.push(p.id);
    return { estado: 'hecho', eco: p.x };
  }, { cada: 250, reloj });
  try {
    await vuelta();
    await vuelta();
    assert.deepEqual(vistos, ['id-justo']);
    for (const [x, id] of [[1, 'id-viejo'], [2, 'id-sin-cuando'], [4, 'id-viejo-4']]) {
      assert.deepEqual(leerJson(respuesta(c, `relevo-${x}`)), { estado: 'error', tipo: 'caducado', v: 1, id, cuando: ahora }, String(x));
    }
    assert.equal(leerJson(respuesta(c, 'relevo-3')).eco, 3);
  } finally {
    await a.parar();
  }
});

test('pedir escribe hasta = cuando + acuseMs (el plazo del acuse), y el cuerpo no lo pisa', async () => {
  const c = carpeta();
  const r = await pedir(c, 'relevo-8', { tipo: 'herramienta', hasta: 1, cuando: 2 }, { acuseMs: 40, tiempoMs: 80, cada: 5 });
  assert.deepEqual(r, { estado: 'error', tipo: 'sin_acuse' });
  const p = leerJson(pedido(c, 'relevo-8'));
  assert.equal(typeof p.cuando, 'number');
  assert.notEqual(p.cuando, 2);
  assert.equal(p.hasta, p.cuando + 40);
});

test('atender: un pedido con hasta ya pasado da caducado sin llamar a manejar; uno a tiempo se atiende', async () => {
  const c = carpeta();
  const { reloj, vuelta } = relojAMano();
  const ahora = reloj.ahora();
  // acusado tarde: quien pidió ya se rindió (sin_acuse) y quizá lo repitió con otro pedido
  await escribirSobre(pedido(c, 'relevo-1'), { v: 1, id: 'id-tarde', cuando: ahora - 6000, hasta: ahora - 1000, x: 1 });
  await escribirSobre(pedido(c, 'relevo-2'), { v: 1, id: 'id-hasta-raro', cuando: ahora - 10, hasta: 'luego', x: 2 });
  await escribirSobre(pedido(c, 'relevo-3'), { v: 1, id: 'id-justo', cuando: ahora - 5000, hasta: ahora, x: 3 });
  await escribirSobre(pedido(c, 'relevo-4'), { v: 1, id: 'id-a-tiempo', cuando: ahora - 10, hasta: ahora + 4990, x: 4 });
  // sin hasta (pedido de antes): solo la regla de los 10 minutos
  await escribirSobre(pedido(c, 'relevo-5'), { v: 1, id: 'id-sin-hasta', cuando: ahora - 60_000, x: 5 });
  const vistos = [];
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => {
    vistos.push(p.id);
    return { estado: 'hecho', eco: p.x };
  }, { cada: 250, reloj });
  try {
    await vuelta();
    await vuelta();
    assert.deepEqual(vistos, ['id-justo', 'id-a-tiempo', 'id-sin-hasta']);
    for (const [x, id] of [[1, 'id-tarde'], [2, 'id-hasta-raro']]) {
      assert.deepEqual(leerJson(respuesta(c, `relevo-${x}`)), { estado: 'error', tipo: 'caducado', v: 1, id, cuando: ahora }, String(x));
    }
    for (const x of [3, 4, 5]) assert.equal(leerJson(respuesta(c, `relevo-${x}`)).eco, x);
  } finally {
    await a.parar();
  }
});

test('atender: si manejar lanza, contesta {estado: error, tipo: fallo} sin el mensaje (que puede llevar rutas)', async () => {
  const c = carpeta();
  const a = atender(c, /^relevo-\d+$/, async () => {
    throw new Error('no se pudo leer C:\\Users\\Ejemplo\\secreto.json');
  }, { cada: 5 });
  try {
    const r = await pedir(c, 'relevo-9', {}, { cada: 5, tiempoMs: 1000 });
    assert.equal(r.estado, 'error');
    assert.equal(r.tipo, 'fallo');
    const texto = readFileSync(respuesta(c, 'relevo-9'), 'utf8');
    assert.ok(!/secreto|Users|no se pudo/.test(texto), texto);
  } finally {
    await a.parar();
  }
});

test('atender: lo que no es un resultado válido de manejar cuenta como fallo', async () => {
  const c = carpeta();
  const malos = [undefined, 'texto', { estado: 'recibido' }, { estado: 'raro' }];
  let i = 0;
  const a = atender(c, /^relevo-\d+$/, async () => malos[i++], { cada: 5 });
  try {
    for (let k = 0; k < malos.length; k++) {
      const r = await pedir(c, 'relevo-1', {}, { cada: 5, tiempoMs: 1000 });
      assert.deepEqual({ estado: r.estado, tipo: r.tipo }, { estado: 'error', tipo: 'fallo' }, String(k));
    }
  } finally {
    await a.parar();
  }
});

test('atender: contesta cada id una sola vez, y uno nuevo en el mismo canal sí', async () => {
  const c = carpeta();
  const vistos = [];
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => {
    vistos.push(p.id);
    return { estado: 'hecho' };
  }, { cada: 5 });
  try {
    const r1 = await pedir(c, 'relevo-5', {}, { cada: 5, tiempoMs: 1000 });
    await new Promise((r) => setTimeout(r, 60)); // muchas vueltas con el mismo pedido en disco
    const r2 = await pedir(c, 'relevo-5', {}, { cada: 5, tiempoMs: 1000 });
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(vistos, [r1.id, r2.id]);
    assert.notEqual(r1.id, r2.id);
  } finally {
    await a.parar();
  }
});

test('atender: de uno en uno, aunque haya varios canales con pedido', async () => {
  const c = carpeta();
  let enCurso = 0;
  let maximo = 0;
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => {
    enCurso++;
    maximo = Math.max(maximo, enCurso);
    await new Promise((r) => setTimeout(r, 15));
    enCurso--;
    return { estado: 'hecho', eco: p.x };
  }, { cada: 5 });
  try {
    const rs = await Promise.all([1, 2, 3].map((x) => pedir(c, `relevo-${x}`, { x }, { cada: 5, tiempoMs: 2000 })));
    assert.deepEqual(rs.map((r) => r.eco), [1, 2, 3]);
    assert.equal(maximo, 1);
  } finally {
    await a.parar();
  }
});

test('atender: una carpeta que aún no existe no rompe nada', async () => {
  const c = join(carpeta(), 'todavia-no');
  const a = atender(c, /^relevo-\d+$/, async () => ({ estado: 'hecho', bien: true }), { cada: 5 });
  try {
    await new Promise((r) => setTimeout(r, 30));
    const r = await pedir(c, 'relevo-3', {}, { cada: 5, tiempoMs: 1000 }); // pedir crea la carpeta
    assert.equal(r.bien, true);
  } finally {
    await a.parar();
  }
});

test('atender: parar() con un manejar en curso para limpio y no escribe el resultado', async () => {
  const c = carpeta();
  const rechazos = [];
  const alRechazo = (e) => rechazos.push(e);
  process.on('unhandledRejection', alRechazo);
  let soltar;
  let empezado;
  const haEmpezado = new Promise((r) => { empezado = r; });
  const a = atender(c, /^relevo-\d+$/, () => {
    empezado();
    return new Promise((_, no) => { soltar = () => no(new Error('tarde')); });
  }, { cada: 5 });
  try {
    const p = pedir(c, 'relevo-8', {}, { cada: 5, acuseMs: 1000, tiempoMs: 150 });
    await haEmpezado;
    const parado = a.parar();
    soltar();
    await parado;
    assert.equal((await p).tipo, 'tiempo');
    assert.equal(leerJson(respuesta(c, 'relevo-8')).estado, 'recibido', 'solo el acuse');
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(rechazos, []);
  } finally {
    process.off('unhandledRejection', alRechazo);
    await a.parar(); // dos veces no pasa nada
  }
});

test('nada se acumula: tras diez pedidos solo están los dos archivos del canal (y su .tmp), sin borrar nada', async () => {
  const c = carpeta();
  const { fs, borrados } = fsVigilado();
  const a = atender(c, /^relevo-\d+$/, async (canal, p) => ({ estado: 'hecho', eco: p.x }), { cada: 5, fs });
  try {
    for (let x = 0; x < 10; x++) assert.equal((await pedir(c, 'relevo-11', { x }, { cada: 5, tiempoMs: 1000, fs })).eco, x);
  } finally {
    await a.parar();
  }
  const permitidos = ['relevo-11.pedido.json', 'relevo-11.respuesta.json', 'relevo-11.pedido.json.tmp', 'relevo-11.respuesta.json.tmp'];
  const hay = readdirSync(c).sort();
  assert.ok(hay.includes('relevo-11.pedido.json') && hay.includes('relevo-11.respuesta.json'), hay.join(', '));
  assert.deepEqual(hay.filter((n) => !permitidos.includes(n)), []);
  assert.deepEqual(borrados, []);
});

test('correo.mjs solo importa node:fs, node:path y node:crypto (lo copia el complemento)', () => {
  const texto = readFileSync(new URL('../src/tati/correo.mjs', import.meta.url), 'utf8');
  const modulos = [...texto.matchAll(/(?:import|export)[^'"`;]*?from\s*['"`]([^'"`]+)['"`]|import\s*\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1] || m[2]);
  assert.ok(modulos.length > 0);
  for (const m of modulos) assert.ok(['node:fs', 'node:path', 'node:crypto'].includes(m), m);
  assert.ok(!/\brequire\s*\(/.test(texto));
});

// ---------- turno largo: señales, alId, alEsperar y detener ----------

// Un «TATI» a mano para `pedir` con reloj falso: en cada vuelta acusa y llama a `cada(t, id, pasado)`.
function conTati(c, cada = () => {}) {
  let inicio = null;
  return relojFalso(async (t) => {
    const p = leerSobre(pedido(c, 'tati'));
    if (!p) return;
    if (inicio === null) {
      inicio = t;
      writeFileSync(respuesta(c, 'tati'), JSON.stringify({ v: 1, id: p.id, cuando: t, estado: 'recibido' }));
    }
    cada(t, p.id, t - inicio);
  });
}
const senal = (c, id, cuando) => writeFileSync(join(c, 'tati.senal.json'), JSON.stringify({ v: 1, id, cuando, estado: 'trabajando' }));
const LARGA = { cada: 1000, acuseMs: 5000, tiempoMs: 400_000, senalMs: 120_000 };

test('señales: con una cada 20 s no se corta a los tiempoMs y contesta cuando acaba', async () => {
  const c = carpeta();
  const reloj = conTati(c, (t, id, pasado) => {
    if (pasado % 20_000 === 0) senal(c, id, t);
    if (pasado >= 600_000) writeFileSync(respuesta(c, 'tati'), JSON.stringify({ v: 1, id, cuando: t, estado: 'hecho', texto: 'fin' }));
  });
  const t0 = reloj.ahora();
  const r = await pedir(c, 'tati', {}, { ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir });
  assert.equal(r.estado, 'hecho');
  assert.ok(reloj.ahora() - t0 > 600_000);
});

test('señales: una con el id de otro pedido no cuenta y vale el plazo de siempre', async () => {
  const c = carpeta();
  const reloj = conTati(c, (t) => senal(c, 'otro-id', t));
  const t0 = reloj.ahora();
  const r = await pedir(c, 'tati', {}, { ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir });
  assert.equal(r.tipo, 'tiempo');
  assert.ok(reloj.ahora() - t0 >= 400_000 && reloj.ahora() - t0 < 402_000);
});

test('señales: un `cuando` repetido no renueva: sin_senal a los senalMs de la última nueva', async () => {
  const c = carpeta();
  let vista = null;
  const reloj = conTati(c, (t, id) => {
    if (vista === null) vista = t;
    senal(c, id, 12345); // siempre el mismo
  });
  const r = await pedir(c, 'tati', {}, { ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir });
  assert.deepEqual(r, { estado: 'error', tipo: 'sin_senal' });
  assert.ok(reloj.ahora() - vista >= 120_000 && reloj.ahora() - vista < 122_000, `${reloj.ahora() - vista} ms`);
});

test('señales: se mide con el reloj de quien pide, aunque el `cuando` de TATI sea muy viejo', async () => {
  const c = carpeta();
  let k = 0;
  const reloj = conTati(c, (t, id, pasado) => {
    if (pasado % 20_000 === 0) senal(c, id, ++k); // un reloj que no se parece en nada
    if (pasado >= 300_000) writeFileSync(respuesta(c, 'tati'), JSON.stringify({ v: 1, id, cuando: t, estado: 'hecho' }));
  });
  assert.equal((await pedir(c, 'tati', {}, { ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir })).estado, 'hecho');
});

test('señales: una señal con su id vale como acuse', async () => {
  const c = carpeta();
  let hecho = false;
  const reloj = relojFalso(async (t) => {
    const p = leerSobre(pedido(c, 'tati'));
    if (!p) return;
    senal(c, p.id, t);
    if (t > 1_000_000 + 8000 && !hecho) {
      hecho = true;
      writeFileSync(respuesta(c, 'tati'), JSON.stringify({ v: 1, id: p.id, cuando: t, estado: 'hecho' }));
    }
  });
  assert.equal((await pedir(c, 'tati', {}, { ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir })).estado, 'hecho');
});

test('sin las opciones nuevas, igual que hoy: el archivo de señal ni se lee y el plazo es tiempoMs', async () => {
  const c = carpeta();
  const leidos = [];
  const fs = { ...fsReal, readFileSync: (r, ...x) => { leidos.push(String(r)); return fsReal.readFileSync(r, ...x); } };
  const reloj = conTati(c, (t, id) => senal(c, id, t));
  const t0 = reloj.ahora();
  const r = await pedir(c, 'tati', {}, { cada: 1000, acuseMs: 5000, tiempoMs: 30_000, fs, ahora: reloj.ahora, dormir: reloj.dormir });
  assert.deepEqual(r, { estado: 'error', tipo: 'tiempo' });
  assert.ok(reloj.ahora() - t0 >= 30_000 && reloj.ahora() - t0 < 32_000);
  assert.ok(!leidos.some((x) => x.endsWith('.senal.json')), 'no lee la señal');
});

test('alId recibe el id del pedido ya escrito y alEsperar se llama en cada vuelta', async () => {
  const c = carpeta();
  const vistos = [];
  let vueltas = 0;
  const reloj = conTati(c, (t, id, pasado) => {
    if (pasado >= 3000) writeFileSync(respuesta(c, 'tati'), JSON.stringify({ v: 1, id, cuando: t, estado: 'hecho' }));
  });
  await pedir(c, 'tati', {}, {
    ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir,
    alId: (id) => vistos.push([id, leerSobre(pedido(c, 'tati'))?.id]),
    alEsperar: () => { vueltas += 1; },
  });
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0][0], vistos[0][1]);
  assert.equal(vueltas, reloj.dormidas.length);
});

test('detener: sin resultado, a los DETENER_ESPERA_MS da detenido, aunque venza antes otro plazo', async () => {
  assert.equal(DETENER_ESPERA_MS, 15_000);
  const c = carpeta();
  let parada = null;
  const reloj = conTati(c, (t, id, pasado) => {
    if (pasado >= 395_000 && parada === null) parada = t; // a 5 s del plazo de los 400 s
  });
  const r = await pedir(c, 'tati', {}, { ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir, detener: () => parada });
  assert.deepEqual(r, { estado: 'error', tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.' });
  assert.ok(reloj.ahora() - parada >= 15_000 && reloj.ahora() - parada < 17_000);
});

test('detener: si TATI contesta dentro del plazo, vale su respuesta', async () => {
  const c = carpeta();
  let parada = null;
  const reloj = conTati(c, (t, id, pasado) => {
    if (pasado >= 2000 && parada === null) parada = t;
    if (parada !== null && t - parada >= 3000) {
      writeFileSync(respuesta(c, 'tati'), JSON.stringify({ v: 1, id, cuando: t, estado: 'error', tipo: 'detenido', detalle: 'Se detuvo el turno en TATI.' }));
    }
  });
  const r = await pedir(c, 'tati', {}, { ...LARGA, ahora: reloj.ahora, dormir: reloj.dormir, detener: () => parada });
  assert.equal(r.tipo, 'detenido');
  assert.equal(r.v, 1, 'es el sobre de TATI');
  assert.ok(reloj.ahora() - parada < 15_000);
});
