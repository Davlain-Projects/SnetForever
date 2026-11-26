// Guías de las cadenas de clase y sus avisos por nivel (tarea 6 de la fase 3). Todo sale del catálogo y de
// la base: el resolvedor encuentra las misiones de cada raza, `fusionar` las junta en una sola secuencia por
// facción y `pasosDeMision` genera los pasos. Aquí no se escribe ninguna ID ni ninguna coordenada.
import { FACCIONES, resolverCadena, vistaDe } from './fuentes.js';
import { RAZAS_DE } from '../questie/vista.js';
import { pasosDeMision, ensamblarGuia } from '../generar/pasos.js';

const SIGLA = { Horde: 'H', Alliance: 'A' };
const FUENTE = 'cadenas/catalogo.js';

const sinRepetir = (lista) => [...new Set(lista)];

/**
 * Junta las secuencias de misiones de cada raza en una sola, de forma estable y recorriendo las razas en el
 * orden dado. Una misión que ya está colocada suma su raza; una nueva se mete justo antes de la primera de las
 * misiones que le siguen en su secuencia y que ya estén colocadas, contando solo las que están detrás de la
 * última misión de esa secuencia colocada (posición mayor que `ultima`). Si no hay ninguna, va al final de
 * todo. Así, con un orden cruzado entre razas (las posteriores ya colocadas quedan antes de `ultima`), la
 * misión nueva se añade al final y no se reordena nada de lo ya colocado.
 * @param {Array<{raza: string, misiones: number[]}>} secuencias
 * @returns {Array<{q: number, razas: string[]}>}
 */
export function fusionar(secuencias) {
  const orden = [];
  for (const { raza, misiones } of secuencias) {
    let ultima = -1; // posición de la última misión de esta secuencia ya colocada
    misiones.forEach((q, k) => {
      const i = orden.findIndex((x) => x.q === q);
      if (i >= 0) {
        orden[i].razas.push(raza);
        ultima = i;
        return;
      }
      // Antes de la primera de las misiones que siguen en esta secuencia que ya esté colocada más allá de
      // `ultima`; si no hay ninguna, al final.
      const siguientes = misiones.slice(k + 1).map((x) => orden.findIndex((y) => y.q === x)).filter((x) => x > ultima);
      const sitio = siguientes.length > 0 ? Math.min(...siguientes) : orden.length;
      orden.splice(sitio, 0, { q, razas: [raza] });
      ultima = sitio;
    });
  }
  return orden;
}

// Resuelve el catálogo y reparte los resultados por cadena, facción y variante (en ese orden).
// Cada grupo: {cadena, faccion, variante (1…), razas: [{raza, r}]}.
function gruposDe(catalogo, fuentes) {
  const grupos = [];
  for (const cadena of catalogo) {
    const resultados = resolverCadena(fuentes, cadena);
    for (const faccion of FACCIONES) {
      for (let variante = 1; variante <= cadena.variantes.length; variante += 1) {
        const razas = resultados.filter((x) => x.faccion === faccion && x.variante === variante)
          .map(({ raza, r }) => ({ raza, r }));
        if (razas.length > 0) grupos.push({ cadena, faccion, variante, razas });
      }
    }
  }
  return grupos;
}

// Une las listas de varias razas (sin repetir y en orden) para una misión de la secuencia fusionada.
export function unirPrevias(resultados, q) {
  const una = [];
  const todas = [];
  for (const r of resultados) {
    const p = r.previas.get(q);
    if (p) { una.push(...p.una); todas.push(...p.todas); }
  }
  return { una: sinRepetir(una), todas: sinRepetir(todas) };
}

// Las migas van antes del accept de la primera misión de cada raza.
export function unirMigas(resultados, q) {
  return sinRepetir(resultados.filter((r) => r.misiones[0].q === q).flatMap((r) => r.migas));
}

// El último goto de `pasos` ({mapa, x, y}), o undefined.
function ultimoPunto(pasos) {
  for (let i = pasos.length - 1; i >= 0; i--) {
    const g = [...pasos[i].elementos].reverse().find((e) => e.t === 'goto');
    if (g) return { mapa: g.mapa, x: g.x, y: g.y };
  }
  return undefined;
}

