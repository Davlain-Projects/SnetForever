// Lote B (B1): los addons de datos tal como los carga el juego (solo los archivos del .toc; los de la línea
// «## X-SNF-App» los lee solo la app). Con los datos reales, todo lo que el addon lee de ítems y objetos del mundo sigue
// ahí: los nombres de los ítems y objetos que citan las guías (rutas, cadenas, mejoras y mazmorras), los de los objetivos
// y requisitos de las misiones, y los puntos de los objetos que dan misiones (aviso de continente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { leerToc } from '../src/maquina.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const reales = { skip: hayDatos ? false : 'no están los addons de datos', timeout: 600000 };

// Medidos con los datos 2026.11.10.6 (antes del lote B, con las tablas completas en el juego): los ítems citados que ya
// no tenían nombre en la base, y los objetos que dan misión con puntos de aparición. Con la tabla pequeña no cambian.
const ITEMS_SIN_NOMBRE_EN_LA_BASE = [29010, 33009];
// Lote H, ronda 1 (I2): exacto, sobre los datos de addons/ (van en git y solo cambian al regenerar: que la prueba falle
// entonces es lo que se quiere). 307 con los datos 2026.11.10.x; 303 con los 2026.11.11.2 (QuestieDB 1.0.14 trae más,
// y la lista negra de Questie quita las de las misiones que oculta en el Forever); 311 con los 2026.11.11.3 (ronda 2:
// vuelven las de fiesta que Questie destapa con su evento).
const OBJETOS_DADORES_CON_PUNTOS = 293; // 311 hasta los datos 2026.11.11.5; 265 hasta los 2026.11.11.7; 293 con los 2026.11.13.1 (QuestieDB 1.1.0)

const ORCO = { raza: 'Orc', clase: 'WARRIOR', faccion: 'Horde', nivel: 12, idioma: 'esES' };
const conDatosReales = (jugador = ORCO) => nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador, forever: true });

// Los id (de ítem y de objeto del mundo) que citan las guías y las misiones del juego, y los que se quedan sin nombre
// («#id») con el idioma activo. Se recorre todo en Lua, dentro del banco, con lo que de verdad ha cargado.
const SIN_NOMBRE = `(function()
  local D = SnetForever.Datos
  local items, objetos = {}, {}
  local function recorrer(v)
    if type(v) ~= "table" then return end
    for k, x in pairs(v) do
      if (k == "i" or k == "item") and type(x) == "number" then items[x] = true
      elseif k == "is" and type(x) == "table" then
        for _, id in ipairs(x) do if type(id) == "number" then items[id] = true end end
      elseif k == "objeto" and type(x) == "number" then objetos[x] = true
      else recorrer(x) end
    end
  end
  recorrer(SNF_RUTAS.guias)
  recorrer(SNF_MISIONES.guias)
  for _, m in pairs(SNF_MISIONES.quest) do
    local deItems = type(m.objectives) == "table" and m.objectives[3]
    for _, e in ipairs(type(deItems) == "table" and deItems or {}) do
      if type(e) == "table" and type(e[1]) == "number" then items[e[1]] = true end
    end
    for _, id in ipairs(type(m.requiredSourceItems) == "table" and m.requiredSourceItems or {}) do items[id] = true end
  end
  local salida = {items = 0, objetos = 0, itemsSin = {}, objetosSin = {}}
  for id in pairs(items) do
    salida.items = salida.items + 1
    if string.find(D.nombreItem(id), "^#") then salida.itemsSin[#salida.itemsSin + 1] = id end
  end
  for id in pairs(objetos) do
    salida.objetos = salida.objetos + 1
    if string.find(D.nombreObjeto(id), "^#") then salida.objetosSin[#salida.objetosSin + 1] = id end
  end
  table.sort(salida.itemsSin)
  table.sort(salida.objetosSin)
  return salida
end)()`;

