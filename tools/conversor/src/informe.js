// Informe en markdown (en español) del resultado del validador, para el jugador.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { RAZAS, CLASES } from './rxp/filtros.js';

const num = (n) => Number(n).toLocaleString('es-ES');
const escapar = (t) => String(t).replace(/\|/g, '\\|');

/** Avisos del validador en forma `{tipo, archivo, mensaje}` (si solo hay textos, se leen de `[tipo] archivo: mensaje`). */
function detalleDe(resultado) {
  if (Array.isArray(resultado.avisosDetalle)) return resultado.avisosDetalle;
  return (resultado.avisos ?? []).map((a) => {
    const m = /^\[([^\]]+)\] (.*?): ([\s\S]*)$/.exec(a);
    return m ? { tipo: m[1], archivo: m[2], mensaje: m[3] } : { tipo: 'otro', archivo: '(sin archivo)', mensaje: a };
  });
}

function agrupar(avisos) {
  const porTipo = new Map();
  for (const a of avisos) {
    const tipo = a.tipo ?? 'sin tipo';
    const archivo = a.archivo ?? '(sin archivo)';
    if (!porTipo.has(tipo)) porTipo.set(tipo, new Map());
    const porArchivo = porTipo.get(tipo);
    if (!porArchivo.has(archivo)) porArchivo.set(archivo, []);
    porArchivo.get(archivo).push(a.mensaje ?? a);
  }
  return porTipo;
}

function tablaCobertura(cobertura) {
  const razas = [...new Set([...RAZAS, ...cobertura.map((c) => c.raza)])].filter((r) => cobertura.some((c) => c.raza === r));
  const clases = [...new Set([...CLASES, ...cobertura.map((c) => c.clase)])];
  const filas = [`| Raza | ${clases.join(' | ')} |`, `|---|${clases.map(() => '---').join('|')}|`];
  for (const raza of razas) {
    const celdas = clases.map((clase) => {
      const cs = cobertura.filter((c) => c.raza === raza && c.clase === clase);
      if (cs.length === 0) return '·';
      const marca = (c) => (c.llega60 ? 'OK' : 'CORTA');
      if (cs.length === 1) return marca(cs[0]);
      return cs.map((c) => `${c.faccion[0]}:${marca(c)}`).join(' ');
    });
    filas.push(`| ${raza} | ${celdas.join(' | ')} |`);
  }
  return filas.join('\n');
}

const SIGLA = { Horde: 'H', Alliance: 'A' };

