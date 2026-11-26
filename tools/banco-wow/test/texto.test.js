// Texto en pantalla (ui/texto.lua), tarea 14: de los textos de los pasos (marcadores |cRXP_…_, iconos, nombres con
// ::id y textos generados para los elementos sin texto) al texto final que enseña la ventana, en español o inglés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS);

const EN = { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } };
const ES = { guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } } };

// Llama a SnetForever.Texto[funcion](argumentos en Lua) y devuelve el resultado.
const texto = (m, funcion, ...args) => m.lua(`SnetForever.Texto.${funcion}(${args.join(', ')})`);
const deElemento = (m, elementoLua, mem = 'nil') => texto(m, 'deElemento', elementoLua, mem);

test('colorear: |cRXP_<TIPO>_ pasa a su color; los seis colores del tema', () => {
  const m = nuevaMaquina(ES);
  const quiero = {
    FRIENDLY: 'FF00FF25', ENEMY: 'FFFF5722', LOOT: 'FF00BCD4', WARN: 'FFFCDC00', PICK: 'FFDB2EEF', BUY: 'FF0E8312',
  };
  for (const [tipo, color] of Object.entries(quiero)) {
    assert.equal(texto(m, 'colorear', aLua(`|cRXP_${tipo}_Kaltunk|r`)), `|c${color}Kaltunk|r`);
  }
  assert.equal(
    texto(m, 'colorear', aLua('Mata a |cRXP_ENEMY_Jabalí|r y habla con |cRXP_FRIENDLY_Gornek|r')),
    'Mata a |cFFFF5722Jabalí|r y habla con |cFF00FF25Gornek|r',
  );
  sinErrores(m);
});

test('colorear: un RXP_X_ desconocido se quita entero; un color normal y los iconos se respetan', () => {
  const m = nuevaMaquina(ES);
  const raro = texto(m, 'colorear', aLua('|cRXP_RARO_x|r'));
  assert.ok(!raro.includes('RXP_'), raro);
  assert.ok(raro.includes('x'), raro);
  // Un marcador desconocido de dos palabras tampoco deja nada roto.
  assert.ok(!texto(m, 'colorear', aLua('|cRXP_OTRO_COSA_y|r')).includes('RXP_'));
  const intacto = '|cFFFCDC00Cuidado|r |T132333:0|t[Grito] |Tinterface/worldmap/chatbubble_64grey.blp:20|tHola';
  assert.equal(texto(m, 'colorear', aLua(intacto)), intacto);
  sinErrores(m);
});

test('colorear: \\n literal pasa a salto de línea', () => {
  const m = nuevaMaquina(ES);
  assert.equal(texto(m, 'colorear', aLua('uno\\ndos\\n|cRXP_WARN_tres|r')), 'uno\ndos\n|cFFFCDC00tres|r');
  sinErrores(m);
});

test('limpiar: Nombre::id → el nombre del PNJ en el idioma activo, sin «::»', () => {
  const m = nuevaMaquina(ES);
  m.lua('SNF_MISIONES.npc[3595] = {name = "Shanda"}');
  m.lua('SNF_MISIONES.es.npc[3595] = {name = "Shanda la Hiladora"}');
  const es = texto(m, 'limpiar', aLua('|cRXP_FRIENDLY_Shanda::3595|r'));
  assert.ok(es.includes('Shanda la Hiladora'), es);
  assert.ok(!es.includes('::'), es);
  // Tras colorear, el resultado es un color normal del cliente.
  assert.equal(texto(m, 'colorear', aLua(es)), '|cFF00FF25Shanda la Hiladora|r');
  const en = nuevaMaquina(EN);
  en.lua('SNF_MISIONES.npc[3595] = {name = "Shanda"}');
  en.lua('SNF_MISIONES.es.npc[3595] = {name = "Shanda la Hiladora"}');
  assert.equal(texto(en, 'limpiar', aLua('|cRXP_FRIENDLY_Shandy::3595|r')), '|cRXP_FRIENDLY_Shanda|r');
  sinErrores(m);
  sinErrores(en);
});

test('limpiar: sin nombre español en los datos se queda el escrito (no se cuela el inglés)', () => {
  const m = nuevaMaquina(ES);
  m.lua('SNF_MISIONES.npc[3595] = {name = "Shanda the Spinner"}');
  assert.equal(
    texto(m, 'limpiar', aLua('|cRXP_FRIENDLY_Shanda la Hiladora::3595|r')),
    '|cRXP_FRIENDLY_Shanda la Hiladora|r',
  );
  // En inglés ese mismo PNJ sí se cambia por su nombre.
  const en = nuevaMaquina(EN);
  en.lua('SNF_MISIONES.npc[3595] = {name = "Shanda the Spinner"}');
  assert.equal(texto(en, 'limpiar', aLua('|cRXP_FRIENDLY_Shanda::3595|r')), '|cRXP_FRIENDLY_Shanda the Spinner|r');
  sinErrores(m);
  sinErrores(en);
});

test('limpiar: un plural o un añadido del autor no se pierde por el nombre de los datos', () => {
  const en = nuevaMaquina(EN);
  en.lua('SNF_MISIONES.npc[3098] = {name = "Mottled Boar"}');
  assert.equal(texto(en, 'limpiar', aLua('Mata |cRXP_ENEMY_Mottled Boars::3098|r')), 'Mata |cRXP_ENEMY_Mottled Boars|r');
  assert.equal(texto(en, 'limpiar', aLua('Mata |cRXP_ENEMY_::3098|r')), 'Mata |cRXP_ENEMY_Mottled Boar|r');
  sinErrores(en);
});

