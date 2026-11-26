// Validación de la respuesta de la IA (P5) y preparación del texto para el chat del juego.
// La IA nunca escribe coordenadas: todo punto sale de la tabla del turno (`turno.puntos`, de contexto.mjs) o de una marca
// de origen (herramientas/marcas.mjs) que resuelve `turno.puntoDeMarca`.
//
// Tarea 17: el bloque puede traer `guiaNueva`, una guía entera hecha por la IA. guiaNuevaValida(v) solo filtra la forma
// (la comprobación del contenido es de la tarea 18) y devuelve {titulo, tramos: [{titulo, pasos}], quitados: {pasos,
// tramos, textos}} o null. Los topes (400 pasos, 10 misiones, 8 tramos) se aplican ANTES de validar: lo que pasa del tope
// ni se mira, solo se cuenta. quitados.textos: cuántos textos de paso se han cortado a 200.
//   - titulo: texto de 1 a 60 caracteres; si no, «Ruta» (en procesarRespuesta, «Ruta» / «Route» según el idioma).
//   - pasos: de 1 a 400; cada paso {texto?, misiones?, punto?, web?}:
//       texto    como mucho 200 caracteres (sin controles, con trim y `|` duplicado, como todo lo que sale en el juego) y,
//                desde la revisión final, sin coordenadas (sinCoordenadas de herramientas/catalogo.mjs)
//       misiones como mucho 10 de {q: entero ≥ 1, accion: 'aceptar' | 'completar' | 'entregar', objetivo?: 1…20}
//                (una misión con algo mal se quita entera)
//       punto    una marca (B:…, G:…) o un P#, de 40 caracteres como mucho, sin espacios alrededor; NUNCA coordenadas
//       web      {zona (texto de 1 a 60 o entero), x, y (de 0 a 100), url (http o https)}
//     un paso sin nada válido se quita; los de más de 400 también. Los dos cuentan en quitados.pasos.
//   - R17 (rutas de subida de varias zonas, «speed run»): en vez de `pasos`, `tramos: [{titulo, pasos}]`, como mucho 8,
//     cada uno con 1 a 400 pasos de las mismas reglas y título de 1 a 60 caracteres (si no, el de la guía con « (i)»,
//     i = su puesto entre los que quedan). Un tramo sin ningún paso válido se quita; los de más de 8 también; los dos
//     cuentan en quitados.tramos. Una guía con `pasos` sale como un solo tramo con el título de la guía: lo que viene
//     detrás (tareas 18-21) siempre lee `tramos`.
// `ruta.puntos` y `pines` aceptan, además de P#, una marca que turno.puntoDeMarca(marca) resuelva (si el turno trae esa
// función): la parada lleva la etiqueta del texto del punto, el papel y `q` si la marca es de misión (y pasa el mismo
// filtro de las paradas que el texto no nombra); las demás son de tipo «lugar». Una marca que no se resuelve se quita como
// un P# que no existe. A las marcas se les quitan los espacios de alrededor (R11); las mayúsculas cuentan.
// Revisión final: `pinesWeb` necesita `url` y pasa por turno.puntoDeWeb (la comprobación de un `web` con las páginas de
// verdad, que pone el núcleo); direccionesWeb(texto) da las url que el núcleo tiene que mirar antes de procesar.
// `abrirGuia: {guia, desde?, hasta?}` (pedidoValido de guiaBiblioteca.mjs): abrir tal cual una guía de la biblioteca; sale
// en `abrirGuia` y la expande el núcleo. Si no vale, se quita ('abrirGuia'). Con abrirGuia, la guiaNueva del mismo bloque
// ni se mira (gana abrirGuia, valga o no), y la rutaZona tampoco.

import { cortar } from './texto.mjs';
import { validarComercio } from './comercio/ia.mjs';
import { leerMarca } from './herramientas/marcas.mjs';
import { sinCoordenadas } from './herramientas/catalogo.mjs';
import { pedidoValido } from './guiaBiblioteca.mjs';

const MAX_TITULO = 80;
const MAX_ETIQUETA = 80;
const MAX_QUITADOS = 20;
const MAX_QUITADO = 60;
const MAX_CAMPOS_RAROS = 5;
const CAMPOS_BLOQUE = new Set(['ruta', 'pines', 'marcas', 'guia', 'rutaZona', 'pinesWeb', 'comercio', 'guiaNueva', 'dibujos', 'abrirGuia']);
const MAX_PINES_WEB = 5;
const MAX_PARADAS = 30; // entradas de `pines` y de `ruta.puntos`, cada una
const MAX_FUENTE = 40;
const MAX_ZONA = 60;
const MAX_TEXTO_JUEGO = 4000;

const NOTAS = {
  es: {
    quitado: '(Se ha quitado lo que la IA propuso y no está en la base.)',
    sinNombrar: '(Se han quitado del mapa las paradas de misiones que el texto no nombra.)',
    ilegible: '(No se ha podido leer la propuesta de la IA.)',
    titulo: 'Ruta',
    deInternet: 'de internet:',
    internet: 'web',
    objetivos: (mision, texto) => `Antes de entregar «${mision}»: ${texto}`,
    objetivosMas: (n) => (n === 1 ? 'Y 1 misión más va sin sus objetivos en la ruta: míralos en tu registro.'
      : `Y ${n} misiones más van sin sus objetivos en la ruta: míralos en tu registro.`),
  },
  en: {
    quitado: '(What the AI proposed that is not in the database was removed.)',
    sinNombrar: '(Map stops for quests the text does not name were removed.)',
    ilegible: "(The AI's proposal could not be read.)",
    titulo: 'Route',
    deInternet: 'from the web:',
    internet: 'web',
    objetivos: (mision, texto) => `Before handing in "${mision}": ${texto}`,
    objetivosMas: (n) => (n === 1 ? 'And 1 more quest goes without its objectives on the route: check your quest log.'
      : `And ${n} more quests go without their objectives on the route: check your quest log.`),
  },
};

const BLOQUE = /```snet[ \t]*\r?\n([\s\S]*?)```/g;

// Texto de la IA (o de la tabla) que va a salir en el juego: sin controles, con trim, `|` duplicado y cortado a `max`
// caracteres sin partir un surrogate ni un `||`.
function sanear(texto, max) {
  const limpio = String(texto ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim().replace(/\|/g, '||');
  const corto = cortar(limpio, max);
  const barras = corto.match(/\|+$/);
  return barras && barras[0].length % 2 === 1 ? corto.slice(0, -1) : corto;
}
const esObjeto = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);

