// Validador de las guías: demuestra que cada combinación raza/clase tiene ruta del 1 al 60, que ningún
// `#next` apunta a una guía que no existe y que las rutas solo usan misiones conocidas.
import { evaluarFiltro } from './rxp/filtros.js';
import { sinBloqueo } from './rxp/bloqueo.js';
import { COMBINACIONES } from './config.js';

const NIVEL_FINAL = 60;
const RE_AOE = /AoE/i;

const aplica = (filtro, pj) => evaluarFiltro(filtro ?? true, pj);
const archivoDe = (g) => (typeof g.fuente === 'string' ? g.fuente : g.fuente?.archivo) ?? '(sin archivo)';
const pjDe = (c, nivel) => ({ clase: c.clase, raza: c.raza, faccion: c.faccion, nivel });

/** Una guía con `variantes` aplica si aplica cualquiera de ellas. */
const variantesAplican = (g, pj) => !g.variantes || g.variantes.some((v) => aplica(v.filtro, pj));
/**
 * ¿Existe la guía para el personaje? RestedXP no registra una guía cuyo `<<` de cabecera no se cumple
 * (ni la de otra facción): hace falta su facción, su filtro y alguna de sus variantes.
 */
const guiaAplica = (g, pj) => (g.faccion === undefined || g.faccion === pj.faccion)
  && aplica(g.filtro, pj) && variantesAplican(g, pj);

/** Clave que se enseña en la cadena: la de la variante que aplica, o la de la guía. */
function claveVisible(g, pj) {
  const v = g.variantes?.find((x) => aplica(x.filtro, pj));
  return v?.clave ?? g.clave;
}

/**
 * Guía de inicio de una combinación: del `tipo` pedido (`normal` o `mazmorras`), que exista para el
 * personaje a nivel 1, con `porDefecto` aplicable y el menor `niveles[0]`. Se evitan las de mago AoE
 * salvo que no haya otra.
 */
function guiaDeInicio(guias, c, tipo) {
  const pj = pjDe(c, 1);
  const cand = [...guias.values()].filter((g) => g.tipo === tipo
    && guiaAplica(g, pj) && aplica(g.porDefecto, pj));
  const sinAoe = cand.filter((g) => !RE_AOE.test(g.clave));
  const lista = sinAoe.length > 0 ? sinAoe : cand;
  let mejor;
  for (const g of lista) if (!mejor || g.niveles[0] < mejor.niveles[0]) mejor = g;
  return mejor;
}

/**
 * Siguiente guía de la cadena: la primera entrada con clave existente, filtro aplicable y guía destino
 * que existe para el personaje (todo a nivel de la guía destino), como el `#next A;B` del original.
 */
function siguienteGuia(guias, g, c) {
  for (const s of g.siguientes ?? []) {
    const dest = s.clave === undefined ? undefined : guias.get(s.clave);
    if (!dest) continue;
    const pj = pjDe(c, dest.niveles[0]);
    if (aplica(s.filtro, pj) && guiaAplica(dest, pj)) return dest;
  }
  return undefined;
}

/** Sigue la cadena de una combinación desde su guía de inicio del `tipo` dado. Devuelve `{cadena, llega60, motivo?}`. */
function seguirCadena(guias, c, tipo = 'normal') {
  const inicio = guiaDeInicio(guias, c, tipo);
  if (!inicio) return { cadena: [], llega60: false, motivo: 'no hay guía de inicio que le corresponda' };
  const cadena = [];
  const vistas = new Set();
  let g = inicio;
  for (;;) {
    cadena.push(claveVisible(g, pjDe(c, g.niveles[0])));
    vistas.add(g.clave);
    if (g.niveles[1] >= NIVEL_FINAL) return { cadena, llega60: true };
    const sig = siguienteGuia(guias, g, c);
    if (!sig) return { cadena, llega60: false, motivo: `la cadena se corta en «${g.clave}» (nivel ${g.niveles[1]}): no tiene siguiente aplicable` };
    if (vistas.has(sig.clave)) return { cadena, llega60: false, motivo: `bucle: «${g.clave}» vuelve a «${sig.clave}»` };
    g = sig;
  }
}

const etiqueta = (c) => `${c.raza} ${c.clase} (${c.faccion})`;

/**
 * Lote A (revisión 52, I2): ningún paso con texto queda sin un elemento que bloquee. Uno así se completaría en el ciclo
 * siguiente de activarse y el jugador no llegaría a leerlo (bloqueo.js da el criterio y pone las casillas).
 * @returns {string[]} un error por paso
 */
function pasosQueSeCompletanSolos(g) {
  const errores = [];
  for (const p of g.pasos ?? []) {
    if (sinBloqueo(p) !== false) {
      errores.push(`«${g.clave}»: el paso ${p.n ?? p.id ?? '?'} tiene texto y ningún elemento que lo detenga: se completaría solo`);
    }
  }
  return errores;
}

