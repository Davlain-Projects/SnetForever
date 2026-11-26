// Fase 4, tarea 16c (parte del addon): rutas de zona de la IA como guía lateral. ia/ruta.lua (proponerGuia,
// aceptarGuia, guiasIA, quitarGuia), Datos.guia / Datos.claves con SnetForeverPJ.ia.guias, motor/guias.lua (tipo «ia»),
// la sección «Rutas de la IA» del menú de la ventana y la fila de propuesta del chat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGuideDetails as nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';
import { comprobarLua51 } from '../src/comprobar-lua51.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(AQUI, '..', 'fixtures');
const ADDON = join(AQUI, '..', '..', '..', 'addons', 'SnetForever');
const DATOS = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'laterales-mini.lua')];

const INICIO = 'Prueba (H)\\01-02 Inicio';
const CLAVE = 'IA\\Ruta de Durotar (Horda)';
const DRUIDA = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 };
const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const CH = 'SnetForever.Chat';
const MC = `${CH}.marcos`;
const R = 'SnetForever.Ruta';

// Una guía de ruta de zona con el formato del contrato (3 misiones: 7001 y 7002 de la zona, la 7003 sigue a la 7001).
function guiaIA(extra = {}) {
  return {
    clave: CLAVE, tipo: 'ia', sinVerificar: true, grupo: 'IA', nombre: 'Ruta de Durotar (Horda)',
    titulo: { es: 'Ruta de Durotar (Horda)', en: 'Durotar route (Horde)' }, faccion: 'Horde',
    niveles: { min: 5, max: 12 }, siguientes: [], mazmorras: {}, fuente: { archivo: 'ia', linea: 0 },
    resumen: { misiones: 3, pasos: 4, elites: 0, grupo: 0 },
    pasos: [
      { id: 'ia1', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [
        { t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' },
        { t: 'accept', q: 7001 },
        { t: 'accept', q: 7002 },
      ] },
      { id: 'ia2', n: 2, etiquetas: {}, requisitos: [], linea: 0, elementos: [
        { t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'flecha', objetivo: 'Jabalí' },
        { t: 'complete', q: 7001, objetivo: 1 },
      ] },
      { id: 'ia3', n: 3, etiquetas: {}, requisitos: [], linea: 0, elementos: [
        { t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' },
        { t: 'turnin', q: 7001 },
        { t: 'isQuestTurnedIn', qs: [7002] },
      ] },
    ],
    ...extra,
  };
}

function maquina(opciones = {}) {
  return nuevaMaquina({ datos: DATOS, jugador: DRUIDA, ...opciones });
}

function conVentana(opciones = {}) {
  const m = maquina(opciones);
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  m.lua(`${V}.crear()`);
  return m;
}

const proponer = (m, g) => m.lua(`${R}.proponerGuia(${aLua(g)})`);
const aceptar = (m) => m.lua(`${R}.aceptarGuia()`);
const claves = (m) => m.lua(`${R}.guiasIA()`);
const estado = (m) => m.lua('SnetForever.Motor.estado()');
const pj = (m) => m.lua('SnetForeverPJ');
const impresosSistema = (m) => (m.lua(`(function()
  local s, t = ${MC}.mensajes, {}
  for i = 1, s:GetNumMessages() do t[i] = (s:GetMessageInfo(i)) end
  return t
end)()`) || []).map((s) => String(s).replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, ''));

// Cuenta los mensajes internos `evento` y guarda el último argumento.
function contar(m, evento) {
  m.lua(`CUENTA_${evento} = {n = 0}
  SnetForever.Eventos.escuchar("${evento}", function(a) CUENTA_${evento}.n = CUENTA_${evento}.n + 1; CUENTA_${evento}.ultimo = a end)`);
  return () => m.lua(`CUENTA_${evento}`);
}

const abrirGuias = (m) => m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');
const filasMenu = (m) => m.lua(`(function() local t = {}
  for _, f in ipairs(${M}.menu.filas) do if f:IsVisible() then t[#t + 1] = f.texto:GetText() end end
  return t end)()`) || [];
function pulsarMenu(m, buscado, boton) {
  const ok = m.lua(`(function()
    for _, fila in ipairs(${M}.menu.filas) do
      if fila:IsVisible() and fila.texto:GetText() == ${aLua(buscado)} then fila:Click(${aLua(boton)}); return true end
    end
    return false
  end)()`);
  assert.ok(ok, `no hay en el menú una fila «${buscado}»: ${filasMenu(m).join(' | ')}`);
}

// ---------------------------------------------------------------------------------------------------
// Proponer, aceptar y abrir como lateral
// ---------------------------------------------------------------------------------------------------

test('proponerGuia deja la guía pendiente y emite SNF_IA_PROPUESTA_GUIA; no guarda ni abre nada', () => {
  const m = maquina();
  const emitidos = contar(m, 'SNF_IA_PROPUESTA_GUIA');
  assert.equal(proponer(m, guiaIA()), true);
  assert.equal(emitidos().n, 1);
  assert.equal(m.lua(`${R}.guiaPendiente().clave`), CLAVE);
  assert.deepEqual(claves(m), []);
  assert.equal(m.lua('SnetForever.Datos.guia(' + aLua(CLAVE) + ')'), undefined);
  assert.equal(m.lua('SnetForever.Ruta == SnetForever.RutaIA'), true);
  sinErrores(m);
});

test('aceptarGuia la guarda en SnetForeverPJ.ia.guias, la abre como lateral y «Volver» devuelve a la principal', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  assert.equal(aceptar(m), true);
  assert.equal(m.lua(`${R}.guiaPendiente()`), undefined);
  assert.equal(m.lua(`SnetForeverPJ.ia.guias[${aLua(CLAVE)}].tipo`), 'ia');
  assert.deepEqual(claves(m), [CLAVE]);
  assert.equal(estado(m).clave, CLAVE);
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(pj(m).lateral, CLAVE);
  assert.equal(m.lua(`SnetForever.Guias.esLateral(${aLua(CLAVE)})`), true);
  // La ventana la enseña como lateral, con «sin verificar» y «Volver a …».
  assert.equal(m.lua(`${M}.estado.volver:IsVisible()`), true);
  assert.equal(m.lua(`${M}.estado.volver.texto:GetText()`), 'Volver a 1-2 Inicio (paso 1)');
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(pj(m).volverA, undefined);
  sinErrores(m);
});

test('la guía de la IA no sale en el selector principal ni como guía por defecto, y la IA no se mezcla con las laterales de los datos', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  for (const g of m.lua('SnetForever.Guias.disponibles()')) assert.ok(!g.claves.includes(CLAVE), g.grupo);
  assert.notEqual(m.lua('SnetForever.Guias.porDefecto()'), CLAVE);
  for (const tipo of ['cadena', 'profesion', 'mazmorra']) assert.ok(!m.lua(`SnetForever.Guias.laterales(${aLua(tipo)})`).includes(CLAVE));
  sinErrores(m);
});

