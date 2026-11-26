// Filtros `<<` de las guías de RestedXP: análisis a forma normalizada y evaluador de referencia.
// Reproduce `applies()` del original (RXPGuides/GuideLoader.lua:36-103; plano 1 §3) con estas diferencias:
// los términos de juego (`FOREVER`, `Classic`, `SOD`, `DF`...) se resuelven aquí, al convertir,
// y los paréntesis se pasan a forma normal (O de grupos Y) en vez de evaluarse en tiempo de juego.
//
// Forma normalizada `Filtro`: `true`, `false` o un array de grupos O; cada grupo es un array Y
// de términos de texto: `c:WARRIOR`, `r:Scourge`, `f:Horde`, `n:10` (nivel >= 10), `s:male`,
// `l:esES`; con `!` delante si el término va negado.

export const RAZAS = ['Human', 'Orc', 'Dwarf', 'NightElf', 'Scourge', 'Tauren', 'Gnome', 'Troll', 'Skyborne'];
export const CLASES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID'];
const FACCIONES = ['Horde', 'Alliance'];

// Nombres de juego distintos de Forever: valen falso (el original los compara con `addon.game`).
// `DK`/`DeathKnight` no existen en Forever; `SOD` solo es verdadero en la temporada 2; `DF` es
// siempre falso (fallo del original, plano 1 §3.1).
const JUEGOS_FALSOS = new Set(['classic', 'tbc', 'wotlk', 'cata', 'mop', 'retail', 'era', 'sod', 'df', 'dk', 'deathknight']);
// Palabras que se usan a propósito para desactivar una línea: falsas y sin aviso.
const SIN_AVISO = new Set(['skip']);

const RE_IDIOMA = /^[a-z]{2}[A-Z]{2}$/;
// Misma expresión que el original: `!?[%w%d]+` (solo ASCII alfanumérico).
const RE_TERMINO = /!?[A-Za-z0-9]+|\u0001\d+\u0002/g;
const RE_PARENTESIS = /(!?)\(\s*([\s\S]*?)\s*\)/g;

// ---- Lógica en forma normal (interna: DNF = array de grupos; `[[]]` es verdadero, `[]` falso) ----
const VERDADERO = () => [[]];
const FALSO = () => [];

const opuesto = (t) => (t.startsWith('!') ? t.slice(1) : `!${t}`);

/** Quita términos repetidos y descarta el grupo si se contradice (x y !x). */
function limpiarGrupo(grupo) {
  const vistos = new Set();
  const sal = [];
  for (const t of grupo) {
    if (vistos.has(opuesto(t))) return null;
    if (!vistos.has(t)) {
      vistos.add(t);
      sal.push(t);
    }
  }
  return sal;
}

/** Quita grupos duplicados y contradictorios. */
function limpiar(dnf) {
  const claves = new Set();
  const sal = [];
  for (const g of dnf) {
    const l = limpiarGrupo(g);
    if (l === null) continue;
    const k = l.join('\u0000');
    if (claves.has(k)) continue;
    claves.add(k);
    sal.push(l);
  }
  return sal;
}

const o = (a, b) => limpiar([...a, ...b]);
const y = (a, b) => limpiar(a.flatMap((ga) => b.map((gb) => [...ga, ...gb])));

/** Negación de una DNF: no(O de Y) = Y de O de negados, repartido otra vez en DNF. */
function negar(dnf) {
  let res = VERDADERO();
  for (const g of dnf) {
    // no(Y de términos) = O de términos negados (un grupo vacío es verdadero y su negación, falsa)
    res = y(res, g.map((t) => [opuesto(t)]));
  }
  return res;
}

