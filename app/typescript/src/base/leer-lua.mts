// Intérprete mínimo de los datos Lua de SnetForever_Misiones (la app nunca ejecuta Lua: solo lee este subconjunto).
//
// Instrucciones admitidas (una tras otra, con comentarios `--…` entre ellas):
//   SNF_MISIONES = <tabla>
//   local T = SNF_MISIONES(.<campo>)+
//   T[<entero>] = <tabla>      (también T["cadena"] = <tabla>: así van las guías de guias_<n>.lua)
// Una tabla solo lleva cadenas con los escapes de tools/conversor/src/salida/lua.js (\\ \" \n \r \ddd), números,
// true/false, `nil` sin clave (un hueco de una lista, como los escribe WoW), otras tablas y claves `ident`, `[entero]` o `["cadena"]`. Cualquier otra cosa da un error «archivo:línea: …».
// Con el mismo intérprete, leerVariablesGuardadas lee los SavedVariables de WoW (`<global> = <valor>`, fase 5).
//
// Forma en JS: una tabla con las claves 1…n seguidas es un array (¡el elemento k de Lua es el índice k-1!; `elemento()`
// resuelve las dos formas) y cualquier otra tabla es un objeto con las claves como texto. La tabla vacía es [], salvo
// las que cuelgan de un `local T = …`, que pasan a ser objetos para poder rellenarlas con T[n] = ….

// El elemento de clave `k` (entero de Lua, desde 1) de una tabla leída: array u objeto.
export function elemento(tabla, k) {
  if (Array.isArray(tabla)) return tabla[k - 1];
  if (tabla && typeof tabla === 'object') return tabla[k];
  return undefined;
}

// Las entradas [kLua, valor] de una tabla leída, con la clave de Lua: entero (desde 1) si la tabla salió como array o
// la clave es un entero, y texto en otro caso. Sirve para las dos formas; úsala en vez de Object.entries/values.
export function entradas(tabla) {
  if (Array.isArray(tabla)) return tabla.map((v, i) => [i + 1, v]);
  if (tabla && typeof tabla === 'object') {
    return Object.entries(tabla).map(([k, v]) => [/^-?\d+$/.test(k) ? Number(k) : k, v]);
  }
  return [];
}

const esEspacio = (c) => c === 32 || c === 9 || c === 10 || c === 13;
const esInicioIdent = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const esDigito = (c) => c >= 48 && c <= 57;
const esIdent = (c) => esInicioIdent(c) || esDigito(c);
const NUMERO = /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/y;
const ENTERO = /-?\d+/y;

// Pone una clave sin tocar el prototipo (una clave «__proto__» es una clave más).
function poner(objeto, clave, valor) {
  if (clave === '__proto__') Object.defineProperty(objeto, clave, { value: valor, enumerable: true, writable: true, configurable: true });
  else objeto[clave] = valor;
}

