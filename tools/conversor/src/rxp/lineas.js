// Lectura de una línea suelta dentro de un paso de una guía de RestedXP.
// No interpreta comandos ni filtros: guarda los argumentos y el filtro `<<` como texto.
// Orden de reconocimiento (igual que `parseLine` del original, GuideLoader.lua:977-1087):
// filtro `<<`, etiqueta `#tag`, texto `>>`, comando `.cmd`, solo texto, `+manual`, `*nota`.

// Comandos que no se trocean por comas (plano 2 §14).
const RESTO_ENTERO = new Set(['link', 'clicknext']);
const SEPARA_PUNTO_Y_COMA = new Set(['target', 'mob', 'unitscan']);

/** Quita el comentario `--` hasta el final de la línea. */
export function quitarComentario(texto) {
  const i = texto.indexOf('--');
  return i < 0 ? texto : texto.slice(0, i);
}

/** Separa el filtro `<< ...` (todo lo que hay tras el primer `<<`) y lo devuelve en crudo. */
export function separarFiltro(texto) {
  const i = texto.indexOf('<<');
  if (i < 0) return { resto: texto.trim() };
  const filtro = texto.slice(i + 2).trim();
  const resto = texto.slice(0, i).trim();
  return filtro === '' ? { resto } : { resto, filtro };
}

/** Trocea los argumentos de un comando; los trozos vacíos se descartan. */
export function trocearArgs(nombre, texto) {
  const t = texto.trim();
  if (RESTO_ENTERO.has(nombre)) return t === '' ? [] : [t];
  const sep = SEPARA_PUNTO_Y_COMA.has(nombre) ? ';' : ',';
  return t.split(sep).map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * Analiza una línea ya recortada de un paso. `textoLinea` puede traer todavía el comentario.
 * `ctx.avisos` (opcional) recibe los avisos; `ctx.archivo` los acompaña.
 * Devuelve la `Linea` o `null` si la línea está vacía, es solo un comentario o no se reconoce
 * (en ese caso añade un aviso).
 */
export function analizarLinea(textoLinea, linea, ctx = {}) {
  const limpia = quitarComentario(textoLinea).trim();
  if (limpia === '') return null;

  const { resto: sinFiltro, filtro } = separarFiltro(limpia);
  const conFiltro = (obj) => (filtro === undefined ? obj : { ...obj, filtro });
  const sal = (obj) => conFiltro({ ...obj, linea });

  // Etiqueta de paso: `#nombre valor` (el nombre llega hasta el primer espacio).
  const t = /^#(\S+)\s*(=?)\s*(.*)$/.exec(sinFiltro);
  if (t) return sal({ tipo: 'tag', nombre: t[1], texto: t[3] });

  // Texto tras el primer `>>`.
  let delante = sinFiltro;
  let texto;
  const m = sinFiltro.indexOf('>>');
  if (m >= 0) {
    texto = sinFiltro.slice(m + 2).trim();
    if (texto === '') texto = undefined;
    delante = sinFiltro.slice(0, m).trim();
  }

  const c = /^\.(\S+)\s*(.*)$/.exec(delante);
  if (c) {
    const l = { tipo: 'cmd', nombre: c[1], args: trocearArgs(c[1], c[2]) };
    if (texto !== undefined) l.texto = texto;
    return sal(l);
  }
  if (texto !== undefined) return sal({ tipo: 'texto', texto });
  if (delante.startsWith('+')) return sal({ tipo: 'manual', texto: delante.slice(1).trim() });
  if (delante.startsWith('*')) return sal({ tipo: 'nota', texto: delante.slice(1).trim() });

  if (ctx.avisos) {
    ctx.avisos.push({ archivo: ctx.archivo ?? '', linea, mensaje: `Línea no reconocida: "${limpia}"` });
  }
  return null;
}
