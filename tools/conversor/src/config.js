// Configuración del conversor: carpeta de origen (solo lectura) y carpeta de salida.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASES } from './rxp/filtros.js';

// Raíz del repositorio (src -> conversor -> herramientas -> repositorio).
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

// Carpeta AddOns del Forever. La variable de entorno SNF_ADDONS la sustituye.
export const ORIGEN = process.env.SNF_ADDONS
  || 'E:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns';

// Carpeta donde se escriben los addons generados. La variable SALIDA la sustituye.
// Por defecto, la carpeta `addons` de este repositorio (no una ruta fija de otro worktree).
export const SALIDA = process.env.SALIDA || join(RAIZ, 'addons');

// Guías de RestedXP que se convierten (restricciones globales). Rutas relativas a ORIGEN.
// `es` es el mismo archivo en `lang/Guides-esES` (las de Skyrim tienen su pareja propia).
const GUIAS_NORMALES = [
  'Alliance-1-10_NightElf.lua', 'Alliance-1-13_Human.lua', 'Alliance-1-14_DwarfGnome.lua',
  'Alliance-11-20.lua', 'Alliance-ADV-AoE-Mage-1-22.lua', 'Alliance-Mage-1-12.lua',
  'Alliance-Mage-12-21.lua', 'Horde-01-12_Durotar.lua', 'Horde-01-14_Undead.lua',
  'Horde-1-12_Mulgore.lua', 'Horde-12-22_Barrens.lua', 'Horde-Mage-12-21.lua',
  'RestedXP-Skyborne.lua',
];
const GUIAS_MAZMORRAS = [
  'Alliance-1-10_NightElf.lua', 'Alliance-1-13_Human.lua', 'Alliance-1-14_DwarfGnome.lua',
  'Alliance-11-20.lua', 'Horde-01-12_Durotar.lua', 'Horde-01-14_Undead.lua',
  'Horde-1-12_Mulgore.lua', 'Horde-12-22_Barrens.lua', 'RestedXP-Skyborne.lua',
];
export const FUENTES = [
  ...GUIAS_NORMALES.map((f) => ({
    en: `RXPGuides/Guides/forever/${f}`, es: `RXPGuides/lang/Guides-esES/forever/${f}`, tipo: 'normal',
  })),
  ...GUIAS_MAZMORRAS.map((f) => ({
    en: `RXPGuides/Guides/forever/dungeon/${f}`, es: `RXPGuides/lang/Guides-esES/forever/dungeon/${f}`, tipo: 'mazmorras',
  })),
  { en: 'RXPGuides_Clasicas/Skyrim_Horde_22-60_EN.lua', es: 'RXPGuides_Clasicas/Skyrim_Horda_22-60_ES.lua', tipo: 'normal' },
  { en: 'RXPGuides_Clasicas/Skyrim_Alianza_20-60_EN.lua', es: 'RXPGuides_Clasicas/Skyrim_Alianza_20-60_ES.lua', tipo: 'normal' },
];

// Guías de profesión de RestedXP (son de WotLK: se recortan al tramo 1-300 del mundo clásico, ver
// `rxp/profesiones.js`). `hasta` es la habilidad máxima que se conserva.
export const FUENTES_PROFESIONES = [
  ['herbalism', 'Herbalism'], ['mining', 'Mining'], ['skinning', 'Skinning'],
].map(([profesion, archivo]) => ({
  en: `RXPGuides/Guides/${archivo}.lua`, es: `RXPGuides/lang/Guides-esES/${archivo}.lua`,
  tipo: 'profesion', profesion, hasta: 300,
}));

// Enlaces manuales de `#next` que no se resuelven solos: nombre tal como va en `#next` (con el
// `Grupo\` si lo lleva, y el nombre normalizado con el affix) → destino. Si el destino lleva `\`
// es una clave; si no, es un nombre que se busca en el grupo de la guía de origen (así vale para
// la guía normal y para la de mazmorras).
export const ENLACES = {
  // Erratas del original: Horde-1-12_Mulgore.lua (normal y dungeon) apunta a «6-13 Mulgore».
  '06-13 Mulgore': '06-12 Mulgore',
  // Skyrim_Alianza_20-60_EN.lua:1523 apunta a una guía que se llama «… Part 2 …».
  '26-31 Duskwood Mage AoE': '26-31 Duskwood Part 2 Mage AoE',
};

// Salidas añadidas a mano al final de los `siguientes` de una guía, sin filtro: `{ claveGuíaOrigen:
// [{ destino }] }`. El destino se resuelve como en ENLACES: con `\` es una clave; sin ella, un
// nombre que se busca en el grupo de la guía de origen.
export const SIGUIENTES_EXTRA = {
  // Skyrim Horda: «22-24 Hillsbrad» solo sigue a «24-26 …» para quien no es Rogue/Warlock/Shaman
  // (Skyrim_Horde_22-60_EN.lua:509); esas clases iban a «24-25 Class quests», que es #som y no
  // se emite en Forever. Sin esto, 8 combinaciones de la Horda no llegan al 60.
  'Skyrim Horde 22-30 (EN)\\22-24 Hillsbrad': [{ destino: '24-26 Southern Barrens/Stonetalon' }],
  // Versión con mazmorras de la Alianza: «20-21 Darkshore/Ashenvale» (dungeon/Alliance-11-20.lua:3898)
  // solo sigue a «21-23 Ashenvale/Stonetalon», que es solo de cazador (Skyrim_Alianza_20-60_EN.lua:6).
  // La guía normal manda a los demás a «21-23 Stonetalon/Ashenvale» (Alliance-11-20.lua:6753); aquí
  // se hace lo mismo. Sin esto, los no cazadores de la versión con mazmorras se quedan en el 21.
  'RestedXP Forever Dungeon Guide (A)\\20-21 Darkshore/Ashenvale': [
    { destino: 'Skyrim Alliance 20-30 (EN)\\21-23 Stonetalon/Ashenvale' },
  ],
};

// Ruta del .toc de QuestieDB con los datos «baked».
export function rutaQuestieToc() {
  return join(ORIGEN, 'QuestieDB', 'QuestieDB_Forever.toc');
}

// Combinaciones raza/clase que el validador exige con ruta del 1 al 60 (Classic) y Skyborne (raza
// nueva de Forever, con las 9 clases en las dos facciones). `classic: false` rebaja los fallos a aviso.
const CLASSIC = {
  Alliance: {
    Human: ['WARRIOR', 'PALADIN', 'ROGUE', 'PRIEST', 'MAGE', 'WARLOCK'],
    Dwarf: ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST'],
    Gnome: ['WARRIOR', 'ROGUE', 'MAGE', 'WARLOCK'],
    NightElf: ['WARRIOR', 'HUNTER', 'ROGUE', 'PRIEST', 'DRUID'],
  },
  Horde: {
    Orc: ['WARRIOR', 'HUNTER', 'ROGUE', 'SHAMAN', 'WARLOCK'],
    Scourge: ['WARRIOR', 'ROGUE', 'PRIEST', 'MAGE', 'WARLOCK'],
    Tauren: ['WARRIOR', 'HUNTER', 'SHAMAN', 'DRUID'],
    Troll: ['WARRIOR', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE'],
  },
};
export const COMBINACIONES = [
  ...Object.entries(CLASSIC).flatMap(([faccion, razas]) => Object.entries(razas)
    .flatMap(([raza, clases]) => clases.map((clase) => ({ raza, clase, faccion, classic: true })))),
  ...['Alliance', 'Horde'].flatMap((faccion) => CLASES
    .map((clase) => ({ raza: 'Skyborne', clase, faccion, classic: false }))),
];
