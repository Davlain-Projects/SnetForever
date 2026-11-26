import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { crearMisionesApi, misionApiParaMensaje } from '../src/comercio/misiones-api.mjs';

const DIA = 24 * 3600 * 1000;

function montar({ falla = null, reloj = { t: 1_700_000_000_000 } } = {}) {
  const carpeta = join(fs.mkdtempSync(join(os.tmpdir(), 'snf-mis-')), 'comercio');
  const llamadas = [];
  const esperas = [];
  const cliente = {
    async indiceZonasMision() {
      llamadas.push('indice');
      if (falla) throw Object.assign(new Error('x'), { code: falla });
      return { areas: [{ name: 'Las Mil Agujas', id: 400 }, { name: 'Durotar', id: 14 }] };
    },
    async misionesDeZona(z) {
      llamadas.push(`zona:${z}`);
      if (z === 400) return { id: 400, area: 'Las Mil Agujas', quests: [{ name: 'Caparazones endurecidos', id: 1105 }, { name: 'Otra cosa', id: 7 }] };
      return { id: 14, area: 'Durotar', quests: [{ name: 'Pieles de jabalí', id: 800 }] };
    },
    async mision(id) {
      llamadas.push(`mision:${id}`);
      return {
        id, title: 'Caparazones endurecidos', area: { name: 'Las Mil Agujas', id: 400 }, description: 'Texto de la historia',
        rewards: { experience: 950, money: { value: 2500, units: { gold: 0, silver: 25, copper: 0 } }, reputations: [] },
      };
    },
  };
  const crear = (extra = {}) => crearMisionesApi({
    cliente, fs, carpeta, dormir: async (ms) => { esperas.push(ms); }, ahora: () => reloj.t, ...extra,
  });
  return { api: crear(), crear, llamadas, esperas, carpeta, reloj, cliente };
}

const indices = (m) => m.llamadas.filter((l) => l === 'indice').length;

test('«caparazones endurecidos» (sin tildes ni mayúsculas) encuentra la 1105 con zona y 25 platas', async () => {
  const { api } = montar();
  await api.listo();
  const r = await api.buscar('Dónde hago CAPARAZONES  endurecidos?');
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 1105);
  assert.equal(r[0].zona, 'Las Mil Agujas');
  assert.equal(r[0].recompensas.dinero.plata, 25);
  assert.equal(r[0].recompensas.experiencia, 950);
  assert.equal(r[0].descripcion, 'Texto de la historia');
});

test('un nombre inexistente da resultados vacíos; el índice se baja una vez, 2 por segundo, y se guarda', async () => {
  const { api, llamadas, esperas, carpeta } = montar();
  await api.listo();
  assert.deepEqual(await api.consultar('misión que no existe'), { fuente: 'api_blizzard', resultados: [] });
  await api.buscar('otra vez nada');
  assert.equal(llamadas.filter((l) => l === 'indice').length, 1);
  assert.deepEqual(esperas, [500]); // dos zonas: una espera entre ellas
  assert.ok(JSON.parse(fs.readFileSync(join(carpeta, 'misiones-api.json'), 'utf8')).misiones.length === 3);
});

test('consultar no espera a la descarga: devuelve null y la arranca; misionApiParaMensaje vuelve enseguida', async () => {
  const m = montar();
  m.cliente.indiceZonasMision = () => new Promise(() => {}); // la descarga nunca termina
  const api = m.crear();
  const base = { buscarMisiones: () => [] };
  const r = await Promise.race([
    misionApiParaMensaje(api, base, { texto: 'caparazones endurecidos' }),
    new Promise((resolve) => setTimeout(() => resolve('colgado'), 500)),
  ]);
  assert.equal(r, null);
  assert.equal(await api.consultar('caparazones endurecidos'), null);
});

test('sin credenciales no se añade nada y no hay error; se reintenta pasada una hora', async () => {
  const m = montar({ falla: 'SIN_CREDENCIALES' });
  assert.equal(await m.api.consultar('caparazones endurecidos'), null);
  await m.api.listo();
  assert.equal(await m.api.consultar('caparazones endurecidos'), null);
  assert.deepEqual(await m.api.buscar('caparazones endurecidos'), []);
  assert.equal(indices(m), 1);
  m.reloj.t += 3600 * 1000 + 1;
  await m.api.consultar('caparazones endurecidos');
  assert.equal(indices(m), 2);
});

test('la caché caduca a los 30 días y un archivo roto se aparta sin borrarlo', async () => {
  const m = montar();
  await m.api.listo();
  const dormir = async () => {};
  const otra = m.crear({ dormir, ahora: () => m.reloj.t + 10 * DIA });
  await otra.listo();
  assert.equal(indices(m), 1);
  const caducada = m.crear({ dormir, ahora: () => m.reloj.t + 31 * DIA });
  await caducada.listo();
  assert.equal(indices(m), 2);
  fs.writeFileSync(join(m.carpeta, 'misiones-api.json'), '{roto');
  const rota = m.crear({ dormir });
  await rota.listo();
  assert.equal((await rota.buscar('caparazones endurecidos'))[0].id, 1105);
  assert.ok(fs.readdirSync(m.carpeta).some((f) => f.startsWith('misiones-api.json.roto-')));
});

