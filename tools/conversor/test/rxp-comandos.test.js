import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analizarGuia } from '../src/rxp/leer.js';
import { cargarMapas, convertirGoto } from '../src/rxp/coordenadas.js';
import { traducirPaso, COMANDOS } from '../src/rxp/comandos.js';
import { ORIGEN } from '../src/config.js';

const rutaMini = fileURLToPath(new URL('./fixtures/db-forever-mini.lua', import.meta.url));
const rutaReal = join(ORIGEN, 'RXPGuides', 'DB', 'forever', 'db.lua');
const mapas = cargarMapas(rutaMini);

const nuevoCtx = () => ({ mapas, archivo: 'x.lua', descartados: {}, avisos: [], ultimaZona: undefined });

/** Traduce un paso escrito como texto (sin la línea `step`). */
function traducir(lineas, ctx = nuevoCtx()) {
  const { pasos } = analizarGuia(`step\n${lineas}`, { archivo: 'x.lua' });
  return { ...traducirPaso(pasos[0], ctx), ctx };
}
/** Elementos sin el número de línea, para comparar. */
const sinLinea = (els) => els.map(({ linea, ...resto }) => resto);
const unElemento = (linea) => {
  const r = traducir(linea);
  assert.equal(r.elementos.length, 1, JSON.stringify(r));
  return sinLinea(r.elementos)[0];
};
const avisosCon = (r, re) => r.avisos.filter((a) => re.test(a.mensaje));

// ---------------------------------------------------------------- mapas y coordenadas
describe('mapas', () => {
  test('cargarMapas lee addon.mapId y añade los nombres especiales', () => {
    assert.equal(mapas.get('Durotar'), 1411);
    assert.equal(mapas.get("Un'Goro Crater"), 1449);
    assert.equal(mapas.get('Zephras Isle'), 2521);
    assert.equal(mapas.get('StormwindClassic'), 1453);
    assert.equal(mapas.get('EPLClassic'), 1423);
    assert.equal(mapas.has('Eversong Woods'), false, 'ignoredMaps no cuenta');
  });

  test('Orgrimmar sale de db.lua real como 1454', { skip: !existsSync(rutaReal) }, () => {
    const reales = cargarMapas(rutaReal);
    assert.equal(reales.get('Orgrimmar'), 1454);
    const r = convertirGoto(['Orgrimmar', '38.69', '85.38'], { mapas: reales });
    assert.deepEqual(r.punto, { mapa: 1454, x: 38.69, y: 85.38 });
  });
});

describe('convertirGoto', () => {
  test('forma mapID/instancia: coordenadas de mundo en el orden en que vienen', () => {
    const r = convertirGoto(['1411/1', '-4251.46', '-607.35'], { mapas });
    assert.deepEqual(r.punto, { mapa: 1411, inst: 1, wx: -4251.46, wy: -607.35 });
    assert.equal(r.zona, '1411/1');
  });

  test('forma con nombre o con número', () => {
    assert.deepEqual(convertirGoto(['Orgrimmar', '38.69', '85.38'], { mapas }).punto, { mapa: 1454, x: 38.69, y: 85.38 });
    assert.deepEqual(convertirGoto(['2521', '40', '30'], { mapas }).punto, { mapa: 2521, x: 40, y: 30 });
    assert.deepEqual(convertirGoto(['Durotar/1', '1', '2'], { mapas }).punto, { mapa: 1411, inst: 1, wx: 1, wy: 2 });
  });

  test('radio y 5.º argumento dan el modo del plano', () => {
    const modo = (...a) => convertirGoto(['Durotar', '50', '50', ...a], { mapas });
    assert.equal(convertirGoto(['Durotar', '50', '50'], { mapas }).modo, 'flecha');
    assert.equal(modo('100', '0').modo, 'paso');
    assert.equal(modo('100', '0').radio, 100);
    assert.equal(modo('15').modo, 'objetivo');
    assert.equal(modo('0').modo, 'pin');
    assert.equal(modo('0', '1').modo, 'baja');
    assert.equal(modo('-1').modo, 'cercano');
    assert.equal(modo('-1').radio, -1);
    assert.equal(modo('-1', 'x').modo, 'cercano');
  });

  test('StormwindClassic y EPLClassic pasan sin cambios; StormwindNew y EPLNew se transforman', () => {
    assert.deepEqual(convertirGoto(['StormwindClassic', '25', '25'], { mapas }).punto, { mapa: 1453, x: 25, y: 25 });
    assert.deepEqual(convertirGoto(['EPLClassic', '10', '20'], { mapas }).punto, { mapa: 1423, x: 10, y: 20 });
    const sw = convertirGoto(['StormwindNew', '39.02232393772481', '43.7789069363158'], { mapas }).punto;
    assert.equal(sw.mapa, 1453);
    assert.ok(Math.abs(sw.x - 25) < 1e-9 && Math.abs(sw.y - 25) < 1e-9, JSON.stringify(sw));
    const epl = convertirGoto(['EPLNew', '43.67876', '17.52954'], { mapas }).punto;
    assert.equal(epl.mapa, 1423);
    assert.ok(Math.abs(epl.x - 48.12616) < 1e-9 && Math.abs(epl.y - 21.96377) < 1e-9, JSON.stringify(epl));
  });

  test('un nombre desconocido o coordenadas no numéricas dan aviso y no hay punto', () => {
    const r = convertirGoto(['Narnia', '1', '2'], { mapas });
    assert.equal(r.punto, undefined);
    assert.match(r.aviso, /Narnia/);
    const r2 = convertirGoto(['Durotar', 'a', '2'], { mapas });
    assert.equal(r2.punto, undefined);
    assert.ok(r2.aviso);
  });

  test('sin argumentos usa la última zona', () => {
    const r = convertirGoto([], { mapas, ultimaZona: 'Durotar' });
    assert.equal(r.zona, 'Durotar');
    assert.equal(r.punto, undefined); // faltan x e y, igual que en el original
  });
});

