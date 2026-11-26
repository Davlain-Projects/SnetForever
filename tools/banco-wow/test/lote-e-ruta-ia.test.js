// Lote E (primera prueba real del chat, 10-nov): con una ruta de la IA activa la ventana lo dice (E1) y las rutas de la
// IA se pueden volver a elegir en el menú «Elegir guía» (E1b). ia/ruta.lua (rutasGuardadas, activarGuardada) y
// ui/ventana.lua (grupo «Rutas de la IA» del menú). Desde el lote F la ruta se ve como una guía (su guía lateral «ia»):
// la tarjeta «Ruta de la IA» y la guía atenuada ya no existen y las pruebas de E1 comprueban lo mismo con la guía.
// Mapa 1411 del banco (src/wow-falso.lua): wx = -2000 - 5000·x/100, wy = 1800 - 3500·y/100, inst 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withGuideDetails as nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const CLAVE = 'Prueba\\01-60 Guía de prueba';
const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const R = 'SnetForever.Ruta';
const mundo1411 = (x, y) => ({ wx: -2000 - 50 * x, wy: 1800 - 35 * y, inst: 1 });

// La guía del jugador en el paso «Habla con Mortacechadora Lesh», con su goto (la flecha de la guía).
const GUIA = guiaDePrueba([
  { elementos: [
    { t: 'goto', mapa: 1411, x: 50, y: 60, modo: 'flecha' },
    { t: 'manual', texto: { en: 'Talk to Deathstalker Lesh', es: 'Habla con Mortacechadora Lesh' } },
  ] },
  { elementos: [{ t: 'manual', texto: { en: 'Next', es: 'Siguiente' } }] },
]);

// Tres paradas de lugar (se alcanzan por distancia) y un pin que no se sigue.
const LUGARES = [
  { mapa: 1411, x: 60, y: 30, etiqueta: 'Mira A', tipo: 'lugar', seguir: true },
  { mapa: 1411, x: 70, y: 30, etiqueta: 'Mira B', tipo: 'lugar', seguir: true },
  { mapa: 1411, x: 80, y: 30, etiqueta: 'Mira C', tipo: 'lugar', seguir: true },
  { mapa: 1411, x: 20, y: 20, etiqueta: 'Pin suelto', tipo: 'lugar', seguir: false },
];