/**
 * Pasos de una secuencia fusionada (ronda 1 del lote «Cadenas de mejoras», M2: lo comparten las guías de clase y las de
 * mejora). Por cada misión: el filtro de razas si no es de todas las de `razasTodas`, sus migas y previas (de las razas
 * que la tienen) y `pasosDeMision`; lo unido por PNJ lleva «orden» («punto», sin coordenadas, manda sobre «orden»: el
 * paso no puede llevar las dos marcas).
 * @param {object} vista
 * @param {Array<{q, razas}>} fusion salida de fusionar
 * @param {object[]} resultados los de resolverVariante de cada raza (con misiones, migas y previas)
 * @param {string[]} razasTodas las razas de la guía en esta facción, en el orden del catálogo
 * @param {(q: number, deLaRaza: object[]) => object} [opcionesDe] opciones extra de pasosDeMision para la misión q
 * @returns {{pasos: object[], deducidas: number, porObjeto: number}} deducidas: misiones unidas por PNJ; porObjeto: por objeto
 */
export function pasosDeSecuencia(vista, fusion, resultados, razasTodas, opcionesDe = () => ({})) {
  const pasos = [];
  let deducidas = 0;
  let porObjeto = 0;
  for (const { q, razas } of fusion) {
    const deLaRaza = resultados.filter((r) => razas.includes(r.raza));
    const origenes = deLaRaza.map((r) => r.misiones.find((x) => x.q === q)?.origen);
    const porPnj = origenes.includes('pnj');
    if (porPnj) deducidas += 1;
    if (origenes.includes('objeto')) porObjeto += 1;
    const ordenadas = razasTodas.filter((r) => razas.includes(r));
    const filtro = ordenadas.length === razasTodas.length ? undefined : ordenadas.map((r) => [`r:${r}`]);
    // Lote C (52-M9): el último punto de los pasos de antes, para la fuente de una misión que empieza con un ítem.
    const anterior = ultimoPunto(pasos);
    const delaMision = pasosDeMision(vista, q, {
      migas: unirMigas(deLaRaza, q), previas: unirPrevias(deLaRaza, q), filtro, anterior, ...opcionesDe(q, deLaRaza),
    });
    pasos.push(...delaMision.map((p) => (porPnj ? { ...p, sinVerificar: p.sinVerificar ?? 'orden' } : p)));
  }
  return { pasos, deducidas, porObjeto };
}

/**
 * Ruling F3-31: la guía solo es para las razas resueltas de esta facción (como sus avisos), en el orden del catálogo;
 * así una cadena no sale en el menú de un personaje para el que no tiene ningún paso.
 */
export function razasDeGuia(razasCatalogo, secuencias) {
  const resueltas = sinRepetir(secuencias.map((s) => s.raza));
  return [...razasCatalogo.filter((r) => resueltas.includes(r)), ...resueltas.filter((r) => !razasCatalogo.includes(r))];
}

function crearGuia(cadena, faccion, variantes, vista, verificadas, base) {
  const clave = `Cadenas de clase (${SIGLA[faccion]})\\${cadena.id}`;
  const resultados = variantes.flatMap((v) => v.razas.map(({ r }) => r));
  const secuencias = resultados.map((r) => ({ raza: r.raza, misiones: r.misiones.map((x) => x.q) }));
  const fusion = fusionar(secuencias);
  // Todas las razas de la cadena en esta facción, según el catálogo (también las de variantes que han caído).
  const razasCadena = cadena.variantes.flatMap((v) => v.razas)
    .filter((r, i, todas) => todas.indexOf(r) === i)
    .filter((r) => RAZAS_DE[faccion].includes(r));
  const { pasos, deducidas } = pasosDeSecuencia(vista, fusion, resultados, razasCadena);
  const niveles = fusion.map(({ q }) => vista.mision(q).requiredLevel);
  const verificada = Boolean(verificadas[cadena.id] ?? verificadas[clave]);
  const razasGuia = razasDeGuia(razasCadena, secuencias);
  const campos = {
    clave,
    grupo: `Cadenas de clase (${SIGLA[faccion]})`,
    nombre: cadena.id,
    titulo: { ...cadena.titulo },
    tipo: 'cadena',
    faccion,
    filtro: razasGuia.map((r) => [`c:${cadena.clase}`, `r:${r}`]),
    niveles: { min: Math.min(...niveles), max: Math.max(...niveles) },
    siguientes: [],
    mazmorras: [],
    fuente: { archivo: FUENTE, linea: 0 },
    sinVerificar: !verificada,
    cadena: { id: cadena.id, ...(cadena.habilidad ? { habilidad: { ...cadena.habilidad } } : {}) },
    origen: base,
  };
  return {
    guia: ensamblarGuia(campos, pasos),
    fila: {
      id: cadena.id,
      faccion,
      razas: sinRepetir(secuencias.map((s) => s.raza)),
      misiones: fusion.length,
      deducidas,
      estado: verificada ? 'verificada' : 'sin verificar',
    },
  };
}

