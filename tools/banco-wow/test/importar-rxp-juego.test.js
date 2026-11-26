// Importar guías RXP desde el juego (motor/importar-rxp.lua y ui/importar-rxp.lua) con un paquete del conversor real
// (npm run importar:rxp -- --juego). Biblioteca sintética: ninguna guía real ni datos de personajes.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { importarRXP, importarRXPJuego } from '../../conversor/src/importar-rxp.js';
import { adler32 } from '../../conversor/src/rxp/paquete.js';
import { nuevaMaquina, sinErrores, withGuideDetails } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RUTA = 'RXP\\Ruta de prueba\\22-24 Camino';
const DESTINO = 'RXP\\Ruta de prueba\\24-26 Cima';
const GRUPO = 'Mis guías RXP · Ruta de prueba';
const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const JUGADOR = { jugador: { nivel: 22, faccion: 'Horde', clase: 'WARRIOR', raza: 'Orc' } };

function biblioteca(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'snet-rxp-juego-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  mkdirSync(join(raiz, 'Guides', 'forever'), { recursive: true });
  mkdirSync(join(raiz, 'DB', 'forever'), { recursive: true });
  writeFileSync(join(raiz, 'DB', 'forever', 'db.lua'), 'addon.mapId = {["Durotar"] = 1411}');
  writeFileSync(join(raiz, 'LICENSE'), 'Fixture sintético.');
  writeFileSync(join(raiz, 'Guides', 'forever', 'prueba.lua'), String.raw`
error("El Lua de origen no se ejecuta")
addon:RegisterGuide([[
#group Ruta de prueba
#name 22-24 Camino
#next 24-26 Cima
<< Horde
step
    +Primera parada con «tildes» y |cFFFF0000color|r
step
    #xprate >1.49
    +Parada con experiencia aumentada
step << Mage
    +Visita al instructor
step
    .accept 788 >>Acepta la misión
step
    +Última parada
]])
addon:RegisterGuide([[
#group Ruta de prueba
#name 24-26 Cima
<< Horde
step
    +Tramo siguiente
]])
`);
  return raiz;
}

// Las partes del paquete de una biblioteca, en partes pequeñas para que haya varias.
function paquete(t, raiz, selectores = ['Ruta de prueba']) {
  const salida = mkdtempSync(join(tmpdir(), 'snet-rxp-paquete-'));
  t.after(() => rmSync(salida, { recursive: true, force: true }));
  const r = importarRXPJuego(raiz, salida, selectores, { version: '2026.01.01.1', tamanoParte: 1500 });
  const partes = readdirSync(r.destino).filter((f) => f.startsWith('parte-')).sort()
    .map((f) => readFileSync(join(r.destino, f), 'ascii'));
  return { ...r, partes, leeme: readFileSync(join(r.destino, 'LEEME.txt'), 'utf8') };
}

const estado = (m) => m.lua('SnetForever.ImportarRXP.estado()');
const pegar = (m, texto) => m.lua(`SnetForever.ImportarRXPVentana.pegar(${aLua(texto)})`);
const textoEstado = (m) => m.lua('SnetForever.ImportarRXPVentana.marcos.dialogo.estado:GetText()');

function esperarComprobacion(m) {
  for (let i = 0; i < 400 && estado(m).fase === 'comprobando'; i++) m.avanzar(0.05);
}

function pegarTodo(m, partes) {
  m.lua('SnetForever.ImportarRXPVentana.abrir()');
  for (const parte of [...partes].reverse()) pegar(m, parte); // en cualquier orden
  esperarComprobacion(m);
}

// Una parte con el trozo cambiado y las dos sumas rehechas: pasa la comprobación de la parte, no la del contenido.
function rehacer(texto, cambiar) {
  const nuevo = cambiar(texto);
  return `SNFRXP1:0badc0de:1:1:${adler32(nuevo)}:${adler32(nuevo)}:${nuevo}`;
}

