// Guías completas de RestedXP: junta la lectura (tarea 8), los filtros (tarea 9) y los comandos
// (tarea 10). Para cada guía interpreta la cabecera, traduce los pasos, empareja el español paso a
// paso, resuelve `#include` y `#next`, y da a cada paso un id estable.
// Reglas del original: docs/plano-restedxp/1-cargador-y-pasos.md §1.4, §2.1 y §4.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { idDePaso } from '../salida/id.js';
import { extraerGuias, analizarGuia } from './leer.js';
import { analizarFiltro, yFiltro, oFiltro, negarFiltro, sinImposibles } from './filtros.js';
import { traducirPaso, RESUELTAS, filtroDeEtiqueta } from './comandos.js';
import { asegurarCasilla } from './bloqueo.js';
import { ORIGEN, ENLACES, SIGUIENTES_EXTRA } from '../config.js';

// Campos de texto de los elementos que pasan a `{en, es?}`.
const TEXTOS = ['texto', 'rotulo', 'tooltip'];
const SUFIJO_MAZMORRAS = ' (mazmorras)';

/**
 * Normaliza un nombre de guía con el `affix` de RestedXP (GuideLoader.lua:108-111 y 1293):
 * «1-6 Durotar» → «01-06 Durotar», «6-10 Durotar» → «06-10 Durotar».
 */
export function normalizarNombre(nombre) {
  return String(nombre).trim()
    .replace(/^(\d)-(\d\d?)/, (_, a, b) => `0${a}-${b.length === 1 ? `0${b}` : b}`);
}

/** Niveles `[desde, hasta]` del nombre («10-12 Durotar» → [10, 12]), o `undefined`. */
function nivelesDe(nombre) {
  const m = /^(\d+)-(\d+)/.exec(nombre.trim());
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : undefined;
}

// `sinImposibles` vive en filtros.js (lote A: también la usa bloqueo.js); se reexporta aquí.
export { sinImposibles };

/**
 * Para quién existe la guía `d` en RestedXP: su filtro de cabecera Y el de sus variantes de grupo.
 * Si se ha llegado por `grupo`, cuentan solo las variantes de ese grupo; si no, cualquiera.
 */
function filtroDestino(d, grupo) {
  let f = d.filtro ?? true;
  if (d.variantes) {
    const delGrupo = d.variantes.filter((v) => v.grupo === grupo);
    const vs = delGrupo.length > 0 ? delGrupo : d.variantes;
    f = yFiltro(f, vs.reduce((acc, v) => oFiltro(acc, v.filtro ?? true), false));
  }
  return f;
}

const conFiltro = (obj, filtro) => (filtro === true || filtro === undefined ? obj : { ...obj, filtro });

