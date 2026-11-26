// Biblioteca de guías: el índice incremental de la carpeta <datos>\guias\. Lista cada archivo de guía con sus zonas,
// misiones, PNJ y niveles, para que las herramientas de la IA lo busquen sin leer los archivos otra vez.
//
//   crearIndice({datos, fs, base: () => Promise<Base>, leer = leerArchivoGuia, alTerminar = null})
//     alTerminar(resumen) se llama al acabar cada actualizar() que salió bien (también las de la vigilancia)
//     -> {carpeta, ruta, actualizar(), indice(), vigilar({espera, intervalo}) -> parar()}
//   Indice = {version: 1, base, lector, indexando, guias: Entrada[], noLeidos: [{archivo, parte?, motivo}], firmas: {archivo: 'mtime:size'}}
//   (parte: la de un archivo que sí se leyó pero trae capítulos que no se entienden, p. ej. de 4Ever Leveling)
//   Entrada = {id, archivo, k, formato, nombre, faccion, niveles, zonas: [uiMap], misiones: [q], pnjs: [id], pasos, url?, bajada?,
//              clave?, parte?, clases?, razas?}   (clases y razas: para quién es la guía, p. ej. un capítulo de 4Ever; clave y parte: las del formato addon; juntar la cabecera y sus partes es del servidor
//              de herramientas, que lee en orden de archivo las entradas con la misma clave)
//
// Solo se vuelve a leer lo que cambió (firma mtime:size) o todo si cambió la versión de la base (las misiones por nombre se
// buscan otra vez) o la del lector (LECTOR: súbela cuando leer.mjs o texto.mjs sacan otra cosa de los mismos archivos).
// Entran las guías con pasos y, aunque no traigan ninguno, las del formato addon (con `clave`: la cabecera de una guía
// partida puede venir con `pasos={}`; Ruling R9). Una indexación larga no bloquea: `indexando` vale true, el índice anterior sigue sirviéndose y el
// bucle cede el turno cada 20 archivos. El disco también dice `indexando: true` (con el índice anterior) desde la primera
// lectura de una pasada hasta que acaba: el servidor de herramientas es otro proceso y solo ve el archivo. Los enlaces y uniones no se recorren y lo que sale de la carpeta no cuenta.
// El registro solo lleva cuántas guías, cuántas sin leer y cuánto tardó (nunca nombres de archivo).
import { createHash } from 'node:crypto';
import { join, relative, isAbsolute, sep } from 'node:path';
import { leerArchivoGuia } from './leer.mjs';
import { zonasDelTitulo } from './texto.mjs';
import { resolverMisiones, resolverZona } from '../rutaZona.mjs';
import { escribirAtomico } from '../buzon.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
import { log } from '../registro.mjs';

export const CARPETA_GUIAS = 'guias';
export const RUTA_INDICE = join('biblioteca', 'indice.json');
export const MAX_ARCHIVOS = 20000;
export const LECTOR = 7; // 7: Mis guías con la clase o la raza de la guía entera y la facción de los pasos (facciones); 6: los pasos de Mis guías con clase, raza o facción (clases / razas; los ilegibles, fuera); 5: 4Ever Leveling, .fgguide de Factoruide y la cabecera de Polestar (clases, razas, «sin leer» por partes); 4: el paso trae `textoEn` si la fuente da el inglés; 2: guías partidas, misiones con relleno y artículo, zonas nombradas en cualquier línea; 3: /way con coma decimal
const NOMBRE_ENLACES = 'enlaces.txt'; // la lista de direcciones del jugador (no es una guía; la baja enlaces.mjs)
const MAX_MISIONES = 400;
const MAX_ZONAS = 20;
const CEDER_CADA = 20; // archivos
const CEDER_MS = 30; // o milisegundos desde el último cede
const CEDER_BYTES = 8 * 1024 * 1024; // o bytes leídos desde el último cede (leer es síncrono)

// Licencias, léemes, créditos y COPYING de una colección no son guías (con pasos numerados saldrían como guías de texto):
// no se leen y van a noLeidos con este motivo. Por el principio del nombre, sin mayúsculas, tildes ni extensión.
const NO_ES_GUIA = 'no es guía';
const NOMBRES_NO_GUIA = /^(license|licencia|readme|leeme|creditos|copying)/;
export const esNoGuia = (archivo) => NOMBRES_NO_GUIA.test(
  archivo.split('/').at(-1).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
);

const cederTurno = () => new Promise((resolver) => setImmediate(resolver));
const vacio = () => ({ version: 1, base: null, lector: LECTOR, indexando: false, guias: [], noLeidos: [], firmas: {} });
const idDe = (archivo, k) => createHash('sha1').update(`${archivo}#${k}`).digest('hex').slice(0, 8);