test('el conversor prepara un paquete por partes con su LEEME y se niega a uno a medias', (t) => {
  const raiz = biblioteca(t);
  const p = paquete(t, raiz);
  assert.ok(p.partes.length > 1);
  assert.equal(p.guias, 2);
  assert.ok(p.partes.every((parte) => /^[ -~]+$/.test(parte) && !parte.includes('|')), 'solo ASCII imprimible y sin «|»');
  assert.match(p.leeme, new RegExp(`Paquete ${p.id} · ${p.partes.length} partes · 2 guías · ${p.pasos} pasos`));
  assert.match(p.leeme, /\/snet importar/);
  assert.throws(() => paquete(t, raiz, ['Ruta de prueba', 'Grupo que no existe']), /Grupo que no existe/);
  assert.throws(() => paquete(t, raiz, []), /al menos un grupo/);
  const solo = paquete(t, raiz, ['Ruta de prueba\\22-24 Camino']);
  assert.equal(solo.guias, 1);
  assert.deepEqual(solo.fuera, [DESTINO], 'el destino que no va en el paquete se nombra');
});

test('desde el juego: se pegan las partes, se comprueba todo, se confirma y la ruta se sigue como la del addon', (t) => {
  const p = paquete(t, biblioteca(t));
  const m = withGuideDetails(JUGADOR);
  const deMenu = m.lua('(function() SnetForever.Ventana.crear(); SnetForever.Ventana.abrirMenu() local s = {} for _, f in ipairs(SnetForeverMenuGuias.filas or SnetForever.Ventana.marcos.menu.filas) do if f:IsShown() then s[#s + 1] = f.texto:GetText() end end return s end)()');
  assert.ok(deMenu.includes('Mis guías: importar de RestedXP…'));
  m.lua(`(function()
    for _, f in ipairs(SnetForever.Ventana.marcos.menu.filas) do
      if f:IsShown() and f.texto:GetText() == "Mis guías: importar de RestedXP…" then f.accion("LeftButton") end
    end
  end)()`);
  assert.equal(m.lua('SnetForeverImportarRXP:IsShown()'), true, 'la entrada de «Mis guías» abre la ventana');

  // Una parte cortada no entra; las buenas sí, en cualquier orden y repetidas.
  pegar(m, p.partes[0].slice(0, -10));
  assert.match(textoEstado(m), /no llegó entera/);
  pegar(m, p.partes[1]);
  pegar(m, p.partes[1]);
  assert.deepEqual([estado(m).recibidas, estado(m).total], [1, p.partes.length]);
  assert.match(textoEstado(m), new RegExp(`Paquete ${p.id}: 1 de ${p.partes.length} partes`));
  for (const parte of p.partes) {
    m.lua(`(function()
      local caja = SnetForever.ImportarRXPVentana.marcos.dialogo.caja
      caja:SetText(${aLua(parte)})
      caja:GetScript("OnTextChanged")(caja, true)
    end)()`);
  }
  assert.equal(m.lua('SnetForever.ImportarRXPVentana.marcos.dialogo.caja:GetText()'), '');
  esperarComprobacion(m);
  const e = estado(m);
  assert.equal(e.fase, 'listo');
  assert.deepEqual([e.resumen.guias, e.resumen.pasos], [2, p.pasos]);
  assert.match(textoEstado(m), new RegExp(`Paquete ${p.id} comprobado: 2 guías y ${p.pasos} pasos`));
  assert.equal(m.lua('SnetForeverPJ.rxp'), undefined, 'nada se guarda antes de confirmar');
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(RUTA)})`), undefined);

  m.lua('SnetForever.ImportarRXPVentana.importar()');
  assert.equal(m.lua('#SnetForeverPJ.rxp.orden'), 1);
  assert.equal(m.lua(`SnetForeverPJ.rxp.paquetes[${aLua(p.id)}].guias`), 2);
  const menu = m.lua('SnetForever.Guias.delMenu("normal")');
  assert.ok(menu.find((g) => g.grupo === GRUPO)?.claves.includes(RUTA));

  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(RUTA)})`), true);
  const guia = m.lua(`SnetForever.Datos.guia(${aLua(RUTA)})`);
  assert.equal(guia.pasos[0].elementos[0].texto.en, 'Primera parada con «tildes» y |cFFFF0000color|r', 'UTF-8 y «|» intactos');
  assert.ok(guia.pasos.some((paso) => JSON.stringify(paso.filtro ?? '').includes('c:MAGE')), 'filtros');
  assert.ok(guia.pasos.some((paso) => paso.elementos.some((el) => el.t === 'accept' && el.q === 788)), 'eventos');
  assert.equal(guia.siguientes[0].clave, DESTINO, 'ruta original');
  // XP: el paso de experiencia aumentada solo sale con el multiplicador.
  assert.notEqual(m.lua('SnetForever.Motor.paso(2).datos.elementos[1].texto.en'), 'Parada con experiencia aumentada');
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  m.avanzar(0.25);
  assert.equal(m.lua('SnetForever.Motor.estado().actual'), 2);
  sinErrores(m);

  // Al volver a entrar (otra sesión), el paquete guardado se lee de nuevo y el progreso sigue.
  const guardado = m.guardado();
  const otra = withGuideDetails({ ...JUGADOR, guardado });
  assert.equal(otra.lua('SnetForever.Motor.estado().clave'), RUTA);
  assert.equal(otra.lua('SnetForever.Motor.estado().actual'), 2);
  otra.lua('SnetForever.ImportarRXPVentana.abrir()');
  assert.match(otra.lua('SnetForever.ImportarRXPVentana.marcos.dialogo.filas[1].texto:GetText()'), new RegExp(`^${p.id} · 2 guías`));
  otra.lua('SnetForever.ImportarRXPVentana.marcos.dialogo.filas[1].quitar:Click()');
  assert.equal(otra.lua(`SnetForever.Datos.guia(${aLua(RUTA)})`), undefined, 'quitar el paquete quita sus guías');
  assert.equal(otra.lua('#SnetForeverPJ.rxp.orden'), 0);
  sinErrores(otra);
});