test('un paso de misión ya entregada se da por hecho (accept, turnin y isQuestTurnedIn)', () => {
  const m = conVentana();
  m.estadoMision(7001, { entregada: true });
  m.estadoMision(7002, { entregada: true });
  proponer(m, guiaIA());
  aceptar(m);
  // Con todas entregadas, el motor pasa de largo los tres pasos (uno por ciclo) y la guía acaba.
  m.avanzar(1);
  assert.equal(estado(m).fin, true);
  sinErrores(m);
});

test('con solo la 7001 entregada se da por hecho su «recoger» y se sigue en lo que falta', () => {
  const m = conVentana();
  m.estadoMision(7001, { entregada: true });
  proponer(m, guiaIA());
  aceptar(m);
  assert.equal(estado(m).fin, false);
  const actual = m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).id');
  // El paso 1 tiene accept 7001 (hecho) y accept 7002 (pendiente): sigue ahí; el 7001 está hecho.
  assert.equal(actual, 'i1');
  assert.equal(m.lua('SnetForever.Motor.paso(1).elementos[2].resultado'), 'hecho');
  sinErrores(m);
});

test('tras recargar() la ruta sigue guardada, sigue en el menú y se puede abrir', () => {
  let m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  m = m.recargar();
  assert.deepEqual(claves(m), [CLAVE]);
  assert.ok(m.lua('SnetForever.Datos.claves()').includes(CLAVE));
  // Se recupera como lateral abierta (volverA se conservó).
  assert.equal(estado(m).clave, CLAVE);
  assert.equal(pj(m).volverA, INICIO);
  m.lua(`${V}.crear()`);
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  abrirGuias(m);
  assert.ok(filasMenu(m).includes('Rutas de la IA'), filasMenu(m).join(' | '));
  pulsarMenu(m, 'Rutas de la IA');
  pulsarMenu(m, 'Ruta de Durotar (Horda)');
  assert.equal(estado(m).clave, CLAVE);
  assert.equal(pj(m).volverA, INICIO);
  sinErrores(m);
});

test('descartarGuia quita la pendiente sin guardar nada', () => {
  const m = maquina();
  proponer(m, guiaIA());
  m.lua(`${R}.descartarGuia()`);
  assert.equal(m.lua(`${R}.guiaPendiente()`), undefined);
  assert.equal(aceptar(m), false);
  assert.deepEqual(claves(m), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Validación y topes
// ---------------------------------------------------------------------------------------------------

test('validación: se quitan los puntos fuera de 0-100 y los ids que no son enteros; el resto se queda', () => {
  const m = maquina();
  const g = guiaIA();
  g.pasos[0].elementos.push({ t: 'goto', mapa: 1411, x: 120, y: 50, modo: 'flecha' });
  g.pasos[0].elementos.push({ t: 'goto', mapa: 1411, x: 50, y: -1, modo: 'flecha' });
  g.pasos[0].elementos.push({ t: 'goto', mapa: 14.5, x: 50, y: 50, modo: 'flecha' });
  g.pasos[0].elementos.push({ t: 'accept', q: 12.5 });
  g.pasos[0].elementos.push({ t: 'accept', q: 'siete' });
  g.pasos[0].elementos.push({ t: 'isQuestTurnedIn', qs: [7002, 3.5, 'x'] });
  proponer(m, g);
  const p = m.lua(`${R}.guiaPendiente()`);
  assert.deepEqual(p.pasos[0].elementos.map((e) => e.t), ['goto', 'accept', 'accept', 'isQuestTurnedIn']);
  assert.deepEqual(p.pasos[0].elementos[3].qs, [7002]);
  sinErrores(m);
});

test('validación: una clave sin «IA\\» o un tipo que no es «ia» descartan la guía con una línea de sistema', () => {
  const m = conVentana();
  m.lua(`${CH}.mostrar and ${CH}.mostrar()`);
  const avisos = contar(m, 'SNF_IA_AVISO');
  assert.equal(proponer(m, guiaIA({ clave: 'Prueba (H)\\01-02 Inicio' })), false);
  assert.equal(proponer(m, guiaIA({ tipo: 'cadena' })), false);
  assert.equal(m.lua(`${R}.guiaPendiente()`), undefined);
  assert.equal(avisos().n, 2);
  assert.equal(avisos().ultimo, 'IA_GUIA_DESCARTADA');
  sinErrores(m);
});

test('validación: una guía sin pasos (o cuyos pasos se quedan vacíos) se descarta y sale la línea de sistema en el chat', () => {
  const m = nuevaMaquina({ datos: DATOS, jugador: { ...DRUIDA, idioma: 'esES' } });
  m.lua('SlashCmdList.SNET("chat")');
  assert.equal(proponer(m, guiaIA({ pasos: [] })), false);
  const g = guiaIA();
  g.pasos = [{ id: 'a', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [{ t: 'goto', mapa: 1411, x: 500, y: 5, modo: 'flecha' }] }];
  assert.equal(proponer(m, g), false);
  assert.equal(m.lua(`${R}.guiaPendiente()`), undefined);
  const lineas = impresosSistema(m);
  assert.equal(lineas.filter((l) => l.includes('descartado')).length, 2, lineas.join(' | '));
  sinErrores(m);
});

test('topes: 61 misiones quedan en 60, con la línea de recorte; los textos se cortan sin partir UTF-8', () => {
  const m = maquina();
  const avisos = contar(m, 'SNF_IA_AVISO');
  const g = guiaIA();
  g.pasos = [];
  for (let i = 1; i <= 61; i++) {
    g.pasos.push({ id: `p${i}`, n: i, etiquetas: {}, requisitos: [], linea: 0, elementos: [
      { t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'flecha' }, { t: 'accept', q: 8000 + i }] });
  }
  proponer(m, g);
  const p = m.lua(`${R}.guiaPendiente()`);
  const qs = new Set(p.pasos.flatMap((s) => s.elementos.filter((e) => e.t === 'accept').map((e) => e.q)));
  assert.equal(qs.size, 60);
  assert.ok(!qs.has(8061));
  assert.equal(avisos().ultimo, 'IA_GUIA_RECORTADA');
  // Tope de 400 pasos.
  const m2 = maquina();
  const g2 = guiaIA();
  g2.pasos = [];
  for (let i = 1; i <= 450; i++) {
    g2.pasos.push({ id: `p${i}`, n: i, etiquetas: {}, requisitos: [], linea: 0, elementos: [{ t: 'goto', mapa: 1411, x: 40, y: 40, modo: 'flecha' }] });
  }
  proponer(m2, g2);
  assert.equal(m2.lua(`#${R}.guiaPendiente().pasos`), 400);
  // Texto largo con tildes: 120 bytes como mucho y sin partir un carácter.
  const m3 = maquina();
  proponer(m3, guiaIA({ titulo: { es: 'á'.repeat(100), en: 'x' } }));
  const t = m3.lua(`${R}.guiaPendiente().titulo.es`);
  assert.ok(Buffer.byteLength(t) <= 80 && t === 'á'.repeat(t.length / 1) && !t.includes('�'), String(t.length));
  sinErrores(m);
  sinErrores(m2);
  sinErrores(m3);
});

test('topes: se guardan 5 rutas; al guardar la sexta desaparece la más antigua y nada más', () => {
  const m = conVentana();
  const nombres = ['Durotar', 'Mulgore', 'Tirisfal', 'Barrens', 'Silverpine', 'Hillsbrad'];
  for (const z of nombres) {
    proponer(m, guiaIA({ clave: `IA\\Ruta de ${z} (Horda)`, nombre: `Ruta de ${z} (Horda)`, titulo: { es: `Ruta de ${z} (Horda)`, en: z } }));
    aceptar(m);
  }
  const k = claves(m);
  assert.equal(k.length, 5);
  assert.ok(!k.includes('IA\\Ruta de Durotar (Horda)'), 'la más antigua se fue');
  assert.deepEqual(k, nombres.slice(1).map((z) => `IA\\Ruta de ${z} (Horda)`), 'ordenadas por fecha');
  // Lo que no es de la IA sigue ahí.
  assert.ok(m.lua('SnetForever.Datos.claves()').includes(INICIO));
  sinErrores(m);
});

test('volver a guardar la misma clave la sustituye (no cuenta como una nueva); con el paso guardado igual sigue en él (T3) y si no, de cero', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  m.lua('SnetForever.Motor.irA(2)');
  proponer(m, guiaIA({ niveles: { min: 6, max: 13 } }));
  aceptar(m);
  assert.deepEqual(claves(m), [CLAVE]);
  assert.equal(m.lua(`SnetForeverPJ.ia.guias[${aLua(CLAVE)}].niveles.min`), 6);
  assert.equal(estado(m).actual, 2);
  // Con otros elementos en el paso guardado, de cero.
  const otra = guiaIA();
  otra.pasos[1].elementos[1] = { t: 'complete', q: 7002, objetivo: 1 };
  proponer(m, otra);
  aceptar(m);
  assert.deepEqual(claves(m), [CLAVE]);
  assert.equal(estado(m).actual, 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Datos y quitar
// ---------------------------------------------------------------------------------------------------

test('Datos.claves incluye las de la IA y quitarGuia las saca; si era la abierta, se vuelve a la principal sin error', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  assert.ok(m.lua('SnetForever.Datos.claves()').includes(CLAVE));
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(CLAVE)}).clave`), CLAVE);
  assert.equal(estado(m).clave, CLAVE);
  m.lua(`${R}.quitarGuia(${aLua(CLAVE)})`);
  assert.deepEqual(claves(m), []);
  assert.ok(!m.lua('SnetForever.Datos.claves()').includes(CLAVE));
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(CLAVE)})`), undefined);
  assert.equal(estado(m).clave, INICIO);
  assert.equal(pj(m).volverA, undefined);
  sinErrores(m);
});