function maquina(opciones = {}) {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 }, ...opciones });
  m.ponerGuia(GUIA);
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)}); ${V}.pintar()`);
  return m;
}

function aceptar(m, puntos = LUGARES, titulo = 'Bosque de Argénteos') {
  m.lua(`${R}.proponer(${aLua({ titulo, puntos })})`);
  return m.lua(`${R}.aceptar()`);
}

const ponerEn = (m, x, y, dy = 3) => {
  const w = mundo1411(x, y);
  m.jugador({ mundo: { wx: w.wx, wy: w.wy + dy, inst: 1 } });
};
const comprobar = (m) => m.lua('SnetForever.Navegacion.comprobarLlegada()');
const texto = (m, ruta) => m.lua(`(function() local o = ${ruta}; return o and o:GetText() end)()`);
const visible = (m, ruta) => m.lua(`(function() local o = ${ruta}; return o ~= nil and o:IsVisible() end)()`);
const destino = (m) => m.lua('SnetForever.Navegacion.destino()');
const flecha = (m) => m.lua('SnetForever.Flecha.actualizar(0); return SnetForever.Flecha.marcos.texto:GetText()');

// Todo lo que se ve de la ventana: cada región visible con su posición, tamaño, alfa y texto (para comparar dos estados).
const FOTO = `(function()
  local salida = {}
  local function mirar(o, camino, region)
    if not o:IsVisible() then return end
    local linea = camino .. " " .. tostring(o:GetWidth()) .. "x" .. tostring(o:GetHeight()) .. " a" .. tostring(o:GetAlpha())
    for i = 1, o:GetNumPoints() do
      local p, _, rp, x, y = o:GetPoint(i)
      linea = linea .. " " .. p .. ">" .. rp .. "(" .. tostring(x) .. "," .. tostring(y) .. ")"
    end
    if o:IsObjectType("FontString") then linea = linea .. " «" .. tostring(o:GetText()) .. "»" end
    salida[#salida + 1] = linea
    if region then return end
    for k, r in ipairs({o:GetRegions()}) do mirar(r, camino .. "." .. k, true) end
    for k, h in ipairs({o:GetChildren()}) do mirar(h, camino .. "/" .. k) end
  end
  mirar(SnetForeverVentana, "V")
  return salida
end)()`;

// ---------------------------------------------------------------------------------------------------
// E1, rehecho en el lote F: la ruta de la IA se ve como una guía (su guía lateral «ia»), sin tarjeta aparte ni guía
// atenuada. Lo que pedía E1 sigue: la ventana dice qué sigue la flecha, al llegar pasa a la siguiente parada, «Volver
// a la guía» deja la guía de antes y sin ruta todo se ve como antes.
// ---------------------------------------------------------------------------------------------------

const clave = (m) => m.lua('SnetForever.Motor.estado().clave');
const lineaPaso = (m) => texto(m, `${M}.pasos[1].lineas[1]`);
const ciclo = (m) => m.avanzar(0.5);

test('E1 (lote F): con una propuesta aceptada la ventana enseña su guía «IA: …» en la parada 1 y la flecha va a ella', () => {
  const m = maquina();
  assert.equal(aceptar(m), true);
  assert.notEqual(clave(m), CLAVE);
  assert.equal(texto(m, `${M}.titulo`), 'IA: Bosque de Argénteos');
  assert.equal(lineaPaso(m), 'Mira A');
  assert.equal(m.lua(`${M}.pasos[1].marco:GetEffectiveAlpha()`), 1, 'nada atenuado');
  assert.equal(destino(m).punto.origen, 'guia');
  assert.equal(destino(m).punto.x, 60);
  assert.doesNotMatch(flecha(m), /Ruta IA/);
  sinErrores(m);
});

test('E1 (lote F): al llegar a la parada 1 pasa a la 2; al llegar a la última la guía acaba y ofrece volver', () => {
  const m = maquina();
  aceptar(m);
  ponerEn(m, 60, 30);
  comprobar(m);
  ciclo(m);
  assert.equal(lineaPaso(m), 'Mira B');
  assert.equal(destino(m).punto.x, 70);
  ponerEn(m, 70, 30);
  comprobar(m);
  ciclo(m);
  ponerEn(m, 80, 30);
  comprobar(m);
  ciclo(m);
  assert.equal(m.lua('SnetForever.Motor.estado().fin'), true);
  assert.equal(m.lua(`${R}.estado()`), undefined);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  sinErrores(m);
});

test('E1 (lote F): «Saltar» es el saltar paso de la guía (y sigue saltado tras /reload)', () => {
  let m = maquina();
  aceptar(m);
  m.lua('SnetForever.Motor.saltar(SnetForever.Motor.estado().actual)');
  ciclo(m);
  assert.equal(lineaPaso(m), 'Mira B');
  m = m.recargar();
  m.avanzar(0.1);
  assert.equal(lineaPaso(m), 'Mira B');
  assert.equal(destino(m).punto.x, 70);
  sinErrores(m);
});

test('E1 (lote F): «Volver a la guía» es el «Volver» de las laterales: la flecha vuelve al paso de la guía y la ruta se quita', () => {
  const m = maquina();
  aceptar(m);
  m.lua(`${M}.estado.volver:Click()`);
  assert.equal(clave(m), CLAVE);
  const d = destino(m);
  assert.equal(d.punto.origen, 'guia');
  assert.equal(d.punto.paso, 1);
  assert.equal(lineaPaso(m), 'Habla con Mortacechadora Lesh');
  // Ronda 1 (Importante 1): como «Quitar pines», la ruta se va del todo; sigue en «Rutas de la IA».
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 0);
  assert.equal(m.lua('SnetForeverPJ.ia.ruta'), undefined);
  assert.equal(m.lua('#SnetForeverPJ.ia.rutas'), 1);
  sinErrores(m);
});

test('E1: sin ruta (o tras quitarla) la ventana se ve exactamente igual que antes', () => {
  const m = maquina();
  const antes = m.lua(FOTO);
  aceptar(m);
  assert.notDeepEqual(m.lua(FOTO), antes, 'con la ruta cambia');
  m.lua(`${R}.quitar()`);
  assert.equal(clave(m), CLAVE);
  assert.deepEqual(m.lua(FOTO), antes);
  // Una ruta solo de pines (nada que seguir) tampoco cambia la ventana.
  aceptar(m, [LUGARES[3]]);
  assert.equal(clave(m), CLAVE);
  assert.deepEqual(m.lua(FOTO), antes);
  sinErrores(m);
});

test('E1 (lote F): en inglés', () => {
  const m = maquina({ guardado: { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } } });
  aceptar(m);
  assert.equal(texto(m, `${M}.titulo`), 'AI: Bosque de Argénteos');
  sinErrores(m);
});

test('E1 (lote F): una parada de misión pasa sola al recogerla; vigilarSecretos en ruta, ventana, texto y flecha', () => {
  const m = maquina({ vigilarSecretos: ['ia/ruta.lua', 'ui/ventana.lua', 'ui/texto.lua', 'ui/flecha.lua'] });
  const Q = 4641;
  aceptar(m, [
    { mapa: 1411, x: 40, y: 20, etiqueta: 'Habla con Garra', tipo: 'recoger', q: Q, seguir: true },
    { mapa: 1411, x: 60, y: 30, etiqueta: 'Caza jabalíes', tipo: 'objetivo', q: Q, obj: 'Jabalí', objetivo: 1, seguir: true },
  ]);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 1);
  // Un objetivo con el texto secreto (motor moderno): ni la ruta ni la ventana lo comparan.
  m.estadoMision(Q, { enDiario: true, objetivos: [{ texto: 'Jabalí: 0/8', hecho: 0, pedido: 8, terminado: false }] });
  m.lua(`BANCO.misiones[${Q}].objetivos[1].texto = BANCO.secreto()`);
  m.disparar('QUEST_ACCEPTED', 1, Q);
  m.disparar('QUEST_LOG_UPDATE');
  ciclo(m);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2);
  assert.equal(destino(m).punto.x, 60);
  flecha(m);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------
// E1c: solo una ruta de verdad abre su guía
// ---------------------------------------------------------------------------------------------------------------

test('E1c: una respuesta con solo pines no abre ninguna guía (la guía sigue mandando); una con ruta, sí', () => {
  const m = maquina();
  // tipo «pines» de la app: aunque algún punto trajera seguir, no se sigue.
  m.lua(`${R}.proponer(${aLua({ titulo: 'Sitios', tipo: 'pines', puntos: LUGARES.map((p) => ({ ...p, seguir: true })) })})`);
  assert.equal(m.lua(`${R}.aceptar()`), true);
  assert.equal(m.lua('#SnetForever.Capa.puntos("ia")'), 4, 'los pines salen como hasta ahora');
  assert.equal(clave(m), CLAVE);
  assert.equal(destino(m).punto.origen, 'guia');
  assert.equal(destino(m).punto.paso, 1);
  // Con ruta (tipo «ruta»), sí.
  m.lua(`${R}.proponer(${aLua({ titulo: 'Camino', tipo: 'ruta', puntos: LUGARES })})`);
  m.lua(`${R}.aceptar()`);
  assert.equal(texto(m, `${M}.titulo`), 'IA: Camino');
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua('IA\\Paradas 2')}).tipo`), 'ia');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------
// E1b: «Rutas de la IA» en el menú «Elegir guía»
// ---------------------------------------------------------------------------------------------------------------

