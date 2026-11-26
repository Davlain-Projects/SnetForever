// Plan de subida de nivel 1-60 (13-nov, petición del autor: «busca desde level 1-60 para tenerlo todo documentado» y «lo
// que tú me aconsejaste es lo que quiero que mi IA en el juego haga, para cualquier raza, nivel o clase»).
//
// subida/plan.json lo documenta a partir de guías de internet ya probadas (las de WoW Forever primero; si no hay, las de
// Classic Era), con sus fuentes: por facción, tramos de niveles con su zona, las misiones clave en el orden de la guía
// (nombres en inglés), lo que la guía manda saltar, mazmorras, a dónde se va después y notas. Nada de ahí lo inventa la
// app ni la IA.
//
// planPara(plan, personaje, lugar, base?) -> objeto para `datos.planSubida` (o null sin facción o sin plan):
//   {actual: tramo entero (con misiones), siguientes: [tramos hasta el 60 sin misiones], consejos, clase?, forever?,
//    fuentes}
// El tramo actual es el de su nivel; entre varios del mismo nivel gana, por este orden, el de su zona de inicio (por raza,
// si el tramo trae `razas`), el de la zona donde está (por uiMap, con resolverZona si se pasa la base) y el primero.
import { readFileSync } from 'node:fs';
import { resolverZona } from './rutaZona.mjs';

const MAX_SIGUIENTES = 8;
const MAX_MISIONES = 30;

let cache;
/** El plan de subida que va con la app (subida/plan.json), leído una vez. Sin el archivo o ilegible, null. */
export function cargarPlan(ruta = new URL('./subida/plan.json', import.meta.url)) {
  if (cache !== undefined && ruta instanceof URL && ruta.href === cache.ruta) return cache.plan;
  let plan = null;
  try {
    const j = JSON.parse(readFileSync(ruta, 'utf8'));
    if (j && typeof j === 'object' && j.facciones && typeof j.facciones === 'object') plan = j;
  } catch {
    plan = null;
  }
  if (ruta instanceof URL) cache = { ruta: ruta.href, plan };
  return plan;
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
// Las guías escriben las razas a su manera («Undead», «Night Elf», «Skyborne (High Order)»); el juego da el nombre de archivo
// (Scourge, NightElf, Skyborne): se comparan sin paréntesis, espacios ni mayúsculas, con Undead = Scourge.
const normaRaza = (s) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '').replace(/^undead$/, 'scourge');
const lista = (v) => (Array.isArray(v) ? v : []);

function resumen(t, conMisiones) {
  const s: {
    niveles: string;
    zona: typeof t.zona;
    hubs?: any;
    misiones?: any;
    saltar?: any;
    mazmorras?: any;
    siguiente?: any;
    notas?: any;
  } = { niveles: `${t.desde}-${t.hasta}`, zona: t.zona };
  if (lista(t.hubs).length > 0) s.hubs = t.hubs;
  if (conMisiones && lista(t.misiones).length > 0) s.misiones = t.misiones.slice(0, MAX_MISIONES);
  // Los que vienen solo llevan niveles, zona y a dónde se va después (el detalle va en el actual: tamaño del turno).
  if (conMisiones && lista(t.saltar).length > 0) s.saltar = t.saltar;
  if (conMisiones && lista(t.mazmorras).length > 0) s.mazmorras = t.mazmorras;
  if (typeof t.siguiente === 'string' && t.siguiente) s.siguiente = t.siguiente;
  if (conMisiones && typeof t.notas === 'string' && t.notas) s.notas = t.notas;
  return s;
}

export function planPara(plan, personaje: {
  faccion?: any;
  nivel?: any;
  raza?: any;
  clase?: any;
} = {}, lugar: { mapa?: any; } = {}, base = null) {
  const faccion = personaje?.faccion;
  const f = plan?.facciones?.[faccion];
  if (!f || !Array.isArray(f.tramos) || f.tramos.length === 0) return null;
  const nivel = esNumero(personaje.nivel) ? Math.max(1, Math.min(60, Math.floor(personaje.nivel))) : 1;
  const tramos = f.tramos.filter((t) => t && esNumero(t.desde) && esNumero(t.hasta) && typeof t.zona === 'string');
  const uiDe = (t) => {
    if (!base) return null;
    t._ui ??= resolverZona(base, t.zona, 'en')?.uiMap ?? null;
    return t._ui;
  };
  const raza = normaRaza(personaje.raza);
  const tieneRaza = (t) => Array.isArray(t.razas) && t.razas.some((r) => normaRaza(r) === raza);
  const suyo = (t) => !Array.isArray(t.razas) || tieneRaza(t);
  const delNivel = tramos.filter((t) => t.desde <= nivel && nivel <= t.hasta && suyo(t));
  const candidatos = delNivel.length > 0 ? delNivel : tramos.filter((t) => t.desde <= nivel && nivel <= t.hasta);
  if (candidatos.length === 0) return null;
  const conRaza = candidatos.find(tieneRaza);
  const aqui = esNumero(lugar?.mapa) ? candidatos.find((t) => uiDe(t) === lugar.mapa) : undefined;
  const actual = conRaza ?? aqui ?? candidatos[0];
  // Los que vienen: los que empiezan después del actual (o en su mismo nivel y no son él), en orden, sin zonas de inicio
  // de otras razas, hasta el 60.
  const siguientes = tramos
    .filter((t) => t !== actual && suyo(t) && (t.desde > actual.desde || (t.desde === actual.desde && tramos.indexOf(t) > tramos.indexOf(actual))) && t.hasta > nivel)
    .sort((a, b) => a.desde - b.desde)
    .slice(0, MAX_SIGUIENTES)
    .map((t) => resumen(t, false));
  const salida: {
    actual: any;
    siguientes: typeof siguientes;
    consejos?: any;
    clase?: string;
    forever?: any;
    fuentes?: any;
  } = { actual: resumen(actual, true), siguientes };
  if (lista(f.consejos).length > 0) salida.consejos = f.consejos;
  const clase = typeof personaje.clase === 'string' ? personaje.clase.toUpperCase() : '';
  if (clase && f.clases && typeof f.clases[clase] === 'string') salida.clase = f.clases[clase];
  if (lista(f.forever).length > 0) salida.forever = f.forever;
  const fuentes = new Set([...lista(actual.fuentes), ...lista(f.fuentes)]);
  if (fuentes.size > 0) salida.fuentes = [...fuentes].slice(0, 6);
  return salida;
}