test('un paquete importado sustituye al del addon con las mismas claves y conserva el progreso de cada paso', (t) => {
  const raiz = biblioteca(t);
  const addon = importarRXP(raiz, raiz, '2026.01.01.1');
  const p = paquete(t, raiz);
  const m = withGuideDetails({
    ...JUGADOR,
    datos: [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(addon.destino, 'SnetForever_RutasRXP.toc')],
  });
  assert.equal(m.lua(`SnetForever.Guias.cargar(${aLua(RUTA)})`), true);
  m.lua('SnetForever.Motor.marcarManual(1, 1, true)');
  m.avanzar(0.25);
  const id = m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).datos.id');
  pegarTodo(m, p.partes);
  assert.equal(estado(m).resumen.delAddon, 2);
  assert.match(textoEstado(m), /Sustituye 2 guías de SnetForever_RutasRXP/);
  m.lua('SnetForever.ImportarRXPVentana.importar()');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), RUTA);
  assert.equal(m.lua('SnetForever.Motor.paso(SnetForever.Motor.estado().actual).datos.id'), id);
  assert.equal(m.lua(`SnetForever.Datos.guia(${aLua(RUTA)}) == SnetForeverRutasRXP.guias[${aLua(RUTA)}]`), false);
  sinErrores(m);
});

