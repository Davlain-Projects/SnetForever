// Lectura de guías de RestedXP: saca el texto de cada `RegisterGuide([[...]])` y lo separa
// en cabecera, pasos y líneas. No interpreta filtros ni comandos (lo hacen otras tareas).
// Fuente de las reglas: docs/plano-restedxp/1-cargador-y-pasos.md §1.
import { analizarLinea, quitarComentario, separarFiltro } from './lineas.js';

const INICIO = /RegisterGuide\s*\(\s*\[(=*)\[/g;

/**
 * Devuelve el contenido de cada `RegisterGuide([[...]])` (también `[=[...]=]`) como
 * `{texto, lineaInicial}`. `lineaInicial` es la línea (1 = primera del archivo) donde empieza
 * el texto: Lua descarta el salto de línea que sigue justo a `[[`. El código Lua que rodea
 * las guías se ignora.
 *
 * Una `RegisterGuide([[` sin su cierre lanza un error con el archivo y la línea (decisión de la ronda
 * final): en el juego el archivo entero no compila y RestedXP no carga ninguna de sus guías, así que
 * no se puede convertir «lo que haya» sin apartarse del original, y tampoco dejarla desaparecer.
 * @param {string} texto
 * @param {{archivo?: string}} [opciones] `archivo` solo sirve para el mensaje de error
 */
export function extraerGuias(texto, { archivo = '(texto)' } = {}) {
  const guias = [];
  INICIO.lastIndex = 0;
  let m;
  while ((m = INICIO.exec(texto)) !== null) {
    const cierre = `]${m[1]}]`;
    let ini = m.index + m[0].length;
    const fin = texto.indexOf(cierre, ini);
    let linea = 1;
    for (let i = 0; i < ini; i++) if (texto[i] === '\n') linea++;
    if (fin < 0) {
      throw new Error(`${archivo}, línea ${linea}: RegisterGuide sin cerrar (falta «${cierre}»); en el juego este archivo no carga`);
    }
    const salto = /^\r?\n/.exec(texto.slice(ini, fin));
    if (salto) {
      ini += salto[0].length;
      linea++;
    }
    guias.push({ texto: texto.slice(ini, fin), lineaInicial: linea });
    INICIO.lastIndex = fin + cierre.length;
  }
  return guias;
}

/**
 * Separa una guía en cabecera (todo lo anterior al primer `step`), pasos y líneas.
 * Los filtros `<<` y los argumentos se guardan en crudo. `linea` es el número de línea en el
 * ARCHIVO: `lineaInicial` es la línea donde empieza `texto` (1 por defecto).
 * @returns {{cabecera: object[], filtroGuia?: string, pasos: object[], avisos: object[]}}
 */
export function analizarGuia(texto, { archivo = '', lineaInicial = 1 } = {}) {
  const avisos = [];
  const cabecera = [];
  const pasos = [];
  let filtroGuia;
  let paso = null;

  texto.split(/\r\n|\r|\n/).forEach((cruda, i) => {
    const linea = lineaInicial + i;
    const limpia = quitarComentario(cruda).trim();
    if (limpia === '') return;

    // Igual que el original: cualquier línea que empiece por `step` abre un paso
    // (aquí exigimos que no siga una letra, para que «steps...» dé aviso en vez de abrir paso).
    if (/^step(?![A-Za-z0-9_])/.test(limpia)) {
      const { filtro } = separarFiltro(limpia.slice(4));
      paso = { linea, ...(filtro === undefined ? {} : { filtro }), lineas: [] };
      pasos.push(paso);
      return;
    }

    if (paso) {
      const l = analizarLinea(limpia, linea, { archivo, avisos });
      if (l) paso.lineas.push(l);
      return;
    }

    // Cabecera.
    if (limpia.startsWith('<<')) {
      const { filtro } = separarFiltro(limpia);
      if (filtro !== undefined && filtroGuia === undefined) filtroGuia = filtro;
      return;
    }
    const { resto, filtro } = separarFiltro(limpia);
    const t = /^#(\S+)\s*(=?)\s*(.*)$/.exec(resto);
    if (t) {
      cabecera.push({ tag: t[1], valor: t[3], ...(filtro === undefined ? {} : { filtro }), linea });
      return;
    }
    avisos.push({ archivo, linea, mensaje: `Línea de cabecera no reconocida: "${limpia}"` });
  });

  return { cabecera, ...(filtroGuia === undefined ? {} : { filtroGuia }), pasos, avisos };
}