// Un objeto `rutaZona` válido: `zona` de texto (1 a 60 caracteres) o un número entero. La zona la resuelve otro módulo.
// 12-nov: `solo: "registro"` (solo las misiones del registro) y `sin` (ids de misiones que no entran, como mucho 20;
// los que no son enteros se ignoran).
const MAX_SIN = 20;
const MAX_MISIONES_PEDIDAS = 30;
const MAX_NOMBRE_MISION = 80;
function rutaZonaValida(v) {
  if (!esObjeto(v)) return null;
  const z = v.zona;
  let r = null;
  if (typeof z === 'string' && z.trim() !== '' && Array.from(z).length <= MAX_ZONA) r = { zona: z };
  if (typeof z === 'number' && Number.isInteger(z) && z >= 1 && z <= 100000) r = { zona: z };
  if (!r) return null;
  if (v.solo === 'registro') r.solo = 'registro';
  const sin = Array.isArray(v.sin) ? [...new Set(v.sin.filter((q) => Number.isInteger(q) && q >= 1))].slice(0, MAX_SIN) : [];
  if (sin.length > 0) r.sin = sin;
  // 12-nov: misiones concretas (nombres de internet o ids): como mucho 30; los nombres, de 1 a 80 caracteres.
  if (Array.isArray(v.misiones)) {
    const misiones = v.misiones
      .filter((m) => (Number.isInteger(m) && m >= 1) || (typeof m === 'string' && m.trim() !== '' && Array.from(m).length <= MAX_NOMBRE_MISION))
      .map((m) => (typeof m === 'string' ? m.trim() : m));
    const unicas = [...new Set(misiones)].slice(0, MAX_MISIONES_PEDIDAS);
    if (unicas.length > 0) r.misiones = unicas;
  }
  return r;
}

// Tarea 17: la guía que arma la IA (ver la cabecera). Solo la forma; el contenido lo comprueba la tarea 18.
const MAX_TITULO_GUIA = 60;
const MAX_PASOS_GUIA = 400;
const MAX_TRAMOS_GUIA = 8;
const MAX_TEXTO_PASO = 200;
const MAX_MISIONES_PASO = 10;
const MAX_OBJETIVO = 20;
const MAX_PUNTO_PASO = 40;
const MAX_URL = 300;
const ACCIONES = new Set(['aceptar', 'completar', 'entregar']);
const ID_PUNTO = /^P[1-9][0-9]*$/;
const URL_WEB = /^https?:\/\/[^\s\x00-\x1f\x7f]+$/;
const entre = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;

// Un título de 1 a 60 caracteres (sin controles ni espacios alrededor) o null. Sin escapar: el largo se mide antes de
// duplicar `|` (eso lo hace escaparTitulo al final).
function tituloGuia(v) {
  if (typeof v !== 'string') return null;
  const limpio = v.replace(/[\x00-\x1f\x7f]/g, '').trim();
  const largo = Array.from(limpio).length;
  return largo >= 1 && largo <= MAX_TITULO_GUIA ? limpio : null;
}
const escaparTitulo = (t) => sanear(t, MAX_TITULO_GUIA * 2);

// Marca de origen o P# del paso (R11: sin espacios alrededor) o null.
function puntoDePaso(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '' || Array.from(t).length > MAX_PUNTO_PASO) return null;
  return leerMarca(t) || ID_PUNTO.test(t) ? t : null;
}

function misionDePaso(m) {
  if (!esObjeto(m) || !Number.isInteger(m.q) || m.q < 1 || !ACCIONES.has(m.accion)) return null;
  if (m.objetivo !== undefined && !(Number.isInteger(m.objetivo) && m.objetivo >= 1 && m.objetivo <= MAX_OBJETIVO)) return null;
  return m.objetivo === undefined ? { q: m.q, accion: m.accion } : { q: m.q, accion: m.accion, objetivo: m.objetivo };
}

function webDePaso(w) {
  if (!esObjeto(w)) return null;
  const zonaTexto = typeof w.zona === 'string' && w.zona.trim() !== '' && Array.from(w.zona).length <= MAX_ZONA;
  const zonaNumero = Number.isInteger(w.zona) && w.zona >= 1 && w.zona <= 100000;
  if (!zonaTexto && !zonaNumero) return null;
  if (!entre(w.x, 0, 100) || !entre(w.y, 0, 100)) return null;
  if (typeof w.url !== 'string' || w.url.length > MAX_URL || !URL_WEB.test(w.url)) return null;
  const redondo = (n) => Math.round(n * 100) / 100;
  return { zona: zonaTexto ? w.zona.trim() : w.zona, x: redondo(w.x), y: redondo(w.y), url: w.url };
}

// Un paso con lo que tenga válido, o null si no le queda nada. `cuenta.textos` suma los textos que se cortan.
function pasoDeGuia(p, cuenta) {
  if (!esObjeto(p)) return null;
  const paso: {
    texto?: string;
    misiones?: any;
    punto?: string;
    web?: any;
  } = {};
  if (typeof p.texto === 'string') {
    // Revisión final: sin las coordenadas que escriba la IA (las mismas formas que quita leer_guia); el sitio va por `punto`.
    const sinPares = sinCoordenadas(p.texto);
    const entero = sanear(sinPares, Infinity);
    const texto = sanear(sinPares, MAX_TEXTO_PASO);
    if (texto !== entero) cuenta.textos++;
    if (texto !== '') paso.texto = texto;
  }
  if (Array.isArray(p.misiones)) {
    // El tope antes de validar: las de más de 10 ni se miran.
    const misiones = p.misiones.slice(0, MAX_MISIONES_PASO).map(misionDePaso).filter(Boolean);
    if (misiones.length > 0) paso.misiones = misiones;
  }
  const punto = puntoDePaso(p.punto);
  if (punto) paso.punto = punto;
  const web = webDePaso(p.web);
  if (web) paso.web = web;
  return Object.keys(paso).length > 0 ? paso : null;
}

// Los pasos válidos de una lista y cuántos se quitan. El tope (400) va antes de validar: los de más ni se miran.
function pasosDeGuia(lista, cuenta) {
  if (!Array.isArray(lista)) return { pasos: [], quitados: 0 };
  const pasos = lista.slice(0, MAX_PASOS_GUIA).map((p) => pasoDeGuia(p, cuenta)).filter(Boolean);
  return { pasos, quitados: lista.length - pasos.length };
}

export function guiaNuevaValida(v, porOmision = 'Ruta') {
  if (!esObjeto(v)) return null;
  const titulo = tituloGuia(v.titulo) ?? porOmision;
  const quitados = { pasos: 0, tramos: 0, textos: 0 };
  const tramos = [];
  if (Array.isArray(v.tramos)) {
    // El tope (8) antes de validar: los tramos del noveno en adelante se cuentan sin mirarlos.
    quitados.tramos = Math.max(0, v.tramos.length - MAX_TRAMOS_GUIA);
    for (const t of v.tramos.slice(0, MAX_TRAMOS_GUIA)) {
      // (un texto cortado nunca queda vacío: su paso vale y su tramo no se quita; textos no cuenta nada de lo quitado)
      const { pasos, quitados: fuera } = pasosDeGuia(esObjeto(t) ? t.pasos : undefined, quitados);
      if (pasos.length === 0) { quitados.tramos++; continue; }
      quitados.pasos += fuera;
      const sufijo = ` (${tramos.length + 1})`;
      const propio = tituloGuia(t.titulo);
      tramos.push({ titulo: escaparTitulo(propio ?? `${cortar(titulo, MAX_TITULO_GUIA - sufijo.length).trim()}${sufijo}`), pasos });
    }
  } else {
    const { pasos, quitados: fuera } = pasosDeGuia(v.pasos, quitados);
    quitados.pasos = fuera;
    if (pasos.length > 0) tramos.push({ titulo: escaparTitulo(titulo), pasos });
  }
  return tramos.length > 0 ? { titulo: escaparTitulo(titulo), tramos, quitados } : null;
}

