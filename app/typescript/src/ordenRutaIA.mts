// 21-nov (en el juego, Durotar): la IA escribe el orden de su ruta y a veces pide usar un objeto antes de matar a quien lo
// suelta, o hace dos viajes a la misma zona. Este módulo puro lo arregla sin inventar nada: solo cambia de sitio pasos.
//
//   ordenarPasosIA(tramos, {base, pj}) -> {tramos, movidos}
//
//   1. Una misión que empieza con un objeto que suelta un PNJ de la ruta se acepta justo detrás del paso que lo mata.
//   2. Dentro de cada tramo y de un mismo mapa, busca el orden más corto por ventanas de VENTANA bloques. Solo lo cambia si
//      ahorra al menos AHORRO_MINIMO: la ruta de la IA puede tener sus motivos y un retoque pequeño no los compensa.
//
// Nunca cambia el orden relativo de dos pasos de una misma misión, ni adelanta una misión a sus previas, a quien suelta su
// objeto o, si pide más nivel que el del personaje, a nada de lo que tenía delante. Un paso sin misiones (un viaje, una
// nota) se queda en su sitio y separa lo de antes de lo de después. Un paso con misiones y sin punto va pegado al anterior.
import { elemento, entradas } from './base/leer-lua.mjs';
import { lista } from './base/pasos.mjs';
import { dependencias, previasPorObjeto } from './rutaZona.mjs';

const VENTANA = 12;
const AHORRO_MINIMO = 0.05;
const ASPECTO = 1.5; // los mapas de zona son 3:2: un 1 % en x son 1,5 veces las yardas de un 1 % en y
const ACCION_DE = { accept: 'aceptar', complete: 'completar', turnin: 'entregar' };

const distancia = (a, b) => Math.hypot((a.x - b.x) * ASPECTO, a.y - b.y);
const enteros = (v) => lista(v).filter(Number.isInteger);

function accionesDe(paso) {
  if (Array.isArray(paso.elementos)) {
    return paso.elementos.filter((e) => ACCION_DE[e.t] && Number.isInteger(e.q)).map((e) => ({ q: e.q, accion: ACCION_DE[e.t] }));
  }
  return (Array.isArray(paso.misiones) ? paso.misiones : []).filter((m) => Number.isInteger(m?.q)).map((m) => ({ q: m.q, accion: m.accion }));
}

function puntoDe(paso) {
  if (paso.punto) return paso.punto;
  return Array.isArray(paso.elementos) ? paso.elementos.find((e) => e.t === 'goto' && Number.isInteger(e.mapa)) ?? null : null;
}

// Los PNJ que hay que matar para los objetivos de q (los de PNJ y los que sueltan sus objetos).
function pnjsDe(base, q, pj) {
  const m = base.mision(q, pj);
  if (!m) return [];
  const directos = entradas(elemento(m.objectives, 1)).map(([, v]) => elemento(v, 1));
  const deObjetos = entradas(elemento(m.objectives, 3)).flatMap(([, v]) => lista(base.item(elemento(v, 1), pj)?.npcDrops));
  return [...directos, ...deObjetos].filter(Number.isInteger);
}

// Quién suelta el objeto con el que empieza q ([] si no empieza con un objeto).
function soltadoresDe(base, q, pj) {
  const m = base.mision(q, pj);
  if (!m) return [];
  return enteros(elemento(m.startedBy, 3)).flatMap((item) => enteros(base.item(item, pj)?.npcDrops));
}

const mataA = (ctx, paso, pnjs) => accionesDe(paso).some((a) => a.accion === 'completar' && pnjsDe(ctx.base, a.q, ctx.pj).some((n) => pnjs.includes(n)));

