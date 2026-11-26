// El menú de guías con muchas guías (por ejemplo, decenas de «Mis guías»): no crece más que la pantalla y se recorre con
// la rueda del ratón, de modo que se puede llegar a la última guía y cargarla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const MENU = 'SnetForeverMenuGuias';
const N = 80;

const muchas = () => {
  const guias = [];
  for (let i = 1; i <= N; i++) {
    guias.push(`{nombre = "Guía ${String(i).padStart(2, '0')}", niveles = {1, 60}, faccion = "Horda", pasos = {{texto = "Paso ${i}"}}}`);
  }
  return `SnetForeverMisGuias = {${guias.join(',\n')}}`;
};

function conMuchas() {
  const m = nuevaMaquina({ previo: muchas() });
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto())');
  m.lua(`${V}.crear()`);
  m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');
  return m;
}

// Filas visibles del menú: texto y su hueco (arriba y abajo) en coordenadas del menú.
const filas = (m) =>
  m.lua(`(function() local t = {}
    for _, f in ipairs(${M}.menu.filas) do
      if f:IsVisible() then
        local _, _, _, _, y = f:GetPoint()
        t[#t + 1] = {texto = f.texto:GetText(), arriba = -y, abajo = -y + f:GetHeight()}
      end
    end
    return t end)()`) || [];
const textos = (m) => filas(m).map((f) => f.texto);
const rueda = (m, delta, veces = 1) => {
  for (let i = 0; i < veces; i++) m.lua(`${MENU}:GetScript("OnMouseWheel")(${MENU}, ${delta})`);
};
function pulsar(m, buscado) {
  const ok = m.lua(`(function()
    for _, fila in ipairs(${M}.menu.filas) do
      if fila:IsVisible() and string.find(fila.texto:GetText() or "", ${aLua(buscado)}, 1, true) then fila:Click(); return true end
    end
    return false end)()`);
  assert.ok(ok, `no hay en el menú una fila visible con «${buscado}»`);
}

test('menú con 80 guías propias: no pasa del alto de la pantalla y ninguna fila visible se sale del menú', () => {
  const m = conMuchas();
  pulsar(m, 'Mis guías');
  const alto = m.lua(`${MENU}:GetHeight()`);
  const altoPantalla = m.lua(`UIParent:GetHeight() / ${MENU}:GetScale()`);
  assert.ok(alto <= altoPantalla, `el menú mide ${alto} y la pantalla ${altoPantalla}`);
  const vis = filas(m);
  assert.ok(vis.length > 5, 'se ven filas');
  for (const f of vis) assert.ok(f.abajo <= alto && f.arriba >= 0, `«${f.texto}» se sale del menú (${f.arriba}-${f.abajo} de ${alto})`);
  assert.ok(!textos(m).some((t) => t.includes('Guía 80')), 'la última no cabe al abrir');
  sinErrores(m);
});

test('menú con 80 guías propias: la rueda baja hasta la última, se puede cargar, y subir vuelve al principio', () => {
  const m = conMuchas();
  pulsar(m, 'Mis guías');
  rueda(m, -1, 60);
  assert.ok(textos(m).some((t) => t.includes('Guía 80')), textos(m).join(' | '));
  // Seguir bajando no deja el menú vacío: la última sigue a la vista.
  rueda(m, -1, 20);
  assert.ok(textos(m).some((t) => t.includes('Guía 80')), 'pasado el final no se va más allá');
  rueda(m, 1, 80);
  const t = textos(m);
  assert.ok(t.some((s) => s.includes('Mis guías')) && t.some((s) => s.includes('Guía 01')), t.join(' | '));
  rueda(m, -1, 60);
  pulsar(m, 'Guía 80');
  assert.equal(m.lua('SnetForever.Motor.estado().clave'), 'Mis guías\\Guía 80');
  assert.equal(m.lua(`${MENU}:IsShown()`), false, 'cargar cierra el menú');
  sinErrores(m);
});

test('al volver a abrir el menú empieza arriba del todo', () => {
  const m = conMuchas();
  pulsar(m, 'Mis guías');
  rueda(m, -1, 60);
  m.lua(`${V}.cerrarMenu()`);
  m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');
  assert.ok(textos(m).some((s) => s.includes('Mis guías')), textos(m).join(' | '));
  sinErrores(m);
});