test('limpiar: un PNJ sin datos se queda con el nombre escrito; un ::id suelto se quita', () => {
  const m = nuevaMaquina(ES);
  const s = texto(m, 'limpiar', aLua('Habla con |cRXP_FRIENDLY_Don Nadie::999999|r y con Otro::5 ya'));
  assert.ok(s.includes('Don Nadie') && !s.includes('::') && !s.includes('999999'), s);
  assert.ok(!s.includes('#'), s);
  sinErrores(m);
});

test('limpiar: *quest* → el nombre de la misión del elemento', () => {
  const m = nuevaMaquina(ES);
  assert.equal(texto(m, 'limpiar', aLua('Acepta *quest*'), '{t = "accept", q = 4641}'), 'Acepta Tu lugar en el mundo');
  assert.equal(texto(m, 'limpiar', aLua('Sin marcador')), 'Sin marcador');
  sinErrores(m);
});

test('deElemento: accept con la misión en español y en inglés', () => {
  const es = nuevaMaquina(ES);
  assert.equal(deElemento(es, '{t = "accept", q = 4641}'), 'Acepta Tu lugar en el mundo');
  assert.equal(deElemento(es, '{t = "turnin", q = 4641}'), 'Entrega Tu lugar en el mundo');
  sinErrores(es);
  const en = nuevaMaquina(EN);
  assert.equal(deElemento(en, '{t = "accept", q = 4641}'), 'Accept Your Place In The World');
  assert.equal(deElemento(en, '{t = "turnin", q = 4641}'), 'Turn in Your Place In The World');
  sinErrores(en);
});

test('deElemento: el texto de los datos manda, con colores y números', () => {
  const m = nuevaMaquina(ES);
  const el = '{t = "accept", q = 4641, texto = {en = "Accept |cRXP_WARN_it|r", es = "Acepta |cRXP_WARN_eso|r\\\\nya"}}';
  assert.equal(deElemento(m, el), 'Acepta |cFFFCDC00eso|r\nya');
  // Una cadena sola (sin {en, es}) también vale.
  assert.equal(deElemento(m, '{t = "nota", texto = "Hola |cRXP_LOOT_mundo|r"}'), 'Hola |cFF00BCD4mundo|r');
  assert.equal(deElemento(m, '{t = "mob", npcs = {}}'), '');
  sinErrores(m);
});

test('deElemento: goto con coordenadas de un decimal (sin «.0» final) y con la zona', () => {
  const m = nuevaMaquina(ES);
  const s = deElemento(m, '{t = "goto", mapa = 1411, x = 43.29, y = 68.53}');
  assert.ok(s.includes('43.3, 68.5'), s);
  assert.ok(s.includes('Durotar'), s);
  // Un punto de mundo (inst, wx, wy) se pasa a coordenadas de zona.
  const w = deElemento(m, '{t = "goto", mapa = 1411, inst = 1, wx = -4165, wy = -615}');
  assert.match(w, /Durotar/);
  // Decisión del controlador (tarea 16, Vigilancia 4): las coordenadas sin «.0» final (69.0 → «69»).
  assert.ok(w.includes('(43.3, 69)'), w);
  // Un mapa que el juego no conoce no rompe nada.
  const raro = deElemento(m, '{t = "goto", mapa = 99999, x = 1.5, y = 2.5}');
  assert.ok(raro.includes('1.5, 2.5'), raro);
  sinErrores(m);
});

test('deElemento: nivel, servicios y viajes generan su texto', () => {
  const m = nuevaMaquina(ES);
  assert.equal(deElemento(m, '{t = "xp", nivel = 7, efecto = "objetivo"}'), 'Sube hasta el nivel 7');
  assert.match(deElemento(m, '{t = "vendor"}'), /\S/);
  assert.match(deElemento(m, '{t = "trainer"}'), /\S/);
  assert.match(deElemento(m, '{t = "hs"}'), /\S/);
  assert.match(deElemento(m, '{t = "home"}'), /\S/);
  assert.match(deElemento(m, '{t = "fp"}'), /\S/);
  assert.match(deElemento(m, '{t = "fly", destino = "Orgrimmar"}'), /Orgrimmar/);
  assert.match(deElemento(m, '{t = "skill", p = "cooking", n = 50, efecto = "objetivo"}'), /Cocina.*50/);
  sinErrores(m);
  const en = nuevaMaquina(EN);
  assert.equal(deElemento(en, '{t = "xp", nivel = 7, efecto = "objetivo"}'), 'Reach level 7');
  assert.match(deElemento(en, '{t = "skill", p = "cooking", n = 50, efecto = "objetivo"}'), /Cooking.*50/);
  sinErrores(en);
});