// ---------------------------------------------------------------- casos del encargo
describe('casos del encargo', () => {
  test('.goto en un paso da el elemento con el punto y el modo', () => {
    assert.deepEqual(unElemento('.goto 1411/1,-4251.46,-607.35'), { t: 'goto', mapa: 1411, inst: 1, wx: -4251.46, wy: -607.35, modo: 'flecha' });
    assert.deepEqual(unElemento('.goto Durotar,50.82,13.86,100,0'), { t: 'goto', mapa: 1411, x: 50.82, y: 13.86, radio: 100, modo: 'paso' });
  });

  test('.accept 4641 >>Accept …', () => {
    assert.deepEqual(unElemento('.accept 4641 >>Accept Your Place In The World'), { t: 'accept', q: 4641, texto: 'Accept Your Place In The World' });
  });

  test('.complete 788,1', () => {
    assert.deepEqual(unElemento('.complete 788,1'), { t: 'complete', q: 788, objetivo: 1 });
  });

  test('.collect 159,10,6394,1', () => {
    assert.deepEqual(unElemento('.collect 159,10,6394,1'), { t: 'collect', i: 159, n: 10, q: 6394, mascara: 1 });
  });

  test('.xp <5,1 es una condición de salto (tabla 1.1); .xp 5,1 la contraria', () => {
    assert.deepEqual(unElemento('.xp <5,1'), { t: 'xp', nivel: 5, efecto: 'saltar_si_no_alcanzado' });
    assert.deepEqual(unElemento('.xp 5,1'), { t: 'xp', nivel: 5, efecto: 'saltar_si_alcanzado', segunAjuste: true });
    assert.deepEqual(unElemento('.xp >10,1'), { t: 'xp', nivel: 10, efecto: 'saltar_si_alcanzado', segunAjuste: true });
  });

  test('.group 3 da el requisito de grupo', () => {
    const r = traducir('.group 3');
    assert.deepEqual(r.requisitos, [{ t: 'grupo', n: 3 }]);
  });

  test('el texto «He is a level 11 elite» da el requisito élite', () => {
    const r = traducir('.complete 1,1 >>Kill him. He is a level 11 elite');
    assert.deepEqual(r.requisitos, [{ t: 'elite' }]);
    assert.deepEqual(traducir('+Mata al |cRXP_ENEMY_Élite|r').requisitos, [{ t: 'elite' }]);
    assert.deepEqual(traducir('.accept 1').requisitos, []);
    assert.deepEqual(traducir('*Mata a los Elites').requisitos, [{ t: 'elite' }]);
    assert.deepEqual(traducir('*Un satélite').requisitos, [], 'solo palabras enteras');
    assert.deepEqual(traducir('*Es elite << Orc').requisitos, [{ t: 'elite', filtro: [['r:Orc']] }]);
  });

  test('.money <0.01 salta el paso si te falta dinero', () => {
    assert.deepEqual(unElemento('.money <0.01'), { t: 'money', cobre: 100, efecto: 'saltar_si_no_alcanzado' });
    assert.deepEqual(unElemento('.money >0.5,1'), { t: 'money', cobre: 5000, efecto: 'saltar_si_alcanzado', total: true });
  });

  test('.itemStat da una condición (decisión R21): el paso se ve si la estadística cumple la comparación', () => {
    const r = traducir('.itemStat 16,ITEM_MOD_DAMAGE_PER_SECOND_SHORT,<5.1');
    assert.deepEqual(sinLinea(r.elementos), [{
      t: 'itemStat', hueco: 16, stat: 'ITEM_MOD_DAMAGE_PER_SECOND_SHORT', op: '<', valor: 5.1, efecto: 'saltar_si_no_alcanzado',
    }]);
    assert.equal(r.ctx.descartados.itemStat, undefined, 'ya no se descarta');
    assert.deepEqual(unElemento('.itemStat 18,QUALITY, > 2'), {
      t: 'itemStat', hueco: 18, stat: 'QUALITY', op: '>', valor: 2, efecto: 'saltar_si_no_alcanzado',
    });
    assert.deepEqual(unElemento('.itemStat 16,LEVEL,10'), {
      t: 'itemStat', hueco: 16, stat: 'LEVEL', op: '==', valor: 10, efecto: 'saltar_si_no_alcanzado',
    });
  });
  test('.itemStat con texto lo conserva, y sin argumentos da aviso y nota', () => {
    const r = traducir('.itemStat 16,QUALITY,<7 >>Compra un arma mejor');
    assert.equal(r.elementos[0].t, 'itemStat');
    assert.equal(r.elementos[0].texto, 'Compra un arma mejor');
    assert.equal(r.elementos[0].padre, undefined);
    const malo = traducir('.itemStat 16,QUALITY >>Texto');
    assert.deepEqual(sinLinea(malo.elementos), [{ t: 'nota', texto: 'Texto' }]);
    assert.equal(avisosCon(malo, /itemStat/).length, 1);
  });
  test('.itemStat no es el último objetivo: el .target siguiente sigue ligado al anterior', () => {
    const r = traducir('.accept 1 >>Coge\n.itemStat 16,QUALITY,<7\n.target +Fulano');
    assert.deepEqual(r.elementos.map((e) => [e.t, e.padre]), [['accept', undefined], ['itemStat', undefined], ['target', 0]]);
  });

  test('.engrave da aviso y no da elemento', () => {
    const r = traducir('.engrave 5,48051');
    assert.equal(r.elementos.length, 0);
    assert.equal(avisosCon(r, /engrave/).length, 1);
    assert.equal(r.ctx.descartados.engrave, 1);
  });

  test('un paso #som no se emite y se cuenta', () => {
    const r = traducir('#som\n.accept 1');
    assert.equal(r.omitido, '#som');
    assert.deepEqual(r.elementos, []);
    assert.equal(r.ctx.descartados['#som'], 1);
  });

  test('#hardcore no se emite y #softcore sí', () => {
    assert.equal(traducir('#hardcore\n.accept 1').omitido, '#hardcore');
    const s = traducir('#softcore\n.accept 1');
    assert.equal(s.omitido, undefined);
    assert.equal(s.elementos.length, 1);
  });

  test('#sofcore da aviso y se lee como softcore', () => {
    const r = traducir('#sofcore\n.accept 1');
    assert.equal(r.omitido, undefined);
    assert.equal(avisosCon(r, /sofcore/).length, 1);
  });
});