/**
 * Valida las guías.
 * @param {{guias: Map<string, object>, misiones: {quest: Map, descartadas: Set<number>}, combinaciones?: object[]}} entrada
 * @returns {{errores: string[], avisos: string[], avisosDetalle: Array<{tipo: string, archivo: string, mensaje: string}>,
 *   cobertura: Array<{raza: string, clase: string, faccion: string, classic: boolean, cadena: string[], llega60: boolean, motivo?: string}>,
 *   coberturaMazmorras: object[]}} `coberturaMazmorras` tiene la misma forma que `cobertura`, para la
 *   versión con mazmorras (vacía si no hay guías de ese tipo); sus fallos solo dan avisos `mazmorras-sin-60`.
 */
export function validar({ guias, misiones, combinaciones = COMBINACIONES }) {
  const errores = new Set();
  const avisosDetalle = [];
  const aviso = (tipo, archivo, mensaje) => avisosDetalle.push({ tipo, archivo, mensaje });

  // 1. `siguientes` de las guías y de los elementos `.next`/`.clicknext`.
  const revisarLista = (g, lista, donde, esFinal) => {
    const validas = lista.filter((s) => s.clave !== undefined && guias.has(s.clave));
    for (const s of lista) {
      if (s.clave !== undefined && !guias.has(s.clave)) {
        errores.add(`«${g.clave}»: ${donde} apunta a «${s.clave}», que no existe`);
      } else if (s.sinResolver !== undefined && validas.length === 0 && !esFinal) {
        errores.add(`«${g.clave}»: ${donde} sin resolver «${s.sinResolver}»`);
      }
    }
  };
  const saltos = new Set();
  for (const g of guias.values()) {
    const esFinal = g.niveles[1] >= NIVEL_FINAL;
    revisarLista(g, g.siguientes ?? [], '#next', esFinal);
    for (const p of g.pasos ?? []) {
      for (const e of p.elementos ?? []) {
        if (Array.isArray(e.siguientes)) revisarLista(g, e.siguientes, `.${e.t} (línea ${e.linea ?? '?'})`, true);
      }
    }
    // 2. Saltos de nivel entre guías encadenadas.
    for (const s of g.siguientes ?? []) {
      const dest = s.clave === undefined ? undefined : guias.get(s.clave);
      const k = dest && `${g.clave}\u0000${dest.clave}`;
      if (dest && dest.niveles[0] - g.niveles[1] > 1 && !saltos.has(k)) {
        saltos.add(k);
        aviso('salto-de-nivel', archivoDe(g),
          `salto de nivel de «${g.clave}» (acaba en ${g.niveles[1]}) a «${dest.clave}» (empieza en ${dest.niveles[0]})`);
      }
    }
  }

  // 3. Misiones desconocidas y coordenadas fuera de rango, agrupadas por guía.
  const conocida = (id) => misiones.quest.has(id) || misiones.descartadas.has(id);
  for (const g of guias.values()) {
    const desconocidas = new Set();
    const malas = [];
    for (const p of g.pasos ?? []) {
      for (const e of p.elementos ?? []) {
        for (const id of [e.q, ...(Array.isArray(e.qs) ? e.qs : [])]) {
          if (typeof id === 'number' && !conocida(id)) desconocidas.add(id);
        }
        const puntos = [e, ...(Array.isArray(e.puntos) ? e.puntos : [])];
        for (const pt of puntos) {
          for (const eje of ['x', 'y']) {
            if (typeof pt[eje] === 'number' && (pt[eje] < 0 || pt[eje] > 100)) {
              malas.push(`${eje}=${pt[eje]} (${e.t}${e.linea ? `, línea ${e.linea}` : ''})`);
            }
          }
        }
      }
    }
    if (desconocidas.size > 0) {
      const ids = [...desconocidas].sort((a, b) => a - b);
      aviso('mision-desconocida', archivoDe(g), `«${g.clave}»: ${ids.length} misión(es) que no están en los datos ni descartadas: ${ids.join(', ')}`);
    }
    if (malas.length > 0) {
      aviso('coordenada-fuera-de-rango', archivoDe(g), `«${g.clave}»: ${malas.length} coordenada(s) fuera de 0-100: ${malas.slice(0, 10).join('; ')}${malas.length > 10 ? '; …' : ''}`);
    }
    for (const e of pasosQueSeCompletanSolos(g)) errores.add(e);
  }

  // 4. Cobertura: cadena 1→60 de cada combinación.
  const cobertura = [];
  for (const c of combinaciones) {
    const r = seguirCadena(guias, c);
    cobertura.push({ raza: c.raza, clase: c.clase, faccion: c.faccion, classic: c.classic !== false, ...r });
  }
  for (const f of cobertura.filter((x) => x.classic && !x.llega60)) {
    errores.add(`${etiqueta(f)}: no hay ruta del 1 al 60: ${f.motivo}${f.cadena.length ? ` [${f.cadena.join(' → ')}]` : ''}`);
  }
  for (const faccion of [...new Set(cobertura.filter((x) => !x.classic).map((x) => x.faccion))]) {
    const sky = cobertura.filter((x) => !x.classic && x.faccion === faccion);
    if (sky.every((x) => !x.llega60)) {
      errores.add(`Skyborne (${faccion}): ninguna clase llega al 60`);
    } else {
      for (const f of sky.filter((x) => !x.llega60)) aviso('skyborne-sin-60', '(cobertura)', `${etiqueta(f)}: no llega al 60: ${f.motivo}`);
    }
  }

  // 5. Versión con mazmorras: misma comprobación desde sus guías de inicio, pero solo da avisos.
  const coberturaMazmorras = [];
  if ([...guias.values()].some((g) => g.tipo === 'mazmorras')) {
    for (const c of combinaciones) {
      const r = seguirCadena(guias, c, 'mazmorras');
      coberturaMazmorras.push({ raza: c.raza, clase: c.clase, faccion: c.faccion, classic: c.classic !== false, ...r });
      if (!r.llega60) {
        aviso('mazmorras-sin-60', '(cobertura con mazmorras)',
          `${etiqueta(c)}: la versión con mazmorras no llega al 60: ${r.motivo}${r.cadena.length ? ` [${r.cadena.join(' → ')}]` : ''}`);
      }
    }
  }

  return {
    errores: [...errores],
    avisos: avisosDetalle.map((a) => `[${a.tipo}] ${a.archivo}: ${a.mensaje}`),
    avisosDetalle,
    cobertura,
    coberturaMazmorras,
  };
}