test('deElemento: complete lleva el objetivo del juego, o «misión: hecho/pedido»', () => {
  const m = nuevaMaquina(ES);
  m.estadoMision(788, {
    enDiario: true,
    objetivos: [{ texto: 'Jabalí moteado muerto: 3/10', hecho: 3, pedido: 10, terminado: false }],
  });
  assert.equal(deElemento(m, '{t = "complete", q = 788, objetivo = 1}'), 'Jabalí moteado muerto: 3/10');
  // Sin esa misión en el diario no hay objetivo: «misión: 0/pedido».
  // (789 no tiene nombre en español en los datos de prueba: sale el inglés.)
  assert.equal(deElemento(m, '{t = "complete", q = 789, objetivo = 1, max = 8}'), 'Sting of the Scorpid: 0/8');
  assert.equal(deElemento(m, '{t = "complete", q = 789, objetivo = 1}'), 'Sting of the Scorpid: 0/1');
  sinErrores(m);
});

test('deElemento: collect da «Nombre: n/N» con lo que llevas', () => {
  const m = nuevaMaquina(ES);
  m.objeto(159, 2);
  assert.equal(deElemento(m, '{t = "collect", i = 159, n = 5}'), 'Agua de manantial refrescante: 2/5');
  m.objeto(159, 7);
  assert.equal(deElemento(m, '{t = "collect", i = 159, is = {159}, n = 5}'), 'Agua de manantial refrescante: 7/5');
  sinErrores(m);
});

test('Vigilancia 4: ningún número sale con «.0» (en el juego un 10 es «10», en fengari un 10/1 es 10.0)', () => {
  const m = nuevaMaquina(ES);
  const xp = deElemento(m, '{t = "xp", nivel = 10 / 1, efecto = "objetivo"}');
  assert.ok(xp.includes('10') && !xp.includes('.0'), xp);
  const collect = deElemento(m, '{t = "collect", i = 159, n = 5 / 1}');
  assert.ok(collect.includes('0/5') && !collect.includes('.0'), collect);
  const nivelFaltan = deElemento(m, '{t = "xp", nivel = 10 / 1, faltan = 610 / 1, efecto = "objetivo"}');
  assert.ok(!nivelFaltan.includes('.0'), nivelFaltan);
  const skill = deElemento(m, '{t = "skill", p = "fishing", n = 75 / 1, efecto = "objetivo"}');
  assert.ok(skill.includes('75') && !skill.includes('.0'), skill);
  const complete = deElemento(m, '{t = "complete", q = 789, objetivo = 1, max = 8 / 1}');
  assert.ok(!complete.includes('.0'), complete);
  assert.equal(texto(m, 'numero', '100.0'), '100');
  assert.equal(texto(m, 'numero', '10 / 1'), '10');
  assert.equal(texto(m, 'numero', '-3.0'), '-3');
  assert.equal(texto(m, 'numero', '43.29', '1'), '43.3');
  assert.equal(texto(m, 'numero', '2', '1'), '2.0');
  assert.equal(texto(m, 'numero', '0.5'), '0.5');
  assert.equal(texto(m, 'numero', 'nil'), '0');
  assert.equal(texto(m, 'numero', '3000000000'), '3000000000');
  sinErrores(m);
});

// F5: «Salen al día» salía «36846,0»; ahora, entero y con el separador de miles del idioma.
test('Texto.entero pone el separador del idioma: «2.054» en español y «2,054» en inglés, redondeado y sin «,0»', () => {
  const es = nuevaMaquina(ES);
  assert.equal(texto(es, 'entero', '2054.4'), '2.054');
  assert.equal(texto(es, 'entero', '36846.0'), '36.846');
  assert.equal(texto(es, 'entero', '1234567'), '1.234.567');
  assert.equal(texto(es, 'entero', '999'), '999');
  assert.equal(texto(es, 'entero', '1000'), '1.000');
  assert.equal(texto(es, 'entero', '3.5'), '4'); // las mitades, lejos del cero
  assert.equal(texto(es, 'entero', '10 / 1'), '10');
  assert.equal(texto(es, 'entero', '-1234.5'), '-1.235');
  assert.equal(texto(es, 'entero', '-0.2'), '0');
  assert.equal(texto(es, 'entero', '3000000000'), '3.000.000.000');
  assert.equal(texto(es, 'entero', 'nil'), '0');
  assert.equal(texto(es, 'entero', '0/0'), '0');
  sinErrores(es);
  const en = nuevaMaquina(EN);
  assert.equal(texto(en, 'entero', '2054.4'), '2,054');
  assert.equal(texto(en, 'entero', '1234567'), '1,234,567');
  assert.equal(texto(en, 'entero', '-1234.5'), '-1,235');
  sinErrores(en);
});

// Un paso con los elementos dados, ya cargado, y el resumen de su paso vivo.
function resumen(elementos, opciones = ES) {
  const m = nuevaMaquina(opciones);
  m.ponerGuia(guiaDePrueba([{ elementos }]));
  m.lua(`SnetForever.Motor.cargar(${aLua('Prueba\\01-60 Guía de prueba')})`);
  return { m, texto: m.lua('SnetForever.Texto.resumenPaso(SnetForever.Motor.paso(1))') };
}

test('resumenPaso: el primer elemento con texto, sin colores, ni iconos, ni saltos', () => {
  const { m, texto: r } = resumen([
    { t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'flecha' },
    { t: 'nota', texto: { en: 'x', es: '|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con |cRXP_FRIENDLY_Gornek|r\\nluego vuelve' } },
    { t: 'accept', q: 4641 },
  ]);
  assert.equal(r, 'Habla con Gornek luego vuelve');
  sinErrores(m);
});