// ---------------------------------------------------------------- etiquetas
describe('etiquetas de paso', () => {
  test('van sin # y en minúscula; gana la primera; sin valor es true', () => {
    const r = traducir('#completewith next\n#completewith otra\n#label Uno\n#sticky\n#optional\n#loop\n#ah\n.accept 1');
    assert.deepEqual(r.etiquetas, { completewith: 'next', label: 'Uno', sticky: true, optional: true, loop: true, ah: true });
  });

  test('#level y #requires dan requisitos', () => {
    const r = traducir('#level 12\n#requires Previo\n.accept 1');
    assert.equal(r.etiquetas.level, '12');
    assert.equal(r.etiquetas.requires, 'Previo');
    assert.deepEqual(r.requisitos, [{ t: 'nivel', n: 12 }, { t: 'paso', etiqueta: 'Previo' }]);
  });

  test('#era, #era/som y #season 0,1 se muestran; #season 2 no', () => {
    for (const e of ['#era', '#era/som', '#season 0,1', '#season 0']) {
      const r = traducir(`${e}\n.accept 1`);
      assert.equal(r.omitido, undefined, e);
      assert.deepEqual(r.etiquetas, {}, e);
    }
    assert.equal(traducir('#season 2\n.accept 1').omitido, '#season');
  });

  test('#phase con la fase 6', () => {
    assert.equal(traducir('#phase 3-6\n.accept 1').omitido, undefined);
    assert.equal(traducir('#phase 4\n.accept 1').omitido, undefined);
    assert.equal(traducir('#phase 1-2\n.accept 1').omitido, '#phase');
  });

  test('#xprate con multiplicador 1', () => {
    assert.equal(traducir('#xprate <1.5\n.accept 1').omitido, undefined);
    assert.equal(traducir('#xprate >1.49\n.accept 1').omitido, '#xprate');
    assert.equal(traducir('#xprate 1.49-1.59\n.accept 1').omitido, '#xprate');
    assert.equal(traducir('#xprate 0.5-1.2\n.accept 1').omitido, undefined);
  });

  test('#hardcoreserver oculto y #softcoreserver visible', () => {
    assert.equal(traducir('#hardcoreserver\n.accept 1').omitido, '#hardcoreserver');
    assert.equal(traducir('#softcoreserver\n.accept 1').omitido, undefined);
  });

  test('una etiqueta resuelta con filtro de clase deja un filtro para el paso', () => {
    const r = traducir('#som << Paladin\n.accept 1');
    assert.equal(r.omitido, undefined);
    assert.deepEqual(r.filtro, [['!c:PALADIN']]);
    assert.equal(traducir('#softcore << Warlock\n.accept 1').filtro, undefined);
    assert.equal(traducir('#som << Classic\n.accept 1').omitido, undefined, 'filtro falso: la etiqueta no cuenta');
    const dos = traducir('#xprate >1.49 << !Paladin\n#xprate 1.49-1.59 << Paladin\n.accept 1');
    assert.equal(dos.omitido, '#xprate', 'entre las dos líneas lo ocultan para todos');
    const gana = traducir('#season 2 << Rogue\n#season 0\n.accept 1');
    assert.deepEqual(gana.filtro, [['!c:ROGUE']], 'gana la primera que aplica');
  });

  test('una etiqueta normal con filtro va a etiquetasPorFiltro, en orden', () => {
    const r = traducir('#completewith next << Horde\n#completewith Otra\n.accept 1');
    assert.deepEqual(r.etiquetasPorFiltro, [{ nombre: 'completewith', valor: 'next', filtro: [['f:Horde']] }]);
    assert.equal(r.etiquetas.completewith, 'Otra');
  });

  test('erratas: obvias se corrigen con aviso; «lavel» decide por el valor', () => {
    const r = traducir('#requres Banco\n#completwith next\n#lavel ghouls\n.accept 1');
    assert.equal(r.etiquetas.requires, 'Banco');
    assert.equal(r.etiquetas.completewith, 'next');
    assert.equal(r.etiquetas.label, 'ghouls');
    assert.equal(avisosCon(r, /requres|completwith|lavel/).length, 3);
    const hc = traducir('#hardcoore\n.accept 1');
    assert.equal(hc.omitido, '#hardcore');
    assert.equal(avisosCon(hc, /hardcoore/).length, 1);
    assert.equal(traducir('#labelTeleIF\n.accept 1').etiquetas.label, 'TeleIF');
    assert.equal(traducir('#era/#som\n.accept 1').omitido, undefined);
    assert.equal(traducir('#lavel 12\n.accept 1').etiquetas.level, '12');
  });

  test('una etiqueta desconocida da aviso y se conserva', () => {
    const r = traducir('#rarisima x\n.accept 1');
    assert.equal(r.etiquetas.rarisima, 'x');
    assert.equal(avisosCon(r, /rarisima/).length, 1);
  });
});

