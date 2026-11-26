// Biblioteca de guías: lector de DATOS Lua (literales). La app nunca ejecuta Lua: esto solo lee texto y lo convierte en
// valores de JS; lo que no sea un literal es un error. Sirve para las guías de addons de terceros (4Ever Leveling) que
// traen sus datos en una tabla Lua, sin pasar por el intérprete de base/leer-lua.mjs (que es más estricto a propósito).
//
//   leerSentencias(texto, {nombreArchivo = 'datos.lua', omitir = null}) -> Sentencia[]
//   Sentencia = {nombre: 'a.b.c', args: Valor[]}   (una llamada «a.b.c(…)», «a.b:c(…)», «f{…}» o «f"…"»; NO se llama)
//             | {nombre: 'a.b', valor: Valor}       (una asignación «a.b = …» o «local a = …»)
//
// Valores: cadenas (comillas dobles o simples con todos los escapes de Lua 5.1-5.4, y largas [[…]] / [==[…]==]),
// números (decimales, con exponente, hexadecimales), true, false, nil y tablas. Las claves de tabla: `ident`, [cadena],
// [número], [true|false]. Un `nil` como valor no guarda nada (como en Lua). Forma en JS, la de base/leer-lua.mjs: una
// tabla con las claves 1…n seguidas es un array (el elemento k de Lua es el índice k-1) y cualquier otra, un objeto con
// las claves como texto; la vacía es []. Usa `entradas` de base/leer-lua.mjs para recorrerlas.
// `omitir`: un Set de claves de texto cuyos valores se saltan sin construirlos (para no llenar la memoria con lo que no
// hace falta de un archivo grande); se comprueba que estén bien escritos igual.
// Errores: Error('archivo:línea: …'). Una tabla de más de MAX_HONDO niveles es un error (la pila nunca se desborda).

export const MAX_HONDO = 200;

const esEspacio = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12;
const esInicioIdent = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const esDigito = (c) => c >= 48 && c <= 57;
const esIdent = (c) => esInicioIdent(c) || esDigito(c);
const esHex = (c) => esDigito(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
const RESERVADAS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const NUMERO = /0[xX](?:[0-9a-fA-F]+(?:\.[0-9a-fA-F]*)?|\.[0-9a-fA-F]+)(?:[pP][-+]?\d+)?|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/y;
const ESCAPES = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'", '\n': '\n' };

function poner(objeto, clave, valor) {
  if (clave === '__proto__') Object.defineProperty(objeto, clave, { value: valor, enumerable: true, writable: true, configurable: true });
  else objeto[clave] = valor;
}

// Un número hexadecimal con parte fraccionaria o exponente binario (0x1.8p3), como Lua.
function hexadecimal(s) {
  const m = /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([-+]?\d+))?$/.exec(s);
  let v = m[1] ? parseInt(m[1], 16) : 0;
  if (m[2]) for (let k = 0; k < m[2].length; k++) v += parseInt(m[2][k], 16) / 16 ** (k + 1);
  return m[3] ? v * 2 ** Number(m[3]) : v;
}