test('resumenPaso: sin textos de los datos se usa el generado, antes que el goto', () => {
  const { m, texto: r } = resumen([{ t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'flecha' }, { t: 'accept', q: 4641 }]);
  assert.equal(r, 'Acepta Tu lugar en el mundo');
  const { m: m2, texto: solo } = resumen([{ t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'flecha' }]);
  assert.match(solo, /\(40, 40\)/);
  const { m: m3, texto: vacio } = resumen([{ t: 'mob', npcs: [] }]);
  assert.equal(vacio, '');
  sinErrores(m);
  sinErrores(m2);
  sinErrores(m3);
});

test('resumenPaso: un texto de 100 caracteres da 60; los acentos no se parten', () => {
  const largo = 'a'.repeat(100);
  const { m, texto: r } = resumen([{ t: 'nota', texto: { en: largo, es: largo } }]);
  assert.equal(r.length, 60);
  const acentos = 'ñ'.repeat(100);
  const { m: m2, texto: r2 } = resumen([{ t: 'nota', texto: { en: acentos, es: acentos } }]);
  assert.equal(r2.length, 60);
  assert.ok(!r2.includes('�'));
  const justo = 'b'.repeat(60);
  const { m: m3, texto: r3 } = resumen([{ t: 'nota', texto: { en: justo, es: justo } }]);
  assert.equal(r3, justo);
  sinErrores(m);
  sinErrores(m2);
  sinErrores(m3);
});

test('Motor.resumir es Texto.resumenPaso al cargar; «Saltar» guarda ese resumen', () => {
  const m = nuevaMaquina(ES);
  assert.equal(m.lua('SnetForever.Motor.resumir == SnetForever.Texto.resumenPaso'), true);
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 4641 }] }, { elementos: [{ t: 'manual' }] }]));
  m.lua(`SnetForever.Motor.cargar(${aLua('Prueba\\01-60 Guía de prueba')})`);
  m.lua('SnetForever.Motor.saltar(1)');
  assert.equal(m.lua('SnetForeverPJ.saltados[1].resumen'), 'Acepta Tu lugar en el mundo');
  sinErrores(m);
});

// Texto.icono(el, mem) -> ruta, recorte de un elemento dado en Lua.
const icono = (m, elementoLua) => m.lua(`(SnetForever.Texto.icono(${elementoLua}))`);

const TABLA_ICONOS = {
  accept: 'Interface\\GossipFrame\\AvailableQuestIcon',
  turnin: 'Interface\\GossipFrame\\ActiveQuestIcon',
  dailyturnin: 'Interface\\GossipFrame\\ActiveQuestIcon',
  collect: 'Interface\\GossipFrame\\VendorGossipIcon',
  hs: 'Interface\\Minimap\\Tracking\\Innkeeper',
  home: 'Interface\\Minimap\\Tracking\\Innkeeper',
  fp: 'Interface\\Minimap\\Tracking\\FlightMaster',
  fly: 'Interface\\Minimap\\Tracking\\FlightMaster',
  train: 'Interface\\GossipFrame\\TrainerGossipIcon',
  trainer: 'Interface\\GossipFrame\\TrainerGossipIcon',
  vendor: 'Interface\\GossipFrame\\VendorGossipIcon',
  stable: 'Interface\\Minimap\\Tracking\\StableMaster',
  xp: 'Interface\\Icons\\INV_Misc_Book_09',
  ['goto']: 'Interface\\Icons\\INV_Misc_Map_01',
};

test('icono: un icono de Blizzard por tipo de elemento (tabla b.4)', () => {
  const m = nuevaMaquina(ES);
  for (const [t, ruta] of Object.entries(TABLA_ICONOS)) assert.equal(icono(m, `{t = ${aLua(t)}}`), ruta, t);
  for (const t of ['nota', 'mob', 'target', 'abandon', 'skill', 'manual']) {
    assert.equal(icono(m, `{t = ${aLua(t)}}`), undefined, t);
  }
  assert.equal(icono(m, 'nil'), undefined);
  assert.equal(icono(m, '{}'), undefined);
  sinErrores(m);
});

test('icono: el goto va recortado a 0,08-0,92 y el resto sin recorte', () => {
  const m = nuevaMaquina(ES);
  assert.deepEqual(m.lua('{SnetForever.Texto.icono({t = "goto"})}'), [
    'Interface\\Icons\\INV_Misc_Map_01', 0.08, 0.92, 0.08, 0.92,
  ]);
  assert.deepEqual(m.lua('{SnetForever.Texto.icono({t = "accept"})}'), ['Interface\\GossipFrame\\AvailableQuestIcon']);
  sinErrores(m);
});

test('icono: un complete de monstruo da espadas, de objeto de misión da bolsa y de otro tipo el sanador', () => {
  const quiero = {
    monster: 'Interface\\GossipFrame\\BattleMasterGossipIcon',
    item: 'Interface\\GossipFrame\\VendorGossipIcon',
    object: 'Interface\\GossipFrame\\HealerGossipIcon',
    event: 'Interface\\GossipFrame\\HealerGossipIcon',
  };
  for (const [tipo, ruta] of Object.entries(quiero)) {
    const m = nuevaMaquina(ES);
    m.estadoMision(788, { enDiario: true, objetivos: [{ texto: 'Algo: 0/3', hecho: 0, pedido: 3, terminado: false, tipo }] });
    assert.equal(icono(m, '{t = "complete", q = 788, objetivo = 1}'), ruta, tipo);
    sinErrores(m);
  }
});