// El intérprete en sí: las piezas que comparten ejecutarDatos y leerVariablesGuardadas (mismos valores, mismos errores
// «archivo:línea: …»). `actual()`, `avanzar()` y `alFinal()` dejan a cada uno recorrer sus propias instrucciones.
function crearLector(texto, nombreArchivo) {
  let i = 0;
  const n = texto.length;

  function fallo(pos, mensaje) {
    let linea = 1;
    for (let p = texto.indexOf('\n'); p !== -1 && p < pos; p = texto.indexOf('\n', p + 1)) linea++;
    throw new Error(`${nombreArchivo}:${linea}: ${mensaje}`);
  }
  const fragmento = (pos) => texto.slice(pos, pos + 14).replace(/\s+/g, ' ');

  function saltar() {
    for (;;) {
      const c = texto.charCodeAt(i);
      if (esEspacio(c)) i++;
      else if (c === 45 && texto.charCodeAt(i + 1) === 45) {
        const fin = texto.indexOf('\n', i);
        i = fin === -1 ? n : fin + 1;
      } else return;
    }
  }

  function ident() {
    const ini = i;
    if (!esInicioIdent(texto.charCodeAt(i))) fallo(i, `se esperaba un nombre y hay «${fragmento(i)}»`);
    i++;
    while (i < n && esIdent(texto.charCodeAt(i))) i++;
    return texto.slice(ini, i);
  }

  function esperar(caracter, contexto?: any) {
    saltar();
    if (texto[i] !== caracter) fallo(i, `se esperaba «${caracter}»${contexto ? ` ${contexto}` : ''} y hay «${fragmento(i)}»`);
    i++;
  }

  function cadena() {
    const ini = i;
    i++; // la comilla de apertura
    let r = '';
    let tramo = i;
    for (;;) {
      if (i >= n) fallo(ini, 'cadena sin cerrar');
      const c = texto.charCodeAt(i);
      if (c === 34) {
        r += texto.slice(tramo, i);
        i++;
        return r;
      }
      if (c === 10) fallo(ini, 'cadena sin cerrar (salto de línea sin escapar)');
      if (c !== 92) {
        i++;
        continue;
      }
      r += texto.slice(tramo, i);
      const e = texto[i + 1];
      if (e === '\\' || e === '"') { r += e; i += 2; }
      else if (e === 'n') { r += '\n'; i += 2; }
      else if (e === 'r') { r += '\r'; i += 2; }
      else if (e !== undefined && esDigito(e.charCodeAt(0))) {
        let j = i + 1;
        while (j < n && j < i + 4 && esDigito(texto.charCodeAt(j))) j++;
        const codigo = Number(texto.slice(i + 1, j));
        if (codigo > 255) fallo(i, `escape no admitido «${texto.slice(i, j)}»`);
        r += String.fromCharCode(codigo);
        i = j;
      } else fallo(i, `escape no admitido «${texto.slice(i, i + 2)}»`);
      tramo = i;
    }
  }

  function numero() {
    NUMERO.lastIndex = i;
    const m = NUMERO.exec(texto);
    if (!m) fallo(i, `no admitido «${fragmento(i)}»`);
    i += m[0].length;
    return Number(m[0]);
  }

  function valor() {
    saltar();
    const c = texto.charCodeAt(i);
    if (c === 123) return tabla();
    if (c === 34) return cadena();
    if (c === 45 || esDigito(c)) return numero();
    if (esInicioIdent(c)) {
      const ini = i;
      const palabra = ident();
      if (palabra === 'true') return true;
      if (palabra === 'false') return false;
      fallo(ini, `no admitido «${fragmento(ini)}»`);
    }
    return fallo(i, `no admitido «${fragmento(i)}»`);
  }

  // Clave entre corchetes: entero o cadena. Devuelve el texto de la clave.
  function claveCorchetes() {
    i++; // [
    saltar();
    let clave;
    if (texto.charCodeAt(i) === 34) clave = cadena();
    else {
      ENTERO.lastIndex = i;
      const m = ENTERO.exec(texto);
      if (!m || texto[i + m[0].length] === '.') fallo(i, `la clave tiene que ser un entero o una cadena y hay «${fragmento(i)}»`);
      clave = m[0];
      i += clave.length;
    }
    esperar(']');
    return clave;
  }

  function tabla() {
    i++; // {
    let lista; // elementos sin clave, en orden
    let objeto; // elementos con clave
    let posicion = 0;
    for (;;) {
      saltar();
      const c = texto.charCodeAt(i);
      if (c === 125) { i++; break; }
      if (i >= n) fallo(i, 'tabla sin cerrar');
      let clave;
      let hueco = false;
      if (c === 91) {
        clave = claveCorchetes();
        esperar('=');
      } else if (esInicioIdent(c)) {
        // ¿Clave `ident =` o valor suelto (true, false)?
        const ini = i;
        const palabra = ident();
        saltar();
        if (texto[i] === '=' && texto[i + 1] !== '=') { i++; clave = palabra; } else if (palabra === 'nil') hueco = true; else i = ini;
      }
      if (hueco) {
        // Un `nil` sin clave (así escribe WoW los huecos de una lista): ocupa su posición y no guarda nada. La tabla ya
        // no es una lista seguida, así que pasa a objeto.
        posicion++;
        if (!objeto) {
          objeto = {};
          if (lista) lista.forEach((x, k) => { objeto[k + 1] = x; });
        }
      } else if (clave === undefined) {
        const v = valor();
        posicion++;
        if (objeto) poner(objeto, String(posicion), v);
        else (lista ??= []).push(v);
      } else {
        const v = valor();
        if (!objeto) {
          objeto = {};
          if (lista) lista.forEach((x, k) => { objeto[k + 1] = x; });
        }
        poner(objeto, clave, v);
      }
      saltar();
      const s = texto[i];
      if (s === ',' || s === ';') i++;
      else if (s !== '}') fallo(i, `se esperaba «,» o «}» y hay «${fragmento(i)}»`);
    }
    if (!objeto) return lista ?? [];
    // ¿Son las claves 1…n seguidas? Entonces es un array.
    const claves = Object.keys(objeto);
    let seguidas = claves.length > 0;
    for (let k = 1; seguidas && k <= claves.length; k++) if (!Object.hasOwn(objeto, k)) seguidas = false;
    if (!seguidas) return objeto;
    const array = new Array(claves.length);
    for (let k = 1; k <= claves.length; k++) array[k - 1] = objeto[k];
    return array;
  }

  return {
    fallo, fragmento, saltar, ident, esperar, valor, tabla, claveCorchetes,
    pos: () => i,
    actual: () => texto[i],
    avanzar: () => { i++; },
    alFinal: () => i >= n,
  };
}