// Regla 1: cada «aceptar» de objeto que va antes de matar a quien lo suelta pasa justo detrás de ese paso.
function aceptarTrasSoltar(entrada, ctx) {
  const pasos = [...entrada];
  let movidos = 0;
  const hechas = new Set();
  for (let i = 0; i < pasos.length; i++) {
    const paso = pasos[i];
    // Un paso ya armado (con `elementos`) solo se mueve si no es más que ese «aceptar»: con goto, ya va a donde cae.
    const suelto = Array.isArray(paso.elementos) && paso.elementos.length === 1 && paso.elementos[0].t === 'accept';
    const candidatas = suelto ? paso.elementos : Array.isArray(paso.misiones) ? paso.misiones.filter((m) => m?.accion === 'aceptar') : [];
    for (const m of candidatas) {
      if (hechas.has(m.q)) continue;
      const pnjs = soltadoresDe(ctx.base, m.q, ctx.pj);
      if (pnjs.length === 0 || pasos.slice(0, i).some((p) => mataA(ctx, p, pnjs))) continue;
      let j = -1;
      for (let k = i + 1; k < pasos.length; k++) {
        if (mataA(ctx, pasos[k], pnjs)) { j = k; break; }
        if (accionesDe(pasos[k]).some((a) => a.q === m.q)) break;
      }
      if (j < 0 || accionesDe(pasos[j]).some((a) => a.q === m.q)) continue;
      hechas.add(m.q);
      movidos++;
      if (suelto) {
        pasos.splice(j + 1, 0, paso);
        pasos.splice(i, 1);
        i--;
        break;
      }
      const resto = paso.misiones.filter((x) => x !== m);
      const solo = resto.length === 0;
      // Sin su punto: se hace donde cae el objeto, no donde lo pedía la IA.
      const { punto: _punto, ...sinPunto } = paso;
      pasos.splice(j + 1, 0, solo ? { ...sinPunto, misiones: [m] } : { misiones: [m] });
      if (solo) { pasos.splice(i, 1); i--; } else pasos[i] = { ...paso, misiones: resto };
      break;
    }
  }
  return { pasos, movidos };
}

// ¿`a`, que va antes que `b`, tiene que seguir antes?
function debeIrAntes(a, b, ctx) {
  const deA = new Set(a.acciones.map((x) => x.q));
  if (b.acciones.some((x) => deA.has(x.q))) return true;
  const entregadasEnA = new Set(a.acciones.filter((x) => x.accion === 'entregar').map((x) => x.q));
  for (const { q, accion } of b.acciones) {
    if (accion !== 'aceptar') continue;
    const m = ctx.base.mision(q, ctx.pj);
    if (!m) return true; // de la biblioteca: no se sabe qué pide
    if ((Number.isFinite(m.requiredLevel) ? m.requiredLevel : 0) > ctx.nivel) return true;
    const d = ctx.deps.get(q);
    const previas = [...(d?.todas ?? []), ...(d?.alguna ?? []), ...enteros(m.preQuestSingle), ...enteros(m.preQuestGroup), ...previasPorObjeto(ctx.base, ctx.pj, q)];
    if (previas.some((p) => entregadasEnA.has(p))) return true;
    const pnjs = soltadoresDe(ctx.base, q, ctx.pj);
    if (pnjs.length > 0 && a.pasos.some((p) => mataA(ctx, p, pnjs))) return true;
  }
  return false;
}

