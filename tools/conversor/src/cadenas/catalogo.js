// Catálogo de las cadenas de clase que desbloquean habilidades (decisión R1 del plan de la fase 3).
// Solo lleva nombres ingleses de misiones tal como están en la base: las IDs las encuentra el resolvedor
// (resolver.js). Aquí no entra ninguna ID a mano (la prueba lo vigila: ningún número ≥ 2 salvo `nivel`).
//
//   Cadena   = {id, clase, nivel, titulo: {es, en}, habilidad?: {es, en}, variantes: Variante[]}
//   Variante = {razas, faccion?, inicio?, fin?, pasos?, desempate?, dador?, habilidad?}
//     - modo A: `inicio` y `fin` (se sigue la cadena por los enlaces de la base);
//     - modo B: `pasos`, una misión por nombre, unidas por enlace o por PNJ;
//     - cada raza se resuelve en las facciones donde existe, o solo en `faccion` si la lleva;
//     - `desempate`: "forever" (ID ≥ 90000) o "classic", si hay dos inicios con el mismo nombre (R13); en el
//       modo B elige también entre dos misiones del mismo nombre que siguen a la misma anterior;
//     - `dador` (modo B, lote H): nombre del PNJ que da el primer paso, cuando la base deja dos caminos y otra fuente
//       (RestedXP) dice cuál; se cita la fuente al lado.
//
// Se comprueba con `npm run cadenas -- --resolver <id>` y `--listar CLASE RAZA FACCION`. Lo que la base no
// deja resolver sin adivinar va a PENDIENTES con su motivo (R8). Razas de cada clase: las del Classic, las
// que el Forever añade con su carta de clase de nivel 1 en la base (brujo trol, paladín no-muerto, cazador
// humano, sacerdote gnomo, chamán enano) y Skyborne, que tiene las 9 clases en las dos facciones.
// El mago no está (R10).

const CADENAS_DRUIDA = [
  {
    id: 'druida-oso',
    clase: 'DRUID',
    nivel: 10,
    titulo: { es: 'Druida: Forma de oso', en: 'Druid: Bear Form' },
    habilidad: { es: 'Forma de oso', en: 'Bear Form' },
    variantes: [
      { razas: ['Tauren', 'NightElf'], inicio: 'Moonglade', fin: 'Body and Heart' },
      { razas: ['Skyborne'], inicio: 'The Great Ursera Spirit', fin: 'Strength and Mercy' },
    ],
  },
  {
    id: 'druida-veneno',
    clase: 'DRUID',
    nivel: 14,
    titulo: { es: 'Druida: Curar envenenamiento', en: 'Druid: Cure Poison' },
    habilidad: { es: 'Curar envenenamiento', en: 'Cure Poison' },
    variantes: [
      // El Skyborne de la Horda sigue la cadena tauren y el de la Alianza la del elfo de la noche; la base solo
      // los trae en una de ellas, el resto son correcciones propias (src/questie/propias.js).
      { razas: ['Tauren', 'NightElf'], inicio: 'Lessons Anew', fin: 'Power over Poison' },
      { razas: ['Skyborne'], inicio: 'Lessons Anew', fin: 'Power over Poison' },
    ],
  },
  {
    id: 'druida-acuatica',
    clase: 'DRUID',
    nivel: 16,
    titulo: { es: 'Druida: Forma acuática', en: 'Druid: Aquatic Form' },
    habilidad: { es: 'Forma acuática', en: 'Aquatic Form' },
    variantes: [
      { razas: ['Tauren', 'NightElf'], inicio: 'A Lesson to Learn', fin: 'Aquatic Form' },
      { razas: ['Skyborne'], inicio: 'A Lesson to Learn', fin: 'Aquatic Form' },
    ],
  },
  {
    // La habilidad se deduce del nombre de las misiones («The Great Cat Spirit»).
    id: 'druida-felina',
    clase: 'DRUID',
    nivel: 20,
    titulo: { es: 'Druida: Forma felina', en: 'Druid: Cat Form' },
    habilidad: { es: 'Forma felina', en: 'Cat Form' },
    variantes: [
      {
        razas: ['Tauren'],
        pasos: ['The Great Cat Spirit', 'The Great Cat Spirit', 'The Great Cat Spirit',
          'Blessings of the Great Cat Spirit', 'To Thunder Bluff'],
      },
      {
        razas: ['NightElf'],
        pasos: ['The Great Cat Spirit', 'The Great Cat Spirit', 'The Great Cat Spirit',
          'Blessings of the Great Cat Spirit', 'To Darnassus'],
      },
      {
        razas: ['Skyborne'],
        faccion: 'Horde',
        pasos: ['The Great Cat Spirit', 'The Great Windborne Cat Spirit', 'The Great Windborne Cat Spirit',
          'Blessings of the Great Windborne Cat Spirit', 'To Thunder Bluff'],
      },
      {
        razas: ['Skyborne'],
        faccion: 'Alliance',
        pasos: ['The Great Cat Spirit', 'The Great Windborne Cat Spirit', 'The Great Windborne Cat Spirit',
          'Blessings of the Great Windborne Cat Spirit', 'To Darnassus'],
      },
    ],
  },
  {
    id: 'druida-claro',
    clase: 'DRUID',
    nivel: 10,
    titulo: { es: 'Druida: Claro de la Luna', en: 'Druid: Moonglade' },
    variantes: [
      { razas: ['Skyborne'], pasos: ['Child of Nature', 'Moonglade'] },
    ],
  },
];