test('quitar una guía que no es la abierta no cambia la guía en curso; una clave desconocida no da error', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  m.lua(`SnetForever.Ventana.cerrarMenu()`);
  proponer(m, guiaIA({ clave: 'IA\\Ruta de Mulgore (Horda)' }));
  aceptar(m);
  m.lua(`${R}.quitarGuia(${aLua(CLAVE)})`);
  assert.equal(estado(m).clave, 'IA\\Ruta de Mulgore (Horda)');
  m.lua(`${R}.quitarGuia("IA\\\\No existe")`);
  m.lua(`${R}.quitarGuia(nil)`);
  assert.equal(claves(m).length, 1);
  sinErrores(m);
});

test('al recargar con la guía abierta ya quitada del guardado, se vuelve a la principal sin error', () => {
  let m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  m.lua(`SnetForeverPJ.ia.guias = {}`);
  m = m.recargar();
  assert.equal(estado(m).clave, INICIO);
  assert.equal(pj(m).volverA, undefined);
  sinErrores(m);
});

test('Datos.guia: las guías de los datos tienen prioridad si la clave coincide', () => {
  const m = maquina();
  m.lua(`SnetForeverPJ.ia.guias = {[${aLua(INICIO)}] = {clave = ${aLua(INICIO)}, tipo = "ia", pasos = {}, niveles = {min = 1, max = 2}}}`);
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(INICIO)}).tipo`), 'normal');
  assert.equal(m.lua('SnetForever.Datos.claves()').filter((c) => c === INICIO).length, 1);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Menú de guías
// ---------------------------------------------------------------------------------------------------

test('menú: «Rutas de la IA» solo sale si hay alguna; abre su guía y el clic derecho la quita', () => {
  const m = conVentana();
  abrirGuias(m);
  assert.ok(!filasMenu(m).includes('Rutas de la IA'), filasMenu(m).join(' | '));
  m.lua(`${V}.cerrarMenu()`);
  proponer(m, guiaIA());
  aceptar(m);
  m.lua(`SnetForever.Guias.cargar(${aLua(INICIO)})`);
  abrirGuias(m);
  assert.ok(filasMenu(m).includes('Rutas de la IA'), filasMenu(m).join(' | '));
  assert.ok(filasMenu(m).indexOf('Prueba (H)') < filasMenu(m).indexOf('Rutas de la IA'));
  pulsarMenu(m, 'Rutas de la IA');
  assert.ok(filasMenu(m).includes('Ruta de Durotar (Horda)'), filasMenu(m).join(' | '));
  // Clic izquierdo: la abre como lateral y cierra el menú.
  pulsarMenu(m, 'Ruta de Durotar (Horda)');
  assert.equal(estado(m).clave, CLAVE);
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false);
  // Clic derecho: la quita (y como era la abierta, vuelve a la principal).
  abrirGuias(m);
  pulsarMenu(m, 'Ruta de Durotar (Horda)', 'RightButton');
  assert.deepEqual(claves(m), []);
  assert.equal(estado(m).clave, INICIO);
  abrirGuias(m);
  assert.ok(!filasMenu(m).includes('Rutas de la IA'), filasMenu(m).join(' | '));
  sinErrores(m);
});

test('menú: en inglés la sección se llama «AI routes»', () => {
  const m = conVentana({ guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } });
  proponer(m, guiaIA());
  aceptar(m);
  abrirGuias(m);
  assert.ok(filasMenu(m).includes('AI routes'), filasMenu(m).join(' | '));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Fila del chat
// ---------------------------------------------------------------------------------------------------

function conRespuesta(m, campos) {
  const id = m.lua('SnetForever.Envio.estado()').id;
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_REGISTRO", ${aLua({ seq: 1, pj: m.lua('SnetForever.Personaje.clave()'), msg: id, ...campos })})`);
}
function enChat(opciones = {}) {
  const m = nuevaMaquina({ datos: DATOS, jugador: { ...DRUIDA, idioma: 'esES' }, ...opciones });
  m.lua('SnetForever.Guias.cargar(' + aLua(INICIO) + ')');
  m.lua('SlashCmdList.SNET("chat")');
  m.lua(`${MC}.entrada:SetText("hola")`);
  m.lua(`${MC}.entrada:GetScript("OnEnterPressed")(${MC}.entrada)`);
  return m;
}
// T3: la guiaIA con abrirGuiaIA solo se abre sola sin guía cargada o con la cargada acabada (aquí, una de un paso cuya
// misión ya está en el diario).
function conGuiaAcabada(m) {
  m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 4641 }] }]));
  m.estadoMision(4641, { enDiario: true });
  m.lua(`SnetForever.Guias.cargar(${aLua(guiaDePrueba([]).clave)})`);
  m.lua('SnetForever.Motor.actualizar()');
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
}
const respuesta = (m, guiaIAcampo) => conRespuesta(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIAcampo });

