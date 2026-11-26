// Lote A (revisión 52, I2): con los datos reales, los 27 pasos con texto visible que se daban por hechos al instante
// (sin un elemento que pudiera quedar pendiente) ya no se completan solos: o su bankwithdraw con texto espera a que los
// objetos estén en las bolsas, o el conversor les puso una casilla (manual). Marcar esa casilla sí los completa.
// La lista sale de recorrer los datos 2026.11.10.2 como el informe de la revisión (sin los pegajosos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const opciones = { skip: existsSync(TOC_RUTAS) ? false : 'no está addons/SnetForever_Rutas (la fase 1 no se ha generado)' };

const pj = (raza, clase, faccion) => ({ raza, clase, faccion });
const ORCO = pj('Orc', 'WARRIOR', 'Horde');
const ORCO_PICARO = pj('Orc', 'ROGUE', 'Horde');
const ORCO_BRUJO = pj('Orc', 'WARLOCK', 'Horde');
const ORCO_CAZADOR = pj('Orc', 'HUNTER', 'Horde');
const TROL_MAGO = pj('Troll', 'MAGE', 'Horde');
const HUMANO = pj('Human', 'WARRIOR', 'Alliance');
const HUMANO_MAGO = pj('Human', 'MAGE', 'Alliance');
const GNOMO_MAGO = pj('Gnome', 'MAGE', 'Alliance');
const ELFO_CAZADOR = pj('NightElf', 'HUNTER', 'Alliance');
const ENANO_CAZADOR = pj('Dwarf', 'HUNTER', 'Alliance');

