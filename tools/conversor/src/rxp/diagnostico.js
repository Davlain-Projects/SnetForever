// Diagnóstico de los `#next` que no se resuelven al importar una biblioteca local de RestedXP para Forever.
//
// No resuelve nada: dice por qué falta cada destino para que nadie tenga que adivinarlo. Busca el nombre en las
// guías de las otras ediciones de la misma carpeta (Guides/ sin Guides/forever/), leídas como texto con el mismo
// lector del conversor (nunca se ejecuta su Lua), y lista los tramos de Forever del mismo grupo que empiezan por
// los mismos niveles. Un candidato de otra edición nunca se añade: sus coordenadas y misiones son de otro cliente.
//
// diagnosticarEnlaces({origen, avisos, guias}) -> [{
//   desde, archivo, linea, destino,
//   motivo: 'solo-en-otra-edicion' | 'sin-tramo' | 'existe-en-forever',
//   candidatos: [{archivo, linea, grupo?, ediciones}],   el mismo nombre en otras ediciones
//   parecidos: [{clave, enlazada}],                      tramos de Forever del mismo grupo con los mismos niveles;
//                                                        `enlazada` dice si algún otro tramo ya lleva a él
// }]
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { extraerGuias, analizarGuia } from './leer.js';
import { normalizarNombre } from './guias.js';

// Etiquetas de cabecera con las que RestedXP marca para qué cliente es una guía.
const EDICIONES = new Set(['classic', 'tbc', 'wotlk', 'cata', 'mop', 'retail', 'era', 'som', 'sod', 'forever']);

function archivosDeOtrasEdiciones(origen) {
  const carpeta = join(origen, 'Guides');
  return readdirSync(carpeta, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.lua$/i.test(e.name))
    .map((e) => relative(origen, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((archivo) => !archivo.startsWith('Guides/forever/'))
    .sort();
}

/** Las cabeceras de un archivo que nombra alguno de `nombres` (el resto ni se analiza). */
function cabecerasCon(origen, archivo, nombres) {
  const texto = readFileSync(join(origen, archivo), 'utf8');
  if (!nombres.some((n) => texto.includes(n))) return [];
  let bloques;
  try {
    bloques = extraerGuias(texto, { archivo });
  } catch {
    return []; // un archivo que el cliente no podría cargar tampoco aporta candidatos
  }
  return bloques.map((b) => {
    const { cabecera } = analizarGuia(b.texto, { archivo, lineaInicial: b.lineaInicial });
    const campo = (tag) => cabecera.find((c) => c.tag === tag);
    const nombre = campo('name');
    return {
      archivo,
      nombre: nombre ? normalizarNombre(nombre.valor) : undefined,
      linea: nombre?.linea ?? b.lineaInicial,
      grupo: campo('group')?.valor?.trim(),
      ediciones: [...new Set(cabecera.map((c) => c.tag).filter((t) => EDICIONES.has(t)))].sort(),
    };
  });
}

function nivelesDelNombre(nombre) {
  return /^\d+-\d+\s/.exec(nombre)?.[0];
}

function enlazadas(guias) {
  const claves = new Set();
  const anotar = (lista) => {
    for (const s of lista ?? []) if (s.clave) claves.add(s.clave);
  };
  for (const g of guias.values()) {
    anotar(g.siguientes);
    for (const p of g.pasos) for (const e of p.elementos) anotar(e.siguientes);
  }
  return claves;
}

export function diagnosticarEnlaces({ origen, avisos, guias }) {
  const pendientes = avisos.filter((a) => a.tipo === 'next-sin-resolver');
  if (pendientes.length === 0) return [];
  const destinos = pendientes.map((a) => {
    const barra = a.destino.lastIndexOf('\\');
    return {
      aviso: a,
      grupo: barra >= 0 ? a.destino.slice(0, barra).trim() : undefined,
      nombre: normalizarNombre(barra >= 0 ? a.destino.slice(barra + 1) : a.destino),
    };
  });
  const nombres = [...new Set(destinos.map((d) => d.nombre))];
  const cabeceras = archivosDeOtrasEdiciones(origen).flatMap((archivo) => cabecerasCon(origen, archivo, nombres));
  const conEnlace = enlazadas(guias);

  return destinos.map(({ aviso, grupo, nombre }) => {
    const origenGuia = guias.get(aviso.desde);
    const grupos = new Set([origenGuia?.grupo, ...(origenGuia?.variantes ?? []).map((v) => v.grupo)].filter(Boolean));
    if (grupo) grupos.add(grupo);
    const candidatos = cabeceras
      .filter((c) => c.nombre === nombre && (!grupo || c.grupo === grupo))
      .map(({ archivo, linea, grupo: g, ediciones }) => ({ archivo, linea, ...(g ? { grupo: g } : {}), ediciones }));
    const niveles = nivelesDelNombre(nombre);
    const parecidos = niveles === undefined ? [] : [...guias.values()]
      .filter((g) => g.clave !== aviso.desde && g.nombre.startsWith(niveles)
        && [g.grupo, ...(g.variantes ?? []).map((v) => v.grupo)].some((gr) => grupos.has(gr)))
      .map((g) => ({ clave: g.clave, enlazada: conEnlace.has(g.clave) }));
    let motivo = 'sin-tramo';
    if (candidatos.some((c) => c.ediciones.includes('forever'))) motivo = 'existe-en-forever';
    else if (candidatos.length > 0) motivo = 'solo-en-otra-edicion';
    return {
      desde: aviso.desde, archivo: aviso.archivo, linea: aviso.linea, destino: aviso.destino, motivo, candidatos, parecidos,
    };
  });
}