test('chat: un registro con guiaIA propone la ruta; «Abrir la ruta» la abre como lateral y la fila se oculta', () => {
  const m = enChat();
  respuesta(m, guiaIA());
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), true);
  assert.equal(m.lua(`${MC}.rutaZona.texto:GetText()`), 'La IA propone la ruta de Durotar: 3 misiones');
  assert.equal(m.lua(`${MC}.rutaZona.abrir.texto:GetText()`), 'Abrir la ruta');
  // Nada se ha abierto sin pulsar.
  assert.equal(estado(m).clave, INICIO);
  assert.deepEqual(claves(m), []);
  m.lua(`${MC}.rutaZona.abrir:Click()`);
  assert.equal(estado(m).clave, CLAVE);
  assert.equal(pj(m).volverA, INICIO);
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), false);
  sinErrores(m);
});

test('chat: «No» descarta la ruta y oculta la fila sin guardar nada', () => {
  const m = enChat();
  respuesta(m, guiaIA());
  m.lua(`${MC}.rutaZona.no:Click()`);
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), false);
  assert.equal(m.lua(`${R}.guiaPendiente()`), undefined);
  assert.deepEqual(claves(m), []);
  assert.equal(estado(m).clave, INICIO);
  sinErrores(m);
});

test('chat: singular y plural de la fila, en español e inglés', () => {
  for (const [idioma, uno, varios] of [
    ['esES', 'La IA propone la ruta de Durotar: 1 misión', 'La IA propone la ruta de Durotar: 2 misiones'],
    ['enUS', 'The AI suggests the Durotar route: 1 quest', 'The AI suggests the Durotar route: 2 quests'],
  ]) {
    for (const [n, esperado] of [[1, uno], [2, varios]]) {
      const m = enChat({ jugador: { ...DRUIDA, idioma } });
      respuesta(m, guiaIA({ resumen: { misiones: n, pasos: 1, elites: 0, grupo: 0 } }));
      assert.equal(m.lua(`${MC}.rutaZona.texto:GetText()`), esperado, idioma);
      sinErrores(m);
    }
  }
});

test('chat: una guiaIA inválida no da fila y deja la línea de sistema', () => {
  const m = enChat();
  respuesta(m, guiaIA({ clave: 'Otra\\cosa' }));
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), false);
  assert.ok(impresosSistema(m).some((l) => l.includes('descartado')), impresosSistema(m).join(' | '));
  sinErrores(m);
});

test('chat: la fila nueva cabe en la ventana junto a las otras propuestas', () => {
  const m = enChat();
  respuesta(m, guiaIA());
  const caja = (n) => m.lua(`(function() local f = ${MC}.${n}; return {f:GetLeft(), f:GetRight(), f:GetTop(), f:GetBottom()} end)()`);
  const raiz = m.lua('{SnetForeverChat:GetLeft(), SnetForeverChat:GetRight(), SnetForeverChat:GetTop(), SnetForeverChat:GetBottom()}');
  const c = caja('rutaZona');
  assert.ok(c[0] >= raiz[0] && c[1] <= raiz[1] && c[2] <= raiz[2] && c[3] >= raiz[3], JSON.stringify({ c, raiz }));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Lua 5.1
// ---------------------------------------------------------------------------------------------------

test('los archivos tocados siguen siendo Lua 5.1', () => {
  for (const f of ['ia/ruta.lua', 'ia/contexto.lua', 'ia/envio.lua', 'motor/viaje.lua', 'nucleo/datos.lua', 'motor/guias.lua', 'ui/chat.lua', 'ui/ventana.lua', 'textos/es.lua', 'textos/en.lua']) {
    const problemas = comprobarLua51(readFileSync(join(ADDON, f), 'utf8'), f);
    assert.deepEqual(problemas, [], `${f}: ${JSON.stringify(problemas)}`);
  }
});

// ---------------------------------------------------------------------------------------------------
// Ronda 1
// ---------------------------------------------------------------------------------------------------

test('ronda 1 (T3): volver a aceptar la misma ruta igual conserva su saltado; con otra distinta no sale el saltado ni quedan retomados; quitarla limpia el panel', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua(`SnetForeverPJ.saltados[#SnetForeverPJ.saltados + 1] = {clave = "Otra", id = "x", n = 1, resumen = "", fecha = ""}`);
  m.lua(`SnetForeverPJ.retomados[${aLua(CLAVE)}] = {i2 = true}`);
  const deRuta = () => m.lua(`(function() local n = 0 for _, s in ipairs(SnetForeverPJ.saltados) do if s.clave == ${aLua(CLAVE)} then n = n + 1 end end return n end)()`);
  assert.equal(deRuta(), 1);
  // T3: la misma ruta con el paso guardado igual sigue por donde iba, con su saltado.
  proponer(m, guiaIA());
  aceptar(m);
  assert.equal(deRuta(), 1);
  // Con otros elementos en el paso guardado empieza de cero y se limpia.
  const otra = guiaIA();
  otra.pasos[1].elementos[1] = { t: 'complete', q: 7002, objetivo: 1 };
  proponer(m, otra);
  aceptar(m);
  assert.equal(deRuta(), 0);
  assert.equal(m.lua(`SnetForeverPJ.retomados[${aLua(CLAVE)}]`), undefined);
  assert.notEqual(m.lua('SnetForever.Motor.paso(1).saltado'), true);
  assert.equal(m.lua('#SnetForeverPJ.saltados'), 1, 'lo de otras guías se queda');
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua(`SnetForeverPJ.retomados[${aLua(CLAVE)}] = {i2 = true}`);
  m.lua(`${R}.quitarGuia(${aLua(CLAVE)})`);
  assert.equal(deRuta(), 0);
  assert.equal(m.lua(`SnetForeverPJ.retomados[${aLua(CLAVE)}]`), undefined);
  assert.equal(m.lua('SnetForeverPJ.saltados[1].clave'), 'Otra');
  sinErrores(m);
});

test('ronda 1: el clic derecho solo vale en las rutas de la IA; en las demás filas se ignora', () => {
  const m = conVentana();
  abrirGuias(m);
  pulsarMenu(m, 'Prueba (H)', 'RightButton');
  assert.ok(!filasMenu(m).includes('1-2 Inicio'), 'el grupo no se abrió con el clic derecho');
  pulsarMenu(m, 'Prueba (H)');
  assert.ok(filasMenu(m).includes('1-2 Inicio'), filasMenu(m).join(' | '));
  sinErrores(m);
});

test('ronda 1: quitar una ruta desde el menú esconde el tooltip', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  m.lua(`CUENTA_HIDE = 0; hooksecurefunc(GameTooltip, "Hide", function() CUENTA_HIDE = CUENTA_HIDE + 1 end)`);
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  pulsarMenu(m, 'Ruta de Durotar (Horda)', 'RightButton');
  assert.ok(m.lua('CUENTA_HIDE') >= 1);
  sinErrores(m);
});