test('nada a medias: un resumen que no cuadra o un dato que no es una tabla literal no se importa', (t) => {
  const p = paquete(t, biblioteca(t));
  const entero = p.partes.map((parte) => parte.split(':').slice(6).join(':')).join('');
  const m = nuevaMaquina(JUGADOR);
  m.lua('SnetForever.ImportarRXPVentana.abrir()');
  pegar(m, rehacer(entero, (s) => s.replace('resumen={guias=2', 'resumen={guias=3')));
  esperarComprobacion(m);
  assert.equal(estado(m).fase, 'error');
  assert.match(textoEstado(m), /^No se ha importado nada: trae 2 guías y \d+ pasos, pero su resumen dice 3/);
  m.lua('SnetForever.ImportarRXPVentana.importar()');
  assert.equal(m.lua('SnetForeverPJ.rxp'), undefined);

  for (const codigo of ['{f=1,guias=os.exit()}', '{f=1,x=function() end}', '{f=1}..("x")', '{f=1,["a"]=1,a=2}', 'x={}']) {
    assert.equal(m.lua(`(SnetForever.ImportarRXP.leer(${aLua(codigo)}))`), undefined, codigo);
  }
  assert.deepEqual(m.lua('SnetForever.ImportarRXP.leer("{1,true,false,-2.5e3,\\"a\\\\124b\\\\195\\\\173\\",[6]={k=\\"v\\"}}")'),
    [1, true, false, -2500, 'a|bí', { k: 'v' }]);
  assert.equal(m.lua('(SnetForever.ImportarRXP.leer("{1,[1]=2}"))'), undefined, 'una clave repetida no vale');
  pegar(m, 'texto cualquiera que no es una parte');
  assert.match(textoEstado(m), /no es una parte de un paquete/);
  sinErrores(m);
});

test('una parte puede terminar en un espacio del texto de la guía', (t) => {
  const p = paquete(t, biblioteca(t));
  const entero = p.partes.map((parte) => parte.split(':').slice(6).join(':')).join('');
  const corte = entero.indexOf('Primera parada') + 'Primera '.length;
  const trozos = [entero.slice(0, corte), entero.slice(corte)];
  assert.ok(trozos[0].endsWith(' '));
  const m = nuevaMaquina(JUGADOR);
  const partes = trozos.map((trozo, i) => `SNFRXP1:${p.id}:${i + 1}:2:${p.suma}:${adler32(trozo)}:${trozo}\r\n`);
  pegarTodo(m, partes);
  assert.equal(estado(m).fase, 'listo');
  sinErrores(m);
});

test('la ventana permite quitar un paquete antiguo aunque la primera página esté llena', (t) => {
  const p = paquete(t, biblioteca(t));
  const m = nuevaMaquina(JUGADOR);
  for (const id of ['abc00001', 'abc00002', 'abc00003', 'abc00004', 'abc00005']) {
    pegarTodo(m, p.partes.map((parte) => parte.replace(p.id, id)));
    assert.equal(estado(m).fase, 'listo');
    m.lua('SnetForever.ImportarRXPVentana.importar()');
  }
  const dialogo = 'SnetForever.ImportarRXPVentana.marcos.dialogo';
  assert.equal(m.lua(`${dialogo}.pagina:GetText()`), '1/2');
  assert.equal(m.lua(`${dialogo}.filas[1].id`), 'abc00005');
  m.lua(`${dialogo}.siguiente:Click()`);
  assert.equal(m.lua(`${dialogo}.pagina:GetText()`), '2/2');
  assert.equal(m.lua(`${dialogo}.filas[1].id`), 'abc00001');
  m.lua(`${dialogo}.filas[1].quitar:Click()`);
  assert.equal(m.lua('SnetForeverPJ.rxp.paquetes.abc00001'), undefined);
  assert.equal(m.lua(`${dialogo}.pagina:IsShown()`), false);
  assert.equal(m.lua(`${dialogo}.filas[1].id`), 'abc00005');
  sinErrores(m);
});

test('en combate la comprobación espera y sigue al salir', (t) => {
  const p = paquete(t, biblioteca(t));
  const m = nuevaMaquina(JUGADOR);
  m.jugador({ enCombate: true });
  pegarTodo(m, p.partes);
  assert.equal(estado(m).fase, 'comprobando');
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  esperarComprobacion(m);
  assert.equal(estado(m).fase, 'listo');
  assert.deepEqual(m.bloqueos(), []);
  sinErrores(m);
});