// ---------------------------------------------------------------- filtros, textos y padres
describe('filtros, textos y padres', () => {
  test('el filtro de la línea va analizado; false no se emite', () => {
    const r = traducir('.accept 1 << Orc\n.accept 2 << Classic\n.accept 3 << Orc/Forever');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'accept', q: 1, filtro: [['r:Orc']] }, { t: 'accept', q: 3 }]);
    assert.equal(r.ctx.descartados['<<false>>'], 1);
  });

  test('cada elemento conserva su número de línea', () => {
    const r = traducir('.accept 1\n.turnin 2');
    assert.deepEqual(r.elementos.map((e) => e.linea), [2, 3]);
  });

  test('manual, nota y texto suelto', () => {
    const r = traducir('+Marca esto\n*Una nota\n>>Otro texto');
    assert.deepEqual(sinLinea(r.elementos), [
      { t: 'manual', texto: 'Marca esto' },
      { t: 'nota', texto: 'Una nota' },
      { t: 'nota', texto: 'Otro texto' },
    ]);
  });

  test('padre: goto, target con +, timer y waypoint se ligan al último objetivo', () => {
    const r = traducir([
      '.goto Durotar,1,2',
      '.accept 1',
      '.goto Durotar,3,4',
      '.target +Gornek',
      '.timer 30,RP',
      '.complete 1,1',
      '.waypoint Durotar,5,6',
      '.goto Durotar,7,8,10',
      '.goto Durotar,9,9',
    ].join('\n'));
    const p = r.elementos.map((e) => [e.t, e.padre]);
    assert.deepEqual(p, [
      ['goto', undefined], ['accept', undefined], ['goto', 1], ['target', 1], ['timer', 1],
      ['complete', undefined], ['waypoint', 5], ['goto', undefined], ['goto', 7],
    ]);
  });

  test('.disablecheckbox no da elemento: marca sinCasilla en el padre', () => {
    const r = traducir('.accept 1\n.disablecheckbox\n.turnin 2\n.disablecheckbox >>Sin casilla');
    assert.deepEqual(sinLinea(r.elementos), [
      { t: 'accept', q: 1, sinCasilla: true },
      { t: 'turnin', q: 2, sinCasilla: true },
      { t: 'nota', texto: 'Sin casilla' },
    ]);
    const s = traducir('.disablecheckbox');
    assert.equal(s.elementos.length, 0);
    assert.equal(avisosCon(s, /padre/).length, 1);
  });

  test('un comando desconocido da aviso; su texto queda como nota', () => {
    const r = traducir('.inventado 1 >>Hola');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'nota', texto: 'Hola' }]);
    assert.equal(avisosCon(r, /inventado/).length, 1);
  });

  test('un número que no lo es da aviso y no hay elemento (el texto queda como nota)', () => {
    const r = traducir('.accept abc >>Acepta');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'nota', texto: 'Acepta' }]);
    assert.equal(avisosCon(r, /abc/).length, 1);
  });

  test('los PRESCINDIBLES no dan elemento; su texto pasa a nota y se cuentan', () => {
    const r = traducir('.link https://x.y >>Mira esto\n.skipgossip\n.skipgossipid 123\n.openmap Durotar\n.addquestitem 1,2\n.macro Nom,1 >>/cast X');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'nota', texto: 'Mira esto' }]);
    for (const c of ['link', 'skipgossip', 'skipgossipid', 'openmap', 'addquestitem', 'macro']) assert.equal(r.ctx.descartados[c], 1, c);
  });

  test('.xpcheck se descarta con aviso', () => {
    const r = traducir('.xpcheck RestedXP Horde 22-30');
    assert.equal(r.elementos.length, 0);
    assert.equal(avisosCon(r, /xpcheck/).length, 1);
  });

  test('la última zona se arrastra entre pasos con el mismo ctx', () => {
    const ctx = nuevoCtx();
    traducir('.goto Durotar,1,2', ctx);
    assert.equal(ctx.ultimaZona, 'Durotar');
    traducir('.goto 1411/1,1,2', ctx);
    assert.equal(ctx.ultimaZona, '1411/1');
  });

  test('ctx.avisos acumula los avisos de los pasos', () => {
    const ctx = nuevoCtx();
    traducir('.inventado', ctx);
    traducir('.otro', ctx);
    assert.equal(ctx.avisos.length, 2);
    assert.equal(ctx.avisos[0].archivo, 'x.lua');
  });
});