const CADENAS_CAZADOR = [
  {
    id: 'cazador-domesticar',
    clase: 'HUNTER',
    nivel: 10,
    titulo: { es: 'Cazador: Domesticar bestia', en: 'Hunter: Tame Beast' },
    habilidad: { es: 'Domesticar bestia', en: 'Tame Beast' },
    variantes: [
      { razas: ['Tauren', 'Orc', 'Troll', 'Human', 'Gnome'], inicio: 'Taming the Beast', fin: 'Training the Beast' },
      // El Skyborne de la Alianza tiene dos cadenas del Forever que llegan al fin: está en PENDIENTES.
      { razas: ['Skyborne'], faccion: 'Horde', inicio: 'Taming the Beast', fin: 'Training the Beast' },
      // R13: la cadena clásica y la nueva del Forever; manda la del Forever (pregunta abierta para el jugador).
      {
        razas: ['Dwarf', 'NightElf'], inicio: 'Taming the Beast', fin: 'Training the Beast', desempate: 'forever',
      },
    ],
  },
];

const BRUJOS = ['Orc', 'Scourge', 'Troll', 'Skyborne', 'Human', 'Gnome'];

const CADENAS_BRUJO = [
  {
    id: 'brujo-abisario',
    clase: 'WARLOCK',
    nivel: 10,
    titulo: { es: 'Brujo: Invocar abisario', en: 'Warlock: Summon Voidwalker' },
    habilidad: { es: 'Invocar abisario', en: 'Summon Voidwalker' },
    variantes: [
      // Una «Creature of the Void» distinta para cada raza (la base les pone máscara de raza).
      { razas: ['Orc', 'Scourge'], inicio: 'Creature of the Void', fin: 'The Binding' },
      { razas: ['Human', 'Gnome', 'Skyborne'], faccion: 'Alliance', inicio: 'Surena Caledon', fin: 'The Binding' },
    ],
  },
  {
    // Cada «Devourer of Souls» se abre en dos ramas: la del súcubo y la del íncubo (lo dicen los textos de los
    // objetivos de la base). Se sigue la del súcubo, por nombres. La Horda tiene dos inicios excluyentes y
    // abiertos a todas sus razas, Orgrimmar y Entrañas (según los textos): el no-muerto va por Entrañas y el
    // resto por Orgrimmar. Las dos valen para cualquiera; es una elección, no un dato de la base.
    id: 'brujo-sucubo',
    clase: 'WARLOCK',
    nivel: 20,
    titulo: { es: 'Brujo: Invocar súcubo', en: 'Warlock: Summon Succubus' },
    habilidad: { es: 'Invocar súcubo', en: 'Summon Succubus' },
    variantes: [
      {
        razas: ['Orc', 'Troll', 'Skyborne'],
        faccion: 'Horde',
        pasos: ['Devourer of Souls', 'Blind Cazul', 'News of Dogran', 'News of Dogran', "Ken'zigla's Draught",
          "Dogran's Captivity", "Love's Gift", 'The Binding'],
      },
      { razas: ['Scourge'], pasos: ['Devourer of Souls', 'Hearts of the Pure', 'The Binding'] },
      {
        razas: ['Human', 'Gnome', 'Skyborne'], faccion: 'Alliance', pasos: ['Devourer of Souls', 'Heartswood', 'The Binding'],
      },
    ],
  },
  {
    id: 'brujo-manafago',
    clase: 'WARLOCK',
    nivel: 30,
    titulo: { es: 'Brujo: Invocar manáfago', en: 'Warlock: Summon Felhunter' },
    habilidad: { es: 'Invocar manáfago', en: 'Summon Felhunter' },
    variantes: [
      { razas: BRUJOS, inicio: 'Tome of the Cabal', fin: 'The Binding' },
    ],
  },
];