// ---- Términos sueltos ----
/** Devuelve `{valor: boolean}` (constante) o `{lit}` (término normalizado), o `{desconocido: true}`. */
function resolverTermino(palabra) {
  if (/^\d+$/.test(palabra)) return { lit: `n:${parseInt(palabra, 10)}` };
  const nombre = palabra === 'Undead' ? 'Scourge' : palabra;
  if (RAZAS.includes(nombre)) return { lit: `r:${nombre}` };
  if (FACCIONES.includes(palabra)) return { lit: `f:${palabra}` };
  const mayus = palabra.toUpperCase();
  if (CLASES.includes(mayus)) return { lit: `c:${mayus}` };
  if (mayus === 'FOREVER') return { valor: true };
  if (mayus === 'MALE' || mayus === 'FEMALE') return { lit: `s:${mayus.toLowerCase()}` };
  if (RE_IDIOMA.test(palabra)) return { lit: `l:${palabra}` };
  if (JUEGOS_FALSOS.has(palabra.toLowerCase())) return { valor: false };
  if (SIN_AVISO.has(palabra)) return { valor: false };
  return { valor: false, desconocido: true };
}

/** Analiza un texto de filtro (sin `<<`) y devuelve una DNF interna. */
function analizar(texto, contexto) {
  const subs = [];
  // Primero los paréntesis: el contenido llega hasta el primer ")" y se sustituye por un valor.
  const plano = texto.replace(RE_PARENTESIS, (_, op, dentro) => {
    const v = analizar(dentro, contexto);
    subs.push(op === '!' ? negar(v) : v);
    return ` \u0001${subs.length - 1}\u0002 `;
  });

  let resultado = FALSO();
  // Grupos O: los trozos no vacíos entre "/" (un texto sin ningún trozo es falso).
  for (const grupo of plano.split('/')) {
    if (grupo === '') continue;
    let g = VERDADERO();
    for (const tok of grupo.match(RE_TERMINO) ?? []) {
      if (tok.startsWith('\u0001')) {
        g = y(g, subs[parseInt(tok.slice(1), 10)]);
        continue;
      }
      const negado = tok.startsWith('!');
      const palabra = negado ? tok.slice(1) : tok;
      const r = resolverTermino(palabra);
      if (r.desconocido) {
        contexto.avisos.push({
          archivo: contexto.archivo,
          linea: contexto.linea,
          mensaje: `Término de filtro desconocido (vale falso): "${palabra}"`,
        });
      }
      if (r.lit !== undefined) g = y(g, [[negado ? `!${r.lit}` : r.lit]]);
      else if (r.valor === negado) g = FALSO(); // el término vale falso
      // si el término vale verdadero no cambia nada
    }
    resultado = o(resultado, g);
  }
  return resultado;
}

/**
 * Analiza el texto de un filtro `<<`.
 * @param {string} texto lo que va después de `<<`
 * @param {{archivo?: string, linea?: number}} [pos]
 * @returns {{filtro: Array<string[]>|true|false, avisos: Array<{archivo: string, linea: number, mensaje: string}>}}
 */
export function analizarFiltro(texto, { archivo = '', linea = 0 } = {}) {
  const contexto = { archivo, linea, avisos: [] };
  const dnf = analizar(String(texto), contexto);
  let filtro;
  if (dnf.length === 0) filtro = false;
  else if (dnf.some((g) => g.length === 0)) filtro = true;
  else filtro = dnf;
  return { filtro, avisos: contexto.avisos };
}

// ---- Operaciones sobre `Filtro` ya analizados (las usa la traducción de etiquetas de paso) ----
const aDnf = (f) => (f === true ? VERDADERO() : f === false ? FALSO() : f);
function deDnf(dnf) {
  if (dnf.length === 0) return false;
  if (dnf.some((g) => g.length === 0)) return true;
  return dnf;
}
/** Y de dos `Filtro`. */
export const yFiltro = (a, b) => deDnf(y(aDnf(a), aDnf(b)));
/** O de dos `Filtro`. */
export const oFiltro = (a, b) => deDnf(o(aDnf(a), aDnf(b)));
/** Negación de un `Filtro`. */
export const negarFiltro = (a) => deDnf(negar(aDnf(a)));