// Secciones de las guías laterales (cadenas de clase, mazmorras y profesiones) de la fase 3.
function seccionesLaterales({
  cadenas = [], sinResolver = [], sinCadena = [], mazmorras = [], profesiones = [], mejoras = [], mejorasSinResolver = [],
}) {
  const L = [];

  L.push('## Cadenas de clase', '');
  if (cadenas.length === 0) L.push('Ninguna.');
  else {
    L.push('| Cadena | Facción | Razas | Misiones | Deducidas por PNJ | Estado |', '|---|---|---|---|---|---|');
    for (const c of cadenas) {
      L.push(`| ${escapar(c.id)} | ${SIGLA[c.faccion] ?? c.faccion} | ${escapar((c.razas ?? []).join(', '))} | ${num(c.misiones)} | ${num(c.deducidas ?? 0)} | ${escapar(c.estado)} |`);
    }
  }
  L.push('');

  L.push('## Cadenas sin resolver', '');
  if (sinResolver.length === 0) L.push('Ninguno.');
  else {
    L.push('Cadenas del catálogo que la base no deja resolver; no bloquean la escritura de los datos.', '');
    for (const s of sinResolver) L.push(`- ${s.id} (${SIGLA[s.faccion] ?? s.faccion}, variante ${s.variante}, ${s.raza}): ${escapar(s.motivo)}`);
  }
  L.push('');

  // Lote «Cadenas de mejoras».
  L.push('## Cadenas de mejoras', '');
  if (mejoras.length === 0) L.push('Ninguna.');
  else {
    L.push('| Mejora | Facción | Razas | Misiones | Unidas por objeto | Recompensa | Combate | Aviso | Estado |',
      '|---|---|---|---|---|---|---|---|---|');
    for (const c of mejoras) {
      L.push(`| ${escapar(c.id)} | ${SIGLA[c.faccion] ?? c.faccion} | ${escapar((c.razas ?? []).join(', '))} | ${num(c.misiones)} | `
        + `${num(c.porObjeto ?? 0)} | ${escapar(c.recompensa ?? '')} | ${c.combate ?? '-'} | ${c.nivelAviso ?? '-'} | ${escapar(c.estado)} |`);
    }
    const sinEspanol = mejoras.filter((c) => (c.sinEspanol ?? []).length > 0);
    if (sinEspanol.length > 0) {
      L.push('', 'Se quedan en inglés (la base no trae su nombre español):', '');
      for (const c of sinEspanol) L.push(`- ${c.id} (${SIGLA[c.faccion] ?? c.faccion}): misiones sin nombre español en la base: ${c.sinEspanol.join(', ')}`);
    }
    // Ronda 2: cadenas en las que la base no deja decidir si hay combate (se toman con combate, el lado prudente).
    const dudosas = mejoras.filter((c) => (c.combateDudoso ?? []).length > 0);
    if (dudosas.length > 0) {
      L.push('', 'Combate sin decidir (nivel del aviso con la regla de las cadenas con combate):', '');
      for (const c of dudosas) {
        L.push(`- ${c.id} (${SIGLA[c.faccion] ?? c.faccion}): no se sabe si hay combate en ${c.combateDudoso.join(', ')} (un objeto sin fuente en la base): se toma con combate.`);
      }
    }
    // Ronda 1: el objeto solo sale de la cadena (dato del jugador) y la base le pone vendedor.
    const conVendedor = mejoras.filter((c) => c.vendedorDeLaBase);
    if (conVendedor.length > 0) {
      L.push('', 'Datos de la base que no valen para el Forever:', '');
      for (const c of conVendedor) {
        L.push(`- ${c.id} (${SIGLA[c.faccion] ?? c.faccion}): la base le pone vendedor a «${escapar(c.recompensa ?? '')}», pero en el `
          + 'Forever solo se consigue con la cadena (el jugador, 10-nov-2026): el dato `vendors` de la base no vale para el Forever.');
      }
    }
  }
  if (mejorasSinResolver.length > 0) {
    L.push('', 'Sin resolver (no bloquean la escritura de los datos):', '');
    for (const s of mejorasSinResolver) L.push(`- ${s.id} (${SIGLA[s.faccion] ?? s.faccion}, variante ${s.variante}, ${s.raza}): ${escapar(s.motivo)}`);
  }
  L.push('');

  L.push('## Misiones de clase sin cadena', '');
  if (sinCadena.length === 0) L.push('Ninguna.');
  else {
    L.push('Misiones de clase de nivel 40 o menos que ninguna cadena del catálogo incluye.', '');
    L.push('| Clase | Misión | Nombre | Nivel |', '|---|---|---|---|');
    for (const m of sinCadena) L.push(`| ${m.clase} | ${m.q} | ${escapar(m.nombre)} | ${m.nivel} |`);
  }
  L.push('');

  L.push('## Mazmorras', '');
  if (mazmorras.length === 0) L.push('Ninguna.');
  else {
    L.push('| Área | Mazmorra | Niveles | Fuente de los niveles | Misiones H | Misiones A | Guía |', '|---|---|---|---|---|---|---|');
    for (const m of mazmorras) {
      const niveles = m.niveles ? `${m.niveles.min}-${m.niveles.max}` : '?';
      const guia = m.guias?.length > 0 ? `sí (${m.guias.length})` : `no${m.motivo ? `: ${escapar(m.motivo)}` : ''}`;
      L.push(`| ${m.area} | ${escapar(m.nombre)}${m.banda ? ' (banda)' : ''} | ${niveles} | ${m.fuenteNiveles ?? '-'} | ${num(m.misionesH ?? 0)} | ${num(m.misionesA ?? 0)} | ${guia} |`);
    }
  }
  L.push('');

  L.push('## Profesiones', '');
  if (profesiones.length === 0) L.push('Ninguna.');
  else {
    L.push('| Guía | Pasos del original | Recortados (más de 300) | Descartados | Emitida |', '|---|---|---|---|---|');
    for (const p of profesiones) {
      const descartados = Object.entries(p.descartados ?? {}).map(([motivo, n]) => `${motivo}: ${n}`).join(', ') || '-';
      L.push(`| ${escapar(p.clave)} | ${num(p.pasos)} | ${num(p.recortados)} | ${descartados} | ${p.emitida === false ? 'no' : 'sí'} |`);
    }
  }
  L.push('');
  return L;
}