const abrirGuias = (m) => m.lua(`${V}.abrirMenu()`);
const filasMenu = (m) => m.lua(`(function() local t = {}
  for _, f in ipairs(${M}.menu.filas) do if f:IsVisible() then t[#t + 1] = f.texto:GetText() end end
  return t end)()`) || [];
const detalleFila = (m, buscado) => m.lua(`(function()
  for _, f in ipairs(${M}.menu.filas) do
    if f:IsVisible() and f.texto:GetText() == ${aLua(buscado)} then return f.detalle:IsVisible() and f.detalle:GetText() or false end
  end
end)()`);
function pulsarMenu(m, buscado, boton) {
  const ok = m.lua(`(function()
    for _, fila in ipairs(${M}.menu.filas) do
      if fila:IsVisible() and fila.texto:GetText() == ${aLua(buscado)} then fila:Click(${aLua(boton)}); return true end
    end
    return false
  end)()`);
  assert.ok(ok, `no hay en el menú una fila «${buscado}»: ${filasMenu(m).join(' | ')}`);
}

test('E1b: sin rutas de la IA el grupo no sale; tras aceptar una propuesta sale con su título, la zona y la hora', () => {
  const m = maquina();
  abrirGuias(m);
  assert.ok(!filasMenu(m).includes('Rutas de la IA'), filasMenu(m).join(' | '));
  m.lua(`${V}.cerrarMenu()`);
  aceptar(m);
  abrirGuias(m);
  assert.ok(filasMenu(m).includes('Rutas de la IA'), filasMenu(m).join(' | '));
  pulsarMenu(m, 'Rutas de la IA');
  assert.ok(filasMenu(m).includes('Bosque de Argénteos'), filasMenu(m).join(' | '));
  const detalle = detalleFila(m, 'Bosque de Argénteos');
  assert.match(detalle, /Durotar/);
  assert.match(detalle, /\d\d\/\d\d \d\d:\d\d/);
  assert.equal(m.lua('#SnetForeverPJ.ia.rutas'), 1);
  sinErrores(m);
});

