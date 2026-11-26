// Flujo completo del conversor: lee el origen (solo lectura), convierte, VALIDA y, solo si no hay
// errores, escribe los dos addons de datos en `addons/` (quitando lo que la nueva versión ya no trae)
// y los instala si se pide. El informe se escribe siempre.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FUENTES, FUENTES_PROFESIONES, ORIGEN, rutaQuestieToc } from './config.js';
import { cargarMapas } from './rxp/coordenadas.js';
import { construirGuias } from './rxp/guias.js';
import { escribirRutas } from './escribir/rutas.js';
import { escribirMisiones, esMisionBasura } from './escribir/misiones.js';
import { leerEntidades } from './questie/entidades.js';
import { leerCorrecciones } from './questie/correcciones.js';
import { cargarZonas } from './questie/zonas.js';
import { leerInstancias } from './questie/instancias.js';
import { crearVista, ORDEN_CLASE } from './questie/vista.js';
import { filasDePropias } from './questie/propias.js';
import { leerOpenMap } from './openmap.js';
import { CATALOGO } from './cadenas/catalogo.js';
import { guiasDeCadenas } from './cadenas/guias.js';
import { VERIFICADAS } from './cadenas/verificadas.js';
import { MEJORAS } from './cadenas/mejoras.js';
import { guiasDeMejoras } from './cadenas/guias-mejoras.js';
import { leerToc } from './questie/toc.js';
import { leerEspanol } from './questie/idioma.js';
import { indexarMazmorras } from './mazmorras/indice.js';
import { guiasDeMazmorras } from './mazmorras/guias.js';
import { recortarProfesion } from './rxp/profesiones.js';
import { validar, validarLaterales } from './validar.js';
import { escribirInforme } from './informe.js';
import { cuarentenaDelVolumen, instalarAddon, limpiarSobrantes, selloDeAhora } from './instalar.js';
import { indicePnjDeBase, resolverPnjs } from './rxp/pnj-por-id.js';
import { dirWtfDe, leerCompletadas, leerEventos, leerListaNegra } from './questie/lista-negra.js';
import { misionesExcluidas } from './questie/excluidas.js';

export const ADDONS = ['SnetForever_Rutas', 'SnetForever_Misiones'];
export const CUARENTENA = 'E:\\_CUARENTENA\\SnetForever';

const REALES = {
  existeOrigen: existsSync, cargarMapas, construirGuias, leerEntidades, leerCorrecciones, cargarZonas, leerOpenMap,
  leerInstancias, guiasDeCadenas, indexarMazmorras, guiasDeMazmorras, recortarProfesion, validar, validarLaterales,
  escribirRutas, escribirMisiones, instalarAddon, log: (l) => console.log(l),
  // Lote H, ronda 1: lo que Questie oculta en el Forever y las misiones hechas de la cuenta (prueba del juego). Solo se leen.
  leerListaNegra: () => leerListaNegra(join(ORIGEN, 'Questie')),
  leerCompletadas: () => leerCompletadas(dirWtfDe(ORIGEN)),
  leerEventos: () => leerEventos(join(ORIGEN, 'Questie')),
  // Las mejoras necesitan el español de la base (nombres y misiones sin nombre español del informe).
  guiasDeMejoras: (catalogo, fuentes) => guiasDeMejoras(catalogo, { ...fuentes, espanol: leerEspanol(leerToc(rutaQuestieToc())) }),
};

const aviso = (tipo, archivo, mensaje) => ({ tipo, archivo, mensaje });
// Las misiones de clase hasta este nivel que no entran en ninguna cadena salen en el informe (R10).
const NIVEL_SIN_CADENA = 40;
const CLASES_CON_ORDEN = Object.keys(ORDEN_CLASE);

/** Todas las misiones (`q` y `qs`) que citan las guías dadas. */
function misionesDeGuias(guias) {
  const qs = new Set();
  for (const g of guias.values()) {
    for (const p of g.pasos ?? []) {
      for (const e of p.elementos ?? []) {
        if (typeof e.q === 'number') qs.add(e.q);
        for (const q of Array.isArray(e.qs) ? e.qs : []) qs.add(q);
      }
    }
  }
  return qs;
}