// ------------------------------------------------------------------------------------------------------------------
// Profesiones (13-nov, petición del autor: «las guías de profesiones solo hay 3, ¿las otras no existen?»)
// ------------------------------------------------------------------------------------------------------------------
// subida/profesiones.json: por skillLine del juego (los ids de ctx.prof), rangos (hasta qué habilidad, nivel de personaje
// y dónde se aprende), tramos (qué fabricar, cuántas veces y con qué materiales), totales, recogida, notas y fuentes.
//
// planProfesiones(guias, prof) -> [{nombre, es, rango, maximo, actual, siguientes, aprender?, recogida?, notas?, fuentes}]
//   prof: [{id, r, m}] del addon (habilidad y tope del rango actual). `actual` es el tramo de su habilidad; `siguientes`,
//   los dos que vienen (sin materiales); `aprender`, el rango siguiente cuando está a 25 o menos del tope del suyo.

const MAX_TRAMOS_SIGUIENTES = 2;
const CERCA_DEL_TOPE = 25;

let cacheProfesiones;
export function cargarProfesiones(ruta = new URL('./subida/profesiones.json', import.meta.url)) {
  if (cacheProfesiones !== undefined && ruta instanceof URL && ruta.href === cacheProfesiones.ruta) return cacheProfesiones.guias;
  let guias = null;
  try {
    const j = JSON.parse(readFileSync(ruta, 'utf8'));
    if (j && typeof j === 'object' && j.profesiones && typeof j.profesiones === 'object') guias = j;
  } catch {
    guias = null;
  }
  if (ruta instanceof URL) cacheProfesiones = { ruta: ruta.href, guias };
  return guias;
}

export function planProfesiones(guias, prof) {
  const salida = [];
  for (const p of lista(prof)) {
    const g = guias?.profesiones?.[p?.id];
    if (!g || !esNumero(p.r)) continue;
    const r = Math.max(1, Math.floor(p.r));
    const tramos = lista(g.tramos).filter((t) => t && esNumero(t.desde) && esNumero(t.hasta));
    const actual = tramos.find((t) => t.desde <= r && r < t.hasta) ?? tramos.find((t) => t.desde <= r && r <= t.hasta);
    const plan: {
      nombre: typeof g.nombre;
      es: typeof g.es;
      rango: typeof r;
      maximo: number;
      actual?: any;
      siguientes?: any;
      aprender?: any;
      recogida?: any;
      notas?: any;
      fuentes?: any;
    } = { nombre: g.nombre, es: g.es, rango: r, maximo: esNumero(p.m) ? Math.floor(p.m) : undefined };
    if (actual) {
      plan.actual = { habilidad: `${actual.desde}-${actual.hasta}`, fabricar: actual.fabricar };
      if (esNumero(actual.veces)) plan.actual.veces = actual.veces;
      if (lista(actual.materiales).length > 0) plan.actual.materiales = actual.materiales;
      if (typeof actual.notas === 'string' && actual.notas) plan.actual.notas = actual.notas;
      plan.siguientes = tramos.filter((t) => t.desde >= actual.hasta).slice(0, MAX_TRAMOS_SIGUIENTES)
        .map((t) => ({ habilidad: `${t.desde}-${t.hasta}`, fabricar: t.fabricar }));
    } else if (r >= 300) {
      plan.actual = { habilidad: '300', fabricar: 'máximo' };
    }
    if (esNumero(plan.maximo) && plan.maximo < 300 && plan.maximo - r <= CERCA_DEL_TOPE) {
      const siguiente = lista(g.rangos).find((x) => esNumero(x?.hasta) && x.hasta > plan.maximo);
      if (siguiente) plan.aprender = siguiente;
    }
    if (typeof g.recogida === 'string' && g.recogida) plan.recogida = g.recogida;
    if (typeof g.notas === 'string' && g.notas) plan.notas = g.notas;
    if (lista(g.fuentes).length > 0) plan.fuentes = g.fuentes.slice(0, 3);
    salida.push(plan);
  }
  return salida;
}
