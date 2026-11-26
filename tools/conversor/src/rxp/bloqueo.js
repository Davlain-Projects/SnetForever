// Lote A (revisión 52, I2): pasos que solo informan. El motor del addon da un paso por hecho cuando ningún elemento
// bloquea (motor/pasos.lua, `completo`), así que un paso con texto visible y sin ningún elemento que pueda quedar
// pendiente se completa en el ciclo siguiente y el jugador nunca lo lee («Retira los siguientes artículos de tu
// banco…»). El conversor les pone una casilla: un `manual` con su propio texto, como el `+texto` de RestedXP.
//
// Criterio (decidido con RestedXP, docs/plano-restedxp/1-cargador-y-pasos.md §5.3 y 2-comandos.md §0.3):
// - Los pegajosos (`#sticky`, `#completewith`) no piden casilla: se completan por sus elementos o al pasar su destino.
// - El texto del recorrido (goto, waypoint, pin, line, loop) no cuenta como texto visible: un paso que solo trae puntos
//   de flecha es un tramo intermedio de una cadena y en RestedXP tampoco pide casilla.
// - Cuentan los demás elementos con `texto` propio de la guía (no los textos que genera el addon).
//
// puedeBloquear(el) -> boolean   el elemento puede quedar «pendiente» en el addon (refleja los evaluadores de
//                                motor/elementos-*.lua y mapa/navegacion.lua: si cambian, hay que cambiar esto).
// sinBloqueo(paso) -> Filtro     para qué personajes el paso tiene texto visible y nada que lo detenga (false: nadie).
// asegurarCasilla(paso) -> n     pone las casillas que falten (cambia `paso.elementos`) y dice cuántas puso.
import { yFiltro, oFiltro, negarFiltro, sinImposibles, CLASES, RAZAS } from './filtros.js';

// Tipos que nunca dan «pendiente»: informativos (motor/elementos.lua, INFORMATIVOS) y condiciones que solo saltan el
// paso o informan (isOnQuest…, istrained, maxlevel, zoneskip, subzoneskip, bindlocation, showwhiledead, bronzetube,
// itemcount) o que pasan a otra guía (next).
const NUNCA_BLOQUEAN = new Set([
  'nota', 'line', 'link', 'xpto60', 'clicknext', 'use', 'usespell', 'pin', 'waypoint', 'goto', 'loop', 'target', 'mob',
  'unitscan', 'timer', 'itemStat', 'enabledungeon', 'solo', 'blastedLands',
  'isOnQuest', 'isNotOnQuest', 'isQuestComplete', 'isQuestNotComplete', 'isQuestTurnedIn', 'isQuestAvailable',
  'istrained', 'maxlevel', 'zoneskip', 'subzoneskip', 'bindlocation', 'showwhiledead', 'bronzetube', 'itemcount', 'next',
]);
// Tipos cuyo texto propio no cuenta como texto visible del paso (el recorrido de la ventana).
const RECORRIDO = new Set(['goto', 'waypoint', 'pin', 'line', 'loop']);
const PEGAJOSAS = new Set(['sticky', 'completewith']);

export function puedeBloquear(el) {
  if (el.sinCasilla) return false;
  if (el.t === 'goto') return el.modo === 'objetivo';
  if (el.t === 'bankwithdraw') return el.texto !== undefined; // como RestedXP: sin texto solo informa
  if (el.efecto !== undefined) return el.efecto === 'objetivo';
  if (el.t === 'complete' && el.info) return false;
  return !NUNCA_BLOQUEAN.has(el.t);
}

const conTexto = (v) => typeof v === 'string' && v.trim() !== '';
/** ¿Trae el elemento texto propio que la ventana enseña como una línea del paso? */
function textoVisible(el) {
  if (RECORRIDO.has(el.t) || el.texto === undefined) return false;
  return typeof el.texto === 'string' ? conTexto(el.texto) : conTexto(el.texto.en) || conTexto(el.texto.es);
}

const filtroDe = (x) => (x === undefined ? true : x);

