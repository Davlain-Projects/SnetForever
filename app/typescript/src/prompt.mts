// Instrucciones del sistema y entrada de cada turno para la IA (Claude, Codex o TATI: no dependen del motor).
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// Las instrucciones: texto fijo, el mismo para cualquier motor.
export const SISTEMA = readFileSync(new URL('./prompt/sistema.md', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------------------------------------------------
// Instrucciones por partes para TATI. En TATI, las instrucciones del chat del juego se releen en cada llamada al modelo
// de la sesión (y las paga el jugador con su suscripción): le llega un núcleo fijo y los temas grandes los pide con la
// herramienta `instrucciones({tema})` (herramientas/catalogo.mjs). Todo sale de sistema.md partido por sus `## `: aquí
// no se copia ninguna regla. El chat propio de la app (Claude o Codex directos) sigue con SISTEMA entero.
//
//   TEMAS        [{tema, titulo, cuando}]: las secciones que van aparte («Campos de los datos» no: los datos vienen en
//                cada turno y hacen falta siempre para leerlos bien, así que va en el núcleo) (`titulo`, el de su `## ` en español, sin el
//                paréntesis) y cuándo pedir cada una (la línea del índice)
//   buscarTema(tema) -> el de TEMAS | null;  textoDeTema(tema) -> el texto de esa sección tal cual (desde su `## `, con saltos de línea \n) | null. Vale la clave
//                (`pines_rutas`) o el título, sin mirar mayúsculas ni espacios de más.
//   SISTEMA_TATI el principio de sistema.md, las secciones que no son temas (en su orden), la chuleta del bloque snet
//                (líneas de «Pines y rutas» tal cual) y el índice. Fijo: el mismo en todos los turnos (TATI solo
//                vuelve a mandar sus instrucciones si cambian).
// ---------------------------------------------------------------------------------------------------------------------
const TEXTO = SISTEMA.replace(/\r\n/g, '\n');
const PARTES = TEXTO.split(/^(?=## )/m);
const tituloDe = (seccion) => seccion.split('\n')[0].replace(/^## /, '').replace(/ \(.*$/, '').trim();
const SECCIONES = new Map(PARTES.slice(1).map((s) => [tituloDe(s), s.trimEnd()]));

export const TEMAS = Object.freeze([
  { tema: 'pines_rutas', titulo: 'Pines y rutas',
    cuando: 'antes de poner en el bloque `snet` una `ruta`, `pines`, `pinesWeb`, `rutaZona`, `abrirGuia` o `guiaNueva`, y para un plan de subida, un speed run o una ruta de entregas' },
  { tema: 'inventario', titulo: 'Inventario',
    cuando: 'antes de aconsejar qué vender, guardar, usar o equipar, o de poner `marcas`' },
  { tema: 'talentos', titulo: 'Talentos, profesiones y subasta',
    cuando: 'antes de hablar de sus talentos, de sus profesiones o de los precios de la subasta' },
  { tema: 'comercio', titulo: 'Comercio',
    cuando: 'antes de hablar de `datos.comercio` o de proponer un grupo o una regla de compra (`comercio`)' },
  { tema: 'misiones_fuera', titulo: 'Misiones que no están en la base',
    cuando: 'cuando una misión no está en la base o viene `datos.misionApi`' },
].map((t) => Object.freeze(t)));

const normal = (v) => String(v).trim().replace(/\s+/g, ' ').toLowerCase();

/** El tema de TEMAS por su clave o su título (sin mirar mayúsculas ni espacios de más) | null. */
export function buscarTema(tema) {
  if (typeof tema !== 'string' || tema.trim() === '') return null;
  const t = normal(tema);
  return TEMAS.find((x) => x.tema === t || normal(x.titulo) === t) ?? null;
}

export function textoDeTema(tema) {
  const hallado = buscarTema(tema);
  return hallado ? SECCIONES.get(hallado.titulo) ?? null : null;
}

// La chuleta: estas líneas de «Pines y rutas», tal cual y en su orden, más el primer ejemplo del bloque (con su valla).
// Si alguien cambia el principio de una de ellas en sistema.md, la app no arranca con una chuleta a medias: las pruebas
// (test/prompt-tati.test.js) lo cogen antes.
const CHULETA = [
  '- **Los sitios de la base van con `P#`.**', '- Places from the data go with their `P#` ids',
  '- Como mucho un bloque `snet` por respuesta', '```snet', '  - `ruta`:', '  - `pines`:', '  - `marcas`:', '  - `guia`:',
  '  - `comercio`:', '  - `abrirGuia`:', '- Los `P#` y los objetos que no estén en los datos del turno se descartan',
  '- Cuando propongas una ruta o pines, dilo también en el texto en una frase',
];

function chuleta() {
  const lineas = (SECCIONES.get('Pines y rutas') ?? '').split('\n');
  const salida = [];
  for (const prefijo of CHULETA) {
    const i = lineas.findIndex((l) => l.startsWith(prefijo));
    if (i < 0) throw new Error(`sistema.md: falta en «Pines y rutas» la línea «${prefijo}»`);
    if (prefijo !== '```snet') {
      salida.push(lineas[i]);
      continue;
    }
    const fin = lineas.findIndex((l, j) => j > i && l === '```');
    if (fin < 0) throw new Error('sistema.md: el ejemplo del bloque snet no se cierra');
    salida.push('', ...lineas.slice(i, fin + 1), '');
  }
  return salida.join('\n');
}

function construirSistemaTati() {
  for (const t of TEMAS) if (!SECCIONES.has(t.titulo)) throw new Error(`sistema.md: falta la sección «${t.titulo}»`);
  const temas = new Set(TEMAS.map((t) => t.titulo));
  const nucleo = [...SECCIONES].filter(([titulo]) => !temas.has(titulo)).map(([, s]) => s);
  const lista = TEMAS.map((t) => `\`${t.tema}\``).join(', ');
  return [
    PARTES[0].trimEnd(),
    ...nucleo,
    '## El bloque `snet`, en corto (The `snet` block, in short)',
    chuleta(),
    '## Temas aparte (Topics on demand)',
    'Estas instrucciones no traen todas las reglas: las de cada tema siguiente están aparte y valen igual que estas. Antes '
      + 'de poner pines, rutas o `guiaNueva` en el bloque `snet`, o de hablar de inventario, talentos, profesiones, subasta o '
      + `comercio, consulta el tema con la herramienta \`instrucciones\` (\`{"tema": "<tema>"}\`; temas: ${lista}). Si ya lo `
      + 'tienes en esta conversación, no lo pidas otra vez. Before pins, routes, `guiaNueva`, inventory, talents, '
      + 'professions, auction or trade, read the topic with the `instrucciones` tool.',
    TEMAS.map((t) => `- \`${t.tema}\` («${t.titulo}»): ${t.cuando}.`).join('\n'),
  ].join('\n\n');
}

export const SISTEMA_TATI = construirSistemaTati();

// Nada de lo que viene del juego o del jugador puede cerrar el bloque de datos antes de tiempo.
export const neutralizar = (texto) => String(texto).replace(/<\/datos_juego/gi, '<\\/datos_juego');

/** S5: el bloque de datos del juego con un id nuevo: `<datos_juego id="…">`, los datos en JSON y su cierre (3 líneas). */
export function bloqueDatos(datos) {
  const id = randomBytes(4).toString('hex');
  return [`<datos_juego id="${id}">`, neutralizar(JSON.stringify(datos ?? {})), `</datos_juego id="${id}">`].join('\n');
}

const ROLES_IA = new Set(['ia', 'assistant']);

// Prueba B (15-nov, en el juego con haiku): con las herramientas conectadas la IA contestaba sin llamar a ninguna. Con
// ellas, justo antes de la pregunta va esta línea fija de la app (sistema.md la explica en «Cómo viene el mensaje»).
export const LINEA_HERRAMIENTAS = 'Herramientas de SnetForever disponibles: úsalas antes de responder '
  + '(guía, ruta o «qué hago aquí»: primero buscar_guias; un sitio: pnj, mision o como_llegar).';

// historial: [{rol: 'jugador'|'ia', texto}] en orden; texto: la pregunta nueva del jugador.
// herramientas: true solo cuando la pregunta va con el servidor de guías (Claude); con Codex o sin ellas, nada.
export function construirEntrada({ datos, historial = [], texto = '', herramientas = false }) {
  const partes = [bloqueDatos(datos), ''];
  for (const h of historial) {
    if (!h || typeof h.texto !== 'string') continue;
    partes.push(`${ROLES_IA.has(h.rol) ? 'IA' : 'Jugador'}: ${neutralizar(h.texto)}`);
  }
  if (historial.length > 0) partes.push('');
  if (herramientas === true) partes.push(LINEA_HERRAMIENTAS);
  partes.push('Pregunta del jugador:', neutralizar(texto));
  return partes.join('\n');
}