// Revisión final: las direcciones de las páginas que cita el bloque snet de la respuesta (el último, como en
// procesarRespuesta), en orden: las de los `web` de los pasos de `guiaNueva` que pasan guiaNuevaValida y después las de
// `pinesWeb`. El núcleo baja con ellas las páginas de verdad (como mucho 3 en total) antes de procesar la respuesta.
export function direccionesWeb(texto) {
  const bloques = [...String(texto ?? '').matchAll(BLOQUE)].map((m) => m[1]);
  if (bloques.length === 0) return [];
  let json;
  try { json = JSON.parse(bloques[bloques.length - 1]); } catch { return []; }
  if (!esObjeto(json)) return [];
  const urls = [];
  // Con abrirGuia, la guiaNueva del bloque no cuenta (procesarRespuesta): sus páginas, tampoco.
  const guia = json.guiaNueva !== undefined && json.abrirGuia === undefined ? guiaNuevaValida(json.guiaNueva) : null;
  for (const t of guia?.tramos ?? []) for (const p of t.pasos) if (p.web) urls.push(p.web.url);
  for (const w of Array.isArray(json.pinesWeb) ? json.pinesWeb : []) if (esObjeto(w) && typeof w.url === 'string') urls.push(w.url);
  return urls;
}

// Lote E2: un id de misión entre paréntesis detrás del nombre de esa misión («Watching the Roads (95981)», «Arugal debe
// morir» (1014), **Icor de Putrepellejo (443)**) no le dice nada al jugador: se quita. Solo si el id es de una misión del
// registro o de la base (turno.nombresMision) y lo de delante (sin comillas ni negritas de cierre) acaba en uno de sus
// nombres, sin distinguir mayúsculas; cualquier otro número se queda como está. Si ese nombre es el de la base y el
// jugador la tiene en el registro con otro título (una misión propia de Forever sin nombre «es»), se pone el del registro.
// 12-nov: la IA busca en internet y su herramienta de búsqueda le hace citar las páginas con enlaces. En el chat del juego
// un enlace no se puede abrir: de «[Wowhead: Warsong Saw Blades](https://…)» queda el nombre, y las direcciones sueltas
// (y los «<…>» que las envuelven) se quitan.
const ENLACE_MD = /\[([^\]\n]{1,200})\]\(\s*<?https?:\/\/[^)\s]*>?\s*\)/g;
const URL_SUELTA = /<?\bhttps?:\/\/[^\s)>\]]+>?/g;
function sinEnlaces(texto) {
  return texto.replace(ENLACE_MD, '$1').replace(URL_SUELTA, '').replace(/\(\s*\)/g, '').replace(/[ \t]+$/gm, '');
}

