// Catálogo de las cadenas de mejoras (lote «Cadenas de mejoras»): cadenas de misiones cuya recompensa mejora al
// personaje (un saco de dormir, una bolsa…) y que no son de ninguna clase. Como el de las cadenas de clase
// (catalogo.js), solo lleva nombres ingleses tal como están en la base: las IDs las encuentra el resolvedor con el
// universo de las mejoras (todas las misiones que no son de clase y valen para la raza y la facción). Aquí no entra
// ninguna ID a mano (la prueba lo vigila).
//
//   Mejora   = {id, nivel, titulo?: {es, en}, recompensa, beneficio?: {es, en, fuente}, variantes: Variante[]}
//   Variante = {faccion, razas, pasos? | inicio? + fin?, desempate?}   (los modos A y B de catalogo.js)
//     - recompensa: el nombre inglés del objeto que da la última misión (se comprueba con la base);
//     - beneficio: lo que hace la mejora. NO sale de la base: `fuente` dice de dónde viene ('jugador': lo contó
//       el jugador tras probarlo en el juego). La guía lo lleva tal cual y el addon lo enseña en su descripción. Sin él,
//       la descripción sale de la base: el nombre y el tipo de la recompensa («Recompensa: … (bolsa)»);
//     - titulo: sin él, «Mejora: <nombre de la recompensa>» con los nombres de la base;
//     - soloConLaCadena (dato del jugador): el objeto solo sale de la cadena; si la base le pone vendedor, el informe de
//       la versión apunta que ese dato no vale para el Forever;
//     - si dos inicios se llaman igual, los separa la máscara de raza de la base (cada raza solo ve la suya).
//
// Se comprueba con las pruebas de test/cadenas-mejoras.test.js; las candidatas salen con `npm run cadenas -- --mejoras`.

const HORDA = ['Orc', 'Scourge', 'Tauren', 'Troll', 'Skyborne'];
const ALIANZA = ['Human', 'Dwarf', 'NightElf', 'Gnome', 'Skyborne'];

// La cadena del saco de dormir. Se enlaza por objetos (el objeto donde se entrega una es el que da la siguiente) y
// la primera misión tiene dos versiones con el mismo nombre, una por facción (máscara de raza), que forman un ciclo:
// cada una se entrega donde empieza la otra. Desde «Stepping Stones» es la misma para las dos facciones.
const PASOS_SACO = ['... and that note you found', 'Stepping Stones', 'Scramble', 'Wet Job', "Eagle's Fist",
  'This Must Be The Place'];

export const MEJORAS = [
  {
    id: 'mejora-saco-dormir',
    nivel: 14,
    titulo: { es: 'Mejora: Saco de dormir acogedor', en: 'Upgrade: Cozy Sleeping Bag' },
    recompensa: 'Cozy Sleeping Bag',
    // Dato del jugador (el jugador, 10-nov-2026): en el Forever el saco solo se consigue con la cadena. El vendedor que trae
    // la base para ese objeto no lo vende: el informe de la versión lo apunta y los textos no lo mencionan.
    soloConLaCadena: true,
    // Dato del jugador (el jugador, 10-nov-2026, en el juego): no está en la base.
    beneficio: {
      es: 'Al ponerlo en el suelo te acuestas y ganas hasta un 3 % de experiencia extra durante 2 horas (comprobado en el juego)',
      en: 'Place it on the ground to lie down and gain up to 3% extra experience for 2 hours (checked in game)',
      fuente: 'jugador',
    },
    variantes: [
      { faccion: 'Horde', razas: HORDA, pasos: PASOS_SACO },
      { faccion: 'Alliance', razas: ALIANZA, pasos: PASOS_SACO },
    ],
  },
  // Las bolsas «muy claras» del detector (artifacts/reports/mejoras-candidatas-*.md): cadenas lineales unidas por las previas de la
  // base, que empiezan en un PNJ con punto, no son de mazmorra ni de un evento, de nivel 5 o más (las de antes ya las
  // llevan las guías de zona de inicio) y cuya última misión da una bolsa. No traen beneficio del jugador: el título y la
  // descripción salen de la base (el nombre y el tipo de la recompensa). Todas son de la Alianza: la base no tiene
  // ninguna de la Horda que cumpla lo mismo.
  {
    id: 'mejora-bolsa-buzzbox',
    nivel: 7,
    recompensa: "Wizbang's Gunnysack",
    variantes: [{ faccion: 'Alliance', razas: ALIANZA, pasos: ['Buzzbox 827', 'Buzzbox 411', 'Buzzbox 323', 'Buzzbox 525'] }],
  },
  {
    id: 'mejora-bolsa-cazador',
    nivel: 11,
    recompensa: 'Hunting Satchel',
    variantes: [{ faccion: 'Alliance', razas: ALIANZA, pasos: ["A Hunter's Boast", "A Hunter's Challenge", "Vyrin's Revenge", "Vyrin's Revenge"] }],
  },
  {
    id: 'mejora-bolsa-astillero',
    nivel: 13,
    recompensa: "Shipwright's Satchel",
    variantes: [{ faccion: 'Alliance', razas: ALIANZA, pasos: ['Expanding Horizons', 'Making Do'] }],
  },
  {
    id: 'mejora-bolsa-guardia-nocturna',
    nivel: 18,
    recompensa: 'Gunnysack of the Night Watch',
    variantes: [{ faccion: 'Alliance', razas: ALIANZA, pasos: ['The Night Watch', 'The Night Watch', 'The Night Watch'] }],
  },
];