// ---------------------------------------------------------------------------------------------
// Facción
// ---------------------------------------------------------------------------------------------
/** Facción que deja pasar el guardián Lua de fuera de `RegisterGuide` (`if faction == ... return`). */
function faccionDelArchivo(texto) {
  const fuera = texto
    .replace(/RegisterGuide\s*\(\s*\[(=*)\[[\s\S]*?\]\1\]/g, '')
    .replace(/--[^\r\n]*/g, '');
  const igual = /if\s+faction\s*==\s*["'](Horde|Alliance)["']\s*then\s+return/.exec(fuera);
  if (igual) return igual[1] === 'Horde' ? 'Alliance' : 'Horde';
  const distinto = /if\s+faction\s*~=\s*["'](Horde|Alliance)["']\s*then\s+return/.exec(fuera);
  return distinto ? distinto[1] : undefined;
}
/** Facción que exige un `Filtro` (todos sus grupos O piden la misma). */
function faccionDelFiltro(filtro) {
  if (!Array.isArray(filtro)) return undefined;
  return ['Horde', 'Alliance'].find((f) => filtro.every((g) => g.includes(`f:${f}`)));
}
/** Facción por el sufijo `(H)`/`(A)` de los grupos; si hay de las dos (Skyborne), ninguna. */
function faccionDeGrupos(grupos) {
  const sufijos = new Set(grupos.map((g) => /\((H|A)\)\s*$/.exec(g)?.[1] ?? '?'));
  if (sufijos.size !== 1) return undefined;
  const s = [...sufijos][0];
  return s === 'H' ? 'Horde' : s === 'A' ? 'Alliance' : undefined;
}

// ---------------------------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------------------------
/**
 * Agrupa las etiquetas de cabecera por nombre (en minúscula), en orden, con su filtro analizado.
 * Las líneas con filtro falso no existen (GuideLoader.lua:1224-1226).
 */
function leerCabecera(cabecera, archivo, avisos) {
  const tags = {};
  for (const c of cabecera) {
    let filtro = true;
    if (c.filtro !== undefined) {
      const r = analizarFiltro(c.filtro, { archivo, linea: c.linea });
      for (const a of r.avisos) avisos.push({ ...a, tipo: 'filtro' });
      filtro = r.filtro;
      if (filtro === false) continue;
    }
    (tags[c.tag.toLowerCase()] ??= []).push({ valor: c.valor.trim(), filtro, linea: c.linea });
  }
  return tags;
}
const primero = (tags, nombre) => tags[nombre]?.[0]?.valor;

/**
 * Opciones de una etiqueta de un solo valor con líneas filtradas: el original se queda con la
 * primera línea que aplica al personaje. La condición de la línea i es «aplica la i y ninguna de
 * las anteriores». Con `conNinguna`, añade la opción «no aplica ninguna» (valor `undefined`).
 */
function opciones(lineas, conNinguna) {
  const sal = [];
  let antes = false;
  for (const l of lineas ?? []) {
    const cond = yFiltro(l.filtro, negarFiltro(antes));
    if (cond !== false) sal.push({ valor: l.valor, cond, linea: l.linea });
    antes = oFiltro(antes, l.filtro);
    if (antes === true) break;
  }
  if (conNinguna && antes !== true) sal.push({ valor: undefined, cond: negarFiltro(antes) });
  return sal;
}

/** Quita de un `Filtro` los grupos O que contienen a otro grupo entero (absorción: a o (a y b) = a). */
function absorber(filtro) {
  if (!Array.isArray(filtro)) return filtro;
  const conj = filtro.map((g) => new Set(g));
  return filtro.filter((g, i) => !conj.some((o, j) => j !== i && o.size <= g.length
    && [...o].every((t) => conj[i].has(t)) && (o.size < g.length || j < i)));
}

/**
 * Variantes de grupo, subgrupo y título visible (`#group`, `#subgroup`, `#displayname` con
 * `<< filtro`, como en Skyborne): una por combinación posible, con su condición.
 */
function variantesDe(tags, nombreCrudo) {
  const sal = [];
  for (const g of opciones(tags.group, false)) {
    for (const s of opciones(tags.subgroup, true)) {
      for (const d of opciones(tags.displayname, true)) {
        const filtro = yFiltro(yFiltro(g.cond, s.cond), d.cond);
        if (filtro === false) continue;
        const titulo = d.valor || nombreCrudo;
        const igual = sal.find((v) => v.grupo === g.valor && v.subgrupo === s.valor && v.titulo === titulo);
        if (igual) igual.filtro = oFiltro(igual.filtro, filtro);
        else sal.push({ grupo: g.valor, subgrupo: s.valor, titulo, filtro });
      }
    }
  }
  for (const v of sal) v.filtro = absorber(v.filtro);
  return sal;
}

/**
 * Título del español para una variante de condición `cond`: la primera línea `#displayname` que
 * puede aplicar con esa condición, o el `#name` tal cual.
 */
function tituloEs(tags, cond) {
  const l = (tags.displayname ?? []).find((x) => yFiltro(cond, x.filtro) !== false);
  return l?.valor || primero(tags, 'name');
}

/**
 * Visibilidad de la guía en Forever por sus etiquetas de cabecera de temporada, fase, xprate y
 * hardcore/softcore (las mismas reglas que en los pasos: temporada 0, fase 6, xprate 1, softcore).
 * Devuelve `{filtro, culpables}`: `filtro` es `true`, `false` o para quién se ve.
 */
function visibilidadCabecera(tags, xpVariable) {
  let filtro = true;
  const culpables = [];
  for (const nombre of Object.keys(RESUELTAS)) {
    const lineas = tags[nombre];
    if (!lineas) continue;
    let decidido = false;
    let oculta = false;
    for (const l of lineas) {
      if (decidido === true) break; // gana la primera línea que aplica
      const aplica = yFiltro(l.filtro, negarFiltro(decidido));
      oculta = oFiltro(oculta, yFiltro(aplica, negarFiltro(filtroDeEtiqueta(nombre, l.valor, xpVariable))));
      decidido = oFiltro(decidido, l.filtro);
    }
    if (oculta === false) continue;
    culpables.push(`#${nombre}`);
    filtro = yFiltro(filtro, negarFiltro(oculta));
  }
  return { filtro, culpables };
}

// ---------------------------------------------------------------------------------------------
// Español
// ---------------------------------------------------------------------------------------------
/** Firma de un elemento para emparejar inglés y español: su `t` y sus IDs. */
const firmaElemento = (e) => [e.t, e.q, e.i, e.mapa, e.qs, e.is,
  Array.isArray(e.puntos) ? e.puntos.map((p) => p.mapa) : undefined];
const firmaPaso = (elementos) => JSON.stringify(elementos.map(firmaElemento));
/**
 * Un paso coge el español si su lista de `t` y sus IDs coinciden: `q`, `i`, `mapa`, `qs`, `is`
 * y el `mapa` de cada punto de `puntos` (`.line`, `.loop`).
 */
function cuadra(en, es) {
  return en.length === es.length
    && en.every((e, k) => JSON.stringify(firmaElemento(e)) === JSON.stringify(firmaElemento(es[k])));
}

/**
 * Alinea dos secuencias de firmas con la subsecuencia común más larga (LCS). Devuelve, para cada
 * posición de `a`, la de `b` con la que se empareja, o -1.
 */
function alinear(a, b) {
  const par = new Array(a.length).fill(-1);
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) {
    par[ini] = ini;
    ini++;
  }
  let fa = a.length;
  let fb = b.length;
  while (fa > ini && fb > ini && a[fa - 1] === b[fb - 1]) {
    fa--;
    fb--;
    par[fa] = fb;
  }
  const n = fa - ini;
  const m = fb - ini;
  if (n === 0 || m === 0) return par;
  const w = m + 1;
  const d = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      d[i * w + j] = a[ini + i] === b[ini + j]
        ? d[(i + 1) * w + j + 1] + 1
        : Math.max(d[(i + 1) * w + j], d[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[ini + i] === b[ini + j]) {
      par[ini + i] = ini + j;
      i++;
      j++;
    } else if (d[(i + 1) * w + j] >= d[i * w + j + 1]) i++;
    else j++;
  }
  return par;
}
/** Pasa los textos de los elementos a `{en, es?}`. `es` son los elementos en español (o nada). */
function textosBilingues(elementos, es) {
  return elementos.map((e, k) => {
    const sal = { ...e };
    for (const c of TEXTOS) {
      if (typeof e[c] !== 'string') continue;
      const tes = es?.[k]?.[c];
      sal[c] = typeof tes === 'string' ? { en: e[c], es: tes } : { en: e[c] };
    }
    return sal;
  });
}

/**
 * Empareja las guías del archivo inglés con las del español: primero por `#name` normalizado; las
 * que quedan, por posición en el archivo si el rango de niveles del nombre coincide (el español
 * traduce muchos nombres: «1-6 Shadowglen» ↔ «1-6 Cañada Umbría»).
 */
function emparejarGuias(en, es, archivo, avisos) {
  const nombre = (g) => normalizarNombre(primero(g.tags, 'name') ?? '');
  const libres = new Set(es.map((_, i) => i));
  const pareja = en.map((g) => {
    const i = es.findIndex((x, j) => libres.has(j) && nombre(x) === nombre(g));
    if (i < 0) return undefined;
    libres.delete(i);
    return es[i];
  });
  en.forEach((g, i) => {
    if (pareja[i] || !libres.has(i)) return;
    const a = nivelesDe(primero(g.tags, 'name') ?? '');
    const b = nivelesDe(primero(es[i].tags, 'name') ?? '');
    if (a && b && a[0] === b[0] && a[1] === b[1]) {
      pareja[i] = es[i];
      libres.delete(i);
      avisos.push({
        archivo, linea: g.lineaInicial, tipo: 'emparejada-por-posicion',
        mensaje: `Guía "${primero(g.tags, 'name')}" emparejada por posición con "${primero(es[i].tags, 'name')}"`,
      });
    }
  });
  return pareja;
}

// ---------------------------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------------------------
/**
 * Construye todas las guías de las fuentes.
 * @param {Array<{en: string, es?: string, tipo: 'normal'|'mazmorras'}>} fuentes rutas relativas a `ctx.origen`
 * @param {{mapas: Map<string, number>, origen?: string, descartados?: object, avisos?: object[],
 *   enlaces?: object, siguientesExtra?: Record<string, Array<{destino: string}>>,
 *   soloEnlacesOriginales?: boolean}} ctx `origen` vale
 *   ORIGEN por defecto, `enlaces`, ENLACES y `siguientesExtra`, SIGUIENTES_EXTRA (de `config.js`).
 *   `siguientesExtra` es independiente de `origen`: añade al final de los `siguientes` de la guía
 *   de origen (clave) cada destino, sin filtro, y lanza un error si alguno no existe. Las pruebas
 *   con fixtures pasan `{}`.
 *   `descartados` y `avisos` se comparten entre todas las guías; cada guía arrastra su propia
 *   `ultimaZona`.
 * @returns {{guias: Map<string, object>, avisos: object[], estadisticas: object}}
 */
export function construirGuias(fuentes, ctx) {
  const origen = ctx.origen ?? ORIGEN;
  const enlaces = ctx.enlaces ?? ENLACES;
  const siguientesExtra = ctx.siguientesExtra ?? SIGUIENTES_EXTRA;
  ctx.descartados ??= {};
  ctx.avisos ??= [];
  const { avisos, descartados } = ctx;
  const est = {
    guias: 0, pasos: 0, pasosConEspanol: 0, pasosDescuadrados: 0, pasosSinEspanol: 0,
    includes: { resueltos: 0, fallidos: 0 },
    // Entradas de `#next` de cabecera y de `.next`/`.clicknext` resueltas por cada vía.
    next: { grupo: 0, mismoGrupo: 0, enlaces: 0, nombre: 0, sinResolver: 0, alternativaInexistente: 0, destinoNoAplica: 0 },
    nextComandos: { grupo: 0, mismoGrupo: 0, enlaces: 0, nombre: 0, sinResolver: 0, alternativaInexistente: 0, destinoNoAplica: 0 },
    guiasFueraDeForever: 0,
    facciones: { Horde: 0, Alliance: 0, ambas: 0 },
    // Lote A: casillas que se ponen a pasos con texto que se completarían solos (bloqueo.js).
    casillasAnadidas: 0,
  };
  const contar = (k) => { descartados[k] = (descartados[k] ?? 0) + 1; };

  // 1. Cada guía con su cabecera y sus pasos traducidos (sin #include ni #next resueltos).
  const lista = [];
  for (const fuente of fuentes) {
    const textoEn = readFileSync(join(origen, fuente.en), 'utf8');
    const faccionArchivo = faccionDelArchivo(textoEn);
    const leerGuias = (texto, archivo, avisosLectura) => extraerGuias(texto, { archivo }).map((g) => {
      const a = analizarGuia(g.texto, { archivo, lineaInicial: g.lineaInicial });
      avisosLectura.push(...a.avisos);
      return { ...a, lineaInicial: g.lineaInicial, tags: leerCabecera(a.cabecera, archivo, avisosLectura) };
    });
    const guiasEn = leerGuias(textoEn, fuente.en, avisos);

    let guiasEs = [];
    let archivoEs = fuente.es;
    if (archivoEs && !existsSync(join(origen, archivoEs)) && archivoEs.includes('Guides-esES')) {
      archivoEs = archivoEs.replace('Guides-esES', 'Guides-esMX'); // esES; si falta, esMX
    }
    if (archivoEs && existsSync(join(origen, archivoEs))) {
      guiasEs = leerGuias(readFileSync(join(origen, archivoEs), 'utf8'), archivoEs, []);
    } else if (fuente.es) {
      avisos.push({ archivo: fuente.en, linea: 0, tipo: 'sin-espanol', mensaje: `No está el español: "${fuente.es}"` });
      archivoEs = undefined;
    }
    const parejas = emparejarGuias(guiasEn, guiasEs, fuente.en, avisos);

    guiasEn.forEach((a, gi) => {
      if (archivoEs && !parejas[gi]) {
        avisos.push({
          archivo: fuente.en, linea: a.lineaInicial, tipo: 'sin-espanol',
          mensaje: `La guía "${primero(a.tags, 'name')}" no tiene pareja en "${archivoEs}"`,
        });
      }
      const g = construirGuia(a, parejas[gi], { fuente, archivoEs, faccionArchivo });
      if (g) lista.push(g);
    });
  }

  function construirGuia(a, es, { fuente, archivoEs, faccionArchivo }) {
    const archivo = fuente.en;
    const { tags } = a;
    const nombreCrudo = primero(tags, 'name');
    const grupos = [...new Set((tags.group ?? []).map((x) => x.valor))];
    const variantes = nombreCrudo ? variantesDe(tags, nombreCrudo) : [];
    if (!nombreCrudo || variantes.length === 0) {
      avisos.push({ archivo, linea: a.lineaInicial, tipo: 'guia-incompleta', mensaje: 'Guía sin #name o sin #group: no se convierte' });
      return undefined;
    }
    const nombre = normalizarNombre(nombreCrudo);
    let filtro = true;
    if (a.filtroGuia !== undefined) {
      const r = analizarFiltro(a.filtroGuia, { archivo, linea: a.lineaInicial });
      for (const x of r.avisos) avisos.push({ ...x, tipo: 'filtro' });
      filtro = r.filtro;
      if (filtro === false) {
        avisos.push({ archivo, linea: a.lineaInicial, tipo: 'guia-descartada', mensaje: `Guía "${nombre}" con filtro falso: no se convierte` });
        return undefined;
      }
    }
    // Etiquetas de temporada/fase/xprate/hardcore de la cabecera (como en los pasos).
    const vis = visibilidadCabecera(tags, ctx.xpVariable);
    const oculta = vis.filtro === false;
    if (oculta) {
      avisos.push({
        archivo, linea: a.lineaInicial, tipo: 'guia-fuera-de-forever',
        mensaje: `La guía "${nombre}" no se ve en Forever (${vis.culpables.join(', ')}): no se emite; quien la tenga en #next pasa a su #next`,
      });
    } else filtro = yFiltro(filtro, vis.filtro);

    const niveles = nivelesDe(nombre);
    if (!niveles) avisos.push({ archivo, linea: a.lineaInicial, tipo: 'sin-niveles', mensaje: `El nombre "${nombre}" no lleva niveles` });

    const vars = variantes.map((v) => {
      const titulo = { en: v.titulo };
      if (es) {
        const t = tituloEs(es.tags, v.filtro);
        if (t) titulo.es = t;
      }
      const sal = { clave: `${v.grupo}\\${nombre}`, grupo: v.grupo };
      if (v.subgrupo) sal.subgrupo = v.subgrupo;
      sal.titulo = titulo;
      if (v.filtro !== true) sal.filtro = v.filtro;
      return sal;
    });
    const [principal] = vars;
    const guia = {
      clave: principal.clave,
      grupo: principal.grupo,
      nombre,
      titulo: principal.titulo,
      tipo: fuente.tipo,
      fuente: { archivo, linea: a.lineaInicial },
      faccion: faccionArchivo ?? faccionDelFiltro(filtro) ?? faccionDeGrupos(grupos),
      variantes: vars.length > 1 || principal.filtro !== undefined ? vars : undefined,
      grupos: [...new Set(vars.map((v) => v.grupo))],
      oculta,
      disabledungeons: tags.disabledungeons !== undefined,
      next: tags.next ?? [],
      pasos: [],
    };
    if (principal.subgrupo) guia.subgrupo = principal.subgrupo;
    if (niveles) guia.niveles = niveles;
    if (filtro !== true) guia.filtro = filtro;
    const defecto = primero(tags, 'defaultfor');
    if (defecto !== undefined && defecto !== '') {
      const r = analizarFiltro(defecto, { archivo, linea: tags.defaultfor[0].linea });
      for (const x of r.avisos) avisos.push({ ...x, tipo: 'filtro' });
      if (r.filtro !== true) guia.porDefecto = r.filtro;
    }

    // Pasos en inglés: se traducen en orden (cada guía con su propia última zona).
    const ctxGuia = { mapas: ctx.mapas, archivo, descartados, avisos, xpVariable: ctx.xpVariable };
    const enPasos = [];
    for (const p of a.pasos) {
      // El filtro del `step <<`: si no aplica, el original ignora todas sus líneas (GL:1195-1198).
      let filtroPaso = true;
      if (p.filtro !== undefined) {
        const r = analizarFiltro(p.filtro, { archivo, linea: p.linea });
        for (const x of r.avisos) avisos.push({ ...x, tipo: 'filtro' });
        filtroPaso = r.filtro;
      }
      if (filtroPaso === false) {
        contar('paso<<false>>');
        continue;
      }
      const t = traducirPaso(p, ctxGuia);
      if (t.omitido) continue; // ya contado por traducirPaso
      // Las etiquetas con filtro (`etiquetasPorFiltro`) no ocultan el paso: en las guías solo son
      // `#completewith`, `#requires`, `#optional` y `#label`, que se quedan en el paso.
      const filtroFinal = yFiltro(filtroPaso, t.filtro ?? true);
      if (filtroFinal === false) {
        contar('paso<<false>>');
        continue;
      }
      let filtroId = filtroFinal;
      if (ctx.xpVariable && Array.isArray(t.filtro) && t.filtro.some((g) => g.some((v) => /^!?m:/.test(v)))) {
        // Usar la misma condición que se escribió en los IDs del importador anterior.
        const fijo = traducirPaso(p, { ...ctxGuia, xpVariable: false, avisos: [], descartados: {} });
        filtroId = fijo.omitido ? false : yFiltro(filtroPaso, fijo.filtro ?? true);
      }
      enPasos.push({ p, t, filtroFinal, filtroId });
    }

    // Pasos en español, traducidos igual (con su propio contexto; sus avisos no cuentan).
    const ctxEs = { mapas: ctx.mapas, archivo: archivoEs, descartados: {}, avisos: [], xpVariable: ctx.xpVariable };
    const esPasos = [];
    for (const p of es?.pasos ?? []) {
      if (p.filtro !== undefined && analizarFiltro(p.filtro).filtro === false) continue;
      const t = traducirPaso(p, ctxEs);
      if (!t.omitido) esPasos.push({ linea: p.linea, elementos: t.elementos });
    }

    // Emparejado por alineamiento de firmas (lista de `t` + IDs). Los pasos sin pareja se
    // comparan, para el aviso, con el que ocupa su sitio en el hueco del español.
    const par = es ? alinear(enPasos.map((x) => firmaPaso(x.t.elementos)), esPasos.map((x) => firmaPaso(x.elementos))) : [];
    const siguienteEs = new Array(enPasos.length + 1).fill(esPasos.length);
    for (let i = enPasos.length - 1; i >= 0; i--) siguienteEs[i] = par[i] >= 0 ? par[i] : siguienteEs[i + 1];
    let ultimoEs = -1;
    let enHueco = 0;
    enPasos.forEach(({ p, t, filtroFinal, filtroId }, i) => {
      let elementosEs;
      if (es) {
        if (par[i] >= 0 && cuadra(t.elementos, esPasos[par[i]].elementos)) {
          elementosEs = esPasos[par[i]].elementos;
          ultimoEs = par[i];
          enHueco = 0;
        } else {
          const j = ultimoEs + 1 + enHueco;
          enHueco++;
          const pe = j < siguienteEs[i + 1] ? esPasos[j] : undefined;
          const mensaje = pe
            ? `Paso sin español: no cuadra con el español (EN línea ${p.linea}, ES línea ${pe.linea})`
            : `Paso sin español: el español no tiene este paso (EN línea ${p.linea})`;
          avisos.push({ archivo, linea: p.linea, archivoEs, ...(pe ? { lineaEs: pe.linea } : {}), mensaje, tipo: 'descuadre' });
        }
      }
      guia.pasos.push({
        linea: p.linea,
        filtro: filtroFinal,
        filtroId,
        etiquetas: t.etiquetas,
        ...(t.etiquetasPorFiltro ? { etiquetasPorFiltro: t.etiquetasPorFiltro } : {}),
        elementos: textosBilingues(t.elementos, elementosEs),
        requisitos: t.requisitos,
        contenido: JSON.stringify([p.filtro ?? null, p.lineas.map(({ linea, ...resto }) => resto)]),
        es: elementosEs ? 'si' : es ? 'descuadre' : 'no',
      });
    });
    return guia;
  }

  // 2. Claves únicas e índice para buscar por grupo y nombre (incluye los grupos alternativos).
  const guias = new Map();
  const indice = new Map();
  for (const g of lista) {
    if (guias.has(g.clave)) {
      const otra = guias.get(g.clave);
      const sufijo = g.tipo === 'mazmorras' ? SUFIJO_MAZMORRAS : ' (repetida)';
      avisos.push({
        archivo: g.fuente.archivo, linea: g.fuente.linea, tipo: 'clave-repetida',
        mensaje: `La clave "${g.clave}" ya la usa ${otra.fuente.archivo}:${otra.fuente.linea}; esta pasa a "${g.clave}${sufijo}"`,
      });
      g.clave += sufijo;
      if (g.variantes) g.variantes[0].clave = g.clave;
      if (guias.has(g.clave)) continue;
    }
    guias.set(g.clave, g);
    if (!indice.has(g.clave)) indice.set(g.clave, g);
    for (const v of g.variantes ?? []) if (!indice.has(v.clave)) indice.set(v.clave, g);
  }
  const buscar = (grupo, nombre) => indice.get(`${grupo}\\${nombre}`) ?? indice.get(`${grupo}\\${normalizarNombre(nombre)}`);
  /**
   * Busca `nombre` en cada grupo de `origenGuia`. Devuelve `[{destino, grupos}]`, un elemento por
   * destino distinto (en el orden de los grupos), con los grupos en que se ha encontrado.
   */
  function enGrupos(origenGuia, nombre) {
    const sal = [];
    for (const gr of origenGuia.grupos) {
      const d = buscar(gr, nombre);
      if (!d || d === origenGuia) continue;
      const ya = sal.find((x) => x.destino === d);
      if (ya) ya.grupos.push(gr);
      else sal.push({ destino: d, grupos: [gr] });
    }
    return sal;
  }
  /**
   * Destino de ENLACES o SIGUIENTES_EXTRA: con `\` es una clave (de guía o de variante); sin ella, un
   * nombre que se busca en los grupos de la guía de origen. Devuelve `[{destino, grupos}]` (vacía si no está).
   */
  function buscarDestino(origenGuia, texto) {
    if (texto.includes('\\')) {
      const d = indice.get(texto) ?? guias.get(texto);
      return d ? [{ destino: d, grupos: [texto.slice(0, texto.lastIndexOf('\\'))] }] : [];
    }
    return enGrupos(origenGuia, texto);
  }

  // 3. #include (GuideWindow.lua:1606-1744): se copian los pasos de A a B, ambos incluidos.
  const etiquetaDe = (p) => [p.etiquetas.label, ...(p.etiquetasPorFiltro ?? []).filter((e) => e.nombre === 'label').map((e) => e.valor)];
  const resueltas = new Map(); // guía → pasos con los #include resueltos
  const enCurso = new Set();
  function resolverIncludes(guia) {
    if (resueltas.has(guia)) return resueltas.get(guia);
    enCurso.add(guia);
    const sal = [];
    for (const paso of guia.pasos) {
      const inc = paso.etiquetas.include;
      if (typeof inc !== 'string' || inc.startsWith('*')) {
        sal.push(paso);
        continue;
      }
      const { include, ...etiquetas } = paso.etiquetas;
      const propio = { ...paso, etiquetas };
      // El paso del #include solo se conserva si tiene elementos, #requires o #label (GW:1684).
      if (propio.elementos.length > 0 || etiquetas.requires !== undefined || etiquetas.label !== undefined) sal.push(propio);

      const barra = inc.lastIndexOf('\\');
      const grupo = barra < 0 ? guia.grupo : inc.slice(0, barra).replace(/\\+$/, '').trim();
      let nombre = inc.slice(barra + 1).trim();
      let desde;
      let hasta;
      const rango = /^(.*?)@([^@-]+)-?([^@-]*)$/.exec(nombre);
      if (rango) {
        nombre = rango[1].trim();
        desde = rango[2].trim();
        hasta = rango[3].trim() || undefined;
      }
      const fallo = (mensaje) => {
        est.includes.fallidos++;
        avisos.push({ archivo: guia.fuente.archivo, linea: paso.linea, tipo: 'include', mensaje });
      };
      const destino = buscar(grupo, nombre);
      if (!destino) {
        fallo(`#include: no existe la guía "${grupo}\\${nombre}"`);
        continue;
      }
      if (destino === guia || enCurso.has(destino)) {
        fallo(`#include: inclusión circular de "${destino.clave}"`);
        continue;
      }
      const origen2 = resolverIncludes(destino);
      let ini = 0;
      if (desde !== undefined) {
        ini = origen2.findIndex((p) => etiquetaDe(p).includes(desde));
        if (ini < 0) {
          fallo(`#include: la etiqueta "${desde}" no está en "${destino.clave}"`);
          continue;
        }
      }
      let fin = origen2.length - 1;
      const j = hasta === undefined ? 0 : origen2.slice(ini).findIndex((p) => etiquetaDe(p).includes(hasta));
      if (j < 0) fallo(`#include: la etiqueta "${hasta}" no está en "${destino.clave}" (se copia hasta el final)`);
      else {
        if (hasta !== undefined) fin = ini + j;
        est.includes.resueltos++;
      }
      for (const p of origen2.slice(ini, fin + 1)) {
        const f = yFiltro(paso.filtro, p.filtro);
        if (f === false) {
          contar('paso<<false>>');
          continue;
        }
        const filtroId = yFiltro(paso.filtroId, p.filtroId);
        sal.push({ ...structuredClone(p), filtro: f, filtroId, de: p.de ?? destino.clave });
      }
    }
    enCurso.delete(guia);
    resueltas.set(guia, sal);
    return sal;
  }
  for (const g of guias.values()) resolverIncludes(g);

  // 4. #next (functions.lua:3854-3963): lista con `;`, `Grupo\` que sigue valiendo para las
  //    entradas siguientes y filtro por línea. Se resuelve a claves.
  const porNombre = new Map();
  for (const g of guias.values()) {
    if (!porNombre.has(g.nombre)) porNombre.set(g.nombre, []);
    porNombre.get(g.nombre).push(g);
  }
  // RestedXP no registra una guía cuyo `<<` de cabecera no se cumple (ni la variante de grupo cuyo
  // `#group << filtro` no se cumple): de `A;B` toma la primera que existe PARA ESE PERSONAJE. Por eso
  // cada entrada resuelta lleva, con Y, el filtro de la guía destino (y el de su variante).
  const compatibles = (a, b) => (!a.faccion || !b.faccion || a.faccion === b.faccion)
    && sinImposibles(yFiltro(a.filtro ?? true, filtroDestino(b))) !== false;
  /**
   * Resuelve un nombre de `#next` a una lista de `{clave, via, destino, grupos?}`: `grupos` son los
   * grupos por los que se ha encontrado ese destino (para elegir el filtro de las variantes de origen y
   * destino), o nada si se ha encontrado por nombre. Por el grupo de la propia guía puede haber un
   * destino distinto en cada grupo (una guía con un grupo por facción). Lista vacía = sin resolver.
   */
  function resolverNombre(guia, grupoExplicito, nombreCrudo, linea) {
    const nombre = normalizarNombre(nombreCrudo);
    const hecho = (d, via, grupos) => ({ clave: d.clave, via, destino: d, grupos });
    if (grupoExplicito !== undefined) {
      const d = buscar(grupoExplicito, nombre);
      if (d) return [hecho(d, 'grupo', [grupoExplicito])];
      if (ctx.soloEnlacesOriginales) return [];
    }
    const porGrupo = enGrupos(guia, nombre);
    if (porGrupo.length > 0) return porGrupo.map((r) => hecho(r.destino, 'mismoGrupo', r.grupos));
    if (ctx.soloEnlacesOriginales) return [];
    // ENLACES: con `\` el destino es una clave; sin ella, un nombre del grupo de la guía de origen.
    const enlace = enlaces[grupoExplicito !== undefined ? `${grupoExplicito}\\${nombre}` : nombre] ?? enlaces[nombre];
    if (enlace !== undefined) {
      const rs = buscarDestino(guia, enlace);
      if (rs.length > 0) return rs.map((r) => hecho(r.destino, 'enlaces', r.grupos));
    }
    let cand = (porNombre.get(nombre) ?? []).filter((d) => d !== guia && compatibles(guia, d));
    if (cand.length > 1) cand = cand.filter((d) => d.tipo === guia.tipo);
    if (cand.length === 1) {
      avisos.push({
        archivo: guia.fuente.archivo, linea, tipo: 'next-por-nombre',
        mensaje: `#next "${nombreCrudo}" enlazado por nombre con "${cand[0].clave}"`,
      });
      return [hecho(cand[0], 'nombre', undefined)];
    }
    return [];
  }
  /** Filtro de las variantes de `guia` que están en el grupo `grupo` (verdadero si no tiene variantes en él). */
  function filtroVarianteOrigen(guia, grupo) {
    const vs = (guia.variantes ?? []).filter((v) => v.grupo === grupo);
    return vs.length === 0 ? true : vs.reduce((acc, v) => oFiltro(acc, v.filtro ?? true), false);
  }
  /**
   * Filtro de una entrada hacia `destino` (encontrado por `grupos`): `filtro` Y para quién existe el
   * destino (por cada grupo, la variante de origen de ese grupo Y la de destino). Si la guía de origen
   * y `filtro` ya implican el del destino, se queda `filtro` tal cual. `false` = el destino no existe
   * nunca para quien llega por esta entrada.
   */
  function filtroEntrada(guia, filtro, destino, grupos) {
    let fd = grupos === undefined
      ? filtroDestino(destino, undefined)
      : grupos.reduce((acc, gr) => oFiltro(acc, yFiltro(filtroVarianteOrigen(guia, gr), filtroDestino(destino, gr))), false);
    if (ctx.soloEnlacesOriginales && destino.faccion) fd = yFiltro(fd, [[`f:${destino.faccion}`]]);
    const cond = yFiltro(guia.filtro ?? true, filtro);
    if (sinImposibles(yFiltro(cond, fd)) === false) return false;
    if (sinImposibles(yFiltro(cond, negarFiltro(fd))) === false) return filtro;
    return sinImposibles(yFiltro(filtro, fd));
  }
  /**
   * Resuelve una lista `A;B;…`. El original toma la primera entrada que existe para el personaje:
   * cada una lleva el filtro de su destino, las que no existen nunca se quitan, y las que no se
   * encuentran solo quedan `sinResolver` (con aviso) si no se resuelve ninguna.
   */
  function resolverLista(guia, texto, filtro, linea, cuenta = est.next) {
    const resueltas = [];
    const sinResolver = [];
    let noAplican = 0;
    let grupo;
    for (const entrada of String(texto).split(';').map((s) => s.trim()).filter((s) => s !== '')) {
      let nombre = entrada;
      const barra = entrada.lastIndexOf('\\');
      if (barra >= 0) {
        grupo = entrada.slice(0, barra).replace(/\\+$/, '').trim();
        nombre = entrada.slice(barra + 1).trim();
      }
      const rs = resolverNombre(guia, grupo, nombre, linea);
      if (rs.length === 0) {
        sinResolver.push(entrada);
        continue;
      }
      let alguna = false;
      for (const r of rs) {
        const f = filtroEntrada(guia, filtro, r.destino, r.grupos);
        if (f === false) {
          avisos.push({
            archivo: guia.fuente.archivo, linea, tipo: 'next-destino-no-aplica',
            mensaje: `#next "${entrada}": la guía "${r.clave}" no existe nunca para quien llega aquí (su filtro choca): se quita`,
          });
          continue;
        }
        if (!alguna) cuenta[r.via]++;
        alguna = true;
        resueltas.push(conFiltro({ clave: r.clave }, f));
      }
      if (!alguna) noAplican++;
    }
    cuenta.destinoNoAplica += noAplican;
    if (resueltas.length > 0) {
      cuenta.alternativaInexistente += sinResolver.length;
      return resueltas;
    }
    return sinResolver.map((entrada) => {
      cuenta.sinResolver++;
      avisos.push({
        archivo: guia.fuente.archivo, linea, tipo: 'next-sin-resolver', desde: guia.clave, destino: entrada,
        mensaje: `#next "${entrada}" sin resolver`,
      });
      return conFiltro({ sinResolver: entrada }, filtro);
    });
  }

  // Las guías que no se ven en Forever no se emiten: quien apunta a ellas pasa a sus `siguientes`
  // (con los filtros combinados con Y), como hace el original al saltarlas (functions.lua:3945-3948).
  const cuentaOculta = { grupo: 0, mismoGrupo: 0, enlaces: 0, nombre: 0, sinResolver: 0, alternativaInexistente: 0, destinoNoAplica: 0 };
  const crudos = new Map();
  for (const g of guias.values()) {
    const siguientes = ctx.soloEnlacesOriginales
      ? opciones(g.next, false).map((n) => ({ ...n, filtro: n.cond }))
      : g.next;
    crudos.set(g, siguientes.flatMap((n) => resolverLista(g, n.valor, n.filtro, n.linea, g.oculta ? cuentaOculta : est.next)));
  }
  function sinOcultas(lista, vistas = new Set()) {
    return lista.flatMap((s) => {
      const d = s.clave !== undefined ? guias.get(s.clave) : undefined;
      if (!d?.oculta) return [s];
      if (vistas.has(d)) return [];
      const sub = sinOcultas(crudos.get(d), new Set([...vistas, d]));
      return sub.flatMap((x) => {
        const f = sinImposibles(yFiltro(s.filtro ?? true, x.filtro ?? true));
        if (f === false) return [];
        const { filtro: _, ...resto } = x;
        return [conFiltro(resto, f)];
      });
    });
  }

  // SIGUIENTES_EXTRA: salidas manuales al final de los `siguientes`, sin filtro propio (solo el de la
  // guía destino, si la de origen no lo implica ya). Se aplican después de resolver los `#next` y de
  // saltar las guías ocultas.
  const extras = new Map();
  for (const [origenClave, destinos] of Object.entries(siguientesExtra)) {
    const gOrigen = guias.get(origenClave);
    if (!gOrigen || gOrigen.oculta) throw new Error(`SIGUIENTES_EXTRA: la guía de origen «${origenClave}» no existe o no se emite`);
    const claves = destinos.map(({ destino }) => {
      const [r] = buscarDestino(gOrigen, destino);
      const d = r?.destino;
      if (!d || d.oculta) throw new Error(`SIGUIENTES_EXTRA: el destino «${destino}» de «${origenClave}» no existe o no se emite`);
      const f = filtroEntrada(gOrigen, true, d, r.grupos);
      if (f === false) throw new Error(`SIGUIENTES_EXTRA: el destino «${destino}» no existe nunca para quien está en «${origenClave}»`);
      avisos.push({
        archivo: gOrigen.fuente.archivo, linea: gOrigen.fuente.linea, tipo: 'siguiente-extra',
        mensaje: `siguiente añadido a mano: «${origenClave}» → «${d.clave}»`,
      });
      return conFiltro({ clave: d.clave }, f);
    });
    extras.set(gOrigen, claves);
  }

  // `.enabledungeon X` guarda `dungeonOverride[grupo][X]` del grupo de la guía (functions.lua:7650-7662):
  // vale para todas las guías de ese grupo. Se juntan aquí, en el orden de las guías (la última gana);
  // una guía con variantes de grupo cuenta en cada uno de sus grupos.
  const porGrupoMazmorras = new Map();
  for (const g of guias.values()) {
    if (g.oculta) continue;
    for (const p of resueltas.get(g)) {
      for (const e of p.elementos) {
        if (e.t !== 'enabledungeon') continue;
        for (const gr of g.grupos) {
          if (!porGrupoMazmorras.has(gr)) porGrupoMazmorras.set(gr, {});
          const m = porGrupoMazmorras.get(gr);
          if (m[e.d] !== undefined && m[e.d] !== e.activar) {
            avisos.push({
              archivo: g.fuente.archivo, linea: e.linea, tipo: 'enabledungeon-contradictorio',
              mensaje: `.enabledungeon ${e.activar ? '' : '!'}${e.d} contradice otro del grupo «${gr}»: gana este`,
            });
          }
          m[e.d] = e.activar;
        }
      }
    }
  }

  // 5. Salida: siguientes, mazmorras, ids y números de paso.
  const salida = new Map();
  for (const g of guias.values()) {
    if (g.oculta) {
      est.guiasFueraDeForever++;
      continue;
    }
    const siguientes = [...sinOcultas(crudos.get(g)), ...(extras.get(g) ?? [])];
    const pasos = resueltas.get(g);
    const vistos = new Map();
    const mazmorras = {};
    const pasosSal = pasos.map((p, i) => {
      // El contenido normalizado es el filtro del paso y sus líneas sin número de línea; se
      // añade el filtro final, que distingue las copias de un mismo #include con filtros distintos.
      const base = idDePaso(g.clave, p.filtroId === false ? p.filtro : p.filtroId, p.contenido);
      const veces = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, veces);
      const sal = { id: veces === 1 ? base : `${base}-${veces}`, n: i + 1 };
      if (p.filtro !== true) sal.filtro = p.filtro;
      sal.etiquetas = p.etiquetas;
      if (p.etiquetasPorFiltro) sal.etiquetasPorFiltro = p.etiquetasPorFiltro;
      sal.elementos = p.elementos.map((e) => {
        if (!Array.isArray(e.guias) || (e.t !== 'next' && e.t !== 'clicknext')) return e;
        return { ...e, siguientes: sinOcultas(resolverLista(g, e.guias.join(';'), true, e.linea, est.nextComandos)) };
      });
      // Lote A (revisión 52, I2): un paso con texto que nada detiene lleva casilla (bloqueo.js).
      est.casillasAnadidas += asegurarCasilla(sal);
      sal.requisitos = p.requisitos;
      sal.linea = p.linea;
      for (const q of p.requisitos) {
        if (q.t !== 'mazmorra') continue;
        if (q.d.startsWith('!')) sal.sinMazmorra ??= q.d.slice(1);
        else sal.mazmorra ??= q.d;
      }
      if (p.de) sal.de = p.de;
      if (g.disabledungeons) {
        for (const s of [sal.mazmorra, sal.sinMazmorra]) if (s) mazmorras[s] = false;
      }
      if (!p.de) {
        est.pasos++;
        if (p.es === 'si') est.pasosConEspanol++;
        else if (p.es === 'descuadre') est.pasosDescuadrados++;
        else est.pasosSinEspanol++;
      }
      return sal;
    });
    // `.enabledungeon` fija el estado de la mazmorra para todo el GRUPO, y gana a `#disabledungeons`
    // (RXPGuides.lua:2711-2722).
    for (const gr of g.grupos) Object.assign(mazmorras, porGrupoMazmorras.get(gr));

    const guia = { clave: g.clave, grupo: g.grupo, nombre: g.nombre, titulo: g.titulo };
    if (g.subgrupo) guia.subgrupo = g.subgrupo;
    if (g.niveles) guia.niveles = g.niveles;
    if (g.filtro !== undefined) guia.filtro = g.filtro;
    if (g.porDefecto !== undefined) guia.porDefecto = g.porDefecto;
    guia.siguientes = siguientes;
    guia.tipo = g.tipo;
    guia.fuente = g.fuente;
    if (g.faccion) guia.faccion = g.faccion;
    if (g.variantes) guia.variantes = g.variantes;
    guia.mazmorras = mazmorras;
    guia.pasos = pasosSal;
    salida.set(g.clave, guia);
    est.guias++;
    est.facciones[g.faccion ?? 'ambas']++;
  }

  return { guias: salida, avisos, estadisticas: est };
}
