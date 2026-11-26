// Correcciones propias comprobadas (Ruling F3-29): arreglos a la base de QuestieDB Forever que hemos visto en
// el juego (o deducido de otra versión de la misma cadena) y que la base todavía no trae. Se aplican DESPUÉS
// de las correcciones de QuestieDB, tanto en la vista (src/questie/vista.js) como al escribir
// SnetForever_Misiones (así el addon ve la misma máscara que el conversor).
//
//   Entrada = {tipo: 'quest', id, campo: 'requiredRaces', anadirRazas: string[], faccion: 'Horde'|'Alliance',
//              fuente: 'juego'|'deducido', nota, fecha}
//
// Añadir una raza es sumar su bit a la máscara, sin repetirlo si ya está y sin operadores de bits (los
// bits de Skyborne, 2^32 y 2^33, no caben en 32 bits). Una misión sin máscara (para todas las razas) no se toca.

const tieneBit = (mascara, bit) => Math.floor(mascara / bit) % 2 === 1;

// Bits de las razas que se pueden añadir (los mismos que BIT_RAZA de vista.js; aquí no se importa para no
// crear un ciclo: vista.js importa este archivo).
const BITS = { Skyborne: { Alliance: 2 ** 32, Horde: 2 ** 33 } };

const JUEGO = 'el druida de prueba (druida Skyborne de la Horda, nivel 20), 9-nov-2026';
const RESTO = 'no vista aún: es el resto de la misma cadena, cuyas misiones anteriores sí se vieron en el juego (el druida de prueba, 9-nov-2026)';
const DEDUCIDO = 'la base ya da la máscara 4294967304 (elfo de la noche + Skyborne de la Alianza) a la 272 de la misma cadena';
const DEDUCIDO_VENENO = 'la base ya da Skyborne de la Alianza a la 6121 y la 6122 de la misma cadena, pero no a la 6123-6125';
const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Lote H: QuestieDB 1.0.14 dejó la 94006 (oso) y la 98404 (felina) solo para el Skyborne de la Alianza, pero no la 94638
// ni la 98341 y la 98738, de las mismas cadenas. el druida de prueba las tiene entregadas: en su lista `complete` de Questie y en
// RXPCTrackingData de RXPGuides (WTF, leídos el 11-nov-2026), con toda su cadena (94638; 98340, 98341, 98738 y 98362).
const ENTREGADAS = 'el druida de prueba (druida Skyborne de la Horda) la tiene entregada (lista `complete` de Questie y '
  + 'RXPCTrackingData de RXPGuides, leídos el 11-nov-2026); QuestieDB 1.0.14 se la quitó, pero no a las demás de la cadena';

// Solo lleva fuente «juego» lo que de verdad se vio en el juego; el resto de la cadena va como «deducido».
const VISTAS = new Set([27, 28, 30, 6126, 6127, 94006, 98404]);
const horda = (id, nota, fecha = '2026-11-09') => ({
  tipo: 'quest', id, campo: 'requiredRaces', anadirRazas: ['Skyborne'], faccion: 'Horde',
  fuente: VISTAS.has(id) ? 'juego' : 'deducido', nota: VISTAS.has(id) ? nota : `${nota.split(':')[0]}: ${RESTO}`,
  fecha,
});
const alianza = (id, nota) => ({
  tipo: 'quest', id, campo: 'requiredRaces', anadirRazas: ['Skyborne'], faccion: 'Alliance', fuente: 'deducido', nota, fecha: '2026-11-09',
});

export const PROPIAS = [
  // Forma acuática y curar envenenamiento del druida: la base los da solo a los tauren; el juego se las da a los
  // Skyborne de la Horda (el druida de prueba tiene entregadas 27, 28, 6126 y 6127, y la 30 en el registro).
  ...[27, 28, 30, 31].map((id) => horda(id, `Forma acuática de la Horda: ${JUEGO}`)),
  ...rango(6126, 6130).map((id) => horda(id, `Curar envenenamiento de la Horda: ${JUEGO}`)),
  // Versión de la Alianza: la base está actualizada a medias (la 272 ya lo trae).
  ...[26, 29, 5061].map((id) => alianza(id, `Forma acuática de la Alianza: ${DEDUCIDO}`)),
  ...rango(6121, 6125).map((id) => alianza(id, `Curar envenenamiento de la Alianza: ${DEDUCIDO_VENENO}`)),
  // Lote H: forma de oso («The Great Ursera Spirit») y forma felina («The Great Windborne Cat Spirit», el paso 3).
  horda(94006, `Forma de oso del Skyborne de la Horda: ${ENTREGADAS}`, '2026-11-11'),
  horda(98404, `Forma felina del Skyborne de la Horda: ${ENTREGADAS}`, '2026-11-11'),
];