// Dentro de `raiz` (sin salir por enlaces): la ruta real del archivo cuelga de la ruta real de la carpeta.
function dentro(fs, raizReal, ruta) {
  try {
    const r = relative(raizReal, fs.realpathSync(ruta));
    return r !== '' && r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r);
  } catch {
    return false;
  }
}

// Los archivos de guía de la carpeta (rutas relativas con «/»); sin enlaces, uniones, nombres que empiezan por «.» ni enlaces.txt.
function recorrer(fs, carpeta) {
  const archivos = [];
  const visitar = (dir, prefijo) => {
    let lista;
    try {
      lista = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    lista.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of lista) {
      if (archivos.length >= MAX_ARCHIVOS) return;
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
      if (e.isDirectory()) visitar(join(dir, e.name), rel);
      else if (e.isFile() && e.name.toLowerCase() !== NOMBRE_ENLACES) archivos.push(rel);
    }
  };
  visitar(carpeta, '');
  return archivos;
}

function entradaDe(archivo, formato, g, base) {
  const zonas = new Set();
  const misiones = new Set();
  const pnjs = new Set();
  const nombres = [];
  for (const z of base ? zonasDelTitulo(base, g.nombre) : []) zonas.add(z);
  for (const p of g.pasos) {
    if (Number.isInteger(p.punto?.mapa)) zonas.add(p.punto.mapa);
    else if (base && typeof p.punto?.zona === 'string') {
      const z = resolverZona(base, p.punto.zona);
      if (z) zonas.add(z.uiMap);
    }
    for (const m of p.misiones ?? []) {
      if (Number.isInteger(m.q)) misiones.add(m.q);
      else if (typeof m.nombre === 'string' && m.nombre !== '') nombres.push(m.nombre);
    }
    for (const n of p.pnjs ?? []) if (Number.isInteger(n)) pnjs.add(n);
  }
  for (const z of g.zonas ?? []) if (Number.isInteger(z)) zonas.add(z); // las que nombra el texto, tras las de los puntos
  if (nombres.length && base) for (const q of resolverMisiones(base, [...new Set(nombres)]).qs) misiones.add(q);
  return {
    id: idDe(archivo, g.k),
    archivo,
    k: g.k,
    formato,
    nombre: g.nombre,
    faccion: g.faccion,
    niveles: g.niveles,
    zonas: [...zonas].slice(0, MAX_ZONAS),
    misiones: [...misiones].slice(0, MAX_MISIONES),
    pnjs: [...pnjs].slice(0, MAX_MISIONES),
    pasos: g.pasos.length,
    ...(g.url ? { url: g.url } : {}),
    ...(g.bajada ? { bajada: g.bajada } : {}),
    ...(typeof g.clave === 'string' ? { clave: g.clave } : {}),
    ...(g.parte === true ? { parte: true } : {}),
    ...(Array.isArray(g.clases) && g.clases.length ? { clases: g.clases } : {}),
    ...(Array.isArray(g.razas) && g.razas.length ? { razas: g.razas } : {}),
  };
}

