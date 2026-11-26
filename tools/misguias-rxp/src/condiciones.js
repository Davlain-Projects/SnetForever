// Condiciones «<<» de los pasos de RestedXP pasadas a los campos de un paso de Mis guías (clase, raza, faccion, sin_clase,
// sin_raza; ver addons/SnetForever/motor/misguias.lua y templates/SnetForever_MisGuias/LEEME.txt).
//
// Sintaxis de RestedXP: «/» separa alternativas (O), los espacios juntan términos (Y) y «!» niega: «Human Warrior» es un
// humano guerrero, «Warrior/Mage» un guerrero o un mago y «!Human» cualquiera menos un humano.
//
// Los términos de personaje (clase, raza, facción) se resuelven aquí. Las negaciones de expansiones posteriores (!tbc,
// !wotlk, !cata, !mop: CIERTAS) se cumplen siempre en Forever y se quitan (ronda 2). Las demás palabras (versión del juego
// como tbc, wotlk, sod, era; «skip»; niveles; palabras desconocidas) no son del personaje y siguen como antes del 17-nov:
//   * en la cabecera del paso («step << tbc», «step << Rogue tbc») el paso se tira, igual que antes;
//   * en una línea no cuentan: se salta la palabra y se queda lo del personaje («.accept 123 << Warrior sod» es de
//     guerreros; ronda 2, I1); una alternativa que solo tenía esas palabras desaparece («Warrior/tbc», de guerreros) y, si
//     no queda nada del personaje («<< sod»), la línea va con lo común, como antes.
// Con paréntesis la condición entera se trata como «no de personaje».
//
// Un personaje es {c, r, f}: clase (como UnitClass), raza (como UnitRace) y facción. El universo de una guía son todos los
// personajes posibles (con la facción de la guía, si la tiene); una condición es el conjunto de los que la cumplen, y ese
// conjunto se escribe como uno o varios pasos con sus campos (varios solo si no cabe en un paso: cada personaje cumple
// como mucho uno de ellos, así que nadie ve el paso dos veces).

export const CLASES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
// Goblin y Skyborne existen en Forever (Skyborne en las dos facciones).
export const RAZAS_DE = {
  Horde: ['Orc', 'Scourge', 'Tauren', 'Troll', 'Goblin', 'Skyborne'],
  Alliance: ['Human', 'Dwarf', 'NightElf', 'Gnome', 'Skyborne'],
};
export const RAZAS = ['Human', 'Orc', 'Dwarf', 'NightElf', 'Scourge', 'Tauren', 'Gnome', 'Troll', 'Goblin', 'Skyborne'];
export const FACCIONES = ['Horde', 'Alliance'];

// Los nombres en español que escribe el conversor (el addon y la app los entienden igual que los ingleses).
export const NOMBRE_CLASE = {
  WARRIOR: 'Guerrero', PALADIN: 'Paladín', HUNTER: 'Cazador', ROGUE: 'Pícaro', PRIEST: 'Sacerdote', SHAMAN: 'Chamán',
  MAGE: 'Mago', WARLOCK: 'Brujo', DRUID: 'Druida',
};
export const NOMBRE_RAZA = {
  Human: 'Humano', Orc: 'Orco', Dwarf: 'Enano', NightElf: 'Elfo de la noche', Scourge: 'No-muerto', Tauren: 'Tauren',
  Gnome: 'Gnomo', Troll: 'Trol', Goblin: 'Goblin', Skyborne: 'Skyborne',
};
export const NOMBRE_FACCION = { Horde: 'Horda', Alliance: 'Alianza' };

// Razas y clases que RestedXP nombra pero que no hay en Forever: no las cumple nadie.
const RAZAS_IMPOSIBLES = new Set(['bloodelf', 'draenei', 'worgen', 'pandaren']);
const CLASES_IMPOSIBLES = new Set(['deathknight', 'dk', 'monk', 'demonhunter', 'evoker']);
const CLASE_DE = Object.fromEntries(CLASES.map((c) => [c.toLowerCase(), c]));
const RAZA_DE = { ...Object.fromEntries(RAZAS.map((r) => [r.toLowerCase(), r])), undead: 'Scourge' };
const FACCION_DE = { horde: 'Horde', alliance: 'Alliance' };

// Un término suelto: {tipo: 'c'|'r'|'f', valor} (valor null: nadie lo cumple) o null si no es del personaje.
function termino(palabra) {
  const p = palabra.toLowerCase();
  if (Object.hasOwn(CLASE_DE, p)) return { tipo: 'c', valor: CLASE_DE[p] };
  if (Object.hasOwn(RAZA_DE, p)) return { tipo: 'r', valor: RAZA_DE[p] };
  if (Object.hasOwn(FACCION_DE, p)) return { tipo: 'f', valor: FACCION_DE[p] };
  if (RAZAS_IMPOSIBLES.has(p)) return { tipo: 'r', valor: null };
  if (CLASES_IMPOSIBLES.has(p)) return { tipo: 'c', valor: null };
  return null;
}