function crearAviso(cadena, faccion, v, clave, vista) {
  const resultados = v.razas.map(({ r }) => r);
  const nivel = Math.min(...resultados.map((r) => vista.mision(r.misiones[0].q).requiredLevel));
  const texto = v.habilidadVariante ?? cadena.habilidad ?? cadena.titulo;
  return {
    id: `${cadena.id}-${SIGLA[faccion]}-${v.variante}`,
    tipo: 'cadena',
    clase: cadena.clase,
    faccion,
    filtro: v.razas.map(({ raza }) => [`r:${raza}`]),
    nivel,
    texto: { en: texto.en, ...(texto.es ? { es: texto.es } : {}) },
    guia: clave,
    hechas: sinRepetir(resultados.map((r) => r.misiones[r.misiones.length - 1].q)),
  };
}

/**
 * Guías de cadena (una por cadena y facción con alguna variante resuelta), sus avisos (uno por variante
 * resuelta), las filas del informe y lo que no se ha podido resolver. Si una raza de una variante falla, la
 * variante entera queda fuera (va a `sinResolver`) y las demás siguen.
 * @param {Array} catalogo cadenas (src/cadenas/catalogo.js)
 * @param {{entidades: object, correcciones: object, zonas: object, verificadas: object, base: object}} fuentes
 * @returns {{guias: Map<string, object>, avisos: object[], filas: object[],
 *   sinResolver: Array<{id, faccion, variante, raza, motivo}>,
 *   discrepancias: Array<{id, nivel, catalogo}>}} `discrepancias`: avisos cuyo nivel (el de la base) no es el
 *   del catálogo; manda la base.
 */
export function guiasDeCadenas(catalogo, { entidades, correcciones, zonas, verificadas = {}, base }) {
  const fuentes = { entidades, correcciones, zonas };
  const guias = new Map();
  const avisos = [];
  const filas = [];
  const sinResolver = [];
  const discrepancias = [];
  const grupos = gruposDe(catalogo, fuentes);
  const resueltas = [];
  for (const g of grupos) {
    const fallos = g.razas.filter(({ r }) => !r.ok);
    if (fallos.length > 0) {
      for (const { raza, r } of fallos) {
        sinResolver.push({ id: g.cadena.id, faccion: g.faccion, variante: g.variante, raza, motivo: r.motivo });
      }
    } else {
      resueltas.push({ ...g, habilidadVariante: g.cadena.variantes[g.variante - 1].habilidad });
    }
  }
  for (const cadena of catalogo) {
    for (const faccion of FACCIONES) {
      const variantes = resueltas.filter((g) => g.cadena === cadena && g.faccion === faccion);
      if (variantes.length === 0) continue;
      const vista = vistaDe(fuentes, faccion, cadena.clase);
      const { guia, fila } = crearGuia(cadena, faccion, variantes, vista, verificadas, base);
      guias.set(guia.clave, guia);
      filas.push(fila);
      for (const v of variantes) {
        const aviso = crearAviso(cadena, faccion, v, guia.clave, vista);
        if (aviso.nivel !== cadena.nivel) discrepancias.push({ id: aviso.id, nivel: aviso.nivel, catalogo: cadena.nivel });
        avisos.push(aviso);
      }
    }
  }
  return { guias, avisos, filas, sinResolver, discrepancias };
}