const ID_TRAS_NOMBRE =/[ \t]*\((?:#|id:?[ \t]*)?(\d{1,7})\)/g;
const CIERRES = /[*_»"'”’]*$/u;
const LETRA_O_CIFRA = /[\p{L}\p{N}]$/u;

function quitarIdsDeMisiones(texto, turno) {
  if (typeof turno?.nombresMision !== 'function') return texto;
  const partes = [];
  let desde = 0;
  for (const m of texto.matchAll(ID_TRAS_NOMBRE)) {
    const info = turno.nombresMision(Number(m[1]));
    let tramo = texto.slice(desde, m.index);
    let quitar = false;
    if (info) {
      const cierres = tramo.match(CIERRES)[0];
      const cuerpo = tramo.slice(0, tramo.length - cierres.length);
      const bajo = cuerpo.toLowerCase();
      // El nombre más largo primero: «Arugal debe morir» antes que «morir».
      for (const nombre of [...info.nombres].sort((a, b) => b.length - a.length)) {
        if (!bajo.endsWith(nombre.toLowerCase())) continue;
        const antes = cuerpo.slice(0, cuerpo.length - nombre.length);
        if (LETRA_O_CIFRA.test(antes)) continue; // el nombre va pegado a otra palabra: no es él
        quitar = true;
        if (info.registro && nombre !== info.registro) tramo = antes + info.registro + cierres;
        break;
      }
    }
    partes.push(tramo);
    if (!quitar) partes.push(m[0]);
    desde = m.index + m[0].length;
  }
  partes.push(texto.slice(desde));
  return partes.join('');
}

// 14-nov: la IA le enseñó al jugador «(falta `datos.comercio`)». Los nombres internos no le dicen nada: se quita el
// paréntesis que solo es una referencia interna, `datos.x` pasa a «esos datos» y los campos conocidos pierden las comillas
// invertidas. Los bloques de código y los enlaces se dejan como están.
const PROTEGIDO = /```[\s\S]*?```|\[[^\]\n]*\]\([^)\n]*\)/g;
const PAREN_INTERNO = /[ \t]*\((?:(?:falta|faltan|sin|no hay|por falta de|ver|campo|el campo|de)[ \t]+)*`?\bdatos\.[A-Za-z_]\w*(?:\.\w+)*`?[ \t]*\)/gi;
const DATOS_SUELTO = /`?\bdatos\.[A-Za-z_]\w*(?:\.\w+)*`?/g;
const CAMPO_CONOCIDO = /`(sinDatos|enVivo|vistaHaceSegundos|pa|pd|pf|pe|pv|ritmo|normal|generado|fuente|edad)`/g;
// F9p, ronda 2: este no se deja con su nombre sin comillas, como los de arriba: no le dice nada al jugador.
const CAMPO_SIN_SABER = /`?\bmercanciaSinSaber\b(?:\s*:\s*true)?`?/g;
export function limpiarNombresInternos(texto) {
  const guardado = [];
  const marca = (m) => { guardado.push(m); return '\uE000' + (guardado.length - 1) + '\uE001'; };
  return String(texto ?? '')
    .replace(PROTEGIDO, marca)
    .replace(PAREN_INTERNO, '')
    .replace(DATOS_SUELTO, 'esos datos')
    .replace(CAMPO_SIN_SABER, 'rotación sin confirmar')
    .replace(CAMPO_CONOCIDO, '$1')
    .replace(/\uE000(\d+)\uE001/g, (_, i) => guardado[Number(i)]);
}

// Las limpiezas de la prosa de una respuesta (sin el bloque): enlaces, nombres internos, ids de misión detrás de su nombre
// (con turno.nombresMision; sin él no se quitan) y más de una línea en blanco seguida. Revisión final (M3): también las usa
// escribir_chat de TATI (tati/acciones.mjs).
export function limpiarProsa(texto, turno) {
  return quitarIdsDeMisiones(limpiarNombresInternos(sinEnlaces(String(texto ?? ''))).replace(/\n{3,}/g, '\n\n').trim(), turno);
}

// 15-nov (en el juego: el texto decía «entrega Origen del poder al doctor Martin Felben» y el punto del mapa era «Entregar
// Elixir de agonía (Maestro boticario Faranell)»): una parada con misión solo vale si el texto nombra esa misión (por
// cualquiera de sus nombres, sin tildes ni mayúsculas, como palabras enteras), si es de la guía que sigue el jugador
// (datos.ruta.misiones) o de las que nombró él (datos.mencionadas). Las de su registro valen también si el texto no
// nombra ninguna misión conocida del turno («Aquí tienes tu ruta»): no hay con qué compararlas (revisión con datos reales:
// con una sola parada, el caso del incidente se colaba; ahora cuentan todas las del turno: registro, mencionadas, ruta,
// guías propias y tabla de puntos). El nombre vale también sin su artículo del principio («Caballero de la Tumba»). Sin
// turno.nombresMision no se comprueba.
const normalizado = (t) => ` ${String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
const ARTICULO = /^ (?:el|la|los|las|un|una|the|a|an) (?=\S+ \S)/;
const qsDe = (v) => (Array.isArray(v) ? v : []).map((m) => (Number.isInteger(m) ? m : m?.q)).filter(Number.isInteger);
function filtroDeParadas(turno, texto) {
  if (typeof turno?.nombresMision !== 'function') return null;
  const textoNormal = normalizado(texto);
  const datos = turno.datos ?? {};
  const deDatos = new Set([...qsDe(datos.ruta?.misiones), ...qsDe(datos.mencionadas)]);
  // El registro entero del turno (prepararTurno da idsRegistro antes de los recortes); si no viene, el de los datos.
  const delRegistro = new Set(Array.isArray(turno.idsRegistro) ? turno.idsRegistro.filter(Number.isInteger) : qsDe(datos.registro));
  // Última revisión: las del registro, las mencionadas y las que tienen P# (no las de las guías propias, que son muchas).
  const conocidas = new Set([...delRegistro, ...qsDe(datos.mencionadas), ...qsDe(datos.registro), ...qsDe(datos.puntos)]);
  const nombraNombre = (n) => {
    const nombre = normalizado(n);
    if (nombre.trim() === '') return false;
    const sinArticulo = nombre.replace(ARTICULO, ' ');
    return textoNormal.includes(nombre) || (sinArticulo !== nombre && textoNormal.includes(sinArticulo));
  };
  const enTexto = (q) => (turno.nombresMision(q)?.nombres ?? []).some(nombraNombre);
  // Para «nombra alguna misión conocida» no cuentan los nombres de una sola palabra ni los que son el nombre de una zona
  // («Teldrassil», «Southshore»): el texto los dice por el sitio, no por la misión.
  const esZona = (n) => {
    const z = typeof turno.resolverZona === 'function' ? turno.resolverZona(n) : null;
    return z?.nombre != null && Object.values(z.nombre).some((x) => typeof x === 'string' && normalizado(x) === normalizado(n));
  };
  const nombreQueCuenta = (n) => normalizado(n).trim().includes(' ') && !esZona(n) && nombraNombre(n);
  const nombraAlgunaConocida = [...conocidas].some((q) => (turno.nombresMision(q)?.nombres ?? []).some(nombreQueCuenta));
  // qs: las misiones de las paradas propuestas. Devuelve la función que dice si la parada de q vale.
  return (qs) => {
    const nombradas = new Set(qs.filter(enTexto));
    return (q) => nombradas.has(q) || deDatos.has(q) || (!nombraAlgunaConocida && nombradas.size === 0 && delRegistro.has(q));
  };
}

// Tarea 17: una marca de origen de `ruta.puntos` o `pines` -> parada con la forma de las de la tabla ({mapa, x, y, texto,
// papel, q?, deMarca: true}), o null si el turno no trae puntoDeMarca, no la resuelve (o falla) o el punto no es válido.
// `m` es leerMarca(marca): el papel y la q salen de la marca, nunca de la IA.
function puntoDeLaMarca(turno, marca, m) {
  if (typeof turno?.puntoDeMarca !== 'function') return null;
  let p;
  try { p = turno.puntoDeMarca(marca); } catch { return null; }
  if (!esObjeto(p) || !(typeof p.mapa === 'number' && Number.isFinite(p.mapa) && p.mapa > 0) || !entre(p.x, 0, 100) || !entre(p.y, 0, 100)) return null;
  const punto: {
    mapa: typeof p.mapa;
    x: typeof p.x;
    y: typeof p.y;
    texto: any;
    papel: string;
    deMarca: boolean;
    q?: any;
  } = { mapa: p.mapa, x: p.x, y: p.y, texto: typeof p.texto === 'string' ? p.texto : '', papel: 'lugar', deMarca: true };
  if (m.tipo === 'mision') { punto.papel = m.papel; punto.q = m.q; }
  return punto;
}

// Dibujos de la IA en el mapa (encargo 2; el formato del addon está en la cabecera de addons/SnetForever/mapa/dibujos.lua).
// El bloque trae `dibujos: [{tipo: linea|flecha|circulo|marca, puntos: [P# o marcas], tinta?: 1-6, grosor?: 1-3,
// texto?, icono?: 1-8 (solo marca)}]` o `{tipo: linea|flecha, ruta: true, tinta?, grosor?, texto?}` (la línea por los
// próximos pasos de la guía activa: la resuelve el addon). Cada punto sale SOLO de un P# del turno o de una marca que
// turno.puntoDeMarca resuelve: un número, un par o lo que no se resuelve se quita (quitados `punto:…`), y nunca se miran un
// `mapa`, unas coordenadas ni un `radio` de la IA. Un trazo que se queda sin los puntos que necesita (línea y flecha, 2
// del mismo mapa; círculo y marca, 1) se descarta (quitados `dibujo:<n>`, n desde 1). Una línea o flecha que pasa por
// varios mapas se parte en un trazo por cada tramo seguido del mismo mapa (los de un solo punto no salen); la flecha
// lleva la punta solo en el último trozo y el texto va en el primero. Círculo y marca usan el primer punto que se
// resuelve. Círculo: si el punto trae `sitios` (un objetivo con varios sitios en la base: la zona de matar), el centro es
// la media de los sitios y el radio la distancia al más lejano más MARGEN_ZONA (con tope MAX_RADIO_ZONA); si no, el
// radio sale del grosor (RADIO_GROSOR). Topes como el addon: se miran 40 trazos y 20 puntos de cada uno, y salen 40
// trazos como mucho; texto de 80 bytes como mucho (cortado DESPUÉS de pasar por limpiarProsa y sinCoordenadas), sin
// controles, con `|` doble y sin un `|` impar al final. tinta o grosor raros -> 2; icono raro -> 1.
// Revisión: un punto de una misión (P# con q o marca B:q…) pasa el mismo filtro que las paradas (filtroDeParadas, con las
// misiones de todos los puntos de los dibujos): si el texto no la nombra, se quita (quitados `punto:<id>:q<q>`, con la
// nota de las paradas sin nombrar). Una flecha de un mapa a otro (de la zona a la entrada de una mazmorra de otra zona)
// se sigue partiendo por mapas: la app no sabe pasar coordenadas de un mapa a su continente (eso solo lo sabe el addon).
// -> {dibujos, cuenta: {trazos, descartados}, sinNombrar} (descartados: trazos de la IA de los que no sale nada;
// sinNombrar: los puntos quitados por el filtro).
const MAX_DIBUJOS = 40;
const MAX_PUNTOS_DIBUJO = 20;
const MAX_BYTES_TEXTO_DIBUJO = 80;
const TIPOS_DIBUJO = new Set(['linea', 'flecha', 'circulo', 'marca']);
const RADIO_GROSOR = { 1: 1.5, 2: 3, 3: 5 };
const MARGEN_ZONA = 1;
const MAX_RADIO_ZONA = 15;
const DEFECTO_DIBUJO = 2;
const enteroEntre = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;

// Texto de un dibujo para el addon (tooltip): ver arriba. '' si no queda nada.
function textoDibujo(v, turno) {
  if (typeof v !== 'string') return '';
  const limpio = sinCoordenadas(limpiarProsa(v, turno)).replace(/[\x00-\x1f\x7f]/g, '').trim().replace(/\|/g, '||');
  let salida = '';
  let bytes = 0;
  for (const c of limpio) {
    const b = Buffer.byteLength(c, 'utf8');
    if (bytes + b > MAX_BYTES_TEXTO_DIBUJO) break;
    salida += c;
    bytes += b;
  }
  const barras = salida.match(/\|+$/);
  return barras && barras[0].length % 2 === 1 ? salida.slice(0, -1) : salida;
}

// Un punto de un dibujo: P# del turno o marca resuelta -> {mapa, x, y, q?, sitios?} o null. La q de una marca sale de la
// marca; la de un P#, de la tabla del turno.
function sitioDeDibujo(turno, id) {
  const t = typeof id === 'string' ? id.trim() : '';
  let p = null;
  const m = leerMarca(t);
  if (m) {
    if (typeof turno?.puntoDeMarca !== 'function') return null;
    try { p = turno.puntoDeMarca(t); } catch { return null; }
  } else if (ID_PUNTO.test(t)) {
    p = turno.puntos?.get(t);
  }
  if (!esObjeto(p) || !(typeof p.mapa === 'number' && Number.isFinite(p.mapa) && p.mapa > 0) || !entre(p.x, 0, 100) || !entre(p.y, 0, 100)) return null;
  const sitios = Array.isArray(p.sitios) ? p.sitios.filter((s) => Array.isArray(s) && entre(s[0], 0, 100) && entre(s[1], 0, 100)) : [];
  const salida: {
    mapa: typeof p.mapa;
    x: typeof p.x;
    y: typeof p.y;
    q?: any;
    sitios?: any;
  } = { mapa: p.mapa, x: p.x, y: p.y };
  const q = m ? (m.tipo === 'mision' ? m.q : undefined) : p.q;
  if (Number.isInteger(q)) salida.q = q;
  if (sitios.length >= 2) salida.sitios = sitios;
  return salida;
}

// Centro y radio del círculo de un punto (ver arriba).
function circuloDe(p, grosor) {
  if (!p.sitios) return { x: p.x, y: p.y, radio: RADIO_GROSOR[grosor] };
  const n = p.sitios.length;
  const cx = p.sitios.reduce((s, [x]) => s + x, 0) / n;
  const cy = p.sitios.reduce((s, [, y]) => s + y, 0) / n;
  const lejos = Math.max(...p.sitios.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const radio = Math.min(MAX_RADIO_ZONA, Math.ceil((lejos + MARGEN_ZONA) * 10 - 1e-9) / 10);
  return { x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100, radio };
}

// Un trazo de la IA con sus puntos ya resueltos ([{id, p}], de dibujosValidos) -> los trazos para el addon ([] si se
// descarta). Apunta en `quitados` los puntos que no valen; `vale(q)` es el filtro de las paradas. -> {trazos, sinNombrar}
const conPuntos = (d) => esObjeto(d) && TIPOS_DIBUJO.has(d.tipo) && d.ruta !== true && Array.isArray(d.puntos);
function trazosDe(d, resueltos, turno, quitados, vale) {
  const nada = { trazos: [], sinNombrar: 0 };
  if (!esObjeto(d) || !TIPOS_DIBUJO.has(d.tipo)) return nada;
  const tinta = enteroEntre(d.tinta, 1, 6) ? d.tinta : DEFECTO_DIBUJO;
  const grosor = enteroEntre(d.grosor, 1, 3) ? d.grosor : DEFECTO_DIBUJO;
  const texto = textoDibujo(d.texto, turno);
  const conTexto = (t) => (texto !== '' ? { ...t, texto } : t);
  if (d.ruta === true) {
    return { trazos: d.tipo === 'linea' || d.tipo === 'flecha' ? [conTexto({ ruta: true, tipo: d.tipo, tinta, grosor })] : [], sinNombrar: 0 };
  }
  if (!Array.isArray(d.puntos)) return nada;
  const sitios = [];
  let sinNombrar = 0;
  for (const { id, p } of resueltos) {
    const nombre = typeof id === 'string' ? id.trim() : String(id);
    if (!p) quitados.push(`punto:${nombre}`);
    else if (Number.isInteger(p.q) && !vale(p.q)) {
      quitados.push(`punto:${nombre}:q${p.q}`);
      sinNombrar++;
    } else sitios.push(p);
  }
  const r = (trazos) => ({ trazos, sinNombrar });
  if (sitios.length === 0) return r([]);
  if (d.tipo === 'circulo' || d.tipo === 'marca') {
    const p = sitios[0];
    if (d.tipo === 'marca') return r([conTexto({ mapa: p.mapa, tipo: 'marca', tinta, grosor, puntos: [p.x, p.y], marca: enteroEntre(d.icono, 1, 8) ? d.icono : 1 })]);
    const c = circuloDe(p, grosor);
    return r([conTexto({ mapa: p.mapa, tipo: 'circulo', tinta, grosor, puntos: [c.x, c.y], radio: c.radio })]);
  }
  // Línea o flecha: un trozo por cada tramo seguido del mismo mapa, con 2 puntos o más.
  const tramos = [];
  for (const p of sitios) {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.mapa === p.mapa) ultimo.puntos.push(p.x, p.y);
    else tramos.push({ mapa: p.mapa, puntos: [p.x, p.y] });
  }
  const buenos = tramos.filter((t) => t.puntos.length >= 4);
  return r(buenos.map((t, i) => {
    const trazo = { mapa: t.mapa, tipo: i === buenos.length - 1 ? d.tipo : 'linea', tinta, grosor, puntos: t.puntos };
    return i === 0 ? conTexto(trazo) : trazo;
  }));
}

// `filtro`: el de filtroDeParadas (o null sin turno.nombresMision). Primero se resuelven todos los puntos (como mucho 40
// trazos de 20), para pasar al filtro las misiones de todos.
function dibujosValidos(lista, turno, quitados, filtro) {
  const resueltos = lista.map((d, i) => (i < MAX_DIBUJOS && conPuntos(d)
    ? d.puntos.map((id, j) => ({ id, p: j < MAX_PUNTOS_DIBUJO ? sitioDeDibujo(turno, id) : null }))
    : []));
  const qs = resueltos.flat().map((e) => e.p?.q).filter(Number.isInteger);
  const vale = filtro ? filtro(qs) : () => true;
  const dibujos = [];
  let descartados = 0;
  let sinNombrar = 0;
  for (const [i, d] of lista.entries()) {
    const r = i < MAX_DIBUJOS ? trazosDe(d, resueltos[i], turno, quitados, vale) : { trazos: [], sinNombrar: 0 };
    sinNombrar += r.sinNombrar;
    if (r.trazos.length === 0 || dibujos.length >= MAX_DIBUJOS) {
      quitados.push(`dibujo:${i + 1}`);
      descartados++;
      continue;
    }
    dibujos.push(...r.trazos.slice(0, MAX_DIBUJOS - dibujos.length));
  }
  return { dibujos, cuenta: { trazos: dibujos.length, descartados }, sinNombrar };
}

// T2 (A2, 17-nov: la flecha mandaba a entregar una misión sin hacer): por cada parada de entregar de una `ruta` (seguir) sin
// una parada de objetivo de esa misión antes, se meten delante sus objetivos con sitio de la base (turno.objetivosDe(q):
// {nombre, puntos: [{mapa, x, y, texto, papel, q, obj?, objetivo?, npcs?}], faltan, textos}), salvo si ya está lista para
// entregar (turno.idsListas). Como mucho MAX_PUNTOS_RUTA paradas en total (MAX_PUNTOS del addon): los objetivos de una
// misión van todos o ninguno. Salida más simple sin inventar nada: si no caben, o si la misión tiene algún objetivo sin
// sitio en la base (`faltan`), su texto de la base va en una línea del texto («Antes de entregar «X»: …»), como mucho
// MAX_LINEAS_OBJETIVOS. -> {puntos, lineas}
const MAX_PUNTOS_RUTA = 40;
const MAX_LINEAS_OBJETIVOS = 3;
const MAX_TEXTO_OBJETIVOS = 200;
function paradasDeObjetivo(puntos, turno, notas) {
  if (typeof turno?.objetivosDe !== 'function') return { puntos, lineas: [] };
  const listas = new Set(Array.isArray(turno.idsListas) ? turno.idsListas : []);
  const conObjetivo = new Set();
  const salida = [];
  const lineas = [];
  let total = puntos.length;
  let mas = 0;
  for (const p of puntos) {
    if (p.tipo === 'objetivo' && Number.isInteger(p.q)) conObjetivo.add(p.q);
    if (p.seguir && p.tipo === 'entregar' && Number.isInteger(p.q) && !conObjetivo.has(p.q)) {
      conObjetivo.add(p.q);
      let o = null;
      if (!listas.has(p.q)) {
        try { o = turno.objetivosDe(p.q); } catch { o = null; }
      }
      const suyos = (Array.isArray(o?.puntos) ? o.puntos : []).filter((s) => esObjeto(s)
        && typeof s.mapa === 'number' && Number.isFinite(s.mapa) && s.mapa > 0 && entre(s.x, 0, 100) && entre(s.y, 0, 100));
      const caben = total + suyos.length <= MAX_PUNTOS_RUTA;
      if (caben) {
        for (const s of suyos) {
          const parada: {
            mapa: typeof s.mapa;
            x: typeof s.x;
            y: typeof s.y;
            etiqueta: string;
            tipo: string;
            q: typeof p.q;
            obj?: any;
            objetivo?: any;
            npcs?: any;
            seguir?: boolean;
          } = { mapa: s.mapa, x: s.x, y: s.y, etiqueta: sanear(s.texto, MAX_ETIQUETA), tipo: 'objetivo', q: p.q };
          if (s.obj !== undefined) parada.obj = s.obj;
          if (Number.isInteger(s.objetivo)) parada.objetivo = s.objetivo;
          if (Array.isArray(s.npcs) && s.npcs.length > 0) parada.npcs = [...s.npcs];
          parada.seguir = true;
          salida.push(parada);
        }
        total += suyos.length;
      }
      const texto = cortar((Array.isArray(o?.textos) ? o.textos : []).filter((t) => typeof t === 'string')
        .join(' ').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/ {2,}/g, ' ').trim(), MAX_TEXTO_OBJETIVOS);
      if (o && ((!caben && suyos.length > 0) || o.faltan > 0)) {
        if (texto !== '' && lineas.length < MAX_LINEAS_OBJETIVOS) {
          const nombre = String(o.nombre ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
          lineas.push(notas.objetivos(nombre, texto));
        } else mas++;
      }
    }
    salida.push(p);
  }
  // Ronda 1 (M4): las que no caben en esas líneas se cuentan en una más, para que ninguna se pierda sin aviso.
  if (mas > 0) lineas.push(notas.objetivosMas(mas));
  return { puntos: salida, lineas };
}

// turno = {puntos: Map(P# -> punto), inventarioIds: Set, guias: Map(clave -> título), nombresMision?, existeObjeto?,
// grupoAbierto?, puntoDeMarca? (tarea 17: marca -> {mapa, x, y, texto}), datos?} (salida de prepararTurno).
// Tarea 15: `comercio` (grupo y regla que propone la IA) se valida con comercio/ia.mjs (validarComercio); la salida lo
// lleva solo si queda algo válido. Nada se aplica en el juego hasta que el jugador pulsa Aplicar.
// El texto que devuelve es texto plano: para el chat del juego hay que pasarlo por renderizar().
export function procesarRespuesta(texto, turno, idioma) {
  const notas = NOTAS[idioma === 'en' ? 'en' : 'es'];
  const origen = typeof texto === 'string' ? texto : '';
  const bloques = [...origen.matchAll(BLOQUE)].map((m) => m[1]);
  let limpio = limpiarProsa(origen.replace(BLOQUE, ''), turno);
  const salida: {
    texto: typeof limpio;
    quitados: any[];
    propuesta?: any;
    dibujos?: any;
    cuentaDibujos?: any;
    marcas?: any;
    guia?: any;
    rutaZona?: any;
    abrirGuia?: any;
    guiaNueva?: any;
    comercio?: any;
  } = { texto: limpio, quitados: [] };
  if (bloques.length === 0) return salida;

  const quitados = salida.quitados;
  let ilegible = false;
  let sinNombrar = false;
  let nSinNombrar = 0; // entradas de quitados que son paradas sin nombrar (las demás llevan la otra nota)
  let json;
  try { json = JSON.parse(bloques[bloques.length - 1]); } catch { json = undefined; }
  if (!esObjeto(json)) {
    quitados.push('bloque');
    ilegible = true;
  } else {
    // Rutas y pines: los de la ruta primero y en su orden; cada P# (o marca) una sola vez.
    const vistos = new Set();
    const puntos = [];
    const elegidos = []; // [id, seguir, punto] de los P# que existen y las marcas que se resuelven, sin repetir
    // Como mucho 30 entradas por lista antes de resolver nada (cada marca llama a turno.puntoDeMarca); las de más se
    // quitan y se cuentan como un punto que no existe.
    const anadir = (ids, seguir) => {
      const lista = Array.isArray(ids) ? ids : [];
      for (const [i, id] of lista.entries()) {
        if (i >= MAX_PARADAS) { quitados.push(`punto:${String(id)}`); continue; }
        const marca = typeof id === 'string' ? id.trim() : '';
        const m = leerMarca(marca);
        const p = m ? puntoDeLaMarca(turno, marca, m) : typeof id === 'string' ? turno.puntos.get(id) : undefined;
        const clave = m ? marca : id;
        if (!p) { quitados.push(`punto:${String(clave)}`); continue; }
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        elegidos.push([clave, seguir, p]);
      }
    };
    const ruta = esObjeto(json.ruta) ? json.ruta : undefined;
    if (json.ruta !== undefined && !ruta) quitados.push('ruta');
    if (ruta && ruta.puntos !== undefined && !Array.isArray(ruta.puntos)) quitados.push('ruta.puntos');
    if (json.pines !== undefined && !Array.isArray(json.pines)) quitados.push('pines');
    anadir(ruta?.puntos, true);
    anadir(json.pines, false);
    const filtro = filtroDeParadas(turno, limpio);
    const vale = filtro ? filtro(elegidos.map(([, , p]) => p.q).filter(Number.isInteger)) : () => true;
    for (const [id, seguir, p] of elegidos) {
      if (Number.isInteger(p.q) && !vale(p.q)) {
        quitados.push(`punto:${id}:q${p.q}`);
        sinNombrar = true;
        nSinNombrar++;
        continue;
      }
      const punto: {
        mapa: typeof p.mapa;
        x: typeof p.x;
        y: typeof p.y;
        etiqueta: string;
        tipo: typeof p.papel;
        q?: any;
        obj?: any;
        objetivo?: any;
        npcs?: any;
        seguir?: any;
      } = { mapa: p.mapa, x: p.x, y: p.y, etiqueta: sanear(p.texto, MAX_ETIQUETA), tipo: p.papel };
      if (!p.deMarca || Number.isInteger(p.q)) punto.q = p.q; // una marca que no es de misión no lleva q
      if (p.obj !== undefined) punto.obj = p.obj;
      // Lote F: con esto el addon hace de cada parada un paso de guía (complete del objetivo k, y target o mob con los
      // PNJ del sitio para «Objetivos cercanos»).
      if (Number.isInteger(p.objetivo)) punto.objetivo = p.objetivo;
      if (Array.isArray(p.npcs) && p.npcs.length > 0) punto.npcs = [...p.npcs];
      punto.seguir = seguir;
      puntos.push(punto);
    }
    // T2 (A2): las paradas de objetivo que la IA no puso antes de una entrega (no pasan otra vez por el filtro: la misión ya
    // pasó con su entrega). Lo que no tiene sitio o no cabe va en el texto.
    const conObjetivos = paradasDeObjetivo(puntos, turno, notas);
    puntos.splice(0, puntos.length, ...conObjetivos.puntos);
    if (conObjetivos.lineas.length > 0) limpio = [limpio, ...conObjetivos.lineas].filter(Boolean).join('\n\n');
    // 12-nov: sitios que la IA ha leído en internet (no están en la base): zona, x e y de la página que cita. Revisión
    // final: cada uno con la `url` de esa página y comprobado como un `web` de guiaNueva con turno.puntoDeWeb (lo pone el
    // núcleo con las páginas de verdad del turno: página leída en esta pregunta, zona que la app conoce y el par x, y
    // escrito en su texto). Sin url, sin la función (Codex, sin páginas) o sin pasar la comprobación, se quita.
    if (json.pinesWeb !== undefined && !Array.isArray(json.pinesWeb)) quitados.push('pinesWeb');
    let web = 0;
    for (const w of Array.isArray(json.pinesWeb) ? json.pinesWeb : []) {
      const forma = esObjeto(w) && entre(w.x, 0, 100) && entre(w.y, 0, 100)
        && typeof w.url === 'string' && w.url.length <= MAX_URL && URL_WEB.test(w.url);
      let p = null;
      if (forma && typeof turno.puntoDeWeb === 'function') {
        try { p = turno.puntoDeWeb({ zona: w.zona, x: w.x, y: w.y, url: w.url }); } catch { p = null; }
      }
      const mapa = esObjeto(p) && typeof p.mapa === 'number' && Number.isFinite(p.mapa) && p.mapa > 0 ? p.mapa : null;
      if (mapa === null || web >= MAX_PINES_WEB) { quitados.push('pinesWeb'); continue; }
      web++;
      const fuente = typeof w.fuente === 'string' && w.fuente.trim() !== '' ? sanear(w.fuente, MAX_FUENTE) : notas.internet;
      const texto = typeof w.texto === 'string' ? sanear(w.texto, MAX_ETIQUETA) : '';
      const etiqueta = sanear(`${texto}${texto ? ' ' : ''}(${notas.deInternet} ${fuente})`, MAX_ETIQUETA);
      puntos.push({ mapa, x: Math.round(w.x * 100) / 100, y: Math.round(w.y * 100) / 100, etiqueta, tipo: 'lugar', seguir: false, web: true });
    }
    if (puntos.length > 0) {
      const dado = typeof ruta?.titulo === 'string' ? sanear(ruta.titulo, MAX_TITULO) : '';
      const titulo = dado !== '' ? dado : notas.titulo;
      // Lote E1c: «ruta» si hay paradas que seguir (el bloque trae `ruta`); «pines» si solo señala sitios. El addon solo
      // abre la guía de la ruta (lote F; la flecha la sigue) con una ruta.
      const tipo = puntos.some((p) => p.seguir) ? 'ruta' : 'pines';
      salida.propuesta = { titulo, tipo, puntos };
    }

    // Dibujos de la IA en el mapa (ver dibujosValidos): van al addon tal cual, sin pedir aceptar.
    if (Array.isArray(json.dibujos)) {
      const { dibujos, cuenta, sinNombrar: fuera } = dibujosValidos(json.dibujos, turno, quitados, filtro);
      if (fuera > 0) {
        sinNombrar = true;
        nSinNombrar += fuera;
      }
      if (dibujos.length > 0) salida.dibujos = dibujos;
      salida.cuentaDibujos = cuenta;
    } else if (json.dibujos !== undefined) quitados.push('dibujos');

    // Marcas: solo objetos que estaban en el inventario enviado.
    if (esObjeto(json.marcas)) {
      const marcas = {};
      for (const clave of ['vender', 'usar']) {
        const ids = [];
        if (json.marcas[clave] !== undefined && !Array.isArray(json.marcas[clave])) quitados.push(`marcas.${clave}`);
        for (const id of Array.isArray(json.marcas[clave]) ? json.marcas[clave] : []) {
          if (Number.isInteger(id) && turno.inventarioIds.has(id)) { if (!ids.includes(id)) ids.push(id); } else quitados.push(`objeto:${String(id)}`);
        }
        if (ids.length > 0) marcas[clave] = ids;
      }
      for (const clave of Object.keys(json.marcas)) if (clave !== 'vender' && clave !== 'usar') quitados.push(`marcas:${clave}`);
      if (Object.keys(marcas).length > 0) salida.marcas = marcas;
    } else if (json.marcas !== undefined) quitados.push('marcas');

    // Guía: una de las que se enviaron.
    if (json.guia !== undefined) {
      if (typeof json.guia === 'string' && turno.guias.has(json.guia)) salida.guia = json.guia;
      else quitados.push(`guia:${String(json.guia)}`);
    }

    // Ruta de una zona: aquí solo se filtra la forma (la zona la resuelve la tarea 16b). Con abrirGuia en el bloque (valga
    // o no), no se mira: la guía que se pide es la de la biblioteca.
    if (json.rutaZona !== undefined && json.abrirGuia === undefined) {
      const rz = rutaZonaValida(json.rutaZona);
      if (rz) salida.rutaZona = rz;
      else quitados.push('rutaZona');
    }

    // Una guía de la biblioteca tal cual (abrirGuia): solo {guia, desde?, hasta?}, sin pasos ni puntos de la IA; la
    // expande el núcleo (guiaBiblioteca.mjs). Si el bloque la trae, gana ella: la guiaNueva del mismo bloque ni se mira.
    if (json.abrirGuia !== undefined) {
      const pedido = pedidoValido(json.abrirGuia);
      if (pedido) salida.abrirGuia = pedido;
      else quitados.push('abrirGuia');
    }

    // Tarea 17: una guía entera (solo la forma; el contenido, en la tarea 18).
    if (json.guiaNueva !== undefined && json.abrirGuia === undefined) {
      const g = guiaNuevaValida(json.guiaNueva, notas.titulo);
      if (g) salida.guiaNueva = g;
      else quitados.push('guiaNueva');
    }

    // Tarea 15: grupo y regla de comercio.
    if (json.comercio !== undefined) {
      const comercio = validarComercio(json.comercio, { existeObjeto: turno.existeObjeto, grupoAbierto: turno.grupoAbierto }, quitados);
      if (comercio) salida.comercio = comercio;
    }

    // Campos del bloque que no existen: también dejan rastro (como mucho 5).
    for (const campo of Object.keys(json).filter((c) => !CAMPOS_BLOQUE.has(c)).slice(0, MAX_CAMPOS_RAROS)) quitados.push(`campo:${campo}`);
  }

  if (quitados.length > 0) {
    // Si solo se han quitado paradas sin nombrar, su nota; si hay más, las dos.
    const otros = quitados.length > nSinNombrar;
    const nota = ilegible ? notas.ilegible : [otros ? notas.quitado : '', sinNombrar ? notas.sinNombrar : ''].filter(Boolean).join(' ');
    limpio = `${limpio}${limpio ? '\n\n' : ''}${nota}`;
  }
  salida.texto = limpio;
  // Tope de lo que se cuenta: 20 entradas de ≤ 60 caracteres.
  salida.quitados = quitados.slice(0, MAX_QUITADOS).map((e) => cortar(e, MAX_QUITADO));
  return salida;
}

// Código de color del título (el que pone la app, nunca la IA).
const COLOR_TITULO = '|cFFFFD100';

// Recorre el texto ya escapado y devuelve el trozo válido más largo: sin un `|` suelto ni un `|c…` a medias.
// `abiertos` = colores sin cerrar.
function trozoValido(s) {
  let i = 0;
  let abiertos = 0;
  while (i < s.length) {
    if (s[i] !== '|') { i++; continue; }
    const n = s[i + 1];
    if (n === '|') i += 2;
    else if (n === 'r') { i += 2; abiertos = Math.max(0, abiertos - 1); }
    else if (n === 'c' && /^[0-9A-Fa-f]{8}$/.test(s.slice(i + 2, i + 10))) { i += 10; abiertos++; }
    else break;
  }
  return { texto: s.slice(0, i), abiertos };
}

// Límites del texto que va al chat del juego, medidos SOBRE LA SALIDA FINAL (con \n, |r y colores reabiertos).
// El addon guarda cada línea en trozos de ≤ 500 bytes.
const MAX_BYTES_LINEA = 450;
const MAX_BYTES_TOTAL = 12000;
const bytesDe = (t) => Buffer.byteLength(t, 'utf8');

// Une un color que hay que reabrir, el cuerpo de la línea y el cierre. Sin espacios al principio ni al final del cuerpo
// (tampoco justo antes de un `|r` final). Devuelve null si no queda nada que enseñar en una continuación.
function armarLinea(abrir, cuerpo, cierre) {
  const limpio = cuerpo.replace(/ +((?:\|r)*)$/, '$1').replace(/^ +/, '');
  if (limpio === '' && abrir) return null;
  return abrir + limpio + cierre;
}

// Trocea una línea ya escapada en líneas de ≤ MAX_BYTES_LINEA bytes. Los tokens son `||`, `|cXXXXXXXX`, `|r` o un
// carácter entero, así que nunca se parte un `||`, un código de color ni un carácter UTF-8. Corta por espacio cuando
// puede. Si un color cruza el corte, se cierra con `|r` al final de la línea y se reabre al principio de la siguiente.
function partirLinea(linea) {
  const tokens = linea.match(/\|\||\|c[0-9A-Fa-f]{8}|\|r|[\s\S]/gu) ?? [];
  const lineas = [];
  let i = 0;
  let abrir = ''; // color que hay que reabrir al principio de la línea
  const poner = (l) => { if (l !== null) lineas.push(l); };
  while (true) {
    let bytes = bytesDe(abrir);
    let abierto = abrir;
    let j = i;
    let espacio = -1;
    let abiertoEnEspacio = '';
    for (; j < tokens.length; j++) {
      const t = tokens[j];
      const nuevo = t.startsWith('|c') && t.length === 10 ? t : t === '|r' ? '' : abierto;
      if (bytes + bytesDe(t) + (nuevo ? 2 : 0) > MAX_BYTES_LINEA) break;
      bytes += bytesDe(t);
      abierto = nuevo;
      if (t === ' ') { espacio = j; abiertoEnEspacio = abierto; }
    }
    if (j >= tokens.length) {
      poner(armarLinea(abrir, tokens.slice(i).join(''), ''));
      return lineas;
    }
    let fin = j;
    let siguiente = j;
    if (espacio > i) { fin = espacio; siguiente = espacio + 1; abierto = abiertoEnEspacio; }
    else if (j === i) { fin = siguiente = i + 1; } // no cabe ni un token: no debería pasar, pero avanza
    poner(armarLinea(abrir, tokens.slice(i, fin).join(''), abierto ? '|r' : ''));
    abrir = abierto;
    i = siguiente;
  }
}

// Texto ya escapado -> líneas unidas con \n.
const partir = (s) => s.split('\n').flatMap(partirLinea).join('\n');

// Pasa el texto de la IA al formato del chat del juego. Devuelve el texto en líneas unidas con \n y cada línea vale
// ≤ 450 bytes UTF-8 (el addon parte lo que pase de 500). Topes de la salida final: 4.000 caracteres (`.length`) y
// 12.000 bytes. Si no cabe, se acorta la entrada (terminada en «…») y se vuelve a partir hasta que quepa.
// Tarea 14: `reserva = {caracteres, bytes}` deja ese sitio libre bajo los topes (para un aviso que se añade después).
export function renderizar(texto, { reserva }: { reserva?: any; } = {}) {
  const maxTexto = MAX_TEXTO_JUEGO - Math.max(0, Math.floor(reserva?.caracteres ?? 0));
  const maxBytes = MAX_BYTES_TOTAL - Math.max(0, Math.floor(reserva?.bytes ?? 0));
  // Lo primero: `|` -> `||`, para que la IA no pueda meter códigos de color, enlaces ni texturas.
  let s = String(texto ?? '').replace(/\r/g, '').replace(/\|/g, '||');
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/__([^_\n]+?)__/g, '$1');
  s = s.replace(/^#{1,3}[ \t]+(.+)$/gm, `${COLOR_TITULO}$1|r`);
  s = s.replace(/^[-*][ \t]+/gm, '• ');

  const cabe = (t) => t.length <= maxTexto && bytesDe(t) <= maxBytes;
  let salida = partir(s);
  if (cabe(salida)) return salida;

  const letras = Array.from(s);
  let limite = Math.min(letras.length, maxTexto) - 1;
  while (limite > 0) {
    let v = trozoValido(letras.slice(0, limite).join(''));
    // Un color queda abierto: se cierra antes de la marca.
    const cola = v.abiertos > 0 ? '|r…' : '…';
    salida = partir(v.texto + cola);
    if (cabe(salida)) return salida;
    const exceso = Math.max(salida.length - maxTexto, Math.ceil((bytesDe(salida) - maxBytes) / 3), 1);
    limite -= exceso;
  }
  return '…';
}
