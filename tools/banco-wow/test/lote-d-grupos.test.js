// Lote D (D3, lo vio el jugador el 10-nov): en el menú «Elegir guía» los grupos salían con su nombre interno en inglés
// («Skyrim Horde 22-30 (EN)»). Ahora el nombre visible sale de Guias.tituloGrupo: «Skyrim Horda 22-30» en español y
// «Skyrim Horde 22-30» en inglés, sin «(EN)» en ninguno de los dos. La clave interna no cambia (las guías guardadas la
// usan). Al final, con los datos reales si están: el menú de el druida de prueba en español no tiene «(EN)» ni «Horde».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const conDatos = { skip: hayDatos ? false : 'no están los addons de datos (fase 1 sin generar)' };

const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const EN = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } } };
const ES = { SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'es' } } };
const DRUIDA_SKYBORNE = { clase: 'DRUID', raza: 'Skyborne', faccion: 'Horde', nivel: 22 };

const tituloGrupo = (m, nombre) => m.lua(`SnetForever.Guias.tituloGrupo(${aLua(nombre)})`);
const abrirGuias = (m) => m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');
const filasMenu = (m) => m.lua(`(function() local t = {}
  for _, f in ipairs(${M}.menu.filas) do if f:IsVisible() then t[#t + 1] = f.texto:GetText() end end
  return t end)()`) || [];

// Los grupos de los datos reales (SNF_RUTAS.grupos, conversor 2026.11.10.6) y lo que se ve en cada idioma.
const GRUPOS = [
  ['RestedXP Forever Guide (A)', 'RestedXP Forever (Alianza)', 'RestedXP Forever (Alliance)'],
  ['RestedXP Forever Guide (H)', 'RestedXP Forever (Horda)', 'RestedXP Forever (Horde)'],
  ['RestedXP Forever Dungeon Guide (A)', 'RestedXP Forever con mazmorras (Alianza)', 'RestedXP Forever with dungeons (Alliance)'],
  ['RestedXP Forever Dungeon Guide (H)', 'RestedXP Forever con mazmorras (Horda)', 'RestedXP Forever with dungeons (Horde)'],
  ['RestedXP ADV AoE Alliance Mage', 'RestedXP Mago AoE avanzado (Alianza)', 'RestedXP ADV AoE Mage (Alliance)'],
  ['RestedXP Alliance Mage', 'RestedXP Mago (Alianza)', 'RestedXP Mage (Alliance)'],
  ['RestedXP Horde Mage AoE', 'RestedXP Mago AoE (Horda)', 'RestedXP Mage AoE (Horde)'],
  ['Skyrim Horde Mage AoE (EN)', 'Skyrim Mago AoE (Horda)', 'Skyrim Mage AoE (Horde)'],
  ['Skyrim Horde 22-30 (EN)', 'Skyrim Horda 22-30', 'Skyrim Horde 22-30'],
  ['Skyrim Horde 30-40 (EN)', 'Skyrim Horda 30-40', 'Skyrim Horde 30-40'],
  ['Skyrim Horde 40-50 (EN)', 'Skyrim Horda 40-50', 'Skyrim Horde 40-50'],
  ['Skyrim Horde 50-60 (EN)', 'Skyrim Horda 50-60', 'Skyrim Horde 50-60'],
  ['Skyrim Alliance 20-30 (EN)', 'Skyrim Alianza 20-30', 'Skyrim Alliance 20-30'],
  ['Skyrim Alliance 30-40 (EN)', 'Skyrim Alianza 30-40', 'Skyrim Alliance 30-40'],
  ['Skyrim Alliance 40-50 (EN)', 'Skyrim Alianza 40-50', 'Skyrim Alliance 40-50'],
  ['Skyrim Alliance 50-60 (EN)', 'Skyrim Alianza 50-60', 'Skyrim Alliance 50-60'],
  ['Skyrim Alliance Mage (EN)', 'Skyrim Mago (Alianza)', 'Skyrim Mage (Alliance)'],
  ['Skyrim ADV AoE Alliance Mage (EN)', 'Skyrim Mago AoE avanzado (Alianza)', 'Skyrim ADV AoE Mage (Alliance)'],
];

test('D3: Guias.tituloGrupo da cada grupo de los datos en español y en inglés, sin «(EN)»', () => {
  const es = nuevaMaquina({ guardado: ES });
  const en = nuevaMaquina({ guardado: EN });
  for (const [grupo, enEs, enEn] of GRUPOS) {
    assert.equal(tituloGrupo(es, grupo), enEs, grupo);
    assert.equal(tituloGrupo(en, grupo), enEn, grupo);
  }
  sinErrores(es);
  sinErrores(en);
});