test('ronda 1: topes de 30 elementos por paso y de 30 qs en isQuestTurnedIn', () => {
  const m = maquina();
  const g = guiaIA();
  g.pasos = [{ id: 'a', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [
    ...Array.from({ length: 40 }, (_, i) => ({ t: 'accept', q: 100 + i })),
    { t: 'isQuestTurnedIn', qs: Array.from({ length: 50 }, (_, i) => 900 + i) },
  ] }, { id: 'b', n: 2, etiquetas: {}, requisitos: [], linea: 0, elementos: [
    { t: 'isQuestTurnedIn', qs: Array.from({ length: 50 }, (_, i) => 900 + i) }] }];
  const avisos = contar(m, 'SNF_IA_AVISO');
  proponer(m, g);
  const p = m.lua(`${R}.guiaPendiente()`);
  assert.equal(p.pasos[0].elementos.length, 30);
  assert.equal(p.pasos[1].elementos[0].qs.length, 30);
  assert.equal(avisos().ultimo, 'IA_GUIA_RECORTADA');
  sinErrores(m);
});

test('ronda 1: una guía inválida no borra la pendiente válida; solo avisa', () => {
  const m = maquina();
  const avisos = contar(m, 'SNF_IA_AVISO');
  assert.equal(proponer(m, guiaIA()), true);
  assert.equal(proponer(m, guiaIA({ clave: 'Otra\cosa' })), false);
  assert.equal(m.lua(`${R}.guiaPendiente().clave`), CLAVE);
  assert.equal(avisos().ultimo, 'IA_GUIA_DESCARTADA');
  sinErrores(m);
});

test('ronda 1: los ids de misión, de mapa y de qs tienen que ser 1 o más', () => {
  const m = maquina();
  const g = guiaIA();
  g.pasos[0].elementos.push({ t: 'accept', q: 0 }, { t: 'accept', q: -5 }, { t: 'goto', mapa: 0, x: 5, y: 5, modo: 'flecha' },
    { t: 'isQuestTurnedIn', qs: [0, 7002] });
  proponer(m, g);
  const p = m.lua(`${R}.guiaPendiente()`);
  assert.deepEqual(p.pasos[0].elementos.map((e) => e.t), ['goto', 'accept', 'accept', 'isQuestTurnedIn']);
  assert.deepEqual(p.pasos[0].elementos[3].qs, [7002]);
  sinErrores(m);
});

test('ronda 1: si aceptarGuia no puede guardar, deja una línea de sistema en el chat', () => {
  const m = nuevaMaquina({ datos: DATOS, jugador: { ...DRUIDA, idioma: 'esES' } });
  m.lua('SlashCmdList.SNET("chat")');
  proponer(m, guiaIA());
  m.lua('SnetForeverPJ.ia = nil; SnetForeverPJ = nil');
  assert.equal(aceptar(m), false);
  m.lua('SnetForeverPJ = {}');
  assert.ok(impresosSistema(m).some((l) => l.includes('No se ha podido guardar')), impresosSistema(m).join(' | '));
});

// ---------------------------------------------------------------------------------------------------
// Ruling F4-31: la etiqueta «level» de cada paso se conserva (y solo esa)
// ---------------------------------------------------------------------------------------------------

function guiaConNivel(etiquetas) {
  const g = guiaIA();
  g.pasos[0].etiquetas = etiquetas;
  return g;
}

test('F4-31: una etiqueta level=12 con el personaje a nivel 10 deja al paso esperando, como en una guía de la fase 3', () => {
  const m = conVentana();
  proponer(m, guiaConNivel({ level: 12 }));
  aceptar(m);
  m.avanzar(1);
  const g = m.lua(`SnetForeverPJ.ia.guias[${aLua(CLAVE)}].pasos[1]`);
  assert.equal(g.etiquetas.level, 12);
  assert.deepEqual(g.requisitos, [{ t: 'nivel', n: 12 }]);
  assert.equal(m.lua('SnetForever.Motor.paso(1).nivelMinimo'), 12);
  assert.equal(m.lua('SnetForever.Motor.paso(1).espera'), 'nivel');
  assert.equal(estado(m).clave, CLAVE);
  assert.equal(m.lua(`${M}.pasos[1].espera:GetText()`), 'Esperando: nivel 12');
  assert.equal(m.lua(`${M}.pasos[1].espera:IsVisible()`), true);
  sinErrores(m);
});

test('F4-31: las etiquetas level no válidas y cualquier otra etiqueta se descartan', () => {
  for (const malo of [0, 99, 'doce', '12', 12.5, -3, true, {}]) {
    const m = maquina();
    proponer(m, guiaConNivel({ level: malo, requires: 'x', label: 'y' }));
    const p = m.lua(`${R}.guiaPendiente().pasos[1]`);
    assert.equal(m.lua(`next(${R}.guiaPendiente().pasos[1].etiquetas) == nil`), true, `level=${JSON.stringify(malo)}`);
    assert.deepEqual(p.requisitos, [], `level=${JSON.stringify(malo)}`);
    sinErrores(m);
  }
  const m = maquina();
  proponer(m, guiaConNivel({ level: 60, completewith: 'next', requires: 'x', label: 'y' }));
  const p = m.lua(`${R}.guiaPendiente().pasos[1]`);
  assert.deepEqual(p.etiquetas, { level: 60 });
  assert.deepEqual(p.requisitos, [{ t: 'nivel', n: 60 }]);
  proponer(m, guiaConNivel({ level: 1 }));
  assert.deepEqual(m.lua(`${R}.guiaPendiente().pasos[1].etiquetas`), { level: 1 });
  sinErrores(m);
});