// Ronda 2 (decisión 2): negadas, siempre ciertas en Forever (expansiones posteriores). En las fuentes solo hay !tbc y !wotlk.
export const CIERTAS = new Set(['tbc', 'wotlk', 'cata', 'mop']);

/**
 * Analiza el texto de una condición (lo que va detrás de «<<», sin el comentario «--»).
 * @returns {{grupos: Array<{terminos: Array<{tipo, valor, negado}>, otras: string[], ciertas: string[]}>, otros: boolean,
 *   dePersonaje: boolean}}
 *   grupos: las alternativas O; cada una, sus términos de personaje Y, sus palabras que no son del personaje (otras) y las
 *   que se cumplen siempre (ciertas, que no cuentan). otros: hay alguna de otras (o paréntesis).
 */
export function analizar(texto) {
  const limpio = String(texto).replace(/\b(Blood|Night)\s+Elf\b/gi, '$1Elf').trim();
  if (limpio === '' || /[()]/.test(limpio)) return { grupos: [], otros: true, dePersonaje: false };
  let otros = false;
  let dePersonaje = false;
  const grupos = [];
  for (const alternativa of limpio.split('/')) {
    const palabras = alternativa.split(/\s+/).filter(Boolean);
    if (palabras.length === 0) continue;
    const grupo = { terminos: [], otras: [], ciertas: [] };
    for (const w of palabras) {
      const negado = w.startsWith('!');
      const palabra = negado ? w.slice(1) : w;
      const t = termino(palabra);
      if (t) {
        dePersonaje = true;
        grupo.terminos.push({ ...t, negado });
      } else if (negado && CIERTAS.has(palabra.toLowerCase())) {
        grupo.ciertas.push(w);
      } else {
        otros = true;
        grupo.otras.push(w);
      }
    }
    grupos.push(grupo);
  }
  return { grupos, otros, dePersonaje };
}

const cumpleTermino = (t, pj) => ((t.valor !== null && pj[t.tipo] === t.valor) !== t.negado);

/** Los personajes del universo: todas las clases con las razas de cada facción (la de la guía, si la tiene). */
export function universo(faccionGuia = null) {
  const salida = [];
  for (const f of faccionGuia ? [faccionGuia] : FACCIONES) {
    for (const r of RAZAS_DE[f]) for (const c of CLASES) salida.push({ c, r, f });
  }
  return salida;
}

const clave = (pj) => `${pj.c}|${pj.r}|${pj.f}`;

/**
 * El conjunto (Set de claves) de los personajes del universo que cumplen la condición analizada (las palabras ciertas no
 * cuentan). En la cabecera (modo 'cabecera') no se llama con `otros`. En una línea ('linea'), las otras se saltan, una
 * alternativa que solo tenía de esas desaparece y, si no queda ninguna, devuelve null: la línea no tiene nada del
 * personaje (va con lo común, como antes).
 */
export function conjuntoDe(analisis, u, modo = 'cabecera') {
  const grupos = modo === 'linea'
    ? analisis.grupos.filter((g) => g.terminos.length > 0 || g.otras.length === 0)
    : analisis.grupos;
  if (modo === 'linea' && grupos.length === 0) return null;
  const salida = new Set();
  for (const pj of u) {
    if (grupos.some((g) => g.terminos.every((t) => cumpleTermino(t, pj)))) salida.add(clave(pj));
  }
  // Ronda 3 (m4): si la condición ya nombra Goblin o Skyborne, se queda como está.
  const nombraNuevas = analisis.grupos.some((g) => g.terminos.some((t) => t.tipo === 'r' && (t.valor === 'Goblin' || t.valor === 'Skyborne')));
  return nombraNuevas ? salida : conFaccionEntera(salida, u);
}

// Ronda 2 (M4): RestedXP nombra las cuatro razas clásicas de una facción («Orc/Troll/Undead/Tauren») para decir «la
// Horda»; en Forever esa facción tiene además Goblin (Horda) y Skyborne (las dos, ver nucleo/filtros.lua). Si para una
// clase están todas las clásicas de una facción, entran también las de Forever de esa facción.
const CLASICAS = { Horde: ['Orc', 'Scourge', 'Tauren', 'Troll'], Alliance: ['Human', 'Dwarf', 'NightElf', 'Gnome'] };
function conFaccionEntera(conjunto, u) {
  for (const f of FACCIONES) {
    for (const c of CLASES) {
      if (!CLASICAS[f].every((r) => conjunto.has(`${c}|${r}|${f}`))) continue;
      for (const pj of u) if (pj.c === c && pj.f === f) conjunto.add(clave(pj));
    }
  }
  return conjunto;
}

export const interseccion = (a, b) => new Set([...a].filter((k) => b.has(k)));
const igual = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