const GUERREROS = ['Orc', 'Scourge', 'Tauren', 'Troll', 'Human', 'Dwarf', 'NightElf', 'Gnome', 'Skyborne'];

const CADENAS_GUERRERO = [
  {
    // La base une las ramas de cada raza (sin máscara de raza): se sigue la de cada una, por nombres.
    id: 'guerrero-defensiva',
    clase: 'WARRIOR',
    nivel: 10,
    titulo: { es: 'Guerrero: Actitud defensiva', en: 'Warrior: Defensive Stance' },
    habilidad: { es: 'Actitud defensiva', en: 'Defensive Stance' },
    variantes: [
      { razas: ['Orc', 'Troll', 'Tauren'], pasos: ['Path of Defense', "Thun'grim Firegaze", 'Forged Steel'] },
      { razas: ['Scourge'], pasos: ['Ulag the Cleaver', 'Agamand Heirlooms', 'Heirloom Weapon'] },
      // Datos 2026.11.13: la QuestieDB nueva marca «A Warrior's Training» como miga de «Bartleby the Drunk»
      // (breadcrumbForQuestId); las migas no son pasos, así que la cadena empieza en Bartleby.
      {
        razas: ['Human'],
        pasos: ['Bartleby the Drunk', 'Beat Bartleby', "Bartleby's Mug", 'Marshal Haggard', 'Dead-tooth Jack'],
      },
      { razas: ['Dwarf', 'Gnome'], pasos: ['Vejrek', "Ironband's Compound", 'Grey Iron Weapons'] },
      {
        razas: ['NightElf'],
        pasos: ['Elanaria', 'Vorlus Vilehoof', 'The Shade of Elura', 'Smith Mathiel', 'Weapons of Elunite'],
      },
    ],
  },
  {
    // «The Affray» da la actitud; lo que sigue («The Windwatcher»…) es la cadena del arma Torbellino.
    id: 'guerrero-rabiosa',
    clase: 'WARRIOR',
    nivel: 30,
    titulo: { es: 'Guerrero: Actitud rabiosa', en: 'Warrior: Berserker Stance' },
    habilidad: { es: 'Actitud rabiosa', en: 'Berserker Stance' },
    variantes: [
      { razas: GUERREROS, inicio: 'The Islander', fin: 'The Affray' },
    ],
  },
];

const CADENAS_PALADIN = [
  {
    id: 'paladin-redencion',
    clase: 'PALADIN',
    nivel: 12,
    titulo: { es: 'Paladín: Redención', en: 'Paladin: Redemption' },
    habilidad: { es: 'Redención', en: 'Redemption' },
    variantes: [
      // Nueve «The Tome of Divinity» con una lateral («The Symbol of Life») tras la sexta: por nombres (F3-2).
      {
        razas: ['Human', 'Dwarf'],
        pasos: ['The Tome of Divinity', 'The Tome of Divinity', 'The Tome of Divinity', 'The Tome of Divinity',
          'The Tome of Divinity', 'The Tome of Divinity', 'The Tome of Divinity', 'The Tome of Divinity',
          'The Tome of Divinity'],
      },
      { razas: ['Scourge'], inicio: 'A Lesson in Divinity', fin: 'A Lesson in Divinity' },
    ],
  },
];

const CADENAS_PICARO = [
  {
    id: 'picaro-venenos',
    clase: 'ROGUE',
    nivel: 20,
    titulo: { es: 'Pícaro: Venenos', en: 'Rogue: Poisons' },
    habilidad: { es: 'Venenos', en: 'Poisons' },
    variantes: [
      {
        razas: ['Orc', 'Scourge', 'Troll', 'Skyborne'], faccion: 'Horde', inicio: 'The Shattered Salute', fin: "Hinott's Assistance",
      },
      {
        razas: ['Human', 'Dwarf', 'NightElf', 'Gnome', 'Skyborne'],
        faccion: 'Alliance',
        inicio: 'Mathias and the Defias',
        fin: 'The Touch of Zanzil',
      },
    ],
  },
];

