#!/usr/bin/env node
// Herramienta de consulta de las cadenas de clase (tarea 4 de la fase 3): sirve para escribir y comprobar
// el catálogo contra la base real sin escribir IDs a mano.
//
//   npm run cadenas -- --listar CLASE RAZA FACCION [--niveles MIN MAX] [--detalle]
//       una línea por recorrido lineal de las misiones de la clase para esa raza:
//       «L<nivel> <n>p: <inicio> -> <fin> [<id1>..<idN>]», con « {RAMA a/b}» si se corta en una
//       bifurcación (cada rama sale después en su propia línea) y « {BUCLE id}» si vuelve atrás.
//       Con --detalle, debajo de cada línea van sus misiones (ID, nombre, nivel, quién la da y la recoge).
//   npm run cadenas -- --resolver <id del catálogo>
//       el resultado de cada variante, para cada raza en cada facción donde existe.
//   npm run cadenas -- --mejoras [--version AAAA.MM.DD.n] [--salida <archivo>]
//       lote «Cadenas de mejoras»: las candidatas a cadenas de mejoras (detector.js), de la más útil a la menos, en
//       artifacts/reports/mejoras-candidatas-<versión>.md (la versión, por defecto, la de los datos de SnetForever_Misiones).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectarMejoras, informeDeMejoras } from './detector.js';
import { crearVista } from '../questie/vista.js';
import { grafoDeClase } from './resolver.js';
import { CATALOGO, PENDIENTES } from './catalogo.js';
import { cargarFuentes, resolverCadena, FACCIONES } from './fuentes.js';

const porId = (a, b) => a - b;

// Recorridos lineales del grafo de la clase para la raza: desde cada misión sin previas y desde cada rama.
function recorridos(vista, { clase, raza, nivelMin = 1, nivelMax = 40 }) {
  const g = grafoDeClase(vista, clase, raza);
  const nivel = (id) => g.U.get(id).requiredLevel ?? 0;
  const pendientes = [...g.nodos.keys()].filter((id) => g.pred.get(id).size === 0).sort(porId);
  const empezados = new Set(pendientes);
  const salida = [];
  while (pendientes.length > 0) {
    const desde = pendientes.shift();
    const ids = [desde];
    let corte = '';
    for (let actual = desde; ;) {
      const sucesores = [...g.succ.get(actual)].sort(porId);
      if (sucesores.length === 0) break;
      if (sucesores.length > 1) {
        corte = ` {RAMA ${sucesores.join('/')}}`;
        for (const s of sucesores) if (!empezados.has(s)) { empezados.add(s); pendientes.push(s); }
        break;
      }
      const [siguiente] = sucesores;
      if (ids.includes(siguiente)) { corte = ` {BUCLE ${siguiente}}`; break; }
      ids.push(siguiente);
      actual = siguiente;
    }
    if (nivel(desde) >= nivelMin && nivel(desde) <= nivelMax) salida.push({ ids, corte, nivel: nivel(desde) });
  }
  salida.sort((a, b) => a.nivel - b.nivel || a.ids[0] - b.ids[0]);
  return { g, salida };
}

const rango = (ids) => (ids.length === 1 ? `${ids[0]}` : `${ids[0]}..${ids[ids.length - 1]}`);
const linea = (g, { ids, corte, nivel }) => `L${nivel} ${ids.length}p: ${g.U.get(ids[0]).name} -> `
  + `${g.U.get(ids[ids.length - 1]).name} [${rango(ids)}]${corte}`;

/**
 * Una línea por recorrido lineal de las misiones de la clase para la raza (ver la cabecera del archivo).
 * @returns {string[]}
 */
export function listarCadenas(vista, opciones) {
  const { g, salida } = recorridos(vista, opciones);
  return salida.map((x) => linea(g, x));
}

// startedBy/finishedBy = [pnjs, objetos, ítems].
function quien(v) {
  const [pnjs = [], objetos = [], items = []] = Array.isArray(v) ? v : [];
  const partes = [...(pnjs ?? []).map((id) => `pnj ${id}`), ...(objetos ?? []).map((id) => `obj ${id}`),
    ...(items ?? []).map((id) => `ítem ${id}`)];
  return partes.length ? partes.join(' ') : '-';
}