// Los campos de un paso (en los valores del addon: clase, raza, faccion, sin_clase, sin_raza) y si un personaje los cumple.
function cumpleCampos(campos, pj) {
  if (campos.clase && !campos.clase.includes(pj.c)) return false;
  if (campos.sin_clase && campos.sin_clase.includes(pj.c)) return false;
  if (campos.raza && !campos.raza.includes(pj.r)) return false;
  if (campos.sin_raza && campos.sin_raza.includes(pj.r)) return false;
  if (campos.faccion && !campos.faccion.includes(pj.f)) return false;
  return true;
}
const tamano = (campos) => Object.values(campos).reduce((n, v) => n + v.length, 0);

// Los campos más cortos que dan justo `trozo` dentro del universo: la clase en positivo, en negativo o sin poner; la raza
// igual; la facción, puesta o no. Con un empate, en positivo y sin facción.
function camposDe(trozo, u) {
  const clases = CLASES.filter((c) => u.some((pj) => pj.c === c && trozo.has(clave(pj))));
  const razas = RAZAS.filter((r) => u.some((pj) => pj.r === r && trozo.has(clave(pj))));
  const facciones = FACCIONES.filter((f) => u.some((pj) => pj.f === f && trozo.has(clave(pj))));
  const opcionesClase = [{}, { clase: clases }, { sin_clase: CLASES.filter((c) => !clases.includes(c)) }];
  // La negación, solo con las razas del universo (en una guía de la Horda, «sin trols» no nombra las de la Alianza).
  const razasU = RAZAS.filter((r) => u.some((pj) => pj.r === r));
  const opcionesRaza = [{}, { raza: razas }, { sin_raza: razasU.filter((r) => !razas.includes(r)) }];
  const opcionesFaccion = [{}, { faccion: facciones }];
  let mejor = null;
  for (const oc of opcionesClase) {
    for (const or of opcionesRaza) {
      for (const of of opcionesFaccion) {
        const campos = { ...oc, ...or, ...of };
        if (Object.values(campos).some((v) => v.length === 0)) continue;
        const da = new Set(u.filter((pj) => cumpleCampos(campos, pj)).map(clave));
        if (igual(da, trozo) && (mejor === null || tamano(campos) < tamano(mejor))) mejor = campos;
      }
    }
  }
  return mejor;
}

// Parte el conjunto en trozos que caben en un paso: por clase (las clases con las mismas razas, juntas) o por raza y
// facción (las que tienen las mismas clases, juntas); si un trozo aún no cabe, por facción. Se queda con el que da menos.
function trozos(conjunto, u, porClase) {
  const grupos = new Map();
  for (const pj of u) {
    if (!conjunto.has(clave(pj))) continue;
    const eje = porClase ? pj.c : `${pj.r}|${pj.f}`;
    if (!grupos.has(eje)) grupos.set(eje, new Set());
    grupos.get(eje).add(porClase ? `${pj.r}|${pj.f}` : pj.c);
  }
  const juntos = new Map(); // firma de lo que tiene cada eje -> claves de los personajes
  for (const [eje, cosas] of grupos) {
    const firma = [...cosas].sort().join(',');
    if (!juntos.has(firma)) juntos.set(firma, new Set());
    for (const pj of u) if ((porClase ? pj.c : `${pj.r}|${pj.f}`) === eje && conjunto.has(clave(pj))) juntos.get(firma).add(clave(pj));
  }
  const salida = [];
  for (const trozo of juntos.values()) {
    const campos = camposDe(trozo, u);
    if (campos) {
      salida.push(campos);
      continue;
    }
    for (const f of FACCIONES) {
      const deF = new Set([...trozo].filter((k) => k.endsWith(`|${f}`)));
      if (deF.size > 0) salida.push(camposDe(deF, u));
    }
  }
  return salida;
}

/**
 * Los campos de los pasos que dan justo ese conjunto de personajes: [] si no lo cumple nadie, [{}] si lo cumplen todos los
 * del universo y, si no, uno o varios juegos de campos (en los valores del addon) que no se pisan.
 */
export function camposDeConjunto(conjunto, u) {
  if (conjunto.size === 0) return [];
  if (conjunto.size === u.length) return [{}];
  const a = trozos(conjunto, u, true);
  const b = trozos(conjunto, u, false);
  return b.length < a.length ? b : a;
}

/** Los campos en el texto que se escribe (nombres en español), en el orden clase, raza, faccion, sin_clase, sin_raza. */
export function camposEnEspanol(campos) {
  const salida = {};
  if (campos.clase) salida.clase = campos.clase.map((c) => NOMBRE_CLASE[c]);
  if (campos.raza) salida.raza = campos.raza.map((r) => NOMBRE_RAZA[r]);
  if (campos.faccion) salida.faccion = campos.faccion.map((f) => NOMBRE_FACCION[f]);
  if (campos.sin_clase) salida.sin_clase = campos.sin_clase.map((c) => NOMBRE_CLASE[c]);
  if (campos.sin_raza) salida.sin_raza = campos.sin_raza.map((r) => NOMBRE_RAZA[r]);
  return salida;
}

export { cumpleCampos, clave as claveDe };