// Lote H, ronda 1: la lista negra de Questie y las misiones de otras temporadas sin dador con punto (questie/excluidas.js).
// Las que salen van en «Misiones descartadas», con su motivo (la línea de la lista); aquí, las cuentas y las que se quedan.
function seccionExcluidas({ cuenta, conservadas, listaNegra }) {
  const L = ['## Lista negra de Questie y misiones de otras temporadas', ''];
  if (listaNegra === null) L.push('No está la carpeta de Questie: no se ha aplicado la lista negra.', '');
  L.push(`- De la lista negra de Questie (lo que oculta en el Forever) hay ${num(cuenta.listaNegra)} en la base; salen ${num(cuenta.listaNegraFuera)}.`);
  L.push(`- De ids 60000-89999 sin dador con punto en la base salen ${num(cuenta.otraTemporadaFuera)}.`);
  L.push(`- Se quedan porque manda el juego (RXPGuides, misiones hechas de la cuenta), por estar en una cadena o por evento: ${num(cuenta.conservadas)}.`);
  L.push(`- De ellas, por evento (Questie las vuelve a enseñar con su fiesta; no entran en las guías laterales ni en sus avisos): ${num(cuenta.porEvento ?? 0)}.`, '');
  if (conservadas.length > 0) {
    L.push('| ID | Misión | Regla | Se queda porque | Línea de la lista |', '|---|---|---|---|---|');
    for (const c of conservadas) {
      L.push(`| ${c.id} | ${escapar(c.nombre ?? '')} | ${c.regla} | ${escapar(c.porque)} | ${c.linea ? `${c.linea}${c.nota ? `: ${escapar(c.nota)}` : ''}` : '·'} |`);
    }
    L.push('');
  }
  return L;
}

// Correcciones propias comprobadas (src/questie/propias.js): lo que se le suma a la base de QuestieDB.
function seccionPropias(propias) {
  const L = ['## Correcciones propias comprobadas', ''];
  if (propias.length === 0) L.push('Ninguna.');
  else {
    L.push('Arreglos a la base de QuestieDB que se aplican después de las suyas (fuente `juego`: visto en el juego; `deducido`: sacado de otra versión de la cadena).', '');
    L.push('| Misión | Nombre | Facción | Campo | Añade | Antes | Después | Fuente | Estado | Nota |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const p of propias) {
      L.push(`| ${p.id} | ${escapar(p.nombre ?? '?')} | ${SIGLA[p.faccion] ?? p.faccion} | ${p.campo} | ${escapar((p.anadirRazas ?? []).join(', '))} | ${p.antes ?? '-'} | ${p.despues ?? '-'} | ${p.fuente} (${p.fecha}) | ${escapar(p.estado)} | ${escapar(p.nota)} |`);
    }
  }
  L.push('');
  return L;
}