const esTexto = (v) => typeof v === 'string' && v.trim() !== '';
const TIPOS_CON_MISIONES = new Set(['cadena', 'mazmorra', 'mejora']);

/**
 * Valida las guías laterales (cadenas, mazmorras y profesiones) y sus avisos antes de escribirlos.
 * @param {{guiasRutas: Map<string, object>, guiasMisiones: Map<string, object>, avisos: object[],
 *   misiones: {quest: Map}}} entrada `misiones.quest` son las misiones de la base (como en `validar`)
 * @returns {{errores: string[], avisos: string[]}} `avisos` son las misiones que un aviso da por hechas y no están en la base
 */
export function validarLaterales({ guiasRutas, guiasMisiones, avisos, misiones }) {
  const errores = [];
  const advertencias = [];
  const enBase = (id) => misiones.quest.has(id);

  for (const clave of guiasRutas.keys()) {
    if (guiasMisiones.has(clave)) errores.push(`La guía «${clave}» está en los dos addons (Rutas y Misiones)`);
  }

  const todas = [...guiasRutas.values(), ...guiasMisiones.values()];
  for (const g of todas) {
    const comprobarMisiones = TIPOS_CON_MISIONES.has(g.tipo);
    const desconocidas = new Set();
    for (const p of g.pasos ?? []) {
      if (!Array.isArray(p.elementos) || p.elementos.length === 0) {
        errores.push(`«${g.clave}»: el paso ${p.n ?? p.id ?? '?'} sin elementos`);
        continue;
      }
      for (const e of p.elementos) {
        if (comprobarMisiones) {
          for (const id of [e.q, ...(Array.isArray(e.qs) ? e.qs : [])]) {
            if (typeof id === 'number' && !enBase(id)) desconocidas.add(id);
          }
        }
        for (const pt of [e, ...(Array.isArray(e.puntos) ? e.puntos : [])]) {
          for (const eje of ['x', 'y']) {
            const v = pt?.[eje];
            if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)) {
              errores.push(`«${g.clave}»: coordenada ${eje}=${v} fuera de 0-100 o no numérica (paso ${p.n ?? '?'}, ${e.t})`);
            }
          }
        }
      }
    }
    if (desconocidas.size > 0) {
      const ids = [...desconocidas].sort((a, b) => a - b);
      errores.push(`«${g.clave}»: ${ids.length} misión(es) que no están en la base: ${ids.join(', ')}`);
    }
    errores.push(...pasosQueSeCompletanSolos(g));
  }

  for (const a of avisos ?? []) {
    const id = a.id ?? '(sin id)';
    if (typeof a.nivel !== 'number' || !Number.isFinite(a.nivel)) errores.push(`Aviso «${id}»: no tiene nivel numérico`);
    if (!esTexto(a.texto?.en)) errores.push(`Aviso «${id}»: no tiene texto.en`);
    if ((a.tipo ?? 'cadena') === 'cadena' && !esTexto(a.clase)) errores.push(`Aviso «${id}»: un aviso de cadena necesita clase`);
    if (a.guia !== undefined && !guiasRutas.has(a.guia) && !guiasMisiones.has(a.guia)) {
      errores.push(`Aviso «${id}»: la guía «${a.guia}» no existe`);
    }
    if (a.hechas !== undefined && !Array.isArray(a.hechas)) {
      errores.push(`Aviso «${id}»: hechas no es una lista`);
      continue;
    }
    const faltan = (a.hechas ?? []).filter((q) => !enBase(q));
    if (faltan.length > 0) advertencias.push(`Aviso «${id}»: da por hechas misiones que no están en la base: ${faltan.join(', ')}`);
  }

  return { errores, avisos: advertencias };
}