export function crearIndice({ datos, fs, base, leer = leerArchivoGuia, alTerminar = null }) {
  const carpeta = join(datos, CARPETA_GUIAS);
  const ruta = join(datos, RUTA_INDICE);
  let actual = vacio();
  let enCurso = null;
  let repetir = false;

  try {
    const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    if (j && j.version === 1 && Array.isArray(j.guias) && Array.isArray(j.noLeidos) && j.firmas && typeof j.firmas === 'object') {
      actual = { ...j, indexando: false };
    }
  } catch {
    // sin índice guardado (o ilegible): se hace de cero
  }

  // Guarda el índice en disco (temporal y renombre; lo que falla va a la cuarentena). Un fallo solo se apunta.
  async function guardar(estado) {
    try {
      fs.mkdirSync(join(datos, 'biblioteca'), { recursive: true });
      await escribirAtomico(fs, ruta, JSON.stringify(estado), {
        mover: (origen, nombre) => fs.renameSync(origen, join(cuarentenaNueva({ ...process.env, SNF_DATOS: datos }), nombre)),
      });
    } catch (e) {
      log('aviso', `biblioteca: no se pudo guardar el índice (${e?.code ?? 'error'})`);
    }
  }

  async function hacer() {
    const t0 = Date.now();
    actual = { ...actual, indexando: true }; // antes del primer await: ya se ve que está indexando
    const previo = actual;
    let avisado = false; // ¿se guardó en disco el «indexando»? (el servidor de herramientas es otro proceso)
    try {
      fs.mkdirSync(carpeta, { recursive: true });
      const b = await base();
      const version = b?.version ?? null;
      const reusar = previo.base === version && previo.lector === LECTOR;
      const antes = new Map();
      for (const g of previo.guias) (antes.get(g.archivo) ?? antes.set(g.archivo, []).get(g.archivo)).push(g);
      const antesNoLeidos = new Map(); // archivo -> [no leídos] (uno por archivo, o uno por parte)
      for (const n of previo.noLeidos) (antesNoLeidos.get(n.archivo) ?? antesNoLeidos.set(n.archivo, []).get(n.archivo)).push(n);

      let raizReal;
      try {
        raizReal = fs.realpathSync(carpeta);
      } catch {
        raizReal = carpeta;
      }
      const guias = [];
      const noLeidos = [];
      const firmas = {};
      const archivos = recorrer(fs, carpeta);
      let desdeCede = 0, bytes = 0, ultimo = Date.now(), leidos = 0;
      for (const archivo of archivos) {
        if (desdeCede >= CEDER_CADA || bytes >= CEDER_BYTES || Date.now() - ultimo > CEDER_MS) {
          await cederTurno();
          desdeCede = 0; bytes = 0; ultimo = Date.now();
        }
        desdeCede++;
        const completa = join(carpeta, ...archivo.split('/'));
        let st;
        try {
          st = fs.lstatSync(completa);
        } catch {
          continue;
        }
        if (!st.isFile() || !dentro(fs, raizReal, completa)) continue;
        const firma = `${Math.floor(st.mtimeMs)}:${st.size}`;
        firmas[archivo] = firma;
        // Antes de reutilizar: así un LICENSE que un índice anterior guardó como guía sale sin rehacerlo todo.
        if (esNoGuia(archivo)) {
          noLeidos.push({ archivo, motivo: NO_ES_GUIA });
          continue;
        }
        if (reusar && previo.firmas[archivo] === firma) {
          guias.push(...(antes.get(archivo) ?? []));
          noLeidos.push(...(antesNoLeidos.get(archivo) ?? []));
          continue;
        }
        // Antes de la primera lectura de verdad de la pasada, el disco dice «indexando» (con el índice anterior): así lo
        // ve el servidor de herramientas. Las pasadas sin nada que leer no escriben aquí.
        if (leidos === 0) {
          await guardar({ ...previo, indexando: true });
          avisado = true;
        }
        leidos++;
        bytes += st.size;
        const r = leer(completa, { fs, base: b });
        if (r.noLeido) {
          noLeidos.push({ archivo, motivo: r.noLeido });
          continue;
        }
        for (const s of Array.isArray(r.sinLeer) ? r.sinLeer : []) noLeidos.push({ archivo, parte: String(s.parte), motivo: s.motivo });
        for (const g of r.guias ?? []) if (g.pasos?.length || typeof g.clave === 'string') guias.push(entradaDe(archivo, r.formato, g, b));
      }
      const nuevo = { version: 1, base: version, lector: LECTOR, indexando: false, guias, noLeidos, firmas };
      actual = nuevo;
      await guardar(nuevo);
      log('info', `biblioteca: ${guias.length} guías, ${noLeidos.length} sin leer, ${Date.now() - t0} ms`);
      return { guias: guias.length, noLeidos: noLeidos.length, leidos };
    } catch (e) {
      actual = { ...previo, indexando: false };
      if (avisado) await guardar(actual); // que el disco no se quede diciendo «indexando»
      throw e;
    }
  }

  // Una petición que llega con una pasada en marcha no se pierde: al acabar se hace otra (una sola, lleguen las que lleguen).
  function actualizar() {
    if (enCurso) {
      repetir = true;
      return enCurso;
    }
    enCurso = (async () => {
      try {
        let r;
        do {
          repetir = false;
          r = await hacer();
        } while (repetir);
        try {
          alTerminar?.(r); // la app mira aquí si hay enlaces nuevos por bajar; un fallo suyo no tumba el índice
        } catch {
          // ignorado a propósito
        }
        return r;
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  }

  function vigilar({ espera = 2000, intervalo = 600_000 } = {}) {
    let parado = false;
    let pendiente = null;
    const lanzar = () => {
      if (!parado) actualizar().catch(() => {});
    };
    const aviso = () => {
      if (parado) return;
      clearTimeout(pendiente);
      pendiente = setTimeout(lanzar, espera);
      pendiente.unref?.();
    };
    let vigia = null;
    try {
      vigia = fs.watch(carpeta, { recursive: true }, aviso);
      vigia?.on?.('error', () => {});
    } catch {
      // sin vigilante: queda el repaso cada `intervalo`
    }
    const repaso = setInterval(lanzar, intervalo);
    repaso.unref?.();
    return function parar() {
      parado = true;
      clearTimeout(pendiente);
      clearInterval(repaso);
      try {
        vigia?.close();
      } catch {
        // ya cerrado
      }
    };
  }

  return { carpeta, ruta, actualizar, indice: () => actual, vigilar };
}