test('E1b: elegirla en el menú la abre como guía (lote F), también tras quitarla y tras /reload', () => {
  let m = maquina();
  aceptar(m);
  m.lua(`${R}.quitar()`);
  assert.equal(clave(m), CLAVE);
  m = m.recargar();
  m.avanzar(0.1);
  assert.equal(clave(m), CLAVE);
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  pulsarMenu(m, 'Bosque de Argénteos');
  assert.equal(m.marco('SnetForeverMenuGuias').visible, false, 'el menú se cierra');
  assert.equal(texto(m, `${M}.titulo`), 'IA: Bosque de Argénteos');
  assert.equal(lineaPaso(m), 'Mira A');
  assert.equal(destino(m).punto.x, 60);
  assert.equal(visible(m, `${M}.estado.volver`), true);
  assert.equal(m.lua('#SnetForeverPJ.ia.rutas'), 1, 'elegirla no la duplica');
  sinErrores(m);
});

test('E1b: como mucho 5 (la sexta echa a la más antigua); la activa va primero; el clic derecho la quita', () => {
  const m = maquina();
  for (let i = 1; i <= 6; i++) aceptar(m, LUGARES, `Ruta ${i}`);
  m.lua(`${R}.activarGuardada(SnetForeverPJ.ia.rutas[2].id)`); // la «Ruta 3»
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  const filas = filasMenu(m);
  const rutas = filas.slice(filas.indexOf('Rutas de la IA') + 1);
  assert.deepEqual(rutas, ['Ruta 3', 'Ruta 6', 'Ruta 5', 'Ruta 4', 'Ruta 2']);
  assert.match(detalleFila(m, 'Ruta 3'), /ruta activa/);
  pulsarMenu(m, 'Ruta 3', 'RightButton');
  assert.equal(clave(m), CLAVE, 'era la activa: se quita también la ruta y su guía');
  const despues = filasMenu(m);
  assert.deepEqual(despues.slice(despues.indexOf('Rutas de la IA') + 1), ['Ruta 6', 'Ruta 5', 'Ruta 4', 'Ruta 2']);
  sinErrores(m);
});