test('D3: un grupo que no está en la tabla se traduce palabra a palabra y pierde el «(EN)»; uno sin nada que traducir sale igual', () => {
  const es = nuevaMaquina({ guardado: ES });
  const en = nuevaMaquina({ guardado: EN });
  assert.equal(tituloGrupo(es, 'Skyrim Horde Warrior 60 (EN)'), 'Skyrim Horda Guerrero 60');
  assert.equal(tituloGrupo(en, 'Skyrim Horde Warrior 60 (EN)'), 'Skyrim Horde Warrior 60');
  assert.equal(tituloGrupo(es, 'Prueba (H)'), 'Prueba (H)'); // las siglas valen en los dos idiomas
  assert.equal(tituloGrupo(es, 'Otra cosa'), 'Otra cosa');
  assert.equal(tituloGrupo(es, ''), '');
  sinErrores(es);
});

test('D3: en el menú «Elegir guía» el grupo se ve traducido y al pulsarlo se abre (la clave interna no cambia)', () => {
  for (const [guardado, esperado] of [[ES, 'Skyrim Horda 22-30'], [EN, 'Skyrim Horde 22-30']]) {
    const m = nuevaMaquina({ guardado, jugador: { nivel: 22 } });
    const clave = 'Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad';
    m.ponerGuia(guiaDePrueba([{ elementos: [{ t: 'accept', q: 788 }] }], {
      clave, grupo: 'Skyrim Horde 22-30 (EN)', nombre: '22-24 Hillsbrad', niveles: [22, 24],
      titulo: { en: '22-24 Hillsbrad', es: '22-24 Laderas de Trabalomas' },
    }));
    m.lua(`${V}.crear()`);
    abrirGuias(m);
    const filas = filasMenu(m);
    assert.ok(filas.includes(esperado), filas.join(' | '));
    assert.ok(!filas.some((f) => f.includes('(EN)')), filas.join(' | '));
    // El grupo se abre por su clave interna: sale la guía y se puede cargar.
    m.lua(`(function() for _, f in ipairs(${M}.menu.filas) do
      if f:IsVisible() and f.texto:GetText() == ${aLua(esperado)} then f:Click() return end end end)()`);
    const titulo = guardado === ES ? '22-24 Laderas de Trabalomas' : '22-24 Hillsbrad';
    assert.ok(filasMenu(m).includes(titulo), filasMenu(m).join(' | '));
    m.lua(`(function() for _, f in ipairs(${M}.menu.filas) do
      if f:IsVisible() and f.texto:GetText() == ${aLua(titulo)} then f:Click() return end end end)()`);
    assert.equal(m.lua('SnetForever.Motor.estado().clave'), clave);
    assert.equal(m.lua('SnetForeverPJ.guia'), clave);
    sinErrores(m);
  }
});

test('D3: con los datos reales, el menú de el druida de prueba en español no contiene «(EN)» ni «Horde»; en inglés, ningún «(EN)»', conDatos, () => {
  for (const [guardado, prohibidas] of [[ES, ['(EN)', 'Horde']], [EN, ['(EN)']]]) {
    const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: DRUIDA_SKYBORNE, guardado });
    m.lua(`${V}.crear()`);
    abrirGuias(m);
    // Todos los grupos plegables abiertos (los principales por su nombre y las secciones laterales), para ver también
    // los nombres de las guías.
    m.lua(`(function()
      local abiertos = ${M}.menu.abiertos
      for _, g in ipairs(SnetForever.Guias.delMenu(SnetForever.Ajustes.get("version"))) do
        abiertos[g.grupo] = true
        abiertos["\\002" .. g.grupo] = true
      end
      for _, tipo in ipairs({"cadena", "mejora", "profesion", "mazmorra", "ia"}) do abiertos["\\001" .. tipo] = true end
      SnetForever.Ventana.abrirMenu()
    end)()`);
    const filas = filasMenu(m);
    assert.ok(filas.length > 5, filas.join(' | '));
    const grupos = m.lua(`(function() local t = {}
      for _, g in ipairs(SnetForever.Guias.delMenu(SnetForever.Ajustes.get("version"))) do
        t[#t + 1] = SnetForever.Guias.tituloGrupo(g.grupo) end return t end)()`);
    for (const p of prohibidas) {
      assert.ok(!grupos.some((g) => g.includes(p)), `«${p}» en los grupos: ${grupos.join(' | ')}`);
      assert.ok(!filas.some((f) => f.includes(p)), `«${p}» en el menú: ${filas.filter((f) => f.includes(p)).join(' | ')}`);
    }
    sinErrores(m);
  }
});