/**
 * Misiones de clase (las del QuestSort de la clase) de nivel <= 40 que ninguna guía de cadena cita. El nivel es el
 * requerido y, si la base no lo trae, el de la misión. Se mira la base con las correcciones de cada facción.
 * @returns {Array<{clase: string, q: number, nombre: string, nivel: number}>} ordenadas por clase, nivel e id
 */
function misionesDeClaseSinCadena(fuentes, guiasCadena) {
  const enCadena = misionesDeGuias(guiasCadena);
  const vistas = new Map();
  for (const faccion of ['Horde', 'Alliance']) {
    for (const clase of CLASES_CON_ORDEN) {
      const vista = crearVista(fuentes, { faccion, clase });
      for (const [q, m] of vista.misiones()) {
        if (m.zoneOrSort !== ORDEN_CLASE[clase] || enCadena.has(q) || vistas.has(`${clase}:${q}`)) continue;
        const nivel = m.requiredLevel > 0 ? m.requiredLevel : (m.questLevel ?? 0);
        if (nivel <= NIVEL_SIN_CADENA) vistas.set(`${clase}:${q}`, { clase, q, nombre: m.name, nivel });
      }
    }
  }
  return [...vistas.values()].sort((a, b) => a.clase.localeCompare(b.clase) || a.nivel - b.nivel || a.q - b.q);
}

/** Una fila por mazmorra del índice: niveles y su fuente, misiones por facción y si tiene guía (o el motivo de que no). */
function filasDeMazmorras(indice, filasGuias) {
  return Object.values(indice.porMazmorra).sort((a, b) => a.area - b.area).map((m) => {
    const delArea = filasGuias.filter((f) => f.area === m.area);
    const contar = (faccion) => m.misiones.filter((e) => e.faccion === undefined || e.faccion === faccion).length;
    const guias = delArea.filter((f) => f.guia).map((f) => f.guia);
    const motivos = [...new Set(delArea.filter((f) => !f.guia && f.motivo).map((f) => f.motivo))];
    return {
      area: m.area, nombre: m.nombre, niveles: m.niveles, fuenteNiveles: m.fuenteNiveles, banda: m.banda,
      misionesH: contar('Horde'), misionesA: contar('Alliance'), guias, motivo: guias.length === 0 ? motivos.join('; ') : undefined,
    };
  });
}

/**
 * Convierte, valida, escribe e instala.
 * @param {{version: string, salida: string, informe: string, instalar: boolean, cuarentena?: string}} opciones
 * @param {object} [deps] dependencias (solo se cambian en pruebas): las funciones de los módulos y `log`
 * @returns {number} código de salida: 0 bien; 1 si hay errores de validación (no se escribe ni instala nada)
 */