// ---------------------------------------------------------------- un caso por comando
describe('misiones', () => {
  test('accept con flags', () => {
    assert.deepEqual(unElemento('.accept 10,1'), { t: 'accept', q: 10, noAuto: true });
    assert.deepEqual(unElemento('.accept 10,2,9'), { t: 'accept', q: 10, previa: 9 });
  });
  test('turnin con recompensa, flag y ID negativo', () => {
    assert.deepEqual(unElemento('.turnin 10'), { t: 'turnin', q: 10 });
    assert.deepEqual(unElemento('.turnin 10,2,1'), { t: 'turnin', q: 10, recompensa: 2, noAuto: true });
    assert.deepEqual(unElemento('.turnin -10'), { t: 'turnin', q: 10, siFalta: true });
    assert.deepEqual(unElemento('.turnin -10,1'), { t: 'turnin', q: 10, siFalta: true, siIncompleta: true });
  });
  test('complete con max, flag 1 e ID negativo', () => {
    assert.deepEqual(unElemento('.complete 5,2,3,1'), { t: 'complete', q: 5, objetivo: 2, max: 3, info: true });
    assert.deepEqual(unElemento('.complete -5,1,0'), { t: 'complete', q: 5, objetivo: 1, siFalta: true });
    assert.equal(traducir('.complete 5').elementos.length, 0);
  });
  test('daily, dailyturnin y abandon', () => {
    assert.deepEqual(unElemento('.daily 1,2,3'), { t: 'daily', qs: [1, 2, 3] });
    assert.deepEqual(unElemento('.dailyturnin 1,2'), { t: 'dailyturnin', qs: [1, 2] });
    assert.deepEqual(unElemento('.abandon 3,4 >>*Abandona'), { t: 'abandon', qs: [3, 4], texto: 'Abandona', iconoEntrega: true });
  });
  test('condiciones de misión', () => {
    assert.deepEqual(unElemento('.isOnQuest 1,2'), { t: 'isOnQuest', qs: [1, 2] });
    assert.deepEqual(unElemento('.isNotOnQuest 1'), { t: 'isNotOnQuest', qs: [1] });
    assert.deepEqual(unElemento('.isQuestComplete 7'), { t: 'isQuestComplete', q: 7 });
    assert.deepEqual(unElemento('.isQuestNotComplete 7,account'), { t: 'isQuestNotComplete', q: 7, cuenta: true });
    assert.deepEqual(unElemento('.isQuestAvailable 8,9'), { t: 'isQuestAvailable', qs: [8, 9] });
    const r = traducir('.isQuestTurnedIn 4641');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'isQuestTurnedIn', qs: [4641] }]);
    assert.deepEqual(r.requisitos, [{ t: 'mision', q: 4641, estado: 'entregada' }]);
    assert.deepEqual(traducir('.isQuestTurnedIn 1,2').requisitos, [{ t: 'mision', q: 1, estado: 'entregada', alternativas: [2] }]);
  });
});