function detalle(vista, opciones) {
  const { g, salida } = recorridos(vista, opciones);
  return salida.flatMap((x) => [linea(g, x), ...x.ids.map((id) => {
    const q = g.U.get(id);
    return `    ${id} «${q.name}» L${q.requiredLevel ?? 0} da: ${quien(q.startedBy)} recoge: ${quien(q.finishedBy)}`;
  })]);
}

function textoResultado({ variante, faccion, raza, r }) {
  const cabeza = `variante ${variante} ${faccion} ${raza}:`;
  if (!r.ok) return `${cabeza} FALLA ${r.motivo}`;
  const misiones = r.misiones.map((x) => (x.origen === 'pnj' ? `${x.q}(pnj)` : `${x.q}`)).join(' ');
  const migas = r.migas.length ? ` migas ${r.migas.join(' ')}` : '';
  return `${cabeza} OK ${misiones}${migas}`;
}

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));
const FORMATO_VERSION = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

// Versión de los datos de SnetForever_Misiones que hay en el repositorio (su nucleo.lua), o null.
function versionDeLosDatos() {
  const nucleo = join(RAIZ, 'addons', 'SnetForever_Misiones', 'nucleo.lua');
  if (!existsSync(nucleo)) return null;
  return /SNF_MISIONES = \{version="([^"]+)"/.exec(readFileSync(nucleo, 'utf8'))?.[1] ?? null;
}

function mejoras(argv) {
  const opciones = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a !== '--version' && a !== '--salida') throw new Error(`opción desconocida: ${a}`);
    if (i + 1 >= argv.length) throw new Error(`falta el valor de ${a}`);
    opciones[a.slice(2)] = argv[i + 1];
    i += 1;
  }
  const version = opciones.version ?? versionDeLosDatos();
  if (!version || !FORMATO_VERSION.test(version)) throw new Error(`la versión «${version}» no tiene la forma AAAA.MM.DD.n (usa --version)`);
  const salida = opciones.salida ?? join(RAIZ, 'artifacts', 'reports', `mejoras-candidatas-${version}.md`);
  const fuentes = cargarFuentes();
  const candidatas = detectarMejoras(fuentes);
  const meta = fuentes.entidades.meta ?? {};
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, informeDeMejoras(candidatas, { version, base: { version: meta.version, commit: meta.commit } }), 'utf8');
  return [`${candidatas.length} candidatas en ${salida}`];
}

function principal(argv) {
  const [orden, ...resto] = argv;
  if (orden === '--mejoras') return mejoras(resto);
  if (orden === '--listar') {
    const [clase, raza, faccion, ...mas] = resto;
    if (!clase || !raza || !FACCIONES.includes(faccion)) throw new Error('uso: --listar CLASE RAZA Horde|Alliance');
    const opciones = { clase, raza };
    let conDetalle = false;
    for (let i = 0; i < mas.length; i += 1) {
      if (mas[i] === '--detalle') conDetalle = true;
      else if (mas[i] === '--niveles') {
        const [min, max] = [mas[i + 1], mas[i + 2]].map((x) => (/^\d+$/.test(x ?? '') ? Number(x) : NaN));
        if (Number.isNaN(min) || Number.isNaN(max)) throw new Error('--niveles necesita dos números: --niveles MIN MAX');
        opciones.nivelMin = min;
        opciones.nivelMax = max;
        i += 2;
      }
      else throw new Error(`opción desconocida: ${mas[i]}`);
    }
    const vista = crearVista(cargarFuentes(), { faccion, clase });
    return (conDetalle ? detalle : listarCadenas)(vista, opciones);
  }
  if (orden === '--resolver') {
    const [id] = resto;
    const cadena = CATALOGO.find((c) => c.id === id);
    if (!cadena) {
      const p = PENDIENTES.find((x) => x.id === id);
      if (p) return [`${id} está en PENDIENTES: ${p.motivo}`];
      throw new Error(`no hay ninguna cadena «${id}» en el catálogo`);
    }
    return resolverCadena(cargarFuentes(), cadena).map(textoResultado);
  }
  throw new Error('uso: --listar CLASE RAZA FACCION [--niveles MIN MAX] [--detalle] | --resolver <id> | --mejoras [--version V] [--salida F]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const l of principal(process.argv.slice(2))) console.log(l);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
