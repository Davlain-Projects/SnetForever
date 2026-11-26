// Guías de las cadenas de mejoras y sus avisos por nivel (lote «Cadenas de mejoras»). Como las de clase (guias.js):
// todo sale del catálogo (mejoras.js) y de la base. El resolvedor encuentra las misiones de cada raza en el universo
// de las mejoras, `fusionar` las junta en una sola secuencia por facción y `pasosDeMision` genera los pasos, con el
// objeto en el que se acepta y se entrega cada misión. Aquí no se escribe ninguna ID ni ninguna coordenada; lo único
// que puede no salir de la base es el beneficio del catálogo, que va marcado como dato del jugador
// (`mejora.beneficioDe = 'jugador'`). Sin él (ni título), los dos salen de la base: el nombre y el tipo de la recompensa
// (`beneficioDe = 'base'`).
import { FACCIONES, vistaDe } from './fuentes.js';
import { resolverVariante } from './resolver.js';
import { fusionar, pasosDeSecuencia, razasDeGuia } from './guias.js';
import { RAZAS_DE } from '../questie/vista.js';
import { ensamblarGuia } from '../generar/pasos.js';
import { recompensasPorMision, tipoDeMejora, NOMBRE_TIPO } from './recompensas.js';

const SIGLA = { Horde: 'H', Alliance: 'A' };
const FUENTE = 'cadenas/mejoras.js';
export const GRUPO_MEJORAS = { Horde: 'Mejoras (H)', Alliance: 'Mejoras (A)' };
export const MARCA_MEJORA = 'x:mejora'; // término de filtro que solo entiende un addon que conoce las guías de mejora

const lista = (v) => (Array.isArray(v) ? v : []);
const sinRepetir = (xs) => [...new Set(xs)];
const comunes = (a, b) => lista(a).filter((x) => lista(b).includes(x));

// Resuelve cada raza de cada variante de la facción y comprueba que la última misión da la recompensa del catálogo.
// Devuelve [{variante (1…), raza, r}], con r como resolverVariante (o un fallo por la recompensa).
function resolverFaccion(mejora, faccion, vista, premios) {
  const salida = [];
  mejora.variantes.forEach((v, i) => {
    if (v.faccion !== faccion) return;
    for (const raza of v.razas.filter((x) => RAZAS_DE[faccion].includes(x))) {
      let r = resolverVariante(vista, {
        universo: 'mejora', raza, inicio: v.inicio, fin: v.fin, pasos: v.pasos, desempate: v.desempate,
      });
      if (r.ok) {
        const ultima = r.misiones[r.misiones.length - 1].q;
        const item = (premios.get(ultima) ?? []).find((id) => vista.item(id)?.name === mejora.recompensa);
        if (item === undefined) {
          r = { ok: false, raza, motivo: `${raza}: la última misión "${vista.mision(ultima).name}" (${ultima}) no da «${mejora.recompensa}»` };
        } else {
          r = { ...r, item };
        }
      }
      salida.push({ variante: i + 1, raza, r });
    }
  });
  return salida;
}

// Objetos que una misión de la secuencia comparte con la anterior (dadores) y con la siguiente (receptores), en todas
// las razas: así la flecha va al objeto de la cadena aunque la misión también empiece o acabe en otros.
function objetosCompartidos(resultados, q, vista) {
  const dadores = [];
  const receptores = [];
  for (const r of resultados) {
    const k = r.misiones.findIndex((x) => x.q === q);
    if (k < 0) continue;
    const m = vista.mision(q);
    if (k > 0) dadores.push(...comunes(vista.mision(r.misiones[k - 1].q).finishedBy?.[1], m.startedBy?.[1]));
    if (k + 1 < r.misiones.length) receptores.push(...comunes(m.finishedBy?.[1], vista.mision(r.misiones[k + 1].q).startedBy?.[1]));
  }
  return { dadores: sinRepetir(dadores), receptores: sinRepetir(receptores) };
}