const CHAMANES_A = ['Dwarf', 'Skyborne'];

const CADENAS_CHAMAN = [
  {
    // Por nombres (F3-2): el modo A se para en la lateral «Fire Sapta».
    id: 'chaman-fuego',
    clase: 'SHAMAN',
    nivel: 10,
    titulo: { es: 'Chamán: Tótem de fuego', en: 'Shaman: Fire Totem' },
    habilidad: { es: 'Tótem de fuego', en: 'Fire Totem' },
    variantes: [
      { razas: ['Orc', 'Tauren', 'Troll'], pasos: ['Call of Fire', 'Call of Fire', 'Call of Fire', 'Call of Fire'] },
      // Lote H, ronda 1: el Skyborne de la Horda, desde Sessaria Skystride. Lo dice RestedXP (RestedXP-Skyborne.lua:4051-4310,
      // «Horde Shaman: Call of Fire Detour/Finale»: la primera la da Sessaria); la otra que la base pone delante (la de
      // Swart, para volver a Zephras) es una miga que la base no marca. El de la Alianza, en PENDIENTES.
      // Datos 2026.11.13: la QuestieDB nueva une la primera también con la segunda del Classic (1525); RestedXP sigue
      // la del Forever (97244, RestedXP-Skyborne.lua:4096-4097), de ahí el desempate.
      {
        razas: ['Skyborne'],
        faccion: 'Horde',
        pasos: ['Call of Fire', 'Call of Fire', 'Call of Fire', 'Call of Fire'],
        dador: 'Sessaria Skystride',
        desempate: 'forever',
      },
      // Alianza del Forever: la primera la da el instructor y lleva al PNJ de la segunda.
      {
        razas: ['Dwarf'],
        faccion: 'Alliance',
        pasos: ['Call of Fire', 'Call of Fire', 'Call of Fire', 'Call of Fire', 'Call of Fire'],
      },
    ],
  },
  {
    // Solo la Alianza del Forever: una misión. La Horda, en PENDIENTES.
    id: 'chaman-aire',
    clase: 'SHAMAN',
    nivel: 30,
    titulo: { es: 'Chamán: Tótem de aire', en: 'Shaman: Air Totem' },
    habilidad: { es: 'Tótem de aire', en: 'Air Totem' },
    variantes: [
      { razas: CHAMANES_A, faccion: 'Alliance', inicio: 'Call of Air', fin: 'Call of Air' },
    ],
  },
];

const CADENAS_SACERDOTE = [
  {
    // Hechizo racial: el título no nombra la habilidad. Solo el elfo de la noche; el resto, en PENDIENTES.
    id: 'sacerdote-10',
    clase: 'PRIEST',
    nivel: 10,
    titulo: { es: 'Sacerdote: hechizo racial (nivel 10)', en: 'Priest: racial spell (level 10)' },
    variantes: [
      { razas: ['NightElf'], inicio: 'Stars of Elune', fin: 'Stars of Elune' },
    ],
  },
];

export const CATALOGO = [
  ...CADENAS_DRUIDA,
  ...CADENAS_CAZADOR,
  ...CADENAS_BRUJO,
  ...CADENAS_GUERRERO,
  ...CADENAS_PALADIN,
  ...CADENAS_PICARO,
  ...CADENAS_CHAMAN,
  ...CADENAS_SACERDOTE,
];