test('final Minor 7: un isQuestTurnedIn con más de 30 qs no se recorta en silencio: avisa IA_GUIA_RECORTADA', () => {
  const m = maquina();
  const g = guiaIA();
  g.pasos[2].elementos[2] = { t: 'isQuestTurnedIn', qs: [7002, ...Array.from({ length: 34 }, (_, i) => 900 + i)] };
  const avisos = contar(m, 'SNF_IA_AVISO');
  assert.equal(proponer(m, g), true);
  const p = m.lua(`${R}.guiaPendiente()`);
  assert.equal(p.pasos[2].elementos[2].qs.length, 30);
  assert.equal(avisos().n, 1);
  assert.equal(avisos().ultimo, 'IA_GUIA_RECORTADA');
  // con 30 justas no hay aviso
  const m2 = maquina();
  const g2 = guiaIA();
  g2.pasos[2].elementos[2] = { t: 'isQuestTurnedIn', qs: [7002, ...Array.from({ length: 29 }, (_, i) => 900 + i)] };
  const avisos2 = contar(m2, 'SNF_IA_AVISO');
  assert.equal(proponer(m2, g2), true);
  assert.equal(avisos2().n, 0);
  sinErrores(m);
  sinErrores(m2);
  m2.cerrar();
});

// 12-nov (el jugador: «con la ruta de la IA no me da la opción de marcar objetivo cercano»): al validar una ruta de zona, cada
// accept y turnin lleva el target de quien da o recoge la misión y cada complete el mob de su objetivo (de la base).
test('12-nov: la ruta de zona lleva los PNJ de sus misiones para «Objetivos cercanos» (target y mob, con padre)', () => {
  const m = conVentana();
  m.lua(`SNF_MISIONES.npc[97501] = {name = "Dador del poblado", friendlyToFaction = "H", spawns = {[1411] = {{43.3, 69}}}}
  SNF_MISIONES.npc[97502] = {name = "Jabali de prueba", spawns = {[1411] = {{50, 60}}}}`);
  m.datoMision(7001, { name: 'La caza', startedBy: [[97501]], finishedBy: [[97501]], requiredLevel: 1, questLevel: 5,
    objectives: [[[97502, 'Jabali de prueba']]] });
  proponer(m, guiaIA());
  aceptar(m);
  const pasos = m.lua(`(function()
    local g = SnetForeverPJ.ia.guias[${aLua(CLAVE)}]
    local s = {}
    for i, p in ipairs(g.pasos) do
      s[i] = {}
      for _, e in ipairs(p.elementos) do
        if e.t == "target" or e.t == "mob" then s[i][#s[i] + 1] = {t = e.t, id = e.npcs[1].id, padre = e.padre} end
      end
    end
    return s
  end)()`);
  assert.deepEqual(pasos[0], [{ t: 'target', id: 97501, padre: 1 }], 'recoger 7001: el dador (la 7002 no está en la base)');
  assert.deepEqual(pasos[1], [{ t: 'mob', id: 97502, padre: 1 }], 'el objetivo 1 de la 7001: el jabalí');
  assert.deepEqual(pasos[2], [{ t: 'target', id: 97501, padre: 1 }], 'entregar 7001: el mismo PNJ');
  sinErrores(m);
});