test('icono: un complete sin tipo del juego usa el de la base; sin ningún dato, el sanador', () => {
  const m = nuevaMaquina(ES);
  // 5555 no está en la base; 788 sí (su primer objetivo es una criatura). El cliente de Forever no trae `type`.
  for (const q of [5555, 788]) {
    m.estadoMision(q, { enDiario: true, objetivos: [{ texto: 'Algo: 0/3', hecho: 0, pedido: 3, terminado: false }] });
  }
  m.lua(`local original = C_QuestLog.GetQuestObjectives
    C_QuestLog.GetQuestObjectives = function(q)
      local lista = original(q)
      for _, o in ipairs(lista) do o.type = nil end
      return lista
    end`);
  assert.equal(icono(m, '{t = "complete", q = 5555, objetivo = 1}'), 'Interface\\GossipFrame\\HealerGossipIcon');
  assert.equal(icono(m, '{t = "complete", q = 788, objetivo = 1}'), 'Interface\\GossipFrame\\BattleMasterGossipIcon');
  assert.equal(icono(m, '{t = "complete", q = 99999}'), 'Interface\\GossipFrame\\HealerGossipIcon');
  sinErrores(m);
});

test('icono: use, equip y destroy llevan el icono del objeto; sin él, el signo de interrogación', () => {
  const m = nuevaMaquina(ES);
  const sin = 'Interface\\Icons\\INV_Misc_QuestionMark';
  m.lua('BANCO.iconosItem[6948] = 134414');
  for (const t of ['use', 'equip', 'destroy']) {
    const el = t === 'use' ? '{t = "use", is = {6948}}' : `{t = "${t}", i = 6948}`;
    assert.equal(icono(m, el), 134414, t);
    const otro = t === 'use' ? '{t = "use", is = {1}}' : `{t = "${t}", i = 1}`;
    assert.equal(icono(m, otro), sin, t);
  }
  assert.equal(icono(m, '{t = "equip"}'), sin);
  const viejo = nuevaMaquina({ ...ES, sinApi: ['C_Item.GetItemIconByID'] });
  assert.equal(icono(viejo, '{t = "destroy", i = 6948}'), sin);
  sinErrores(m);
  sinErrores(viejo);
});

test('icono: el del objeto se pide por SNF.API.iconoObjeto (sin API ni objeto en caché da nil, sin error)', () => {
  const m = nuevaMaquina(ES);
  m.lua('BANCO.iconosItem[6948] = 134414');
  assert.equal(m.lua('SnetForever.API.iconoObjeto(6948)'), 134414);
  assert.equal(m.lua('SnetForever.API.iconoObjeto(1)'), undefined);
  // La ventana usa la capa: con la capa cambiada, sale lo que ella diga.
  m.lua('SnetForever.API.iconoObjeto = function(id) return id == 6948 and 999 or nil end');
  assert.equal(icono(m, '{t = "destroy", i = 6948}'), 999);
  const viejo = nuevaMaquina({ ...ES, sinApi: ['C_Item.GetItemIconByID'] });
  assert.equal(viejo.lua('SnetForever.API.iconoObjeto(6948)'), undefined);
  viejo.lua('C_Item.GetItemIconByID = function() error("objeto sin cargar") end');
  assert.equal(viejo.lua('SnetForever.API.iconoObjeto(6948)'), undefined);
  sinErrores(m);
  sinErrores(viejo);
});

test('icono: «Habla con» y «Talk to» en nota o manual y los gossipoption llevan el bocadillo', () => {
  const bocadillo = 'Interface\\WorldMap\\ChatBubble_64Grey';
  const m = nuevaMaquina(ES);
  const el = (t, es, en = es) => `{t = "${t}", texto = {es = ${aLua(es)}, en = ${aLua(en)}}}`;
  assert.equal(icono(m, el('nota', 'Habla con |cRXP_FRIENDLY_Gornek|r')), bocadillo);
  assert.equal(icono(m, el('manual', 'habla con Gornek')), bocadillo);
  assert.equal(icono(m, el('gossipoption', 'Elige la opción')), bocadillo);
  assert.equal(icono(m, el('nota', 'Cuidado con el perro', 'Talk to Gornek')), undefined);
  const en = nuevaMaquina(EN);
  assert.equal(icono(en, el('nota', 'Habla con Gornek', 'Talk to |cRXP_FRIENDLY_Gornek|r')), bocadillo);
  sinErrores(m);
  sinErrores(en);
});

test('icono: una nota que ya trae el bocadillo en su texto no lleva icono doble', () => {
  const m = nuevaMaquina(ES);
  const con = '|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con Gornek';
  assert.equal(icono(m, `{t = "nota", texto = {es = ${aLua(con)}, en = ${aLua(con)}}}`), undefined);
  assert.equal(icono(m, `{t = "manual", texto = {es = ${aLua(con.toUpperCase())}, en = "x"}}`), undefined);
  sinErrores(m);
});