// Lote H: cada paso va por su id estable (el de los datos 2026.11.10.10; entre paréntesis, su número entonces), no por su
// número: RXPGuides 4.11.35 movió dos de ellos (Wailing Caverns 131 -> 130, Stonetalon 331 -> 329) sin cambiarlos. Si un
// id desaparece, el paso ha cambiado de verdad y la prueba lo dice.
const AOE_A = 'Skyrim ADV AoE Alliance Mage (EN)\\';
const CASOS = [
  ['Profesiones\\01-300 Herbalism (H)', '6246023e', ORCO], // (19)
  ['RestedXP ADV AoE Alliance Mage\\16-18 ADV Westfall Mage AoE', 'c5c5a56c', HUMANO_MAGO], // (3)
  // El mismo paso para un gnomo (su bankwithdraw es otro) y para un Skyborne, que no tiene ninguno: lleva la casilla.
  ['RestedXP ADV AoE Alliance Mage\\16-18 ADV Westfall Mage AoE', 'c5c5a56c', GNOMO_MAGO], // (3)
  ['RestedXP ADV AoE Alliance Mage\\16-18 ADV Westfall Mage AoE', 'c5c5a56c', pj('Skyborne', 'MAGE', 'Alliance')], // (3)
  ['RestedXP ADV AoE Alliance Mage\\20-22 ADV Redridge 1 Mage AoE', 'c2972b72', HUMANO_MAGO], // (124)
  ['RestedXP Forever Dungeon Guide (A)\\06-11 Teldrassil', 'b2b92bfe', ELFO_CAZADOR], // (26)
  ['RestedXP Forever Dungeon Guide (H)\\21-22 Wailing Caverns', 'c4fee0b4', ORCO_PICARO], // (131; 130 en la 4.11.35)
  ['RestedXP Forever Guide (A)\\06-11 Teldrassil', '13bf16ac', ELFO_CAZADOR], // (26)
  ['RestedXP Forever Guide (H)\\17-22 Stonetalon/Barrens/Ashenvale', '53e1a3dd', ORCO_PICARO], // (331; 329 en la 4.11.35)
  ['RestedXP Horde Mage AoE\\12-17 The Barrens AoE', 'bf089577', TROL_MAGO], // (91)
  [`${AOE_A}22-26 ADV Wetlands 1 Mage AoE`, '80f83412', HUMANO_MAGO], // (89)
  [`${AOE_A}27-32 ADV Duskwood Mage AoE`, '814668b6', HUMANO_MAGO], // (138)
  [`${AOE_A}41-41 ADV Dustwallow/Alterac Mage AoE`, '322cf05e', HUMANO_MAGO], // (3)
  [`${AOE_A}41-41 ADV Dustwallow/Alterac Mage AoE`, '7f805762', HUMANO_MAGO], // (4)
  [`${AOE_A}41-41 ADV Dustwallow/Alterac Mage AoE`, 'eb85067c', HUMANO_MAGO], // (5)
  [`${AOE_A}50-51 ADV Searing Gorge Mage AoE`, 'e4405bbf', HUMANO_MAGO], // (5)
  [`${AOE_A}51-52 ADV Tanaris/Un'Goro Mage AoE`, '6241634c', HUMANO_MAGO], // (17)
  [`${AOE_A}51-52 ADV Tanaris/Un'Goro Mage AoE`, 'ea8db7c7', HUMANO_MAGO], // (21)
  [`${AOE_A}51-52 ADV Tanaris/Un'Goro Mage AoE`, '437bd5c0', HUMANO_MAGO], // (48)
  [`${AOE_A}51-52 ADV Tanaris/Un'Goro Mage AoE`, '54525098', HUMANO_MAGO], // (66)
  ['Skyrim Alliance 20-30 (EN)\\27-29 Wetlands/Hillsbrad', '49456c7c', ENANO_CAZADOR], // (4)
  ['Skyrim Alliance 30-40 (EN)\\29-32 Duskwood', '1637d8b5', HUMANO], // (15)
  ['Skyrim Alliance 30-40 (EN)\\29-32 Duskwood', '607800e7', HUMANO_MAGO], // (117)
  ['Skyrim Alliance 30-40 (EN)\\29-32 Duskwood', '738ede36', HUMANO], // (119)
  ['Skyrim Alliance 30-40 (EN)\\34-35 Stranglethorn Vale I', 'c6cb0287', HUMANO], // (69)
  ['Skyrim Alliance 40-50 (EN)\\40-41 Badlands', '0d193aa2', HUMANO], // (4)
  ['Skyrim Horde 22-30 (EN)\\24-26 Southern Barrens/Stonetalon', '55ee9a20', ORCO_BRUJO], // (12)
  ['Skyrim Horde 30-40 (EN)\\34-35 Desolace', '86564da8', ORCO_CAZADOR], // (52)
  ['Skyrim Horde 50-60 (EN)\\59-60 Winterspring/Silithus II', '40030806', ORCO], // (17)
];

// Prepara el juego para que las condiciones del paso (las que lo saltan) no lo salten: la misión de un isOnQuest en
// el diario, lo que pide un itemcount en las bolsas, el aura de un aura, el tiempo de reutilización de un cooldown, y
// el nivel de su #level. Todo sale de los datos del propio paso. Devuelve el nivel con el que hay que entrar.
const PREPARAR = `(function(clave, n)
  local guia = SnetForever.Datos.guia(clave)
  local paso
  for _, p in ipairs(guia.pasos) do if p.n == n then paso = p end end
  local nivel = SnetForever.Guias.niveles(guia)
  for _, r in ipairs(paso.requisitos or {}) do
    if r.t == "nivel" then nivel = math.max(nivel, r.n) end
    if r.t == "objeto" then BANCO.ponerObjeto(r.i, r.n, {}) end
  end
  for _, el in ipairs(paso.elementos) do
    if el.t == "isOnQuest" then
      for _, q in ipairs(el.qs) do BANCO.ponerMision(q, {enDiario = true}) end
    elseif el.t == "itemcount" and el.efecto == "saltar_si_no_alcanzado" then
      BANCO.ponerObjeto(el.is[1], el.n + 1, {})
    elseif el.t == "aura" and el.efecto == "saltar_si_no_alcanzado" then
      BANCO.ponerAura({spellId = el.spell, restante = 600})
    elseif el.t == "cooldown" and el.efecto == "saltar_si_alcanzado" and el.op == "<" then
      BANCO.ponerEnfriamiento(el.tipo, el.id, 600)
    end
  end
  return nivel
end)`;