// 12-nov (el jugador: «me está mandando hacer una misión que no tengo»): en una ruta de zona, el objetivo y la entrega de una
// misión que no está en el registro se daban por hechos con siFalta. 16-nov: ya no se fuerza (el motor lo trata con
// sinMision y «no disponible», como en las guías normales): solo lo lleva el elemento que lo trae.
test('16-nov: en la ruta de zona, complete y turnin ya no llevan siFalta forzado', () => {
  const m = conVentana();
  proponer(m, guiaIA());
  aceptar(m);
  const elementos = m.lua(`(function()
    local g = SnetForeverPJ.ia.guias[${aLua(CLAVE)}]
    local s = {}
    for _, p in ipairs(g.pasos) do
      for _, e in ipairs(p.elementos) do
        if e.t == "complete" or e.t == "turnin" or e.t == "accept" then s[#s + 1] = {t = e.t, siFalta = e.siFalta == true} end
      end
    end
    return s
  end)()`);
  assert.deepEqual(elementos, [
    { t: 'accept', siFalta: false }, { t: 'accept', siFalta: false },
    { t: 'complete', siFalta: false }, { t: 'turnin', siFalta: false },
  ]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Tarea 16: pasos de texto, goto «objetivo» y guía pedida que se abre sola
// ---------------------------------------------------------------------------------------------------

const elementosGuardados = (m, paso) => m.lua(`(function()
  local g = ${R}.guiaPendiente()
  local s = {}
  for i, e in ipairs(g.pasos[${paso}].elementos) do s[i] = {t = e.t, modo = e.modo, radio = e.radio, es = e.texto and e.texto.es, en = e.texto and e.texto.en} end
  return s
end)()`);

test('tarea 16: un paso de solo manual, otro de goto objetivo y otro con accept + goto + nota se aceptan enteros', () => {
  const m = conVentana();
  const g = guiaIA({
    pasos: [
      { id: 'a', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [{ t: 'manual', texto: { es: 'Habla con el mago', en: 'Talk to the mage' } }] },
      { id: 'b', n: 2, etiquetas: {}, requisitos: [], linea: 0, elementos: [{ t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'objetivo', radio: 10 }] },
      { id: 'c', n: 3, etiquetas: {}, requisitos: [], linea: 0, elementos: [
        { t: 'accept', q: 7001 }, { t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' },
        { t: 'nota', texto: { es: 'Cuidado con los jabalíes', en: 'Beware of boars' } },
      ] },
    ],
  });
  assert.equal(proponer(m, g), true);
  assert.equal(m.lua(`#${R}.guiaPendiente().pasos`), 3);
  assert.deepEqual(elementosGuardados(m, 1).map((e) => [e.t, e.es, e.en]), [['manual', 'Habla con el mago', 'Talk to the mage']]);
  const b = elementosGuardados(m, 2)[0];
  assert.deepEqual([b.t, b.modo, b.radio], ['goto', 'objetivo', 10]);
  assert.deepEqual(elementosGuardados(m, 3).map((e) => e.t).slice(0, 3), ['accept', 'goto', 'nota']);
  assert.equal(aceptar(m), true);
  assert.equal(estado(m).clave, CLAVE);
  sinErrores(m);
});

test('tarea 16: un radio de 0, de 500 o no entero deja el goto en flecha', () => {
  for (const radio of [0, 500, 2.5, '10']) {
    const m = conVentana();
    const g = guiaIA({
      pasos: [{ id: 'b', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [
        { t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'objetivo', radio }, { t: 'accept', q: 7001 }] }],
    });
    assert.equal(proponer(m, g), true);
    const e = elementosGuardados(m, 1)[0];
    assert.deepEqual([e.modo, e.radio], ['flecha', undefined], String(radio));
    sinErrores(m);
  }
});

test('tarea 16: una nota de 400 bytes se corta a 300 sin partir una tilde; sin texto válido el elemento se va', () => {
  const m = conVentana();
  const largo = 'á'.repeat(200); // 400 bytes
  const impar = 'x' + 'á'.repeat(200); // el corte en 300 partiría una á
  const g = guiaIA({
    pasos: [{ id: 'a', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [
      { t: 'nota', texto: { es: largo, en: impar } }, { t: 'manual', texto: {} }, { t: 'manual', texto: { es: '', en: '' } }, { t: 'accept', q: 7001 }] }],
  });
  assert.equal(proponer(m, g), true);
  const els = elementosGuardados(m, 1);
  assert.deepEqual(els.map((e) => e.t), ['nota', 'accept']);
  assert.equal(Buffer.byteLength(els[0].es, 'utf8'), 300);
  assert.equal(els[0].es, 'á'.repeat(150));
  assert.equal(els[0].en, 'x' + 'á'.repeat(149));
  sinErrores(m);
});

test('tarea 16: un paso cuyo único elemento es una nota sin texto válido no pasa', () => {
  const m = conVentana();
  const g = guiaIA({ pasos: [{ id: 'a', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [{ t: 'nota', texto: 5 }] }] });
  assert.equal(proponer(m, g), false);
  sinErrores(m);
});

test('tarea 16: con abrirGuiaIA (y la guía cargada acabada, T3) la guía se abre sola, con una línea de sistema (es y en); sin la marca sale «Abrir la ruta»', () => {
  for (const [idioma, texto] of [['esES', 'Guía de la IA abierta: Ruta de Durotar (Horda)'], ['enUS', 'AI guide opened: Durotar route (Horde)']]) {
    const m = enChat({ jugador: { ...DRUIDA, idioma } });
    conGuiaAcabada(m);
    conRespuesta(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIA(), abrirGuiaIA: true });
    assert.equal(estado(m).clave, CLAVE, idioma);
    assert.deepEqual(claves(m), [CLAVE]);
    assert.equal(m.lua(`${R}.guiaPendiente()`), undefined);
    assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), false);
    assert.ok(impresosSistema(m).includes(texto), JSON.stringify(impresosSistema(m)));
    sinErrores(m);
  }
  const m = enChat();
  conRespuesta(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIA(), abrirGuiaIA: false });
  assert.equal(estado(m).clave, INICIO);
  assert.equal(m.lua(`${MC}.rutaZona.abrir.texto:GetText()`), 'Abrir la ruta');
  sinErrores(m);
});

// Ronda 1 (I2): la guía pedida que se queda en la tarjeta (había otra a medias) se guarda en «Rutas de la IA» sin
// abrirse: la tarjeta solo decide si se abre ahora, y un /reload no la pierde.
test('ronda 1 (I2): la guía pedida que se queda en la tarjeta se guarda sin abrirse y sigue en el menú tras /reload', () => {
  let m = enChat();
  conRespuesta(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIA(), abrirGuiaIA: true });
  assert.equal(estado(m).clave, INICIO);
  assert.equal(m.lua(`${MC}.rutaZona:IsVisible()`), true);
  assert.deepEqual(claves(m), [CLAVE]);
  assert.equal(pj(m).volverA, undefined);
  // «No» no la quita: solo no la abre ahora.
  m.lua(`${MC}.rutaZona.no:Click()`);
  assert.deepEqual(claves(m), [CLAVE]);
  m = m.recargar();
  assert.equal(estado(m).clave, INICIO);
  assert.deepEqual(claves(m), [CLAVE]);
  m.lua(`${V}.crear()`);
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  pulsarMenu(m, 'Ruta de Durotar (Horda)');
  assert.equal(estado(m).clave, CLAVE);
  assert.equal(pj(m).volverA, INICIO);
  sinErrores(m);
});

test('ronda 1 (I2): pulsar la tarjeta de la guía ya guardada la abre, sin duplicarla', () => {
  const m = enChat();
  conRespuesta(m, { t: 'respuesta', texto: 'Mira la ruta.', guiaIA: guiaIA(), abrirGuiaIA: true });
  m.lua(`${MC}.rutaZona.abrir:Click()`);
  assert.equal(estado(m).clave, CLAVE);
  assert.deepEqual(claves(m), [CLAVE]);
  assert.equal(pj(m).volverA, INICIO);
  sinErrores(m);
});

test('ronda 1 (I2): guardar la guía de la tarjeta no echa a la cargada ni a la de volver', () => {
  const m = enChat();
  const z = (k) => `IA\\Ruta ${k} (Horda)`;
  const g = (k) => guiaIA({ clave: z(k), nombre: `Ruta ${k} (Horda)`, titulo: { es: `Ruta ${k} (Horda)`, en: `Route ${k}` } });
  // La 1 (la más antigua) es la de volver y la 2 la cargada, las dos a medias; luego la 3, la 4 y la 5 sin abrir.
  for (const k of [1, 2]) { proponer(m, g(k)); aceptar(m); }
  for (const k of [3, 4, 5]) { proponer(m, g(k)); m.lua(`${R}.guardarGuiaPendiente()`); m.lua(`${R}.descartarGuia()`); }
  assert.equal(estado(m).clave, z(2));
  assert.equal(pj(m).volverA, z(1));
  assert.equal(claves(m).length, 5);
  conRespuesta(m, { t: 'respuesta', texto: 'Otra.', guiaIA: g(6), abrirGuiaIA: true });
  assert.equal(estado(m).clave, z(2), 'sigue la cargada');
  const k = claves(m);
  assert.equal(k.length, 5);
  assert.ok(k.includes(z(1)) && k.includes(z(2)) && k.includes(z(6)), k.join(' | '));
  assert.ok(!k.includes(z(3)), k.join(' | '));
  sinErrores(m);
});