export function leerSentencias(texto, { nombreArchivo = 'datos.lua', omitir = null } = {}) {
  const t = String(texto ?? '');
  const n = t.length;
  let i = 0;

  function fallo(pos, mensaje) {
    let linea = 1;
    for (let p = t.indexOf('\n'); p !== -1 && p < pos; p = t.indexOf('\n', p + 1)) linea++;
    throw new Error(`${nombreArchivo}:${linea}: ${mensaje}`);
  }
  const fragmento = (pos) => t.slice(pos, pos + 14).replace(/\s+/g, ' ');

  // El nivel de una cadena o comentario largo en `pos` («[[», «[==[»): su número de «=», o -1 si no lo es.
  function nivelLargo(pos) {
    if (t.charCodeAt(pos) !== 91) return -1;
    let j = pos + 1;
    while (t.charCodeAt(j) === 61) j++;
    return t.charCodeAt(j) === 91 ? j - pos - 1 : -1;
  }

  function largo(nivel) {
    const ini = i;
    i += nivel + 2;
    if (t.charCodeAt(i) === 13) i++;
    if (t.charCodeAt(i) === 10) i++;
    const cierre = `]${'='.repeat(nivel)}]`;
    const fin = t.indexOf(cierre, i);
    if (fin < 0) fallo(ini, 'cadena larga sin cerrar');
    const s = t.slice(i, fin);
    i = fin + cierre.length;
    return s;
  }

  function saltar() {
    for (;;) {
      const c = t.charCodeAt(i);
      if (esEspacio(c)) i++;
      else if (c === 45 && t.charCodeAt(i + 1) === 45) {
        i += 2;
        const nivel = nivelLargo(i);
        if (nivel >= 0) largo(nivel);
        else {
          const fin = t.indexOf('\n', i);
          i = fin === -1 ? n : fin + 1;
        }
      } else return;
    }
  }

  function ident() {
    const ini = i;
    if (!esInicioIdent(t.charCodeAt(i))) fallo(i, `se esperaba un nombre y hay «${fragmento(i)}»`);
    i++;
    while (i < n && esIdent(t.charCodeAt(i))) i++;
    return t.slice(ini, i);
  }

  function cadena() {
    const ini = i;
    const comilla = t.charCodeAt(i);
    i++;
    let r = '';
    let tramo = i;
    for (;;) {
      if (i >= n) fallo(ini, 'cadena sin cerrar');
      const c = t.charCodeAt(i);
      if (c === comilla) {
        r += t.slice(tramo, i);
        i++;
        return r;
      }
      if (c === 10 || c === 13) fallo(ini, 'cadena sin cerrar (salto de línea sin escapar)');
      if (c !== 92) { i++; continue; }
      r += t.slice(tramo, i);
      const e = t[i + 1];
      if (e !== undefined && Object.hasOwn(ESCAPES, e)) { r += ESCAPES[e]; i += 2; }
      else if (e === '\r') { r += '\n'; i += t[i + 2] === '\n' ? 3 : 2; }
      else if (e !== undefined && esDigito(e.charCodeAt(0))) {
        let j = i + 1;
        while (j < n && j < i + 4 && esDigito(t.charCodeAt(j))) j++;
        const codigo = Number(t.slice(i + 1, j));
        if (codigo > 255) fallo(i, `escape no válido «${t.slice(i, j)}»`);
        r += String.fromCharCode(codigo);
        i = j;
      } else if (e === 'x') {
        if (!esHex(t.charCodeAt(i + 2)) || !esHex(t.charCodeAt(i + 3))) fallo(i, `escape no válido «${t.slice(i, i + 4)}»`);
        r += String.fromCharCode(parseInt(t.slice(i + 2, i + 4), 16));
        i += 4;
      } else if (e === 'z') {
        i += 2;
        while (i < n && esEspacio(t.charCodeAt(i))) i++;
      } else if (e === 'u' && t[i + 2] === '{') {
        const fin = t.indexOf('}', i + 3);
        const hex = fin > 0 ? t.slice(i + 3, fin) : '';
        const cp = /^[0-9a-fA-F]{1,8}$/.test(hex) ? parseInt(hex, 16) : NaN;
        if (!(cp >= 0 && cp <= 0x10FFFF)) fallo(i, 'escape \\u no válido');
        r += String.fromCodePoint(cp);
        i = fin + 1;
      } else fallo(i, `escape no válido «${t.slice(i, i + 2)}»`);
      tramo = i;
    }
  }

  function numero() {
    const ini = i;
    let signo = 1;
    if (t.charCodeAt(i) === 45) { signo = -1; i++; saltar(); }
    NUMERO.lastIndex = i;
    const m = NUMERO.exec(t);
    if (!m || esIdent(t.charCodeAt(i + m[0].length))) fallo(ini, `no es un dato «${fragmento(ini)}»`);
    i += m[0].length;
    return signo * (/^0[xX]/.test(m[0]) ? hexadecimal(m[0]) : Number(m[0]));
  }

  // Un valor. `guardar` false: se lee y se comprueba, pero no se construye (devuelve undefined).
  function valor(hondo, guardar) {
    saltar();
    const c = t.charCodeAt(i);
    if (c === 123) return tabla(hondo + 1, guardar);
    if (c === 34 || c === 39) { const s = cadena(); return guardar ? s : undefined; }
    if (c === 91) {
      const nivel = nivelLargo(i);
      if (nivel >= 0) { const s = largo(nivel); return guardar ? s : undefined; }
    }
    if (c === 45 || c === 46 || esDigito(c)) return numero();
    if (esInicioIdent(c)) {
      const ini = i;
      const palabra = ident();
      if (palabra === 'true') return true;
      if (palabra === 'false') return false;
      if (palabra === 'nil') return null;
      fallo(ini, `no es un dato «${fragmento(ini)}»`);
    }
    return fallo(i, i >= n ? 'falta un valor al final' : `no es un dato «${fragmento(i)}»`);
  }

  function claveCorchetes(hondo) {
    i++; // [
    const ini = i;
    const v = valor(hondo, true);
    if (v === null || (typeof v === 'object')) fallo(ini, 'la clave tiene que ser una cadena, un número o un booleano');
    saltar();
    if (t[i] !== ']') fallo(i, `se esperaba «]» y hay «${fragmento(i)}»`);
    i++;
    return String(v);
  }

  function esperarIgual() {
    saltar();
    if (t[i] !== '=' || t[i + 1] === '=') fallo(i, `se esperaba «=» y hay «${fragmento(i)}»`);
    i++;
  }

  function tabla(hondo, guardar) {
    if (hondo > MAX_HONDO) fallo(i, 'tabla demasiado honda');
    const ini = i;
    i++; // {
    let lista; // elementos sin clave, en orden (mientras no haya claves)
    let objeto; // con claves
    let posicion = 0;
    for (;;) {
      saltar();
      if (i >= n) fallo(ini, 'tabla sin cerrar');
      const c = t.charCodeAt(i);
      if (c === 125) { i++; break; }
      let clave;
      if (c === 91 && nivelLargo(i) < 0) {
        clave = claveCorchetes(hondo);
        esperarIgual();
      } else if (esInicioIdent(c)) {
        const ini2 = i;
        const palabra = ident();
        saltar();
        if (t[i] === '=' && t[i + 1] !== '=' && !RESERVADAS.has(palabra)) { i++; clave = palabra; } else i = ini2;
      }
      const guarda = guardar && !(clave !== undefined && omitir?.has(clave));
      const v = valor(hondo, guarda);
      if (clave === undefined) {
        posicion++;
        if (guarda && v !== null && v !== undefined) {
          if (objeto) poner(objeto, String(posicion), v);
          else if (lista && lista.length === posicion - 1) lista.push(v);
          else if (!lista && posicion === 1) lista = [v];
          else {
            objeto = {};
            (lista ?? []).forEach((x, k) => { objeto[k + 1] = x; });
            lista = undefined;
            poner(objeto, String(posicion), v);
          }
        }
      } else if (guarda && v !== null && v !== undefined) {
        if (!objeto) {
          objeto = {};
          (lista ?? []).forEach((x, k) => { objeto[k + 1] = x; });
          lista = undefined;
        }
        poner(objeto, clave, v);
      }
      saltar();
      const s = t[i];
      if (s === ',' || s === ';') i++;
      else if (s !== '}') fallo(i, i >= n ? 'tabla sin cerrar' : `se esperaba «,» o «}» y hay «${fragmento(i)}»`);
    }
    if (!guardar) return undefined;
    if (!objeto) return lista ?? [];
    const claves = Object.keys(objeto);
    for (let k = 1; k <= claves.length; k++) if (!Object.hasOwn(objeto, k)) return objeto;
    const array = new Array(claves.length);
    for (let k = 1; k <= claves.length; k++) array[k - 1] = objeto[k];
    return array;
  }

  // El nombre de una sentencia: «a.b.c», «a.b:c» o «a["b"]» (solo nombres y cadenas; nada de expresiones).
  function nombreDeSentencia() {
    let nombre = ident();
    if (RESERVADAS.has(nombre) && nombre !== 'local') fallo(i - nombre.length, `instrucción no admitida «${fragmento(i - nombre.length)}»`);
    for (;;) {
      saltar();
      if (t[i] === '.' || t[i] === ':') {
        const sep = t[i];
        i++;
        saltar();
        nombre += sep === '.' ? `.${ident()}` : `:${ident()}`;
      } else if (t[i] === '[' && nivelLargo(i) < 0) {
        nombre += `.${claveCorchetes(0)}`;
      } else return nombre;
    }
  }

  const sentencias = [];
  for (;;) {
    saltar();
    if (i >= n) break;
    const ini = i;
    if (!esInicioIdent(t.charCodeAt(i))) fallo(i, `instrucción no admitida «${fragmento(i)}»`);
    let nombre = nombreDeSentencia();
    if (nombre === 'local') {
      saltar();
      nombre = ident();
      esperarIgual();
      sentencias.push({ nombre, valor: valor(0, true) });
    } else if (t[i] === '=' && t[i + 1] !== '=') {
      i++;
      sentencias.push({ nombre, valor: valor(0, true) });
    } else if (t[i] === '(') {
      i++;
      const args = [];
      saltar();
      if (t[i] === ')') i++;
      else {
        for (;;) {
          args.push(valor(0, true));
          saltar();
          if (t[i] === ',') { i++; continue; }
          if (t[i] === ')') { i++; break; }
          fallo(i, i >= n ? 'llamada sin cerrar' : `se esperaba «,» o «)» y hay «${fragmento(i)}»`);
        }
      }
      sentencias.push({ nombre, args });
    } else if (t[i] === '{' || t[i] === '"' || t[i] === "'") {
      sentencias.push({ nombre, args: [valor(0, true)] });
    } else fallo(ini, `instrucción no admitida «${fragmento(ini)}»`);
    saltar();
    if (t[i] === ';') i++;
  }
  return sentencias;
}