// Texto.lineasPaso del paso 1 de una guía con los elementos dados.
function lineas(elementos, max, opciones = ES, preparar) {
  const m = nuevaMaquina(opciones);
  if (preparar) preparar(m);
  m.ponerGuia(guiaDePrueba([{ elementos }]));
  m.lua(`SnetForever.Motor.cargar(${aLua('Prueba\\01-60 Guía de prueba')})`);
  const arg = max === undefined ? '' : `, ${max}`;
  return { m, lineas: m.lua(`SnetForever.Texto.lineasPaso(SnetForever.Motor.paso(1)${arg})`) };
}

test('lineasPaso: accept, turnin y una nota salen con su icono, su texto y en orden', () => {
  const { m, lineas: ls } = lineas([
    { t: 'accept', q: 4641 },
    { t: 'nota', texto: { en: 'Talk to Gornek', es: 'Habla con |cRXP_FRIENDLY_Gornek|r' } },
    { t: 'turnin', q: 4641 },
    { t: 'nota', texto: { en: 'Be careful', es: 'Ojo con el perro' } },
  ]);
  assert.equal(ls.length, 4);
  assert.deepEqual(ls[0], { icono: 'Interface\\GossipFrame\\AvailableQuestIcon', texto: 'Acepta Tu lugar en el mundo', sangria: 0 });
  assert.deepEqual(ls[1], { icono: 'Interface\\WorldMap\\ChatBubble_64Grey', texto: 'Habla con |cFF00FF25Gornek|r', sangria: 0 });
  assert.deepEqual(ls[2], { icono: 'Interface\\GossipFrame\\ActiveQuestIcon', texto: 'Entrega Tu lugar en el mundo', sangria: 0 });
  // Una línea sin icono se sangra el ancho del icono (12) y su espacio (4) para alinear el texto.
  assert.deepEqual(ls[3], { texto: 'Ojo con el perro', sangria: 16 });
  sinErrores(m);
});

test('lineasPaso: la línea con el bocadillo ya en su texto no duplica el icono y va en una sola línea', () => {
  const con = '|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con Gornek\\nluego vuelve';
  const { m, lineas: ls } = lineas([{ t: 'nota', texto: { en: 'x', es: con } }]);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].icono, undefined);
  assert.equal(ls[0].texto, '|Tinterface/worldmap/chatbubble_64grey.blp:20|tHabla con Gornek luego vuelve');
  sinErrores(m);
});

test('lineasPaso: un complete de monstruo sale con espadas y los elementos sin texto no salen', () => {
  const { m, lineas: ls } = lineas(
    [{ t: 'mob', npcs: [] }, { t: 'complete', q: 788, objetivo: 1 }, { t: 'target', npcs: [] }],
    undefined,
    ES,
    (mq) => mq.estadoMision(788, { enDiario: true, objetivos: [{ texto: 'Jabalí: 3/10', hecho: 3, pedido: 10, terminado: false, tipo: 'monster' }] }),
  );
  assert.equal(ls.length, 1);
  assert.equal(ls[0].icono, 'Interface\\GossipFrame\\BattleMasterGossipIcon');
  assert.equal(ls[0].texto, 'Jabalí: 3/10');
  sinErrores(m);
});

test('Texto.icono: el tipo de un objetivo se guarda en caché por (q, k) cuando se sabe (revisión de D2)', () => {
  const m = nuevaMaquina(ES);
  m.lua(`SnetForever.PREGUNTAS = 0
  local original = SnetForever.Misiones.objetivo
  SnetForever.Misiones.objetivo = function(...) SnetForever.PREGUNTAS = SnetForever.PREGUNTAS + 1; return original(...) end`);
  // Sin datos del objetivo todavía: no se guarda nada y se vuelve a preguntar.
  m.lua('SnetForever.Texto.icono({t = "complete", q = 77777, objetivo = 1}); SnetForever.Texto.icono({t = "complete", q = 77777, objetivo = 1})');
  assert.equal(m.lua('SnetForever.PREGUNTAS'), 2);
  m.estadoMision(788, { enDiario: true, objetivos: [{ texto: 'Jabalí: 3/10', hecho: 3, pedido: 10, terminado: false, tipo: 'monster' }] });
  for (let i = 0; i < 3; i++) {
    assert.equal(m.lua('SnetForever.Texto.icono({t = "complete", q = 788, objetivo = 1})'), 'Interface\\GossipFrame\\BattleMasterGossipIcon');
  }
  assert.equal(m.lua('SnetForever.PREGUNTAS'), 3, 'una sola pregunta para (788, 1)');
  sinErrores(m);
});

test('lineasPaso: el recorrido (goto) solo sale si el paso no tiene otras líneas', () => {
  const { m, lineas: ls } = lineas([{ t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'flecha' }, { t: 'accept', q: 4641 }]);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].icono, 'Interface\\GossipFrame\\AvailableQuestIcon');
  const { m: m2, lineas: solo } = lineas([{ t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'flecha' }]);
  assert.equal(solo.length, 1);
  assert.equal(solo[0].icono, 'Interface\\Icons\\INV_Misc_Map_01');
  assert.match(solo[0].texto, /\(40, 40\)/);
  sinErrores(m);
  sinErrores(m2);
});