test('tarea 16: con abrirGuiaIA y una guía inválida no se abre nada', () => {
  const m = enChat();
  conRespuesta(m, { t: 'respuesta', texto: 'Mira.', guiaIA: guiaIA({ tipo: 'cadena' }), abrirGuiaIA: true });
  assert.equal(estado(m).clave, INICIO);
  assert.deepEqual(claves(m), []);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// 16-nov (en el juego, una ruta de la IA de Las Mil Agujas: «cuando llego a los puntos se saltan los objetivos sin
// completar las quest» y «la ventana de objetivos cercanos no la veo»)
// ---------------------------------------------------------------------------------------------------

// Mundo del mapa 1411 en el banco: wx = -2000 - 50·x, wy = 1800 - 35·y, inst 1.
const ponerEn = (m, x, y) => m.jugador({ mundo: { wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 } });
const pasoIA = (id, elementos) => ({ id, n: Number(id.slice(1)), etiquetas: {}, requisitos: [], linea: 0, elementos });
const OBJ = (terminado) => [{ texto: `Jabalí: ${terminado ? 1 : 0}/1`, hecho: terminado ? 1 : 0, pedido: 1, terminado }];

test('16-nov: un paso unido (punto de paso + misión): llegar al punto NO lo da por hecho; solo la misión lo completa', () => {
  const m = conVentana();
  m.datoMision(7001, { name: 'La caza', requiredLevel: 1, questLevel: 5, objectives: [[[97502, 'Jabali de prueba']]] });
  m.estadoMision(7001, { enDiario: true, objetivos: OBJ(false) });
  proponer(m, guiaIA({ pasos: [
    pasoIA('u1', [
      { t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'flecha', radio: 10 },
      { t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' },
      { t: 'complete', q: 7001, objetivo: 1 },
      { t: 'nota', texto: { es: 'Abre la Comida de Arpía del suelo', en: 'Abre la Comida de Arpía del suelo' } },
    ]),
    pasoIA('u2', [{ t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' }, { t: 'turnin', q: 7001 }]),
  ] }));
  aceptar(m);
  // El punto de paso conserva su radio (es de flecha: no bloquea) y el complete no lleva siFalta.
  const el = m.lua(`SnetForeverPJ.ia.guias[${aLua(CLAVE)}].pasos[1].elementos`);
  assert.deepEqual([el[0].modo, el[0].radio, el[1].modo, el[1].radio], ['flecha', 10, 'flecha', undefined]);
  assert.equal(el[2].siFalta, undefined);
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1);
  // Llega al punto de paso: queda alcanzado y la flecha pasa al siguiente punto, pero el paso sigue.
  ponerEn(m, 50, 60);
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Motor.paso(1).elementos[1].mem.alcanzado'), true);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1, 'llegar no da el paso por hecho');
  assert.equal(m.lua('SnetForever.Navegacion.destino().punto.x'), 43.3);
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  // Con el objetivo hecho, sí.
  m.estadoMision(7001, { enDiario: true, completa: true, objetivos: OBJ(true) });
  m.disparar('QUEST_LOG_UPDATE');
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2);
  sinErrores(m);
});

test('16-nov: siFalta ya no se fuerza: un complete de una misión que se acepta más adelante espera, como en las guías normales', () => {
  const m = conVentana();
  m.datoMision(7001, { name: 'La caza', requiredLevel: 1, questLevel: 5, objectives: [[[97502, 'Jabali de prueba']]] });
  proponer(m, guiaIA({ pasos: [
    pasoIA('u1', [{ t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'flecha' }, { t: 'complete', q: 7001, objetivo: 1 }]),
    pasoIA('u2', [{ t: 'goto', mapa: 1411, x: 43.3, y: 69, modo: 'flecha' }, { t: 'accept', q: 7001 }]),
    pasoIA('u3', [{ t: 'turnin', q: 7001 }]),
  ] }));
  aceptar(m);
  // Lo que pasa la app (siFalta = true) se respeta; lo que no trae, no se pone.
  const conSiFalta = m.lua(`(function() local s = {}
    for _, p in ipairs(SnetForeverPJ.ia.guias[${aLua(CLAVE)}].pasos) do
      for _, e in ipairs(p.elementos) do if e.q then s[#s + 1] = e.siFalta == true end end
    end return s end)()`);
  assert.deepEqual(conSiFalta, [false, false, false]);
  m.avanzar(2);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1, 'el complete espera (no pasa en silencio)');
  assert.deepEqual(m.lua('SnetForeverPJ.saltados'), []);
  sinErrores(m);
});

test('16-nov: un objetivo de saquear un objeto lleva de mob a quien lo suelta y «Objetivos cercanos» lo enseña', () => {
  const m = conVentana();
  m.lua(`SNF_MISIONES.npc[97503] = {name = "Grenka de prueba", spawns = {[1411] = {{50, 60}}}}
  SNF_MISIONES.npc[97504] = {name = "Soltador de los datos", spawns = {[1411] = {{51, 61}}}}
  SNF_MISIONES.item[97601] = {name = "Garra de prueba"}
  SNF_MISIONES.item[97602] = {name = "Costilla de prueba", npcDrops = {97504}}`);
  m.datoMision(7001, { name: 'La garra', requiredLevel: 1, questLevel: 5, objectives: [[], [], [[97601], [97602]]] });
  m.estadoMision(7001, { enDiario: true, objetivos: [...OBJ(false), ...OBJ(false)] });
  proponer(m, guiaIA({ pasos: [
    // La app manda quién suelta la garra (pnj); la costilla trae npcDrops en los datos.
    pasoIA('u1', [{ t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'flecha' }, { t: 'complete', q: 7001, objetivo: 1, pnj: [97503, 'x', 0] },
      { t: 'complete', q: 7001, objetivo: 2 }]),
  ] }));
  aceptar(m);
  const mobs = m.lua(`(function() local s = {}
    for _, e in ipairs(SnetForeverPJ.ia.guias[${aLua(CLAVE)}].pasos[1].elementos) do
      if e.t == "mob" then s[#s + 1] = {id = e.npcs[1].id, n = #e.npcs, padre = e.padre} end
      if e.t == "complete" and e.pnj ~= nil then s[#s + 1] = "pnj guardado" end
    end return s end)()`);
  assert.deepEqual(mobs, [{ id: 97503, n: 1, padre: 1 }, { id: 97504, n: 1, padre: 2 }]);
  m.avanzar(1);
  const nombres = m.lua('(function() local s = {} for _, e in ipairs(SnetForever.Cercanos.lista()) do s[#s + 1] = e.nombreIngles end return s end)()');
  assert.ok(nombres.includes('Grenka de prueba') && nombres.includes('Soltador de los datos'), JSON.stringify(nombres));
  assert.equal(m.lua('SnetForeverObjetivos:IsShown()'), true, 'la ventana de Objetivos cercanos sale');
  sinErrores(m);
});