// Un personaje tiene una sola clase, una sola raza y una sola facción. Con eso, un grupo Y se simplifica: si pide una
// clase, sobran las clases negadas (igual con raza y facción), y es imposible si niega todas las clases o todas las
// razas (además de lo que ya quita sinImposibles).
const TODAS = { c: CLASES.length, r: RAZAS.length, f: 2 };
function simplificarGrupo(grupo) {
  const positivos = new Set(grupo.filter((t) => !t.startsWith('!')).map((t) => t[0]));
  const sal = grupo.filter((t) => !(t.startsWith('!') && positivos.has(t[1]) && TODAS[t[1]]));
  for (const k of Object.keys(TODAS)) {
    if (sal.filter((t) => t.startsWith(`!${k}:`)).length >= TODAS[k]) return null;
  }
  return sal;
}
/** El filtro sin grupos imposibles ni redundantes (un grupo que contiene a otro sobra: O de Y). */
function limpiar(filtro) {
  const f = sinImposibles(filtro);
  if (!Array.isArray(f)) return f;
  const grupos = f.map(simplificarGrupo).filter((g) => g !== null);
  if (grupos.some((g) => g.length === 0)) return true;
  const sal = grupos.filter((g, i) => !grupos.some((h, j) => j !== i && h.length <= g.length
    && h.every((t) => g.includes(t)) && (h.length < g.length || j < i)));
  return sal.length === 0 ? false : sal;
}
const o = (a, b) => limpiar(oFiltro(a, b));
const y = (a, b) => limpiar(yFiltro(a, b));
const no = (a) => limpiar(negarFiltro(a));

/**
 * El filtro de un elemento nuevo, sin lo que ya pide el paso: se quitan los grupos que chocan con él y, si el paso es
 * un solo grupo, sus términos (ya se cumplen siempre que el paso se ve).
 */
function paraElPaso(filtro, delPaso) {
  if (!Array.isArray(filtro)) return filtro;
  const fijos = Array.isArray(delPaso) && delPaso.length === 1 ? delPaso[0] : [];
  const grupos = filtro.filter((g) => y(delPaso, [g]) !== false).map((g) => g.filter((t) => !fijos.includes(t)));
  return limpiar(grupos.length === 0 ? false : grupos);
}

/** Para quién es pegajoso el paso: sus etiquetas sin filtro y las de `etiquetasPorFiltro`. */
function pegajosoPara(paso) {
  const et = paso.etiquetas ?? {};
  if (Object.keys(et).some((k) => PEGAJOSAS.has(k) && et[k] !== undefined && et[k] !== false)) return true;
  let filtro = false;
  for (const e of paso.etiquetasPorFiltro ?? []) {
    if (PEGAJOSAS.has(e.nombre)) filtro = o(filtro, filtroDe(e.filtro));
  }
  return filtro;
}

/** Para quién no hay casilla: los que no ven el paso como pegajoso ni ven ningún elemento que bloquee. */
function sinCubrir(paso) {
  let cubre = pegajosoPara(paso);
  for (const el of paso.elementos ?? []) {
    if (puedeBloquear(el)) cubre = o(cubre, filtroDe(el.filtro));
  }
  return no(cubre);
}

export function sinBloqueo(paso) {
  let texto = false;
  for (const el of paso.elementos ?? []) {
    if (textoVisible(el)) texto = o(texto, filtroDe(el.filtro));
  }
  return y(y(filtroDe(paso.filtro), texto), sinCubrir(paso));
}

/** Un `manual` con el texto, la línea y (si no es para todos) el filtro dados. */
function casilla(el, filtro) {
  const m = { t: 'manual', texto: el.texto, linea: el.linea };
  if (filtro !== true) m.filtro = filtro;
  return m;
}

// Recorre los elementos con texto visible, en orden, y da casilla a los personajes que lo ven y aún no la tienen:
//  - una nota pasa a manual con el mismo texto; si otros la ven ya cubiertos, se queda para ellos y la casilla va
//    justo detrás, solo para los demás (así cada uno ve el texto una vez);
//  - otro elemento con texto (xpto60, use…) se queda y la casilla va detrás con su texto; si nadie más lo ve, pierde su
//    texto para no repetirlo.
// El filtro del paso (`paso.filtro`) solo sirve para saber si hace falta: no se copia a los elementos nuevos.
export function asegurarCasilla(paso) {
  if (sinBloqueo(paso) === false) return 0;
  const delPaso = filtroDe(paso.filtro);
  let falta = sinCubrir(paso);
  const salida = [];
  let puestas = 0;
  for (const el of paso.elementos) {
    const ve = filtroDe(el.filtro);
    const zona = falta === false || !textoVisible(el) || puedeBloquear(el) ? false : y(ve, falta);
    if (zona === false || y(delPaso, zona) === false) {
      salida.push(el);
      continue;
    }
    // Los que ven el elemento y ya están cubiertos: para ellos se queda como estaba.
    const resto = y(delPaso, y(ve, no(falta))) === false ? false : y(ve, no(falta));
    puestas++;
    if (el.t === 'nota') {
      if (resto !== false) salida.push({ ...el, filtro: paraElPaso(resto, delPaso) });
    } else if (resto === false) {
      const { texto, ...sinTexto } = el; // nadie más lo ve: el texto pasa entero a la casilla
      salida.push(sinTexto);
    } else {
      salida.push(el);
    }
    salida.push(casilla(el, resto === false ? ve : paraElPaso(zona, delPaso)));
    falta = y(falta, no(ve));
  }
  paso.elementos = salida;
  return puestas;
}