// Cadenas (o partes de cadena) que la base no deja resolver sin adivinar. `cadena`, si está, es el id de la
// cadena del catálogo que esta entrada completaría (las razas o facciones que le faltan). La salida de --listar de cada
// una está en el informe de la tarea 4 de la fase 3. Los motivos citan nombres, no IDs: las IDs las da
// `npm run cadenas -- --listar CLASE RAZA FACCION --detalle`.
export const PENDIENTES = [
  {
    id: 'cazador-domesticar-skyborne-a',
    clase: 'HUNTER',
    cadena: 'cazador-domesticar',
    motivo: 'Skyborne de la Alianza: inicio ambiguo. Dos «Taming the Beast» del Forever llegan a «Training the '
      + 'Beast» (la de la Alianza y la de los Skyborne) y el desempate no las separa: las dos son del Forever. '
      + 'Una tercera «Taming the Beast» suelta lleva al PNJ de la de los Skyborne, pero eso solo lo sugiere.',
  },
  {
    id: 'brujo-abisario-troll-skyborne-h',
    clase: 'WARLOCK',
    cadena: 'brujo-abisario',
    motivo: 'Trol y Skyborne de la Horda: la base no tiene ninguna «Creature of the Void» para ellos (solo la '
      + 'del orco y la del no-muerto, con máscara de raza). «Halgar\'s Summons» y «Gan\'rul\'s Summons» llevan '
      + 'a esas dos, que no son para su raza.',
  },
  {
    id: 'brujo-corcel',
    clase: 'WARLOCK',
    motivo: 'Cuatro «Summon Felsteed» de inicio, dos por facción con PNJ distintos, excluyentes entre sí y '
      + 'abiertas a todas las razas de su facción, que llevan a la misma «Summon Felsteed» final. Por enlaces '
      + 'el inicio es ambiguo y por nombres también (todas se llaman igual).',
  },
  {
    id: 'guerrero-defensiva-skyborne',
    clase: 'WARRIOR',
    cadena: 'guerrero-defensiva',
    motivo: 'Skyborne: la base tiene «The Skybreaker Bulwark», de guerrero, nivel 10 y solo para Skyborne, sin '
      + 'enlaces, pero no dice que dé la actitud defensiva; las cadenas de su facción también le valen. '
      + 'Pregunta para el jugador.',
  },
  {
    id: 'chaman-tierra',
    clase: 'SHAMAN',
    motivo: 'Horda: tres «Call of Earth» de inicio excluyentes (dos del Classic y una del Forever) abiertas a todas '
      + 'las razas, que se piden unas a otras como previas: por enlaces se corta y por nombres es ambigua. '
      + 'Alianza: con tres pasos es ambigua; con cuatro sale, pero empezando por una «Call of Earth» de nivel 10 '
      + 'que lleva por PNJ a una cadena de nivel 4, y eso no cuadra: la base no dice si es la entrada o una '
      + 'misión aparte.',
  },
  {
    id: 'chaman-agua',
    clase: 'SHAMAN',
    motivo: 'Horda: tras la quinta «Call of Water» sale «Water Sapta» (el modo A se para ahí) y, más adelante, la '
      + 'sexta «Call of Water» tiene dos sucesoras por enlace que también se llaman «Call of Water» (una la da un '
      + 'objeto y la otra un PNJ): la cadena bifurca y por nombres solo se elegiría una por el número de pasos. Alianza: nueve '
      + '«Call of Water» sin enlaces, unidas solo por PNJ, y tres seguidas las da y las recoge el mismo PNJ: el '
      + 'orden no sale de la base.',
  },
  {
    // Lote H. Hasta QuestieDB 1.0.11 entraba en la variante de la Alianza, con el enano.
    id: 'chaman-fuego-skyborne-a',
    clase: 'SHAMAN',
    cadena: 'chaman-fuego',
    motivo: 'Skyborne de la Alianza: la QuestieDB del lote H le deja la primera «Call of Fire» (la del instructor), pero las '
      + 'cuatro siguientes de Loch Modan pasan a ser solo del enano; la cadena se corta en el paso dos. RestedXP no '
      + 'lleva al chamán Skyborne de la Alianza a Loch Modan y ningún personaje del jugador la ha hecho.',
  },
  {
    id: 'chaman-aire-horda',
    clase: 'SHAMAN',
    cadena: 'chaman-aire',
    motivo: 'Horda: dos «Call of Air» de inicio, de PNJ distintos, que acaban en el mismo PNJ; el Skyborne '
      + 'tiene además una tercera sin PNJ. Inicio ambiguo.',
  },
  {
    id: 'sacerdote-10-otras',
    clase: 'PRIEST',
    cadena: 'sacerdote-10',
    motivo: 'Humano, enano, no-muerto, trol y gnomo: cada hechizo («Desperate Prayer», «Divine Grace», «Touch of '
      + 'Weakness», «Hex of Weakness», «Confounding Flash») tiene varias misiones con el mismo nombre (una por '
      + 'instructor que la da, y alguna sin PNJ), todas con el mismo PNJ de entrega: inicio ambiguo. Skyborne: no hay ninguna.',
  },
  {
    id: 'sacerdote-20',
    clase: 'PRIEST',
    motivo: 'Igual que en el nivel 10: «A Lack of Fear», «Shadowguard», «Devouring Plague», «Elune\'s Grace», «Arcane '
      + 'Feedback» y «Contingency Plan» tienen varias misiones con el mismo nombre, una por instructor, que '
      + 'acaban en el mismo PNJ. Skyborne: no hay ninguna.',
  },
];