// Las globales que pueden definir los archivos de datos: la base de misiones y (2.ª ronda) las guías de SnetForever_Rutas.
const RAICES = new Set(['SNF_MISIONES', 'SNF_RUTAS']);

export function ejecutarDatos(texto, raiz, nombreArchivo = 'datos.lua') {
  const { fallo, fragmento, saltar, ident, esperar, tabla, claveCorchetes, pos, actual: car, avanzar, alFinal } = crearLector(texto, nombreArchivo);
  const alias = new Map(); // nombre local -> tabla
  for (;;) {
    saltar();
    if (alFinal()) break;
    const ini = pos();
    const palabra = ident();
    if (RAICES.has(palabra)) {
      esperar('=', `tras ${palabra}`);
      saltar();
      if (car() !== '{') fallo(pos(), `se esperaba una tabla y hay «${fragmento(pos())}»`);
      raiz[palabra] = tabla();
    } else if (palabra === 'local') {
      saltar();
      const nombre = ident();
      esperar('=');
      saltar();
      const posRaiz = pos();
      const deRaiz = ident();
      if (!RAICES.has(deRaiz)) fallo(posRaiz, `solo se admite «local ${nombre} = SNF_MISIONES…» y hay «${fragmento(posRaiz)}»`);
      if (!raiz[deRaiz] || typeof raiz[deRaiz] !== 'object') fallo(posRaiz, `${deRaiz} no está definido todavía`);
      let padre = raiz;
      let clavePadre = deRaiz;
      let actual = raiz[deRaiz];
      let ruta = deRaiz;
      // Revisión: también con corchetes («SNF_RUTAS.guias["…"].pasos»: los pasos de una guía que no cupo en un archivo).
      while (car() === '.' || car() === '[') {
        let campo;
        if (car() === '[') {
          campo = claveCorchetes();
          ruta += `[${JSON.stringify(campo)}]`;
        } else {
          avanzar();
          campo = ident();
          ruta += `.${campo}`;
        }
        if (!actual || typeof actual !== 'object' || !Object.hasOwn(actual, campo)) fallo(posRaiz, `no existe «${ruta}»`);
        padre = actual;
        clavePadre = campo;
        actual = actual[campo];
      }
      if (!actual || typeof actual !== 'object') fallo(posRaiz, `«${ruta}» no es una tabla`);
      if (Array.isArray(actual)) {
        if (actual.length > 0) fallo(posRaiz, `«${ruta}» no es una tabla con claves sueltas`);
        actual = {};
        poner(padre, clavePadre, actual);
      }
      alias.set(nombre, actual);
    } else {
      saltar();
      if (!alias.has(palabra) || car() !== '[') fallo(ini, `instrucción no admitida «${fragmento(ini)}»`);
      const destino = alias.get(palabra);
      const clave = claveCorchetes();
      esperar('=');
      saltar();
      if (car() !== '{') fallo(pos(), `se esperaba una tabla y hay «${fragmento(pos())}»`);
      poner(destino, clave, tabla());
    }
    saltar();
    if (car() === ';') avanzar();
  }
  return raiz;
}

/**
 * SavedVariables de WoW (fase 5, tarea 11): lee las sentencias de primer nivel `<global> = <tabla|cadena|número|booleano>`
 * (con los comentarios `-- [1]` que escribe WoW) y devuelve el valor de la global `nombre`, o undefined si el archivo no
 * la trae. Las demás se leen y se saltan (solo hace falta que estén bien escritas). Si una global sale dos veces, manda
 * la última, como en Lua. Mismo intérprete y mismos errores «archivo:línea: …» que ejecutarDatos.
 */
export function leerVariablesGuardadas(texto, nombre, nombreArchivo = 'SnetForever.lua') {
  const { fallo, fragmento, saltar, ident, esperar, valor, pos, actual: car, avanzar, alFinal } = crearLector(texto, nombreArchivo);
  let encontrado;
  for (;;) {
    saltar();
    if (alFinal()) break;
    const ini = pos();
    const global = ident();
    saltar();
    if (car() !== '=' || global === 'local') fallo(ini, `instrucción no admitida «${fragmento(ini)}»`);
    esperar('=', `tras ${global}`);
    const v = valor();
    if (global === nombre) encontrado = v;
    saltar();
    if (car() === ';') avanzar();
  }
  return encontrado;
}