test('lineasPaso: con más líneas que max se corta y acaba en «…»; sin max salen todas', () => {
  const notas = [1, 2, 3, 4, 5, 6].map((n) => ({ t: 'nota', texto: { en: `Línea ${n}`, es: `Línea ${n}` } }));
  const { m, lineas: ls } = lineas(notas, 4);
  assert.equal(ls.length, 5);
  assert.deepEqual(ls.slice(0, 4).map((l) => l.texto), ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4']);
  assert.deepEqual(ls[4], { texto: '…', sangria: 16 });
  const { m: m2, lineas: justo } = lineas(notas.slice(0, 4), 4);
  assert.equal(justo.length, 4);
  assert.ok(justo.every((l) => l.texto !== '…'));
  const { m: m3, lineas: todas } = lineas(notas);
  assert.equal(todas.length, 6);
  sinErrores(m);
  sinErrores(m2);
  sinErrores(m3);
});

test('lineasPaso: un paso sin elementos con texto da una lista vacía', () => {
  const { m, lineas: ls } = lineas([{ t: 'mob', npcs: [] }]);
  assert.deepEqual(ls, []);
  sinErrores(m);
});

test('iconoRequisito: ok, falta y aviso', () => {
  const m = nuevaMaquina(ES);
  assert.equal(texto(m, 'iconoRequisito', aLua('ok')), 'Interface\\RaidFrame\\ReadyCheck-Ready');
  assert.equal(texto(m, 'iconoRequisito', aLua('falta')), 'Interface\\RaidFrame\\ReadyCheck-NotReady');
  assert.equal(texto(m, 'iconoRequisito', aLua('aviso')), 'Interface\\RaidFrame\\ReadyCheck-Waiting');
  sinErrores(m);
});

test('las claves de textos/es.lua y textos/en.lua de este archivo existen en los dos idiomas', () => {
  const m = nuevaMaquina(ES);
  const faltan = m.lua(`(function()
    local falta = {}
    for clave in pairs(SnetForever.L.tablas.es) do
      if SnetForever.L.tablas.en[clave] == nil then falta[#falta + 1] = "en:" .. clave end
    end
    for clave in pairs(SnetForever.L.tablas.en) do
      if SnetForever.L.tablas.es[clave] == nil then falta[#falta + 1] = "es:" .. clave end
    end
    table.sort(falta)
    return falta
  end)()`);
  assert.deepEqual(faltan, []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Contrato con los datos reales: ningún texto de las guías sale con un marcador sin convertir ni da error.
// ---------------------------------------------------------------------------------------------------

const PASADA = `(function()
  local Texto = SnetForever.Texto
  local malos, errores, nElementos, nTextos = {}, 0, 0, 0
  local function mirar(guia, el, s)
    nTextos = nTextos + 1
    if type(s) ~= "string" then
      errores = errores + 1
      if #malos < 12 then malos[#malos + 1] = "no es texto: " .. guia .. " línea " .. tostring(el.linea) end
      return
    end
    if string.find(s, "RXP_", 1, true) or string.find(s, "::%d") or string.find(s, "\\\\n", 1, true)
        or string.find(s, "*quest*", 1, true) then
      if #malos < 12 then malos[#malos + 1] = guia .. " línea " .. tostring(el.linea) .. ": " .. s end
    end
  end
  for clave, guia in pairs(SNF_RUTAS.guias) do
    for _, paso in ipairs(guia.pasos) do
      for _, el in ipairs(paso.elementos) do
        nElementos = nElementos + 1
        local ok, s = pcall(Texto.deElemento, el, nil)
        if not ok then
          errores = errores + 1
          if #malos < 12 then malos[#malos + 1] = "error en " .. clave .. " línea " .. tostring(el.linea) .. ": " .. tostring(s) end
        else
          mirar(clave, el, s)
        end
      end
    end
  end
  return {malos = malos, errores = errores, elementos = nElementos, textos = nTextos}
end)()`;

for (const idioma of ['es', 'en']) {
  test(`contrato (${idioma}): todos los textos de todas las guías reales salen limpios`, { skip: hayDatos ? false : 'sin datos de la fase 1' }, () => {
    const m = nuevaMaquina({
      datos: [TOC_RUTAS, TOC_MISIONES],
      guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma } } },
    });
    const r = m.lua(PASADA);
    assert.ok(r.elementos > 50000, `solo ${r.elementos} elementos`);
    assert.deepEqual(r.malos, [], `quedan marcadores o hay errores (${r.errores} errores)`);
    assert.equal(r.errores, 0);
    sinErrores(m);
  });
}

test('contrato: los resúmenes de todos los pasos de varias guías reales son cortos y limpios', { skip: hayDatos ? false : 'sin datos de la fase 1' }, () => {
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  const r = m.lua(`(function()
    local Texto = SnetForever.Texto
    local claves = SnetForever.Datos.claves()
    local malos, n, vacios = {}, 0, 0
    for i = 1, #claves, 7 do
      local guia = SnetForever.Datos.guia(claves[i])
      for _, paso in ipairs(guia.pasos) do
        local elementos = {}
        for k, el in ipairs(paso.elementos) do elementos[k] = {datos = el, mem = {}} end
        local ok, s = pcall(Texto.resumenPaso, {elementos = elementos})
        n = n + 1
        if not ok or type(s) ~= "string" or #s > 70 or string.find(s, "|", 1, true) or string.find(s, "RXP_", 1, true) then
          if #malos < 10 then malos[#malos + 1] = claves[i] .. " paso " .. tostring(paso.n) .. ": " .. tostring(s) end
        end
        if s == "" then vacios = vacios + 1 end
      end
    end
    return {malos = malos, n = n, vacios = vacios}
  end)()`);
  assert.ok(r.n > 500, `solo ${r.n} pasos`);
  assert.deepEqual(r.malos, []);
  sinErrores(m);
});

// Datos reales (Dungeon Guide (A)\15-17 Darkshore): el español de RestedXP trae «!|==|r». Un «|» suelto se escapa al
// pintar y desaparece del resumen.
test('un «|» suelto se escapa al colorear y no queda en el resumen', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Texto.colorear("a !|==|r b")'), 'a !||==|r b');
  assert.equal(m.lua('SnetForever.Texto.colorear("x||y |cffffffffz|r")'), 'x||y |cffffffffz|r');
  assert.equal(m.lua('SnetForever.Texto.colorear("fin|")'), 'fin||');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T2: una entrega a medias enseña los objetivos con su progreso
// ---------------------------------------------------------------------------------------------------

// La misión inventada 97901, en el diario y sin completar, con dos objetivos tal como los da el juego.
function aMedias(opciones = ES) {
  const m = nuevaMaquina(opciones);
  m.datoMision(97901, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5, objectives: [] });
  m.estadoMision(97901, { enDiario: true, completa: false, objetivos: [
    { texto: 'Raíz de prueba: 1/3', hecho: 1, pedido: 3, terminado: false },
    { texto: 'Pluma de prueba', hecho: 2, pedido: 2, terminado: true },
  ] });
  return m;
}

test('T2: el texto de una entrega a medias dice que hay que completarla y cada objetivo con su hecho/pedido', () => {
  const m = aMedias();
  assert.equal(deElemento(m, '{t = "turnin", q = 97901}'),
    'Completa «Misión inventada» antes de entregarla:\n- Raíz de prueba: 1/3\n- Pluma de prueba: 2/2');
  // También manda sobre el texto que trae la guía («Entrega …»).
  assert.equal(deElemento(m, '{t = "turnin", q = 97901, texto = {es = "Entrega la misión de prueba", en = "Turn in"}}'),
    'Completa «Misión inventada» antes de entregarla:\n- Raíz de prueba: 1/3\n- Pluma de prueba: 2/2');
  const en = aMedias(EN);
  assert.equal(deElemento(en, '{t = "turnin", q = 97901}'),
    'Complete “Misión inventada” before turning it in:\n- Raíz de prueba: 1/3\n- Pluma de prueba: 2/2');
  sinErrores(m);
  sinErrores(en);
});

test('T2: el texto sigue al juego: un objetivo que avanza se ve; completa, vuelve a «Entrega …» (o al de la guía)', () => {
  const m = aMedias();
  const el = '(function() EL = rawget(_G, "EL") or {t = "turnin", q = 97901, texto = {es = "Entrega la misión de prueba", en = "x"}} return EL end)()';
  assert.match(deElemento(m, el), /Raíz de prueba: 1\/3/);
  m.estadoMision(97901, { objetivos: [
    { texto: 'Raíz de prueba: 2/3', hecho: 2, pedido: 3, terminado: false },
    { texto: 'Pluma de prueba', hecho: 2, pedido: 2, terminado: true },
  ] });
  assert.match(deElemento(m, el), /Raíz de prueba: 2\/3/, 'la memoria del texto no se queda con el 1/3');
  m.estadoMision(97901, { completa: true, objetivos: [
    { texto: 'Raíz de prueba: 3/3', hecho: 3, pedido: 3, terminado: true },
    { texto: 'Pluma de prueba', hecho: 2, pedido: 2, terminado: true },
  ] });
  assert.equal(deElemento(m, el), 'Entrega la misión de prueba');
  assert.equal(deElemento(m, '{t = "turnin", q = 97901}'), 'Entrega Misión inventada');
  sinErrores(m);
});

test('T2: en la lista (lineasPaso) y en el resumen, la entrega a medias sale con el texto corto', () => {
  const { m, lineas: ls } = lineas([{ t: 'turnin', q: 97901 }], undefined, ES, (mq) => {
    mq.datoMision(97901, { name: 'Misión inventada', requiredLevel: 1, questLevel: 5, objectives: [] });
    mq.estadoMision(97901, { enDiario: true, objetivos: [{ texto: 'Raíz de prueba: 1/3', hecho: 1, pedido: 3, terminado: false }] });
  });
  assert.deepEqual(ls, [{ icono: 'Interface\\GossipFrame\\ActiveQuestIcon', texto: 'Completa «Misión inventada» antes de entregarla', sangria: 0 }]);
  assert.match(m.lua('SnetForever.Texto.resumenPaso(SnetForever.Motor.paso(1))'), /^Completa «Misión inventada» antes de entregarla/);
  sinErrores(m);
});

test('T2 ronda 1: con la casilla de la entrega marcada a mano, el texto no dice «Completa…»', () => {
  const m = aMedias();
  const el = '(function() EL = rawget(_G, "EL") or {t = "turnin", q = 97901} return EL end)()';
  assert.match(deElemento(m, el), /^Completa/);
  assert.equal(deElemento(m, el, '{forzado = true}'), 'Entrega Misión inventada');
  assert.match(deElemento(m, el, '{}'), /^Completa/, 'sin la marca, otra vez');
  sinErrores(m);
});