test('lote B: el .toc de Misiones ya no carga item_*, object_*, es_item_* ni es_object_* y los lista en X-SNF-App', reales, () => {
  const { metadatos, archivos } = leerToc(TOC_MISIONES);
  assert.deepEqual(archivos.filter((f) => /^(es_)?(item|object)_\d+\.lua$/.test(f)), []);
  const app = (metadatos['X-SNF-App'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const prefijo of ['item', 'object', 'es_item', 'es_object']) {
    assert.ok(app.some((f) => new RegExp(`^${prefijo}_\\d+\\.lua$`).test(f)), `falta ${prefijo}_<n>.lua en X-SNF-App`);
  }
  for (const f of app) assert.ok(existsSync(join(dirname(TOC_MISIONES), f)), `${f} no está en la carpeta`);
});

test('lote B: con solo lo del .toc, los ítems y objetos de las guías y de las misiones tienen nombre (es y en)', reales, () => {
  const m = conDatosReales();
  // El banco carga lo mismo que el juego: los registros completos no están.
  const cuenta = m.lua('(function() local n = 0 for _ in pairs(SNF_MISIONES.item) do n = n + 1 end return n end)()');
  assert.ok(cuenta < 10000, `SNF_MISIONES.item trae ${cuenta} ítems: parece la tabla completa`);
  const es = m.lua(SIN_NOMBRE);
  console.log(`  citados: ${es.items} ítems y ${es.objetos} objetos; tabla de ítems del juego: ${cuenta}`);
  assert.ok(es.items >= 3000, 'unos 3.000 ítems citados');
  assert.ok(es.objetos >= 10, 'unos 10 objetos citados');
  assert.deepEqual(es.objetosSin, [], 'objetos sin nombre');
  // Los ítems sin nombre en la base ya no lo tenían antes: no son de este lote (ver informe del lote B).
  assert.deepEqual(es.itemsSin, ITEMS_SIN_NOMBRE_EN_LA_BASE);
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const en = m.lua(SIN_NOMBRE);
  assert.deepEqual(en.objetosSin, []);
  assert.deepEqual(en.itemsSin, ITEMS_SIN_NOMBRE_EN_LA_BASE);
  sinErrores(m);
});

test('lote B: el aviso de continente sigue encontrando dónde empiezan las misiones que da un objeto', reales, () => {
  const m = conDatosReales({ raza: 'Human', clase: 'WARRIOR', faccion: 'Alliance', nivel: 12, idioma: 'esES' });
  // Las misiones que empiezan en un objeto del mundo de los dos continentes, y si el addon sabe dónde está ese objeto.
  const r = m.lua(`(function()
    local con, sin = 0, 0
    for q, mision in pairs(SNF_MISIONES.quest) do
      local por = mision.startedBy
      for _, id in ipairs(type(por) == "table" and type(por[2]) == "table" and por[2] or {}) do
        local o = SNF_MISIONES.object[id]
        if type(o) == "table" and type(o.spawns) == "table" and next(o.spawns) then con = con + 1 else sin = sin + 1 end
      end
    end
    return {con = con, sin = sin}
  end)()`);
  assert.equal(r.con, OBJETOS_DADORES_CON_PUNTOS, `objetos dadores con puntos: ${r.con} (sin: ${r.sin})`);
  // Lo que cuenta el aviso, igual que con los datos 2026.11.10.6 (medido en el banco antes del lote B). Lote H: con la
  // 2026.11.11.1 eran 7 y 11 por la 60860 («Your Reward has Arrived!», promoción solo de Asia según Questie); la ronda 1
  // la quita con la lista negra y vuelven las cifras de antes, con el mismo punto.
  // Datos 2026.11.13.1 (QuestieDB 1.1.0): 7, porque «A Warrior's Training» (1638) pasa a ser miga de «Bartleby the
  // Drunk» (1639) y las dos se pueden coger en Ventormenta; el punto de la zona se mueve con ellas.
  const cuenta = m.lua('SnetForever.Continente.contar(0)');
  assert.equal(cuenta.n, 7, 'Reinos del Este, humano guerrero 12');
  assert.deepEqual(cuenta.zonas.map((z) => [z.mapa, z.misiones.length, z.punto.x, z.punto.y]), [[1453, 7, 81.24, 38.25]]);
  sinErrores(m);
  const mago = conDatosReales({ raza: 'Human', clase: 'MAGE', faccion: 'Alliance', nivel: 30, idioma: 'esES' });
  // Datos 2026.11.13.1 (QuestieDB 1.1.0): 9. Salen «A Friend of the Family» (98191, ahora pide antes la 98190) y «The
  // Shamed Lieutenant» (98219, ahora pide la 98191), y entra «Darkspear Islands Clash» (98898, nueva en la base).
  assert.equal(mago.lua('SnetForever.Continente.contar(0)').n, 9, 'Reinos del Este, humano mago 30');
  const orco = conDatosReales();
  assert.equal(orco.lua('SnetForever.Continente.contar(1)').n, 20, 'Kalimdor, orco guerrero 12');
  sinErrores(mago);
  sinErrores(orco);
});

test('lote B (B3): con los datos reales, «Kobold Vermin» (dos id en la base) lleva el 6, el de Elwynn, y lo usa la lista', reales, () => {
  const m = conDatosReales({ raza: 'Human', clase: 'WARRIOR', faccion: 'Alliance', nivel: 1, idioma: 'esES' });
  const r = m.lua(`(function()
    local ids, sin, base = {}, 0, 0
    for _, n in pairs(SNF_MISIONES.npc) do if n.name == "Kobold Vermin" then base = base + 1 end end
    for _, guia in pairs(SNF_RUTAS.guias) do
      for _, paso in ipairs(guia.pasos or {}) do
        for _, el in ipairs(paso.elementos or {}) do
          for _, npc in ipairs(type(el.npcs) == "table" and el.npcs or {}) do
            if npc.nombre == "Kobold Vermin" then
              if npc.id then ids[#ids + 1] = npc.id else sin = sin + 1 end
            end
          end
        end
      end
    end
    return {ids = ids, sin = sin, base = base}
  end)()`);
  assert.ok(r.base >= 2, 'el nombre está repetido en la base');
  assert.ok(r.ids.length > 0, 'ninguna guía lo pide');
  assert.deepEqual([...new Set(r.ids)], [6]);
  assert.equal(r.sin, 0);
  sinErrores(m);
});