// Lote B (B3): los PNJ de target/mob/unitscan que se quedan sin id (src/rxp/pnj-por-id.js), juntos por nombre y motivo.
const MOTIVOS_PNJ = {
  'no-esta-en-la-base': 'el nombre no está en la base',
  'sin-goto': 'hay varios y la guía no tiene ningún goto',
  'ninguno-en-el-mapa': 'hay varios y ninguno tiene puntos en el mapa del goto más cercano',
  'varios-en-el-mapa': 'hay varios con puntos en el mapa del goto más cercano',
};
function seccionPnjSinId(sinId) {
  const L = ['## PNJ de target y mob sin id', ''];
  if (sinId.length === 0) {
    L.push('Ninguno.', '');
    return L;
  }
  L.push('Se quedan solo con el nombre, como antes del lote B: el addon junta todos los PNJ de la base con ese nombre.', '');
  for (const [codigo, texto] of Object.entries(MOTIVOS_PNJ)) L.push(`- \`${codigo}\`: ${texto}.`);
  L.push('');
  const grupos = new Map();
  for (const s of sinId) {
    const clave = JSON.stringify([s.nombre, s.motivo, s.mapa ?? null]);
    if (!grupos.has(clave)) grupos.set(clave, { ...s, donde: [] });
    grupos.get(clave).donde.push(`${s.guia}:${s.linea ?? '?'}`);
  }
  L.push('| PNJ | Motivo | Mapa | Candidatos | Veces | Dónde |', '|---|---|---|---|---|---|');
  const filas = [...grupos.values()].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  for (const g of filas) {
    const donde = g.donde.slice(0, 3).join(', ') + (g.donde.length > 3 ? ` y ${num(g.donde.length - 3)} más` : '');
    L.push(`| ${escapar(g.nombre)} | ${g.motivo} | ${g.mapa ?? '·'} | ${g.candidatos.join(', ') || '·'} | ${num(g.donde.length)} | ${escapar(donde)} |`);
  }
  L.push('');
  return L;
}

/**
 * Escribe el informe.
 * @param {{errores: string[], avisos: string[], avisosDetalle?: object[], cobertura: object[]}} resultado
 * @param {string} ruta archivo de salida (se crean las carpetas que falten)
 * @param {{estadisticas?: object, avisosConstruccion?: Array<{tipo?: string, archivo?: string, mensaje: string}>,
 *   descartados?: Record<string, number>, misionesDescartadas?: Array<{id: number, motivo: string}>,
 *   laterales?: {cadenas: object[], sinResolver: object[], sinCadena: Array<{clase, q, nombre, nivel}>,
 *   mazmorras: object[], profesiones: object[], mejoras?: object[], mejorasSinResolver?: object[]}}} [extras]
 *   `laterales` añade las secciones de la fase 3 y la de las cadenas de mejoras; `pnjSinId` (lote B), la de los PNJ de
 *   target/mob que se quedan sin id
 */