describe('navegación y lugar', () => {
  test('waypoint, pin, line y loop', () => {
    const r = traducir([
      '.accept 1',
      '.waypoint 1426/0,264.89,-5163.79,60,0',
      '.waypoint Durotar,1,2,-5',
      '.pin 2521,50.27,76.45,Tornado',
      '.line Durotar,1,2,3,4',
      '.loop @20,Durotar,1,2,3,4,5,6',
      '.loop +30,Mulgore,1,2,3,4',
    ].join('\n'));
    assert.deepEqual(sinLinea(r.elementos).slice(1), [
      { t: 'waypoint', mapa: 1426, inst: 0, wx: 264.89, wy: -5163.79, radio: 60, modo: 'baja', sinPin: true, padre: 0 },
      { t: 'waypoint', mapa: 1411, x: 1, y: 2, radio: -5, modo: 'cercano', persistente: true, sinPin: true, padre: 0 },
      { t: 'pin', mapa: 2521, x: 50.27, y: 76.45, modo: 'pin', tooltip: 'Tornado', padre: 0 },
      { t: 'line', puntos: [{ mapa: 1411, x: 1, y: 2 }, { mapa: 1411, x: 3, y: 4 }], padre: 0 },
      { t: 'loop', rango: 20, sigue: true, puntos: [{ mapa: 1411, x: 1, y: 2 }, { mapa: 1411, x: 3, y: 4 }, { mapa: 1411, x: 5, y: 6 }], padre: 0 },
      { t: 'loop', rango: 30, centro: true, puntos: [{ mapa: 1412, x: 1, y: 2 }, { mapa: 1412, x: 3, y: 4 }], padre: 0 },
    ]);
  });
  test('line con coordenadas de mundo', () => {
    assert.deepEqual(unElemento('.line 1411/1,10,20,30,40'), { t: 'line', puntos: [{ mapa: 1411, inst: 1, wx: 10, wy: 20 }, { mapa: 1411, inst: 1, wx: 30, wy: 40 }] });
  });
  test('zone y subzone exigen texto', () => {
    assert.deepEqual(unElemento('.zone Orgrimmar >>Entra'), { t: 'zone', mapa: 1454, texto: 'Entra' });
    assert.equal(traducir('.zone Orgrimmar').elementos.length, 0);
    assert.deepEqual(unElemento('.subzone 362,3 >>Sal'), { t: 'subzone', area: 362, invertir: true, soloInstancia: true, texto: 'Sal' });
  });
  test('zoneskip, subzoneskip y bindlocation', () => {
    assert.deepEqual(unElemento('.zoneskip Durotar+Mulgore/1454,1'), { t: 'zoneskip', mapas: [1411, 1412, 1454], invertir: true });
    assert.deepEqual(unElemento('.subzoneskip 362'), { t: 'subzoneskip', area: 362 });
    assert.deepEqual(unElemento('.bindlocation 362,1'), { t: 'bindlocation', area: 362, invertir: true });
  });
  test('next y clicknext', () => {
    assert.deepEqual(unElemento('.next RestedXP Forever Guide (H)\\12-14 The Barrens'), { t: 'next', guias: ['RestedXP Forever Guide (H)\\12-14 The Barrens'] });
    assert.deepEqual(unElemento('.next'), { t: 'next' });
    assert.deepEqual(unElemento('.clicknext Grupo\\A, B >>Pulsa'), { t: 'clicknext', guias: ['Grupo\\A, B'], texto: 'Pulsa' });
  });
});

describe('nivel, dinero y objetos', () => {
  test('xp con sufijos, etiqueta y objetivo', () => {
    const r = traducir('.xp 10');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'xp', nivel: 10, efecto: 'objetivo' }]);
    assert.deepEqual(r.requisitos, [{ t: 'nivel', n: 10 }]);
    assert.deepEqual(unElemento('.xp 5+5890'), { t: 'xp', nivel: 5, xp: 5890, efecto: 'objetivo' });
    assert.deepEqual(unElemento('.xp 5.5'), { t: 'xp', nivel: 5, fraccion: 0.5, efecto: 'objetivo' });
    assert.deepEqual(unElemento('.xp 5-40'), { t: 'xp', nivel: 5, faltan: 40, efecto: 'objetivo' });
    assert.deepEqual(unElemento('.xp <5'), { t: 'xp', nivel: 5, efecto: 'objetivo', invertir: true });
    assert.deepEqual(unElemento('.xp 12,1,fin'), { t: 'xp', nivel: 12, efecto: 'saltar_si_alcanzado', etiqueta: 'fin', segunAjuste: true });
    assert.deepEqual(unElemento('.xp 12,-1'), { t: 'xp', nivel: 12, efecto: 'saltar_si_no_alcanzado', segunAjuste: true });
    assert.deepEqual(traducir('.xp <8,1').requisitos, [{ t: 'nivel', n: 8 }]);
    assert.deepEqual(traducir('.xp 8,1').requisitos, []);
  });
  test('maxlevel', () => {
    assert.deepEqual(unElemento('.maxlevel 12,fin'), { t: 'maxlevel', nivel: 12, etiqueta: 'fin' });
  });
  test('collect con flags', () => {
    assert.deepEqual(unElemento('.collect 769,50,2178,1,0x20,cooking'), {
      t: 'collect', i: 769, n: 50, q: 2178, mascara: 1, profesion: 'cooking',
    });
    assert.deepEqual(unElemento('.collect 5/6,2'), { t: 'collect', i: 5, is: [5, 6], n: 2 });
    assert.deepEqual(unElemento('.collect 5,2,1,0,25'), { t: 'collect', i: 5, n: 2, q: 1, sinCasilla: true, banco: true, noAlEntregar: true });
    assert.deepEqual(unElemento('.collect 5,2,1,3,-2,mining'), { t: 'collect', i: 5, n: 2, q: 1, mascara: 3, sinCasilla: true, restar: true, multiplicador: 2, profesion: 'mining' });
    assert.deepEqual(unElemento('.collect 5'), { t: 'collect', i: 5, n: 1 });
  });
  test('itemcount: operadores y requisito de objeto', () => {
    const r = traducir('.itemcount 6889,1');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'itemcount', is: [6889], op: '>=', n: 1, efecto: 'saltar_si_no_alcanzado' }]);
    assert.deepEqual(r.requisitos, [{ t: 'objeto', i: 6889, n: 1 }]);
    assert.equal(unElemento('.itemcount 5457,<1').op, '<');
    assert.equal(unElemento('.itemcount 5457,<=1').op, '<=');
    assert.equal(unElemento('.itemcount 5457,=1').op, '==');
    assert.deepEqual(unElemento('.itemcount 1/2,>3,1'), { t: 'itemcount', is: [1, 2], op: '>', n: 3, banco: true, efecto: 'saltar_si_no_alcanzado' });
    assert.deepEqual(traducir('.itemcount 5457,<1').requisitos, []);
  });
  test('destroy, use, usespell, bankdeposit, bankwithdraw, bronzetube, blastedLands', () => {
    assert.deepEqual(unElemento('.destroy 7'), { t: 'destroy', i: 7 });
    assert.deepEqual(unElemento('.use 13536,6948:p'), { t: 'use', is: [13536, 6948], siempre: [6948] });
    assert.deepEqual(unElemento('.usespell 818'), { t: 'usespell', spells: [818] });
    assert.deepEqual(unElemento('.bankdeposit 1,2 >>Guarda'), { t: 'bankdeposit', is: [1, 2], texto: 'Guarda' });
    assert.deepEqual(unElemento('.bankwithdraw 3'), { t: 'bankwithdraw', is: [3] });
    assert.deepEqual(unElemento('.bronzetube'), { t: 'bronzetube' });
    assert.deepEqual(unElemento('.bronzetube rev'), { t: 'bronzetube', invertir: true });
    const bl = unElemento('.blastedLands');
    assert.equal(bl.t, 'blastedLands');
    assert.deepEqual(bl.objetos, [8396, 8394, 8392, 8393, 8391]);
    assert.deepEqual(bl.misiones.find((m) => m.q === 2601), { q: 2601, n: [2, 10, 0, 0, 0] });
    assert.equal(bl.misiones.length, 5);
  });
  test('equip y aura: con texto objetivo, sin texto condición', () => {
    assert.deepEqual(unElemento('.equip 16,5579 >>Equipa'), { t: 'equip', hueco: 16, i: 5579, efecto: 'objetivo', texto: 'Equipa' });
    assert.deepEqual(unElemento('.equip 7,4800'), { t: 'equip', hueco: 7, i: 4800, efecto: 'saltar_si_alcanzado' });
    assert.deepEqual(unElemento('.equip -7'), { t: 'equip', hueco: 7, efecto: 'saltar_si_no_alcanzado' });
    assert.deepEqual(unElemento('.aura -9991'), { t: 'aura', spell: 9991, efecto: 'saltar_si_no_alcanzado' });
    assert.deepEqual(unElemento('.aura 2828,<60 >>Usa'), { t: 'aura', spell: 2828, dur: 60, efecto: 'objetivo', invertir: true, texto: 'Usa' });
    assert.deepEqual(unElemento('.aura 5,3+,pet'), { t: 'aura', spell: 5, cargas: 3, unidad: 'pet', efecto: 'saltar_si_alcanzado' });
  });
});