export function convertir(opciones, deps = {}) {
  const d = { ...REALES, ...deps };
  const { version } = opciones;
  const cuarentena = opciones.cuarentena ?? CUARENTENA;
  const toc = rutaQuestieToc();
  if (!d.existeOrigen(toc)) throw new Error(`No encuentro el origen: ${toc}`);

  // 1. Guías de RestedXP.
  const mapas = d.cargarMapas(join(ORIGEN, 'RXPGuides', 'DB', 'forever', 'db.lua'));
  const ctx = { mapas };
  const construccion = d.construirGuias(FUENTES, ctx);

  // 2. Profesiones: se construyen aparte (sin los `#next` extra de las guías de nivel) y se recortan al 1-300 con los
  // niveles de las zonas de OpenMap (por eso OpenMap se lee aquí).
  const openmap = d.leerOpenMap(join(ORIGEN, 'OpenMap'));
  const ctxProfesiones = { mapas, siguientesExtra: {} };
  const construccionProfesiones = d.construirGuias(FUENTES_PROFESIONES, ctxProfesiones);
  const avisosProfesiones = [...construccionProfesiones.avisos];
  const guiasProfesiones = new Map();
  const profesiones = [];
  for (const guia of construccionProfesiones.guias.values()) {
    const fuente = FUENTES_PROFESIONES.find((f) => f.en === guia.fuente.archivo);
    if (!fuente) {
      avisosProfesiones.push({ tipo: 'profesion-sin-fuente', archivo: guia.fuente.archivo, mensaje: `${guia.clave}: la fuente no está en FUENTES_PROFESIONES` });
      continue;
    }
    const r = d.recortarProfesion(guia, {
      profesion: fuente.profesion, hasta: fuente.hasta, niveles: openmap?.niveles ?? new Map(), verificadas: VERIFICADAS,
    });
    avisosProfesiones.push(...r.avisos);
    profesiones.push({ clave: r.guia?.clave ?? guia.clave, emitida: r.guia !== null, ...r.cuenta });
    if (r.guia) guiasProfesiones.set(r.guia.clave, r.guia);
  }

  // 3. Misiones (base de QuestieDB).
  const entidadesTodas = d.leerEntidades(toc);

  // 4. Cadenas de clase, índice de mazmorras y guías de mazmorra (todo sale de la base).
  const dirQuestieDB = dirname(toc);
  const correcciones = d.leerCorrecciones(dirQuestieDB);
  const zonas = d.cargarZonas(dirQuestieDB);
  const avisosInstancias = [];
  const instancias = d.leerInstancias(dirQuestieDB, avisosInstancias);
  const base = { base: 'QuestieDB', version: entidadesTodas.meta?.version, commit: entidadesTodas.meta?.commit };

  // Lote H, ronda 1: fuera las de la lista negra de Questie y las de otras temporadas sin dador con punto, salvo las que
  // prueba el juego (RXPGuides, misiones hechas de la cuenta) y las de una cadena de clase o de mejora que ya se resolvía
  // (esas se quedan y van al informe). Las cadenas se resuelven primero sin quitar nada, solo si hay algo que quitar.
  const listaNegra = d.leerListaNegra();
  const enGuiasRxp = misionesDeGuias(new Map([...construccion.guias, ...construccionProfesiones.guias]));
  const completadas = d.leerCompletadas();
  // Ronda 2: las de fiesta que Questie destapa con su evento se quedan en los datos (existen, aunque solo en temporada).
  const eventos = d.leerEventos();
  const reglas = { entidades: entidadesTodas, zonas, listaNegra, enGuiasRxp, completadas, eventos };
  let excl = misionesExcluidas({ ...reglas, enCadenas: new Map() });
  if (excl.excluidas.size > 0) {
    const sinQuitar = { entidades: entidadesTodas, correcciones, zonas, verificadas: VERIFICADAS, base };
    const enCadenas = new Map();
    for (const g of [...d.guiasDeCadenas(CATALOGO, sinQuitar).guias.values(), ...d.guiasDeMejoras(MEJORAS, sinQuitar).guias.values()]) {
      for (const q of misionesDeGuias(new Map([[g.clave, g]]))) if (!enCadenas.has(q)) enCadenas.set(q, g.nombre ?? g.clave);
    }
    excl = misionesExcluidas({ ...reglas, enCadenas });
  }
  const entidades = {
    ...entidadesTodas, quest: new Map([...entidadesTodas.quest].filter(([id]) => !excl.excluidas.has(id))),
  };
  const descartadas = [...entidadesTodas.quest]
    .filter(([id, q]) => esMisionBasura(q) || excl.excluidas.has(id)).map(([id]) => id);
  // Ronda 2: las guías laterales (cadenas, mejoras, mazmorras) y sus avisos no usan las que se quedan por evento: una
  // misión de temporada no se propone ni avisa por nivel. Se escriben en los datos, como Questie las tiene.
  const entidadesGuias = {
    ...entidades, quest: new Map([...entidades.quest].filter(([id]) => !excl.porEvento.has(id))),
  };
  const fuentesBase = { entidades: entidadesGuias, correcciones, zonas };
  const cadenas = d.guiasDeCadenas(CATALOGO, { ...fuentesBase, verificadas: VERIFICADAS, base });
  const mejoras = d.guiasDeMejoras(MEJORAS, { ...fuentesBase, verificadas: VERIFICADAS, base });
  const indice = d.indexarMazmorras({ ...fuentesBase, openmap, instancias });
  const mazmorras = d.guiasDeMazmorras(indice, { ...fuentesBase, verificadas: VERIFICADAS, base });
  const guiasMisiones = new Map([...cadenas.guias, ...mejoras.guias, ...mazmorras.guias]);
  const guiasRutas = new Map([...construccion.guias, ...guiasProfesiones]);
  // Lote B (B3): el id de los PNJ de target/mob/unitscan, ya con la base (los que no se pueden decidir, al informe).
  const pnj = resolverPnjs([...guiasRutas.values(), ...guiasMisiones.values()], indicePnjDeBase(entidades, zonas));
  const avisosLaterales = [...cadenas.avisos, ...mejoras.avisos, ...mazmorras.avisos];
  // Correcciones propias comprobadas: qué cambian en la base real (sección propia del informe).
  const propias = filasDePropias((faccion) => crearVista({ ...fuentesBase, propias: [] }, { faccion }));
  const laterales = {
    cadenas: cadenas.filas,
    sinResolver: cadenas.sinResolver,
    sinCadena: misionesDeClaseSinCadena(fuentesBase, cadenas.guias),
    mejoras: mejoras.filas,
    mejorasSinResolver: mejoras.sinResolver,
    mazmorras: filasDeMazmorras(indice, mazmorras.filas),
    profesiones,
  };

  // 5. Validación ANTES de tocar `addons/`.
  const misionesBase = { quest: entidadesTodas.quest, descartadas: new Set(descartadas) };
  const resultado = d.validar({ guias: construccion.guias, misiones: misionesBase });
  const resultadoLaterales = d.validarLaterales({
    guiasRutas: guiasProfesiones, guiasMisiones, avisos: avisosLaterales, misiones: misionesBase,
  });
  const errores = [...resultado.errores, ...resultadoLaterales.errores];
  const aDetalle = (a) => aviso(a.tipo ?? 'construccion', a.archivo ?? '(sin archivo)',
    `${a.linea ? `línea ${a.linea}: ` : ''}${a.mensaje}`);
  const avisosConstruccion = [
    ...construccion.avisos.map(aDetalle),
    ...avisosProfesiones.map(aDetalle),
    ...indice.avisos.map((m) => aviso('mazmorras-indice', 'OpenMap/QuestieDB', m)),
    ...avisosInstancias.map((m) => aviso('mazmorras-instancias', 'QuestieDB', m)),
    ...cadenas.discrepancias.map((x) => aviso('cadenas-nivel', 'cadenas/catalogo.js',
      `aviso ${x.id}: el nivel de la base es ${x.nivel} y el del catálogo ${x.catalogo} (manda la base)`)),
    ...mejoras.discrepancias.map((x) => aviso('mejoras-nivel', 'cadenas/mejoras.js',
      `aviso ${x.id}: el nivel de la base es ${x.nivel} y el del catálogo ${x.catalogo} (manda la base)`)),
    ...resultadoLaterales.avisos.map((m) => aviso('laterales', '(avisos)', m)),
  ];
  const descartados = { ...ctx.descartados };
  for (const [k, v] of Object.entries(ctxProfesiones.descartados ?? {})) descartados[k] = (descartados[k] ?? 0) + v;
  const informe = (extra) => escribirInforme({ ...resultado, errores }, opciones.informe, {
    estadisticas: {
      ...construccion.estadisticas, 'Guías de profesión': guiasProfesiones.size, 'Guías de cadena': cadenas.guias.size,
      'Guías de mejora': mejoras.guias.size, 'Guías de mazmorra': mazmorras.guias.size,
      'Cadenas sin resolver': cadenas.sinResolver.length, 'Mejoras sin resolver': mejoras.sinResolver.length,
      'Misiones de la lista negra de Questie fuera': excl.cuenta.listaNegraFuera,
      'Misiones de otras temporadas sin prueba del juego fuera': excl.cuenta.otraTemporadaFuera,
      'Misiones que se quedan por el juego, por una cadena o por evento': excl.cuenta.conservadas,
      'Misiones que se quedan por evento': excl.cuenta.porEvento,
      'PNJ de target/mob con id resuelto por la base': pnj.resueltos, 'PNJ de target/mob sin id': pnj.sinId.length,
      ...extra.estadisticas,
    },
    avisosConstruccion: [...avisosConstruccion, ...(extra.avisos ?? [])],
    descartados,
    misionesDescartadas: extra.misionesDescartadas ?? [],
    laterales,
    propias,
    pnjSinId: pnj.sinId,
    excluidas: { ...excl, listaNegra },
  });

  d.log(`Versión de los datos: ${version}`);
  d.log(`Guías: ${construccion.guias.size} de RestedXP, ${guiasProfesiones.size} de profesión, ${cadenas.guias.size} de cadena, ${mejoras.guias.size} de mejora, ${mazmorras.guias.size} de mazmorra`);
  d.log(`Cadenas sin resolver: ${cadenas.sinResolver.length}; mejoras sin resolver: ${mejoras.sinResolver.length}`);
  d.log(`Errores de validación: ${errores.length}`);
  for (const e of errores) d.log(`  ERROR: ${e}`);
  if (errores.length > 0) {
    informe({ misionesDescartadas: descartadas.map((id) => ({ id, motivo: esMisionBasura(entidadesTodas.quest.get(id)) ?? excl.excluidas.get(id) })) });
    d.log(`Informe: ${opciones.informe}`);
    d.log('Hay errores de validación: no se escribe nada en addons/ ni se instala.');
    return 1;
  }

  // 3. Addons, y fuera de `addons/` lo que la nueva versión ya no trae. Lote C (revisión 52, Minor 7): a la cuarentena
  // (la de `opciones.cuarentena` o, sin ella, la del volumen de la salida), nunca borrado, también en el repositorio.
  const dirRutas = join(opciones.salida, ADDONS[0]);
  const dirMisiones = join(opciones.salida, ADDONS[1]);
  const licenciaOpenMap = openmap?.licencia || undefined;
  const rutas = d.escribirRutas(guiasRutas, dirRutas, { version, avisos: avisosLaterales, licenciaOpenMap });
  const misiones = d.escribirMisiones(dirMisiones, {
    version, rutaToc: toc, guias: guiasMisiones, guiasRutas, porMazmorra: indice.porMazmorra, instancias: indice.instancias,
    licenciaOpenMap, excluidas: excl.excluidas,
    // Lote eventos: cada misión de fiesta lleva en los datos el nombre de su evento (`evento`).
    eventos,
  });
  const cuarentenaSobrantes = opciones.cuarentena ?? cuarentenaDelVolumen(opciones.salida);
  const selloSobrantes = selloDeAhora();
  for (const [nombre, dir, r] of [[ADDONS[0], dirRutas, rutas], [ADDONS[1], dirMisiones, misiones]]) {
    const quitados = limpiarSobrantes(dir, r.archivos, { cuarentena: cuarentenaSobrantes, nombre, sello: selloSobrantes });
    if (quitados.length > 0) {
      d.log(`${nombre}: ${quitados.length} archivo(s) que ya no se generan, movidos a la cuarentena (${join(cuarentenaSobrantes, selloSobrantes, nombre)}): ${quitados.join(', ')}`);
    }
  }

  informe({
    estadisticas: {
      [`Archivos de ${ADDONS[0]}`]: rutas.archivos.length,
      [`Bytes de ${ADDONS[0]}`]: rutas.bytes,
      [`Archivos de ${ADDONS[1]}`]: misiones.archivos.length,
      [`Bytes de ${ADDONS[1]}`]: misiones.bytes,
    },
    avisos: [
      ...rutas.avisos.map((m) => aviso('escritura-rutas', ADDONS[0], m)),
      ...misiones.avisos.map((m) => aviso('escritura-misiones', ADDONS[1], m)),
    ],
    misionesDescartadas: misiones.descartadas,
  });
  const totalAvisos = (resultado.avisosDetalle?.length ?? 0) + avisosConstruccion.length + rutas.avisos.length + misiones.avisos.length;
  d.log(`Misiones: ${entidadesTodas.quest.size - misiones.descartadas.length} (${misiones.descartadas.length} descartadas)`);
  d.log(`Avisos: ${totalAvisos}`);
  d.log(`${ADDONS[0]}: ${rutas.archivos.length} archivos, ${rutas.bytes} bytes`);
  d.log(`${ADDONS[1]}: ${misiones.archivos.length} archivos, ${misiones.bytes} bytes`);
  d.log(`Informe: ${opciones.informe}`);

  // 4. Instalación.
  if (opciones.instalar) {
    for (const [nombre, dir] of [[ADDONS[0], dirRutas], [ADDONS[1], dirMisiones]]) {
      const r = d.instalarAddon(dir, join(ORIGEN, nombre), { version, nombre, cuarentena });
      d.log(`Instalado ${nombre} en ${r.destino} (${r.copiados} archivos)`);
      if (r.aCuarentena.length > 0) d.log(`  ${r.aCuarentena.length} archivo(s) .lua antiguos movidos a la cuarentena: ${r.aCuarentena.join(', ')}`);
    }
  } else {
    d.log('Instalación: no pedida (usa --instalar)');
  }
  return 0;
}