/**
 * Ronda 2: ¿la cadena tiene combate? Sí si alguna misión pide matar (cualquier objetivo de PNJ, sea o no élite, o
 * crédito de muerte) o recoger un objeto que suelta una criatura; el rango del PNJ no se mira (lote C). Un objeto que no
 * se sabe de dónde sale (sin criaturas, objetos ni ítems que lo den) no deja decidir: se toma el lado prudente (con
 * combate) y la misión va en `dudosas`. Las misiones de buscar o usar objetos del mundo (como las del saco, `objectives = {}`) no son combate.
 * @param {Array<object>} misiones registros de la base (con `id` si se quiere en `dudosas`)
 * @returns {{combate: boolean, dudosas: number[]}}
 */
export function combateDe(misiones, vista) {
  let combate = false;
  const dudosas = [];
  for (const m of misiones) {
    const o = lista(m.objectives);
    const pnjs = [...lista(o[0]).map((e) => e?.[0]), ...lista(o[4]).flatMap((e) => [...lista(e?.[0]), ...(e?.[1] ? [e[1]] : [])])];
    if (pnjs.length > 0) combate = true;
    for (const e of lista(o[2])) {
      const it = vista.item(e?.[0]);
      if (lista(it?.npcDrops).length > 0) combate = true;
      else if (lista(it?.objectDrops).length === 0 && lista(it?.itemDrops).length === 0) {
        combate = true; // no se sabe: el lado prudente
        if (m.id !== undefined && !dudosas.includes(m.id)) dudosas.push(m.id);
      }
    }
  }
  return { combate, dudosas };
}

/**
 * Nivel del aviso de una mejora.
 * - Con combate (ronda 1, M4): el questLevel más alto de la cadena menos MARGEN_AVISO (2), para que cuando salte ninguna
 *   misión esté en naranja ni en rojo (en el Classic, naranja es desde 3 niveles por encima), y nunca por debajo del
 *   requiredLevel más alto. Los questLevel ≤ 0 (escalan con el jugador) no cuentan. Así la de Buzzbox (requiredLevel 7,
 *   misiones de nivel 10 a 16) va al 14 y la del cazador («Ol' Sooty», élite de nivel 20) al 18.
 * - Sin combate (ronda 2, ruling del controlador): el requiredLevel más alto. El questLevel no dice la dificultad de
 *   una misión de buscar objetos: el jugador hizo la del saco (questLevel hasta 32) con un personaje de nivel 21-22.
 */
export const MARGEN_AVISO = 2;
export function nivelDeAviso(misiones, conCombate = true) {
  const requerido = Math.max(0, ...misiones.map((m) => m.requiredLevel ?? 0));
  if (!conCombate) return requerido;
  const deMision = Math.max(0, ...misiones.map((m) => (m.questLevel > 0 ? m.questLevel : 0)));
  return Math.max(requerido, deMision - MARGEN_AVISO);
}

function nombreDe(vista, espanol, tipo, id) {
  const en = vista[tipo === 'item' ? 'item' : 'mision'](id)?.name;
  const es = espanol?.[tipo]?.get(id)?.name;
  return { en, ...(es ? { es } : {}) };
}

// Artículo y nombre de cada tipo de mejora en las frases de «por el camino».
const UN_TIPO = {
  bolsa: { es: 'una bolsa', en: 'a bag' }, montura: { es: 'una montura', en: 'a mount' },
  mascota: { es: 'una mascota', en: 'a pet' }, hechizo: { es: 'un objeto que enseña un hechizo', en: 'an item that teaches a spell' },
  vario: { es: 'un objeto', en: 'an item' },
};

/**
 * Ronda 1 (decisión del controlador): lo que dan por el camino las misiones de antes de la última, si es una mejora
 * («Por el camino, "Tesoros rocosos" te da también una bolsa (…).»). Todo sale de la base. Lote C (mejoras-rereview,
 * Minor 1): la frase en español lleva los nombres en español de la base (los mismos que los pasos) y la inglesa, los
 * ingleses; un nombre sin español se queda en inglés. Sin nada, undefined.
 */
function porElCaminoDe(fusion, ultimas, vista, premios, espanol) {
  const frases = { es: [], en: [] };
  for (const { q } of fusion) {
    if (ultimas.includes(q)) continue;
    for (const id of premios.get(q) ?? []) {
      const tipo = tipoDeMejora(vista.item(id));
      if (!tipo) continue;
      const mision = nombreDe(vista, espanol, 'quest', q);
      const objeto = nombreDe(vista, espanol, 'item', id);
      frases.es.push(`Por el camino, "${mision.es ?? mision.en}" te da también ${UN_TIPO[tipo].es} (${objeto.es ?? objeto.en}).`);
      frases.en.push(`Along the way, "${mision.en}" also gives you ${UN_TIPO[tipo].en} (${objeto.en}).`);
    }
  }
  return frases.en.length > 0 ? { es: frases.es.join(' '), en: frases.en.join(' ') } : undefined;
}