describe('servicios, hechizos, profesiones y estructura', () => {
  test('vendor, trainer, stable, hs, home, deathskip, fly, fp', () => {
    assert.deepEqual(unElemento('.vendor 3165'), { t: 'vendor', npc: 3165 });
    assert.deepEqual(unElemento('.trainer'), { t: 'trainer' });
    assert.deepEqual(unElemento('.stable >>Establo'), { t: 'stable', texto: 'Establo' });
    assert.deepEqual(unElemento('.hs >>Usa la piedra'), { t: 'hs', texto: 'Usa la piedra' });
    assert.equal(traducir('.hs').elementos.length, 0);
    assert.deepEqual(unElemento('.home 362'), { t: 'home', area: 362 });
    assert.deepEqual(unElemento('.deathskip'), { t: 'deathskip' });
    assert.deepEqual(unElemento('.fly Orgrimmar'), { t: 'fly', destino: 'Orgrimmar' });
    assert.equal(traducir('.fly').elementos.length, 0);
    assert.deepEqual(unElemento('.fp Ratchet >>Coge el vuelo'), { t: 'fp', nombre: 'Ratchet', texto: 'Coge el vuelo' });
    assert.deepEqual(unElemento('.fp Ratchet,3'), { t: 'fp', nombre: 'Ratchet', sinCasilla: true, ignorarMensaje: true });
  });
  test('train, istrained, cast, gossipoption', () => {
    assert.deepEqual(unElemento('.train 772'), { t: 'train', spell: 772, efecto: 'objetivo' });
    assert.deepEqual(unElemento('.train 2018,1'), { t: 'train', spell: 2018, efecto: 'saltar_si_alcanzado' });
    assert.deepEqual(unElemento('.train 2018,3'), { t: 'train', spell: 2018, efecto: 'saltar_si_no_alcanzado' });
    assert.deepEqual(unElemento('.train 2018,2'), { t: 'train', spell: 2018, efecto: 'objetivo', invertir: true });
    assert.deepEqual(unElemento('.istrained 1,2'), { t: 'istrained', spells: [1, 2] });
    assert.deepEqual(unElemento('.cast 18960 >>Lanza'), { t: 'cast', spells: [18960], texto: 'Lanza' });
    assert.deepEqual(unElemento('.cast pet,1,2'), { t: 'cast', unidad: 'pet', spells: [1, 2] });
    assert.deepEqual(unElemento('.gossipoption 123 >>Habla'), { t: 'gossipoption', id: 123, texto: 'Habla' });
  });
  test('skill y su requisito', () => {
    const r = traducir('.skill herbalism,<1,1');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'skill', p: 'herbalism', n: 1, efecto: 'saltar_si_no_alcanzado' }]);
    assert.deepEqual(r.requisitos, [{ t: 'profesion', p: 'herbalism', n: 1 }]);
    const o = traducir('.skill riding,75 >>Entrena');
    assert.deepEqual(sinLinea(o.elementos), [{ t: 'skill', p: 'riding', n: 75, efecto: 'objetivo', texto: 'Entrena' }]);
    assert.deepEqual(o.requisitos, [{ t: 'profesion', p: 'riding', n: 75 }]);
    assert.deepEqual(traducir('.skill cooking,50,1').requisitos, []);
  });
  test('reputation y su requisito', () => {
    const r = traducir('.reputation 529,revered,<0,1');
    assert.deepEqual(sinLinea(r.elementos), [{ t: 'reputation', faccion: 529, rango: 7, efecto: 'saltar_si_no_alcanzado' }]);
    assert.deepEqual(r.requisitos, [{ t: 'reputacion', faccion: 529, rango: 7 }]);
    const o = traducir('.reputation 92,Friendly,500');
    assert.deepEqual(sinLinea(o.elementos), [{ t: 'reputation', faccion: 92, rango: 5, valor: 500, efecto: 'objetivo' }]);
    assert.deepEqual(o.requisitos, [{ t: 'reputacion', faccion: 92, rango: 5, valor: 500 }]);
    assert.deepEqual(unElemento('.reputation 529,revered,>0,1'), { t: 'reputation', faccion: 529, rango: 7, efecto: 'saltar_si_alcanzado' });
  });
  test('cooldown', () => {
    assert.deepEqual(unElemento('.cooldown item,6948,<0'), { t: 'cooldown', tipo: 'item', id: 6948, op: '<', seg: 0, efecto: 'saltar_si_alcanzado' });
    assert.deepEqual(unElemento('.cooldown spell,5,>2m,1'), { t: 'cooldown', tipo: 'spell', id: 5, op: '>', seg: 120, efecto: 'saltar_si_alcanzado', unaVez: true });
  });
  test('showwhiledead, xpto60', () => {
    assert.deepEqual(unElemento('.showwhiledead'), { t: 'showwhiledead' });
    assert.deepEqual(unElemento('.xpto60 >>Falta'), { t: 'xpto60', texto: 'Falta' });
  });
  test('target, mob y unitscan guardan los PNJ', () => {
    assert.deepEqual(unElemento('.target Gornek::3143;Zureetha Fargaze'), { t: 'target', npcs: [{ nombre: 'Gornek', id: 3143 }, { nombre: 'Zureetha Fargaze' }] });
    assert.deepEqual(unElemento('.mob Mottled Boar'), { t: 'mob', npcs: [{ nombre: 'Mottled Boar' }] });
    assert.deepEqual(unElemento('.unitscan 3145'), { t: 'unitscan', npcs: [{ id: 3145 }] });
  });
  test('group, solo, dungeon y enabledungeon', () => {
    const g = traducir('.group >>Ve en grupo');
    assert.deepEqual(g.requisitos, [{ t: 'grupo' }]);
    assert.deepEqual(sinLinea(g.elementos), [{ t: 'nota', texto: 'Ve en grupo' }]);
    assert.deepEqual(unElemento('.solo'), { t: 'solo' });
    const d = traducir('.dungeon RFC\n.dungeon !vc');
    assert.deepEqual(d.requisitos, [{ t: 'mazmorra', d: 'RFC' }, { t: 'mazmorra', d: '!DM' }]);
    assert.equal(d.elementos.length, 0);
    assert.equal(avisosCon(traducir('.dungeon XYZ'), /XYZ/).length, 1);
    assert.deepEqual(unElemento('.enabledungeon RFC'), { t: 'enabledungeon', d: 'RFC', activar: true });
    assert.deepEqual(unElemento('.enabledungeon !SM'), { t: 'enabledungeon', d: 'SM', activar: false });
  });
  test('los requisitos repetidos salen una vez; con filtro lo conservan', () => {
    const r = traducir('#level 10\n.xp 10\n.isQuestTurnedIn 5 << Orc');
    assert.deepEqual(r.requisitos, [{ t: 'nivel', n: 10 }, { t: 'mision', q: 5, estado: 'entregada', filtro: [['r:Orc']] }]);
  });
});

test('COMANDOS: la tabla tiene los comandos del plano y daily con su clase', () => {
  assert.equal(Object.keys(COMANDOS).length, 73);
  assert.equal(COMANDOS.goto, 'NAVEGACIÓN');
  assert.equal(COMANDOS.itemStat, 'CONDICIÓN');
  for (const c of Object.keys(COMANDOS)) {
    const r = traducir(`.${c}`);
    assert.equal(avisosCon(r, /Comando desconocido/).length, 0, c);
  }
});
