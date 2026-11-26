// Serializador JS -> Lua 5.1: solo genera constructores de tabla, cadenas, números y booleanos.

const IDENTIFICADOR = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PALABRAS_RESERVADAS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
]);
const ENTERO_CLAVE = /^(0|-?[1-9][0-9]*)$/;

function cadenaLua(s) {
  let r = '"';
  for (const c of s) {
    if (c === '\\') r += '\\\\';
    else if (c === '"') r += '\\"';
    else if (c === '\n') r += '\\n';
    else if (c === '\r') r += '\\r';
    else if (c === '\0') r += '\\000'; // tres dígitos: si sigue un dígito, Lua no lo absorbe
    else r += c;
  }
  return r + '"';
}

function numeroLua(n) {
  if (!Number.isFinite(n)) throw new Error(`No se puede escribir en Lua el número ${n}`);
  // Los enteros se escriben exactos con String(n); sin notación científica hasta 1e21.
  if (Number.isInteger(n) && Math.abs(n) >= 1e21) {
    return BigInt(n).toString();
  }
  return String(n);
}

function claveLua(k) {
  if (IDENTIFICADOR.test(k) && !PALABRAS_RESERVADAS.has(k)) return k;
  if (ENTERO_CLAVE.test(k)) return `[${k}]`;
  return `[${cadenaLua(k)}]`;
}

export function aLua(valor) {
  switch (typeof valor) {
    case 'string': return cadenaLua(valor);
    case 'number': return numeroLua(valor);
    case 'bigint': return valor.toString();
    case 'boolean': return valor ? 'true' : 'false';
    case 'object': break;
    default:
      throw new Error(`No se puede escribir en Lua un valor de tipo ${typeof valor}`);
  }
  if (valor === null) throw new Error('No se puede escribir null en Lua (omite la clave)');
  if (Array.isArray(valor)) {
    // Array.from convierte los huecos de arrays dispersos en undefined.
    const elementos = Array.from(valor);
    const hayHuecos = elementos.some((v) => v === undefined || v === null);
    if (!hayHuecos) return `{${elementos.map(aLua).join(',')}}`;
    const partes = [];
    elementos.forEach((v, i) => {
      if (v !== undefined && v !== null) partes.push(`[${i + 1}]=${aLua(v)}`);
    });
    return `{${partes.join(',')}}`;
  }
  const proto = Object.getPrototypeOf(valor);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`No se puede escribir en Lua un objeto de tipo ${valor.constructor?.name ?? 'desconocido'}`);
  }
  const partes = [];
  for (const [k, v] of Object.entries(valor)) {
    if (v === undefined || v === null) continue;
    partes.push(`${claveLua(k)}=${aLua(v)}`);
  }
  return `{${partes.join(',')}}`;
}