function crearGuia(mejora, faccion, resueltas, vista, { verificadas, base, espanol, premios }) {
  const clave = `${GRUPO_MEJORAS[faccion]}\\${mejora.id}`;
  const resultados = resueltas.map((x) => x.r);
  const secuencias = resultados.map((r) => ({ raza: r.raza, misiones: r.misiones.map((x) => x.q) }));
  const fusion = fusionar(secuencias);
  const razasMejora = sinRepetir(mejora.variantes.filter((v) => v.faccion === faccion).flatMap((v) => v.razas))
    .filter((r) => RAZAS_DE[faccion].includes(r));
  // Los mismos pasos que las de clase (pasosDeSecuencia), con el objeto en el accept y el turnin y la flecha a los objetos
  // que comparte con la misión de al lado. Lo unido por PNJ lleva «orden»; lo unido por objeto, no: el objeto donde se
  // entrega una es el que da la siguiente, según la propia base.
  const { pasos, deducidas: porPnj, porObjeto } = pasosDeSecuencia(vista, fusion, resultados, razasMejora,
    (q, deLaRaza) => ({ objetos: true, ...objetosCompartidos(deLaRaza, q, vista) }));
  const niveles = fusion.map(({ q }) => vista.mision(q).requiredLevel ?? 0);
  const verificada = Boolean(verificadas[mejora.id] ?? verificadas[clave]);
  const razasGuia = razasDeGuia(razasMejora, secuencias);
  const item = resultados[0].item;
  const porElCamino = porElCaminoDe(fusion, resultados.map((r) => r.misiones[r.misiones.length - 1].q), vista, premios, espanol);
  const nombreItem = nombreDe(vista, espanol, 'item', item);
  const esItem = nombreItem.es ?? nombreItem.en;
  // Sin beneficio en el catálogo, el de la base: el nombre y el tipo de la recompensa.
  const tipo = NOMBRE_TIPO[tipoDeMejora(vista.item(item))] ?? NOMBRE_TIPO.vario;
  const { fuente, ...beneficio } = mejora.beneficio
    ?? { es: `Recompensa: ${esItem} (${tipo.es})`, en: `Reward: ${nombreItem.en} (${tipo.en})`, fuente: 'base' };
  const campos = {
    clave,
    grupo: GRUPO_MEJORAS[faccion],
    nombre: mejora.id,
    titulo: mejora.titulo ? { ...mejora.titulo } : { es: `Mejora: ${esItem}`, en: `Upgrade: ${nombreItem.en}` },
    tipo: 'mejora',
    faccion,
    // Ronda 1 (M3): «x:mejora» en cada grupo. Un addon que no conoce las guías de mejora evalúa ese término como falso (un
    // término desconocido no se cumple) y no las saca como guías normales del selector; el que las conoce lo da por bueno.
    filtro: razasGuia.map((r) => [`r:${r}`, MARCA_MEJORA]),
    niveles: { min: Math.min(...niveles), max: Math.max(...niveles) },
    siguientes: [],
    mazmorras: [],
    fuente: { archivo: FUENTE, linea: 0 },
    sinVerificar: !verificada,
    // `beneficioDe` dice de dónde viene el beneficio: 'jugador' (lo contó quien lo probó; no está en la base) o 'base'.
    // `porElCamino`: lo que dan las misiones de antes de la última (de la base); el addon lo enseña detrás del beneficio.
    mejora: {
      id: mejora.id, beneficio, beneficioDe: fuente, recompensa: { item, nombre: nombreItem },
      ...(porElCamino ? { porElCamino } : {}),
    },
    origen: base,
  };
  const ultimas = sinRepetir(resultados.map((r) => r.misiones[r.misiones.length - 1].q));
  const guia = ensamblarGuia(campos, pasos);
  const misionesCadena = fusion.map(({ q }) => ({ ...vista.mision(q), id: q }));
  const combate = combateDe(misionesCadena, vista);
  const inicio = guia.pasos.flatMap((p) => p.elementos).find((e) => e.t === 'goto');
  const aviso = {
    id: `${mejora.id}-${SIGLA[faccion]}`,
    tipo: 'mejora',
    faccion,
    filtro: razasGuia.map((r) => [`r:${r}`]),
    nivel: nivelDeAviso(misionesCadena, combate.combate),
    texto: { en: `You can get: ${nombreItem.en}`, es: `Puedes conseguir: ${esItem}` },
    // Ronda 1 (M4): dónde empieza (el primer punto de la guía). El addon dice la zona y no avisa desde otro continente.
    ...(inicio ? { inicio: { mapa: inicio.mapa, x: inicio.x, y: inicio.y } } : {}),
    guia: clave,
    hechas: ultimas,
  };
  const sinEspanol = fusion.map(({ q }) => q).filter((q) => !espanol?.quest?.get(q)?.name);
  return {
    guia,
    aviso,
    fila: {
      id: mejora.id, faccion, razas: razasGuia, misiones: fusion.length, porObjeto, deducidas: porPnj,
      recompensa: nombreItem.en, estado: verificada ? 'verificada' : 'sin verificar', sinEspanol,
      // Ronda 2: si la cadena tiene combate (decide el nivel del aviso) y las misiones que no dejan decidirlo.
      combate: combate.combate ? 'sí' : 'no', ...(combate.dudosas.length > 0 ? { combateDudoso: combate.dudosas } : {}),
      nivelAviso: aviso.nivel,
      // Solo sale de la cadena (dato del jugador) y la base le pone vendedor: el informe apunta que ese dato no vale.
      ...(mejora.soloConLaCadena && lista(vista.item(item)?.vendors).length > 0 ? { vendedorDeLaBase: true } : {}),
    },
  };
}