test('pide el detalle de 3 como mucho', async () => {
  const m = montar();
  m.cliente.misionesDeZona = async (z) => ({ id: z, area: 'x', quests: [1, 2, 3, 4, 5].map((i) => ({ name: `Misión número ${i}`, id: 100 + i })) });
  await m.api.listo();
  const r = await m.api.buscar('misión número 1 misión número 2 misión número 3 misión número 4 misión número 5');
  assert.equal(r.length, 3);
  assert.equal(m.llamadas.filter((l) => l.startsWith('mision:')).length, 3);
});

test('un detalle 404 se omite y unas recompensas ausentes son null, no ceros', async () => {
  const m = montar();
  m.cliente.mision = async (id) => (id === 1105 ? null : { id, title: 'Otra cosa grande', area: { name: 'Durotar', id: 14 }, description: 'd' });
  await m.api.listo();
  assert.deepEqual(await m.api.buscar('caparazones endurecidos'), []);
  m.cliente.mision = async (id) => ({ id, title: 'Caparazones endurecidos', area: { name: 'Las Mil Agujas', id: 400 }, description: 'd' });
  const r = await m.api.buscar('caparazones endurecidos');
  assert.equal(r[0].recompensas, null);
  m.cliente.mision = async (id) => ({ id, title: 'x', rewards: { experience: 5, reputations: [{ faction: { name: 'Cenario' }, value: 250 }] } });
  assert.deepEqual((await m.api.buscar('caparazones endurecidos'))[0].recompensas.reputaciones, [{ nombre: 'Cenario', valor: 250 }]);
});

test('una lista vacía no se guarda; una zona que falla se reintenta y, si sigue fallando, se salta y se guarda corta', async () => {
  const vacio = montar();
  vacio.cliente.indiceZonasMision = async () => ({ areas: [] });
  const a = vacio.crear();
  await a.listo();
  assert.equal(fs.existsSync(join(vacio.carpeta, 'misiones-api.json')), false);
  assert.equal(a.fallo(), 'VACIO');

  const m = montar();
  let intentos = 0;
  const original = m.cliente.misionesDeZona;
  m.cliente.misionesDeZona = async (z) => {
    if (z === 14) { intentos++; throw Object.assign(new Error('t'), { code: 'TEMPORAL' }); }
    return original(z);
  };
  assert.equal(await m.api.listo(), true);
  assert.equal(intentos, 3); // 1 + 2 reintentos
  const guardado = JSON.parse(fs.readFileSync(join(m.carpeta, 'misiones-api.json'), 'utf8'));
  assert.equal(guardado.incompleta, true);
  assert.equal(guardado.misiones.length, 2);
  // Una caché incompleta caduca al día.
  const luego = m.crear({ ahora: () => m.reloj.t + 2 * DIA });
  await luego.listo();
  assert.equal(indices(m), 2);
});

test('falsos positivos: una palabra corta solo cuenta si dice «misión»; el título largo gana al corto', async () => {
  const m = montar();
  m.cliente.misionesDeZona = async () => ({ id: 1, area: 'Z', quests: [
    { name: 'Lobos', id: 1 }, { name: 'Cazador', id: 2 }, { name: 'Cazador de lobos', id: 3 }, { name: 'Pieles de jabalí', id: 4 },
  ] });
  await m.api.listo();
  assert.deepEqual((await m.api.buscar('hay lobos por aquí')).map((x) => x.id), []);
  assert.deepEqual((await m.api.buscar('la misión lobos')).map((x) => x.id), [1]);
  assert.deepEqual((await m.api.buscar('hice cazador de lobos')).map((x) => x.id), [3]);
  assert.deepEqual((await m.api.buscar('pieles de jabali')).map((x) => x.id), [4]);
});

test('misionApiParaMensaje: una misión de la base no llama a la API; una que no está, sí', async () => {
  const { api, llamadas } = montar();
  await api.listo();
  llamadas.length = 0;
  const base = { buscarMisiones: (t) => (t.includes('conocida') ? [{ q: 5 }] : []) };
  assert.equal(await misionApiParaMensaje(api, base, { texto: 'la misión conocida', idioma: 'es' }), null);
  assert.deepEqual(llamadas, []);
  assert.equal(await misionApiParaMensaje(api, base, { texto: 'dime algo', refs: { q: [9] } }), null);
  assert.deepEqual(llamadas, []);
  const r = await misionApiParaMensaje(api, base, { texto: 'caparazones endurecidos', idioma: 'es' });
  assert.equal(r.fuente, 'api_blizzard');
  assert.equal(r.resultados[0].id, 1105);
  // Si la API se cae, el turno sigue sin ella.
  const mala = { consultar: async () => { throw new Error('red'); } };
  assert.equal(await misionApiParaMensaje(mala, base, { texto: 'caparazones endurecidos' }), null);
});