export function escribirInforme(resultado, ruta, extras = {}) {
  const {
    estadisticas, avisosConstruccion = [], descartados = {}, misionesDescartadas = [], laterales, propias, pnjSinId,
    excluidas,
  } = extras;
  const cobertura = resultado.cobertura ?? [];
  const mazmorras = resultado.coberturaMazmorras ?? [];
  const errores = resultado.errores ?? [];
  const avisos = [...detalleDe(resultado), ...avisosConstruccion];
  const llegan = cobertura.filter((c) => c.llega60).length;
  const classic = cobertura.filter((c) => c.classic);
  const sky = cobertura.filter((c) => !c.classic);

  const L = [];
  L.push('# Informe de validación de las rutas', '');

  L.push('## Resumen', '');
  L.push(`- Combinaciones comprobadas: ${num(cobertura.length)} (${num(classic.length)} del Classic y ${num(sky.length)} de Skyborne).`);
  L.push(`- Con ruta del 1 al 60: ${num(llegan)} de ${num(cobertura.length)} (Classic: ${num(classic.filter((c) => c.llega60).length)} de ${num(classic.length)}; Skyborne: ${num(sky.filter((c) => c.llega60).length)} de ${num(sky.length)}).`);
  if (mazmorras.length > 0) {
    L.push(`- Versión con mazmorras: ${num(mazmorras.filter((c) => c.llega60).length)} de ${num(mazmorras.length)} llegan al 60 (solo da avisos).`);
  }
  L.push(`- Errores: ${num(errores.length)}.`);
  L.push(`- Avisos: ${num(avisos.length)}.`);
  if (estadisticas) for (const [k, v] of Object.entries(estadisticas)) L.push(`- ${k}: ${typeof v === 'number' ? num(v) : JSON.stringify(v)}.`);
  L.push('');

  L.push('## Errores', '');
  if (errores.length === 0) L.push('Ninguno.');
  else for (const e of errores) L.push(`- ${e}`);
  L.push('');

  L.push('## Cobertura', '');
  L.push('Cada celda dice si la cadena de guías llega al nivel 60 (`OK`) o se corta (`CORTA`). `·` es una combinación que no existe. Donde hay dos facciones, `A:` es Alianza y `H:` Horda.', '');
  L.push(tablaCobertura(cobertura), '');
  const cortadas = cobertura.filter((c) => !c.llega60);
  L.push('### Cadenas que no llegan a 60', '');
  if (cortadas.length === 0) L.push('Ninguno.');
  else for (const c of cortadas) L.push(`- ${c.raza} ${c.clase} (${c.faccion})${c.classic ? '' : ' [Skyborne]'}: ${c.motivo ?? 'no llega'}`);
  L.push('');

  L.push('## Cobertura de la versión con mazmorras', '');
  if (mazmorras.length === 0) L.push('No hay guías con mazmorras.');
  else {
    L.push('La misma comprobación, empezando por las guías de la versión con mazmorras. Sus fallos son avisos, no errores.', '');
    L.push(tablaCobertura(mazmorras), '');
    const cortas = mazmorras.filter((c) => !c.llega60);
    L.push('### Cadenas con mazmorras que no llegan a 60', '');
    if (cortas.length === 0) L.push('Ninguno.');
    else for (const c of cortas) L.push(`- ${c.raza} ${c.clase} (${c.faccion})${c.classic ? '' : ' [Skyborne]'}: ${c.motivo ?? 'no llega'}`);
  }
  L.push('');

  if (laterales) L.push(...seccionesLaterales(laterales));
  if (propias) L.push(...seccionPropias(propias));
  if (pnjSinId) L.push(...seccionPnjSinId(pnjSinId));

  L.push('## Avisos', '');
  if (avisos.length === 0) L.push('Ninguno.', '');
  else {
    for (const [tipo, porArchivo] of agrupar(avisos)) {
      const total = [...porArchivo.values()].reduce((s, l) => s + l.length, 0);
      L.push(`### ${tipo} (${num(total)})`, '');
      for (const [archivo, mensajes] of porArchivo) {
        L.push(`- **${archivo}** (${num(mensajes.length)})`);
        for (const m of mensajes.slice(0, 20)) L.push(`  - ${escapar(m).replace(/\n/g, ' ')}`);
        if (mensajes.length > 20) L.push(`  - … y ${num(mensajes.length - 20)} más`);
      }
      L.push('');
    }
  }

  L.push('## Comandos descartados', '');
  const desc = Object.entries(descartados).sort((a, b) => b[1] - a[1]);
  if (desc.length === 0) L.push('Ninguno.');
  else {
    L.push('| Comando | Cuenta |', '|---|---|');
    for (const [k, v] of desc) L.push(`| \`${escapar(k)}\` | ${num(v)} |`);
  }
  L.push('');

  if (excluidas) L.push(...seccionExcluidas(excluidas));

  L.push('## Misiones descartadas', '');
  if (misionesDescartadas.length === 0) L.push('Ninguno.');
  else {
    L.push('| ID | Motivo |', '|---|---|');
    for (const m of misionesDescartadas) L.push(`| ${m.id} | ${escapar(m.motivo)} |`);
  }
  L.push('');

  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, L.join('\n'), 'utf8');
}