/**
 * Guías de las mejoras (una por mejora y facción con alguna variante resuelta), sus avisos (uno por guía), las filas
 * del informe y lo que no se ha podido resolver. Si una raza de una variante falla (también si su última misión no da
 * la recompensa del catálogo), la variante entera queda fuera (va a `sinResolver`) y las demás siguen.
 * @param {Array} catalogo mejoras (src/cadenas/mejoras.js)
 * @param {{entidades, correcciones, zonas, verificadas?, base, espanol?}} fuentes `espanol`: salida de leerEspanol
 *   (para los nombres españoles y la lista de misiones sin nombre español del informe)
 * @returns {{guias: Map<string, object>, avisos: object[], filas: object[],
 *   sinResolver: Array<{id, faccion, variante, raza, motivo}>, discrepancias: Array<{id, nivel, catalogo}>}}
 */
export function guiasDeMejoras(catalogo, { entidades, correcciones, zonas, verificadas = {}, base, espanol }) {
  const fuentes = { entidades, correcciones, zonas };
  const premios = recompensasPorMision(entidades);
  const guias = new Map();
  const avisos = [];
  const filas = [];
  const sinResolver = [];
  const discrepancias = [];
  for (const mejora of catalogo) {
    for (const faccion of FACCIONES) {
      const vista = vistaDe(fuentes, faccion);
      const todas = resolverFaccion(mejora, faccion, vista, premios);
      if (todas.length === 0) continue;
      const caidas = new Set(todas.filter((x) => !x.r.ok).map((x) => x.variante));
      for (const x of todas.filter((y) => !y.r.ok)) {
        sinResolver.push({ id: mejora.id, faccion, variante: x.variante, raza: x.raza, motivo: x.r.motivo });
      }
      const resueltas = todas.filter((x) => !caidas.has(x.variante));
      if (resueltas.length === 0) continue;
      const { guia, aviso, fila } = crearGuia(mejora, faccion, resueltas, vista, { verificadas, base, espanol, premios });
      guias.set(guia.clave, guia);
      avisos.push(aviso);
      filas.push(fila);
      // El nivel del catálogo es el mínimo de la guía (el requiredLevel más bajo); el del aviso se calcula (nivelDeAviso).
      if (guia.niveles.min !== mejora.nivel) discrepancias.push({ id: guia.clave, nivel: guia.niveles.min, catalogo: mejora.nivel });
    }
  }
  return { guias, avisos, filas, sinResolver, discrepancias };
}
