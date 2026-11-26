// Biblioteca de guías: las guías de Factoruide (github.com/brouznouf/factoruide, MIT) que guarda el botón «Share» de su
// programa: un .fgguide (antes .bqroute) es un JSON {format: 'factoruide-guide' | 'brouzquest-result', version, meta,
// request, outcome} (crates/fg-library/src/share.rs). Sin descomprimir nada: LibDeflate solo lo usa el texto de
// importación del addon, que es otra cosa.
//
//   guiaDeFactoruide(texto) -> {formato: 'factoruide', guias: [GuiaLeida]} | {noLeido: 'ilegible' | 'formato' | 'vacio'}
//
// La guía: el nombre, la facción, los niveles y la clase de `outcome.route` (o de `request` / `meta`); la raza de
// `request.race`. Los pasos, de `outcome.route.steps` ({kind, text, quest, quest_name, map: {ui_map, x, y}, target: {id,
// kind}, mob_ids}): accept / objective / turnin dan la misión; `map` el punto (ya en % del mapa); el PNJ, el `target` de
// tipo npc y los `mob_ids`. Sin la ruta calculada, los de `outcome.plan` (solo las misiones). El texto es el que escribe
// Factoruide (en el idioma de su `locale`; en inglés, también `textoEn`).
const FORMATOS = new Set(['factoruide-guide', 'brouzquest-result']);
const ACCIONES = { accept: 'aceptar', objective: 'completar', turnin: 'entregar', turn_in: 'entregar' };
const MAX_NOMBRE = 120;
const MAX_TEXTO = 2000;

const esObjeto = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const lista = (v) => (Array.isArray(v) ? v : []);
const texto = (v, max = MAX_TEXTO) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const entero = (v) => (Number.isInteger(v) && v >= 1 ? v : undefined);
const FACCIONES = { horde: 'Horde', alliance: 'Alliance' };
const nivelesDe = (a, b) => (Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= b && b <= 80 ? [a, b] : undefined);
const primeraMayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pasoDeRuta(p, n, enIngles) {
  const t = texto(p.text);
  const accion = ACCIONES[p.kind];
  const q = entero(p.quest);
  const misiones = accion && q ? [{ q, accion, ...(texto(p.quest_name, 200) ? { nombre: texto(p.quest_name, 200) } : {}) }] : [];
  const m = esObjeto(p.map) ? p.map : {};
  const punto = entero(m.ui_map) && typeof m.x === 'number' && typeof m.y === 'number' && m.x >= 0 && m.x <= 100 && m.y >= 0 && m.y <= 100
    ? { mapa: m.ui_map, x: m.x, y: m.y } : undefined;
  const pnjs = new Set();
  if (p.target?.kind === 'npc' && entero(p.target.id)) pnjs.add(p.target.id);
  for (const id of lista(p.mob_ids)) if (entero(id)) pnjs.add(id);
  if (t === '' && misiones.length === 0 && !punto) return null;
  return {
    n, texto: t, ...(enIngles && t !== '' ? { textoEn: t } : {}), misiones,
    ...(punto ? { punto } : {}), ...(pnjs.size ? { pnjs: [...pnjs] } : {}),
  };
}

function pasoDePlan(p, n) {
  const accion = ACCIONES[p.kind];
  const q = entero(p.quest);
  return accion && q ? { n, texto: '', misiones: [{ q, accion }] } : null;
}

export function guiaDeFactoruide(cuerpo) {
  let j;
  try {
    j = JSON.parse(cuerpo);
  } catch {
    return { noLeido: 'ilegible' };
  }
  if (!esObjeto(j) || !FORMATOS.has(j.format) || !esObjeto(j.outcome)) return { noLeido: 'formato' };
  const ruta = esObjeto(j.outcome.route) ? j.outcome.route : {};
  const peticion = esObjeto(j.request) ? j.request : {};
  const meta = esObjeto(j.meta) ? j.meta : {};
  const enIngles = /^en/i.test(String(ruta.locale ?? peticion.locale ?? 'enUS'));

  const pasos = [];
  const deRuta = lista(ruta.steps).filter(esObjeto);
  if (deRuta.length) for (const p of deRuta) { const x = pasoDeRuta(p, pasos.length + 1, enIngles); if (x) pasos.push(x); }
  else for (const p of lista(j.outcome.plan).filter(esObjeto)) { const x = pasoDePlan(p, pasos.length + 1); if (x) pasos.push(x); }
  if (pasos.length === 0) return { noLeido: 'vacio' };

  const zonas = [];
  for (const p of pasos) if (p.punto && !zonas.includes(p.punto.mapa)) zonas.push(p.punto.mapa);
  const nombre = texto(ruta.name, MAX_NOMBRE) || texto(peticion.name, MAX_NOMBRE) || texto(meta.name, MAX_NOMBRE) || 'Factoruide';
  const faccion = FACCIONES[String(ruta.faction ?? '').toLowerCase()];
  const niveles = nivelesDe(ruta.from_level ?? peticion.from_level ?? meta.from_level, ruta.to_level ?? peticion.to_level ?? meta.to_level);
  const clase = texto(ruta.class, 20) || texto(peticion.class, 20) || texto(meta.class, 20);
  const raza = texto(peticion.race, 30) || texto(meta.race, 30);
  return {
    formato: 'factoruide',
    guias: [{
      k: 0, nombre, pasos,
      ...(faccion ? { faccion } : {}), ...(niveles ? { niveles } : {}), ...(zonas.length ? { zonas } : {}),
      ...(clase ? { clases: [clase.toUpperCase().replace(/\s+/g, '')] } : {}),
      ...(raza ? { razas: [primeraMayuscula(raza)] } : {}),
    }],
  };
}