/** Suma el bit de `raza` (para la facción dada) a la máscara; sin duplicarlo. Sin máscara, se devuelve tal cual. */
export function sumarRaza(mascara, raza, faccion) {
  if (!mascara) return mascara;
  const bit = BITS[raza]?.[faccion];
  if (bit === undefined) throw new Error(`raza sin bit para añadir: ${raza} (${faccion})`);
  return tieneBit(mascara, bit) ? mascara : mascara + bit;
}

function sumarRazas(mascara, razas, faccion) {
  return razas.reduce((m, raza) => sumarRaza(m, raza, faccion), mascara);
}

/** Las entradas que tocan este tipo, id y facción. */
export function propiasDe(tipo, id, faccion, propias = PROPIAS) {
  return propias.filter((p) => p.tipo === tipo && p.id === id && p.faccion === faccion);
}

/** Registro (ya con las correcciones de QuestieDB) con las propias aplicadas; el mismo objeto si no hay ninguna. */
export function aplicarPropiasARegistro(tipo, id, faccion, registro, propias = PROPIAS) {
  if (registro === undefined) return registro;
  let r = registro;
  for (const p of propiasDe(tipo, id, faccion, propias)) {
    const antes = r[p.campo];
    if (!antes) continue;
    const despues = sumarRazas(antes, p.anadirRazas, faccion);
    if (despues !== antes) r = { ...r, [p.campo]: despues };
  }
  return r;
}

/**
 * Correcciones por facción (salida de leerCorrecciones) con las propias aplicadas, para escribir el addon:
 * la máscara efectiva es la de la corrección de QuestieDB si la hay y, si no, la de la base.
 * @returns {{correcciones: object, avisos: string[]}} copia; no toca la entrada
 */
export function aplicarPropiasACorrecciones(correcciones, entidades, propias = PROPIAS) {
  const salida = {};
  const avisos = [];
  for (const faccion of Object.keys(correcciones)) {
    salida[faccion] = {};
    for (const tipo of Object.keys(correcciones[faccion])) salida[faccion][tipo] = { ...correcciones[faccion][tipo] };
  }
  for (const p of propias) {
    const base = entidades[p.tipo]?.get(p.id);
    const tabla = salida[p.faccion][p.tipo];
    const corr = tabla[p.id];
    if (base === undefined && corr === undefined) continue;
    const actual = corr !== undefined && p.campo in corr ? corr[p.campo] : base?.[p.campo];
    if (actual !== null && typeof actual === 'object') {
      avisos.push(`propia ${p.tipo} ${p.id} (${p.faccion}): ${p.campo} depende de la clase o está borrado, no se toca`);
      continue;
    }
    if (typeof actual !== 'number' || !actual || actual === 0) continue;
    const despues = sumarRazas(actual, p.anadirRazas, p.faccion);
    if (despues !== actual) tabla[p.id] = { ...(corr ?? {}), [p.campo]: despues };
  }
  return { correcciones: salida, avisos };
}

/**
 * Filas del informe: qué cambia cada entrada en la base real. `vistaSinPropias(faccion)` da la vista sin las propias.
 * @returns {Array<{tipo, id, nombre?, faccion, campo, fuente, nota, fecha, antes, despues, estado}>}
 */
export function filasDePropias(vistaSinPropias, propias = PROPIAS) {
  return propias.map((p) => {
    const q = vistaSinPropias(p.faccion)[p.tipo === 'quest' ? 'mision' : p.tipo](p.id);
    const antes = q?.[p.campo];
    const despues = antes ? sumarRazas(antes, p.anadirRazas, p.faccion) : antes;
    let estado = 'aplicada';
    if (q === undefined) estado = 'no está en la base';
    else if (!antes) estado = 'sin máscara (vale para todas las razas)';
    else if (despues === antes) estado = 'la base ya la trae';
    return {
      tipo: p.tipo, id: p.id, nombre: q?.name, faccion: p.faccion, campo: p.campo, anadirRazas: p.anadirRazas,
      fuente: p.fuente, nota: p.nota, fecha: p.fecha, antes, despues, estado,
    };
  });
}