// El orden más corto de `trozo` entre `previo` y `siguiente` (puede ser null) respetando las dependencias, o null si no
// ahorra lo bastante. Programación dinámica sobre los subconjuntos (como mucho VENTANA bloques).
function mejorOrden(trozo, previo, siguiente, ctx) {
  const n = trozo.length;
  const piden = trozo.map((b, j) => trozo.slice(0, j).reduce((mask, a, i) => (debeIrAntes(a, b, ctx) ? mask | (1 << i) : mask), 0));
  const total = 1 << n;
  const coste = new Float64Array(total * n).fill(Infinity);
  const vino = new Int8Array(total * n).fill(-1);
  for (let j = 0; j < n; j++) if (piden[j] === 0) coste[(1 << j) * n + j] = distancia(previo.punto, trozo[j].punto);
  for (let mask = 1; mask < total; mask++) {
    for (let u = 0; u < n; u++) {
      const c = coste[mask * n + u];
      if (c === Infinity) continue;
      for (let v = 0; v < n; v++) {
        if (mask & (1 << v) || (piden[v] & mask) !== piden[v]) continue;
        const nueva = mask | (1 << v);
        const d = c + distancia(trozo[u].punto, trozo[v].punto);
        if (d < coste[nueva * n + v]) { coste[nueva * n + v] = d; vino[nueva * n + v] = u; }
      }
    }
  }
  const alFinal = (u) => (siguiente ? distancia(trozo[u].punto, siguiente.punto) : 0);
  let ultimo = -1;
  let mejor = Infinity;
  for (let u = 0; u < n; u++) {
    const c = coste[(total - 1) * n + u] + alFinal(u);
    if (c < mejor) { mejor = c; ultimo = u; }
  }
  let actual = distancia(previo.punto, trozo[0].punto) + alFinal(n - 1);
  for (let i = 1; i < n; i++) actual += distancia(trozo[i - 1].punto, trozo[i].punto);
  if (ultimo < 0 || mejor >= actual * (1 - AHORRO_MINIMO)) return null;
  const orden = [];
  for (let mask = total - 1, u = ultimo; u >= 0;) {
    orden.unshift(trozo[u]);
    const antes = vino[mask * n + u];
    mask &= ~(1 << u);
    u = antes;
  }
  return orden;
}

function optimizar(bloques, ctx) {
  const orden = [...bloques];
  let cambios = 0;
  for (let ini = 1; ini < orden.length - 1; ini += Math.floor(VENTANA / 2)) {
    const fin = Math.min(ini + VENTANA, orden.length);
    const trozo = orden.slice(ini, fin);
    const mejor = mejorOrden(trozo, orden[ini - 1], orden[fin] ?? null, ctx);
    if (mejor) { orden.splice(ini, trozo.length, ...mejor); cambios++; }
  }
  return { orden, cambios };
}

// Regla 2: parte el tramo en bloques seguidos del mismo mapa y ordena cada grupo.
function acortar(pasos, ctx) {
  const salida = [];
  let grupo = [];
  let cambios = 0;
  const cerrar = () => {
    const r = optimizar(grupo, ctx);
    cambios += r.cambios;
    salida.push(...r.orden.flatMap((b) => b.pasos));
    grupo = [];
  };
  for (const paso of pasos) {
    const acciones = accionesDe(paso);
    const punto = puntoDe(paso);
    if (acciones.length === 0) { cerrar(); salida.push(paso); continue; }
    if (!punto) {
      if (grupo.length > 0) { grupo.at(-1).pasos.push(paso); grupo.at(-1).acciones.push(...acciones); } else salida.push(paso);
      continue;
    }
    if (grupo.length > 0 && grupo[0].punto.mapa !== punto.mapa) cerrar();
    grupo.push({ pasos: [paso], acciones: [...acciones], punto });
  }
  cerrar();
  return { pasos: salida, cambios };
}

export function ordenarPasosIA(tramos, { base, pj }: { base?: any; pj?: any; } = {}) {
  if (!base || typeof base.mision !== 'function') return { tramos, movidos: 0 };
  let movidos = 0;
  const salida = tramos.map((t) => {
    const qs = [...new Set(t.pasos.flatMap(accionesDe).map((a) => a.q))].filter((q) => base.mision(q, pj));
    const ctx = { base, pj, nivel: Number.isFinite(pj?.nivel) ? pj.nivel : 0, deps: dependencias(base, pj, qs) };
    const uno = aceptarTrasSoltar(t.pasos, ctx);
    const dos = acortar(uno.pasos, ctx);
    movidos += uno.movidos + dos.cambios;
    return { ...t, pasos: dos.pasos };
  });
  return { tramos: salida, movidos };
}