test('E1b: las rutas de zona de la IA salen en el mismo grupo', () => {
  const m = nuevaMaquina({ datos: undefined, jugador: { mapa: 1411, x: 50, y: 25 } });
  m.ponerGuia(GUIA);
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  aceptar(m);
  m.lua(`${R}.proponerGuia(${aLua({
    clave: 'IA\\Ruta de Durotar (Horda)', tipo: 'ia', titulo: { es: 'Ruta de Durotar (Horda)', en: 'Durotar route (Horde)' },
    faccion: 'Horde', niveles: { min: 1, max: 12 },
    pasos: [{ elementos: [{ t: 'goto', mapa: 1411, x: 43, y: 69 }, { t: 'accept', q: 4641 }] }],
  })}); ${R}.aceptarGuia(); SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  const filas = filasMenu(m);
  assert.ok(filas.includes('Bosque de Argénteos'), filas.join(' | '));
  assert.ok(filas.includes('Ruta de Durotar (Horda)'), filas.join(' | '));
  assert.match(detalleFila(m, 'Ruta de Durotar (Horda)'), /\d\d\/\d\d \d\d:\d\d/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------
// Ronda 1
// ---------------------------------------------------------------------------------------------------------------

const rutaGuardada = (id, extra = {}) => ({ id, titulo: `Guardada ${id}`, mapa: 1411, fecha: 1762790400 + id,
  puntos: [{ mapa: 1411, x: 60, y: 30, etiqueta: 'Mira A', tipo: 'lugar', seguir: true }], ...extra });

test('ronda 1 (Minor 1): 54 rutas guardadas se quedan en las 5 últimas; una fecha de 1e15 no rompe nada; rutaId válido', () => {
  const rutas = Array.from({ length: 54 }, (_, i) => rutaGuardada(i + 1));
  rutas[52].fecha = 1e15; // la 53
  rutas.push('basura', { id: 'x', puntos: [] }, { id: 3.5, puntos: [] });
  const m = maquina({ guardado: { SnetForeverPJ: { esquema: 1, ia: { rutas, rutaId: 'roto' } } } });
  assert.deepEqual(m.lua('(function() local t = {} for k, r in ipairs(SnetForeverPJ.ia.rutas) do t[k] = r.id end return t end)()'),
    [50, 51, 52, 53, 54]);
  assert.equal(m.lua('SnetForeverPJ.ia.rutas[4].fecha'), undefined, 'la fecha rara se descarta, la ruta no');
  assert.equal(m.lua('SnetForeverPJ.ia.rutaId'), 54);
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  assert.equal(detalleFila(m, 'Guardada 53'), 'Durotar', 'sin hora');
  // Una ruta nueva no repite id.
  aceptar(m);
  assert.equal(m.lua('SnetForeverPJ.ia.rutas[5].id'), 55);
  assert.equal(m.lua('#SnetForeverPJ.ia.rutas'), 5);
  sinErrores(m);
});

test('ronda 1 (Minor 2): el grupo enseña como mucho 5, las más recientes sumando pines y zona', () => {
  const m = maquina();
  for (let i = 1; i <= 5; i++) {
    aceptar(m, LUGARES, `Ruta ${i}`);
    m.avanzar(10);
  }
  m.lua(`${R}.quitar()`);
  m.lua(`${R}.proponerGuia(${aLua({
    clave: 'IA\\Ruta de Durotar (Horda)', tipo: 'ia', titulo: { es: 'Ruta de Durotar (Horda)', en: 'Durotar route (Horde)' },
    faccion: 'Horde', niveles: { min: 1, max: 12 },
    pasos: [{ elementos: [{ t: 'goto', mapa: 1411, x: 43, y: 69 }, { t: 'accept', q: 4641 }] }],
  })}); ${R}.aceptarGuia(); SnetForever.Guias.cargar(${aLua(CLAVE)})`);
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  const filas = filasMenu(m);
  const grupo = filas.slice(filas.indexOf('Rutas de la IA') + 1);
  assert.deepEqual(grupo, ['Ruta de Durotar (Horda)', 'Ruta 5', 'Ruta 4', 'Ruta 3', 'Ruta 2']);
  assert.equal(m.lua('#SnetForeverPJ.ia.rutas'), 5, 'lo guardado sigue en 5');
  sinErrores(m);
});

test('ronda 1 (Minor 1): más de 5 rutas de zona guardadas se quedan en las 5 más recientes al entrar', () => {
  const guia = (n) => ({ clave: `IA\\Ruta ${n}`, tipo: 'ia', grupo: 'IA', nombre: `Ruta ${n}`, titulo: { es: `Ruta ${n}`, en: `Route ${n}` },
    sinVerificar: true, niveles: { min: 1, max: 60 }, siguientes: [], mazmorras: {}, fuente: { archivo: 'ia', linea: 0 },
    guardada: n, guardadaEn: n === 7 ? 1e15 : 1762790400 + n,
    pasos: [{ id: 'i1', n: 1, etiquetas: {}, requisitos: [], linea: 0, elementos: [{ t: 'accept', q: 4641, linea: 0 }] }] });
  const guias = {};
  for (let n = 1; n <= 7; n++) guias[`IA\\Ruta ${n}`] = guia(n);
  const m = maquina({ guardado: { SnetForeverPJ: { esquema: 1, ia: { guias } } } });
  assert.deepEqual(m.lua(`${R}.guiasIA()`), ['IA\\Ruta 3', 'IA\\Ruta 4', 'IA\\Ruta 5', 'IA\\Ruta 6', 'IA\\Ruta 7']);
  assert.equal(m.lua(`${R}.horaGuia(${aLua('IA\\Ruta 7')})`), undefined, 'fecha rara: sin hora');
  abrirGuias(m);
  pulsarMenu(m, 'Rutas de la IA');
  assert.ok(filasMenu(m).includes('Ruta 7'));
  sinErrores(m);
});