/** Valor de un término normalizado (con `!` opcional) para un personaje. Referencia para el addon. */
function evaluarTermino(termino, pj) {
  const negado = termino.startsWith('!');
  const t = negado ? termino.slice(1) : termino;
  const tipo = t.slice(0, 1);
  const valor = t.slice(2);
  let ok = false;
  if (tipo === 'c') ok = String(pj.clase ?? '').toUpperCase() === valor;
  else if (tipo === 'r') ok = pj.raza === valor;
  else if (tipo === 'f') ok = pj.faccion === valor;
  else if (tipo === 'n') ok = Number(pj.nivel ?? 1) >= Number(valor);
  else if (tipo === 's') ok = pj.sexo !== undefined && String(pj.sexo).toLowerCase() === valor;
  else if (tipo === 'l') ok = pj.idioma !== undefined && pj.idioma === valor;
  else if (tipo === 'm') {
    const [min, max] = valor.split(',').map(Number);
    const xp = pj.xp ?? 1;
    ok = xp >= min && xp <= max;
  }
  else if (tipo === 'x') ok = CAPACIDADES.has(valor);
  return ok !== negado;
}

// Lote «Cadenas de mejoras», ronda 1 (M3): «x:<capacidad>» se cumple si el addon entiende esa parte de los datos, como
// Filtros.CAPACIDADES de addons/SnetForever/nucleo/filtros.lua. Un addon anterior no conoce «x» y no lo da por cumplido.
const CAPACIDADES = new Set(['mejora']);

/**
 * Evalúa un filtro normalizado para un personaje.
 * @param {Array<string[]>|true|false} filtro
 * @param {{clase: string, raza: string, faccion: string, nivel: number, sexo?: string, idioma?: string}} pj
 */
export function evaluarFiltro(filtro, pj) {
  if (filtro === true || filtro === false) return filtro;
  return filtro.some((grupo) => grupo.every((t) => evaluarTermino(t, pj)));
}

/** Escribe un `Filtro` en notación legible (la misma que lee `analizarFiltro`). */
export function filtroATexto(filtro) {
  if (filtro === true) return 'true';
  if (filtro === false) return 'false';
  const termino = (t) => {
    const neg = t.startsWith('!') ? '!' : '';
    const s = neg ? t.slice(1) : t;
    const valor = s.slice(2);
    if (s[0] === 'c') return neg + valor.charAt(0) + valor.slice(1).toLowerCase();
    return neg + valor;
  };
  return filtro.map((g) => g.map(termino).join(' ')).join('/');
}

// Facción de cada raza (Skyborne existe en las dos).
const FACCION_RAZA = {
  Human: 'Alliance', Dwarf: 'Alliance', NightElf: 'Alliance', Gnome: 'Alliance',
  Orc: 'Horde', Scourge: 'Horde', Tauren: 'Horde', Troll: 'Horde',
};
/** ¿Puede cumplirse un grupo Y? Un personaje tiene una sola clase, raza y facción, y su raza fija la facción. */
function grupoPosible(grupo) {
  const unico = { c: new Set(), r: new Set(), f: new Set() };
  for (const t of grupo) {
    if (!t.startsWith('!') && unico[t[0]]) unico[t[0]].add(t.slice(2));
  }
  if (Object.values(unico).some((s) => s.size > 1)) return false;
  if (grupo.includes('!f:Horde') && grupo.includes('!f:Alliance')) return false;
  const [raza] = unico.r;
  const [faccion] = unico.f;
  if (raza && FACCION_RAZA[raza]) {
    if (faccion && faccion !== FACCION_RAZA[raza]) return false;
    if (grupo.includes(`!f:${FACCION_RAZA[raza]}`)) return false;
  }
  return true;
}
/** Quita de un `Filtro` los grupos O imposibles (p. ej. `f:Alliance` y `f:Horde` a la vez). */
export function sinImposibles(filtro) {
  if (!Array.isArray(filtro)) return filtro;
  const sal = filtro.filter(grupoPosible);
  return sal.length === 0 ? false : sal;
}