// Número del paso con ese id en la guía cargada, o nil.
const NUMERO_DE = `(function(clave, id)
  for _, p in ipairs(SnetForever.Datos.guia(clave).pasos) do if p.id == id then return p.n end end
  return nil
end)`;

// Comprueba un paso (por su id) en la máquina `m` (ya con el personaje): devuelve el fallo, o null.
function comprobar(m, clave, id) {
  const n = m.lua(`${NUMERO_DE}(${aLua(clave)}, ${aLua(id)})`);
  if (typeof n !== 'number') return `no hay ningún paso con el id ${id}: ha cambiado de verdad`;
  const nivel = m.lua(`${PREPARAR}(${aLua(clave)}, ${n})`);
  m.jugador({ nivel });
  m.lua(`SnetForever.Guias.cargar(${aLua(clave)}, {n = ${n}})`);
  // Un #requires del paso (Un'Goro 48 espera a «TorwaPouch»): se salta el paso de esa etiqueta para que se active.
  m.lua(`(function()
    local pv = SnetForever.Motor.paso(SnetForever.Motor.estado().actual)
    if not (pv and pv.requiere) then return end
    for i = 1, pv.i - 1 do
      local q = SnetForever.Motor.paso(i)
      if q and q.etiqueta == pv.requiere and not q.hecho then SnetForever.Motor.saltar(i) end
    end
  end)()`);
  m.avanzar(0.3);
  const vivo = () => m.lua(`(function()
    local e = SnetForever.Motor.estado()
    local pv = SnetForever.Motor.paso(e.actual)
    if not pv then return {} end
    local pendientes = {}
    for k, el in ipairs(pv.elementos) do
      if el.resultado == "pendiente" then pendientes[#pendientes + 1] = {k = k, t = el.datos.t} end
    end
    return {i = e.actual, n = pv.n, hecho = pv.hecho, pendientes = pendientes}
  end)()`);
  const antes = vivo();
  if (antes.n !== n) return `el actual es el paso ${antes.n} (filtros del personaje)`;
  if (!(antes.pendientes?.length > 0)) return 'ningún elemento queda pendiente';
  m.avanzar(1.5); // siete ciclos del motor y un repaso
  const despues = vivo();
  if (despues.n !== n || despues.hecho === true) return `se completó solo (ahora en el paso ${despues.n})`;
  // Marcar sus casillas (como en la ventana) lo completa.
  for (const { k, t } of despues.pendientes) {
    if (t === 'manual') m.lua(`SnetForever.Motor.marcarManual(${despues.i}, ${k}, true)`);
    else m.lua(`SnetForever.Motor.marcarHecho(${despues.i}, ${k}, true)`);
  }
  m.avanzar(0.5);
  if (vivo().i === despues.i) return 'con la casilla marcada no avanza';
  return null;
}

// Una máquina por personaje (cargar los datos reales es lo que más tarda) y todos sus pasos en ella.
const porPersonaje = new Map();
for (const [clave, id, base] of CASOS) {
  const k = `${base.raza} ${base.clase}`;
  if (!porPersonaje.has(k)) porPersonaje.set(k, { base, casos: [] });
  porPersonaje.get(k).casos.push([clave, id]);
}

for (const [k, { base, casos }] of porPersonaje) {
  test(`datos reales (lote A), ${k}: ${casos.length} paso(s) informativos no se completan solos; con su casilla, sí`, opciones, () => {
    const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador: base });
    const fallos = [];
    for (const [clave, id] of casos) {
      const fallo = comprobar(m, clave, id);
      if (fallo) fallos.push(`«${clave}» paso ${id}: ${fallo}`);
    }
    assert.deepEqual(fallos, []);
    sinErrores(m);
  });
}
