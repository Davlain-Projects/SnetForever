// Ranuras de precios: la app deja la foto de precios de la subasta en SnetForever_P01…P08 (cada una con p1.lua…p6.lua),
// y el addon las carga con el juego abierto (LoadOnDemand). Cada foto va a la ranura de su hora ((hora UTC absoluta % 8) + 1), así
// /reload carga la de la hora actual sin pisar la que ya está cargada.
//
// Formato (el addon lo lee tal cual):
//   SNF_PRECIOS = {v = 1, seq, generado, region, conocidas = {["<reino>|<faccion>"] = casa}, casas = {}, grupos = {…},
//                  nombres = {}}
//   grupos es la lista del catálogo: {{clave, nombre = {es, en}, tipo, objetos = {ids…}}, …}.
//   SNF_PRECIOS.casas[casa][item] = {precio, cantidad, normal, tendencia, ritmo, vendidosDia, poco, subastas, conTendencia,
//                                    mercancia?}
//     · precio es la compra mínima (la unidad más barata), cantidad las unidades y subastas cuántas subastas son;
//       normal es el valor de mercado. Qué mide cada número: la cabecera de historial.mjs.
//     · ritmo y vendidosDia valen -1 cuando no hay dato; poco es 1 o 0.
//     · tendencia: si la app no la tiene (null) se escribe 0, y conTendencia dice si se sabe (1) o no (0).
//     · subastas y conTendencia son de T1b: van los dos o ninguno (una fila de 7 es de una app de antes, y el addon la
//       lee igual; un addon de antes no mira más allá del 7.º).
//     · mercancia (F5): 1 si el objeto es una mercancía (sus «salen al día» no cuentan las cancelaciones de encima de lo
//       más barato que sigue intacto, ver historial.mjs); en un objeto suelto no se escribe y la fila se queda en 9. Solo
//       va detrás de subastas y conTendencia. Un addon de antes no lo mira.
//   SNF_PRECIOS.nombres[item] = "nombre" (los nombres de los objetos, para listas sin consultar al juego).
//   F7: casas puede traer varias (la propia, la neutral y, si caben, la de la otra facción: programador.mjs las elige,
//   MAX_CASAS_RANURA), cada una con sus filas; conocidas dice de qué "<reino>|<faccion>" es cada una. El formato no cambia.
// p1.lua abre la tabla solo si no hay ninguna cargada o la cargada tiene un seq menor; los demás archivos solo añaden
// datos si SNF_PRECIOS.seq es el suyo, así una ranura vieja nunca pisa una más nueva.
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { luaCadena, aLuaSeguro, escribirAtomico, dormirReal } from '../buzon.mjs';
import { carpetaSegura, crearReintentador, cuarentenaDelVolumen, fallo } from '../fsseguro.mjs';

export const RANURAS_PRECIOS = 8;
export const ARCHIVOS_POR_RANURA = 6;
export const LIMITE_BYTES = 500000; // un archivo Lua de la ranura no pasa de este tamaño
export const LIMITE_CONSTANTES = 50000; // ni de estas constantes distintas (Lua 5.1 tiene un tope por función)
const MARGEN_BYTES = 1024;
const MARGEN_CONSTANTES = 64;
const INTERFAZ_POR_DEFECTO = '16001';

export const nombreRanuraPrecios = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;

/** El .toc de la ranura de precios `i`: carga bajo demanda, depende de SnetForever y lista p1.lua…p6.lua. */
export function tocPrecios(i, interfaz = INTERFAZ_POR_DEFECTO) {
  const n = String(i).padStart(2, '0');
  return [
    `## Interface: ${interfaz}`,
    `## Title: SnetForever - Precios ${n}`,
    '## Notes: Trae al juego los precios de la subasta que descarga la app de SnetForever. Déjalo activado.',
    '## LoadOnDemand: 1',
    '## Dependencies: SnetForever',
    '## Group: SnetForever',
    '## X-License: MIT',
    '## IconTexture: Interface\\AddOns\\SnetForever\\recursos\\icono',
    '',
    ...Array.from({ length: ARCHIVOS_POR_RANURA }, (_, k) => `p${k + 1}.lua`),
    '',
  ].join('\n');
}

const bytes = (t) => Buffer.byteLength(t, 'utf8');
const numero = (n, que) => {
  if (!Number.isFinite(n)) throw fallo('LUA_TIPO', `precios: ${que} no es un número`);
  return n === 0 ? 0 : n;
};
const idNumerico = (k, que) => {
  if (!/^\d{1,15}$/.test(k)) throw fallo('LUA_CLAVE', `precios: ${que} no válido ${JSON.stringify(String(k).slice(0, 40))}`);
  return k;
};

// Fila de un objeto: 7 números (tendencia null → 0, ritmo y vendidosDia ausentes → -1, poco → 1 o 0) y, si vienen las
// subastas, 2 más: las subastas y si se sabe la tendencia (1 o 0). F5: detrás de esos, un 1 si es una mercancía (si no,
// nada: un objeto suelto se queda en 9).
function fila(r, casa, item) {
  if (!Array.isArray(r) || r.length < 3) throw fallo('LUA_TIPO', `precios: fila mala en ${casa}/${item}`);
  const [precio, cantidad, normal, tendencia, ritmo, vendidos, poco, subastas, conTendencia, mercancia] = r;
  const mas = subastas == null ? [] : [numero(subastas, 'subastas'), conTendencia ? 1 : 0, ...(mercancia ? [1] : [])];
  return [
    numero(precio, 'precio'),
    numero(cantidad, 'cantidad'),
    numero(normal, 'normal'),
    tendencia == null ? 0 : numero(tendencia, 'tendencia'),
    ritmo == null ? -1 : numero(ritmo, 'ritmo'),
    vendidos == null ? -1 : numero(vendidos, 'vendidosDia'),
    poco ? 1 : 0,
    ...mas,
  ];
}

// Las claves de conocidas ("<reino>|<faccion>") no son identificadores: van como cadenas entre corchetes.
function conocidasLua(c) {
  const pares = Object.keys(c).map((k) => `[${luaCadena(k)}] = ${numero(c[k], 'casa')}`);
  return `{${pares.join(', ')}}`;
}

// Los grupos del catálogo (Task 6): lista de {clave, nombre: {es, en}, tipo, objetos: [ids]}; todo texto con luaCadena.
function gruposLua(grupos) {
  if (!Array.isArray(grupos)) throw fallo('LUA_TIPO', 'precios: grupos tiene que ser una lista');
  const g = grupos.map((x) => {
    if (!x || typeof x.clave !== 'string' || !Array.isArray(x.objetos)) throw fallo('LUA_TIPO', 'precios: grupo mal formado');
    const n = x.nombre || {};
    const ids = x.objetos.map((o) => {
      if (!Number.isInteger(o)) throw fallo('LUA_TIPO', 'precios: un objeto de grupo no es un entero');
      return o;
    });
    return `{clave=${luaCadena(x.clave)}, nombre={es=${luaCadena(String(n.es ?? ''))}, en=${luaCadena(String(n.en ?? ''))}}, ` +
      `tipo=${luaCadena(String(x.tipo ?? 'auto'))}, objetos={${ids.join(',')}}}`;
  });
  return `{${g.join(', ')}}`;
}

/**
 * Los 6 textos de una ranura de precios (ver el formato arriba). Da error `PRECIOS_GRANDES` si los datos no caben en
 * p2…p6 con los límites de tamaño y de constantes; si los nombres son lo que no cabe, se reintenta sin ellos.
 */
export function textosPrecios(entrada) {
  try {
    return armarTextos(entrada);
  } catch (e) {
    if (e.code !== 'PRECIOS_GRANDES' || !entrada.nombres || Object.keys(entrada.nombres).length === 0) throw e;
    return armarTextos({ ...entrada, nombres: {} });
  }
}

function armarTextos({ seq, generado, region, conocidas = {}, casas = {}, grupos = [], nombres = {}, info = {} }) {
  numero(seq, 'seq');
  const summaries = Object.keys(casas).sort((a, b) => Number(a) - Number(b)).flatMap((casa) => {
    const row = info[casa];
    if (!row) return [];
    return [`[${idNumerico(casa, 'casa')}]={hora=${numero(row.hora, 'hora')},desde=${numero(row.desde, 'desde')},pares=${numero(row.pares, 'pares')}}`];
  });
  const metadata = summaries.length ? `, info = {${summaries.join(', ')}}` : '';
  const cabecera =
    `if SNF_PRECIOS == nil or (SNF_PRECIOS.seq or 0) < ${seq} then\n` +
    `  SNF_PRECIOS = {v = 1, seq = ${seq}, generado = ${numero(generado, 'generado')}, region = ${luaCadena(String(region))},\n` +
    `    conocidas = ${conocidasLua(conocidas)}, casas = {}, grupos = ${gruposLua(grupos)}, nombres = {}${metadata}}\n` +
    'end\n';
  // Constantes de p1 (cadenas y números distintos, a ojo): también tienen tope.
  const constantesCabecera = new Set(cabecera.match(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?/g)).size;
  if (bytes(cabecera) > LIMITE_BYTES - MARGEN_BYTES || constantesCabecera > LIMITE_CONSTANTES - MARGEN_CONSTANTES) {
    throw fallo('PRECIOS_GRANDES', 'la cabecera de precios no cabe en p1.lua');
  }

  // Cada archivo de datos empieza con la guarda del seq. Es un `return`, no un `if` que envuelva todo: Lua 5.1 no admite
  // saltos tan largos. `Q` es la tabla de casas, `N` la de nombres y `c` la casa actual.
  const guarda = `local P = SNF_PRECIOS\nif not (P and P.seq == ${seq}) then return end\nlocal Q, N, c = P.casas, P.nombres\n`;
  const pie = '';
  const trozos = [];
  let t = null;
  const abrir = () => {
    t = { texto: guarda, bytes: bytes(guarda) + bytes(pie), constantes: new Set(), casa: null };
    trozos.push(t);
  };

  // `casa` es null para un nombre. `claves` son las constantes que la línea añade (números y cadenas).
  const anadir = (casa, linea, claves) => {
    for (let intento = 0; intento < 2; intento++) {
      if (!t) abrir();
      const cambio = casa !== null && t.casa !== casa ? `c=Q[${casa}]\nif not c then c={} Q[${casa}]=c end\n` : '';
      const todas = cambio ? [...claves, `#${casa}`] : claves;
      const nuevas = todas.filter((k) => !t.constantes.has(k)).length;
      const entra = t.bytes + bytes(cambio + linea) <= LIMITE_BYTES - MARGEN_BYTES && t.constantes.size + nuevas <= LIMITE_CONSTANTES - MARGEN_CONSTANTES;
      if (entra || t.texto === guarda) {
        t.texto += cambio + linea;
        t.bytes += bytes(cambio + linea);
        for (const k of todas) t.constantes.add(k);
        if (casa !== null) t.casa = casa;
        return;
      }
      abrir(); // no cabe: un archivo nuevo (y vuelve a intentarlo desde cero)
    }
  };

  for (const casa of Object.keys(casas).sort((a, b) => Number(a) - Number(b))) {
    idNumerico(casa, 'casa');
    for (const item of Object.keys(casas[casa])) {
      idNumerico(item, 'objeto');
      const f = fila(casas[casa][item], casa, item);
      anadir(casa, `c[${item}]={${f.join(',')}}\n`, [`#${item}`, ...f.slice(0, 6).map((n) => `#${n}`), ...(f.length > 7 ? [`#${f[7]}`] : [])]);
    }
  }
  for (const item of Object.keys(nombres)) {
    idNumerico(item, 'objeto');
    const nombre = String(nombres[item]);
    anadir(null, `N[${item}]=${luaCadena(nombre)}\n`, [`#${item}`, `"${nombre}`]);
  }

  if (trozos.length > ARCHIVOS_POR_RANURA - 1) {
    throw fallo('PRECIOS_GRANDES', `los precios no caben en ${ARCHIVOS_POR_RANURA} archivos (harían falta ${trozos.length + 1})`);
  }
  const textos = [cabecera];
  for (let k = 0; k < ARCHIVOS_POR_RANURA - 1; k++) textos.push(trozos[k] ? trozos[k].texto + pie : '-- vacío\n');
  // `completo` significa «p6 se ejecutó con el seq que toca»: el último archivo lo pone, así el addon sabe que los
  // seis cargaron (si falta o falla alguno de en medio, p6 igualmente lo marcaría: p6 solo certifica que llegó hasta él).
  const completo = `if SNF_PRECIOS and SNF_PRECIOS.seq == ${seq} then SNF_PRECIOS.completo = true end\n`;
  textos[ARCHIVOS_POR_RANURA - 1] = (trozos[ARCHIVOS_POR_RANURA - 2] ? textos[ARCHIVOS_POR_RANURA - 1] : guarda) + completo;
  return textos;
}

/** Ranura (1…8) de una foto: la de su hora, `(floor(generado / 3600) % 8) + 1`, con `generado` en segundos UTC. */
export const ranuraDeHora = (generado) => (Math.floor(generado / 3600) % RANURAS_PRECIOS) + 1;

/**
 * Escribe los 6 textos en la ranura de la hora de la foto (`ranuraDeHora(generado)`; el addon carga la de la hora actual y,
 * si falta, la de la anterior). `generado` sale de las opciones o, si no, de p1.lua. Dos escrituras de la misma hora van a
 * la misma ranura. `estado.ultimaRanuraPrecios` se apunta solo para diagnóstico. La carpeta de la ranura tiene que ser de
 * verdad una carpeta de AddOns (no un enlace): si no, error con `code` ENLACE (o FALTA si no existe: eso lo crea
 * prepararAddOns) y no se escribe nada. p1.lua se escribe el último. Devuelve {ranura}.
 */
export async function escribirPrecios(addonsDir, textos, { estado = {}, fs = fsReal, dormir = dormirReal, raizVolumen, generado }: {
  estado?: any;
  fs?: typeof fsReal;
  dormir?: typeof dormirReal;
  raizVolumen?: any;
  generado?: any;
} = {}) {
  if (!Array.isArray(textos) || textos.length !== ARCHIVOS_POR_RANURA) throw fallo('PRECIOS_TEXTOS', 'hacen falta 6 textos');
  const hora = generado ?? Number(/generado = (\d+)/.exec(textos[0])?.[1]);
  if (!Number.isFinite(hora)) throw fallo('PRECIOS_TEXTOS', 'no se sabe la hora de la foto (generado)');
  const ranura = ranuraDeHora(hora);
  const dir = join(addonsDir, nombreRanuraPrecios(ranura));
  carpetaSegura(fs, addonsDir, dir);
  const mover = cuarentenaDelVolumen({ fs, addonsDir, raiz: raizVolumen });
  const reintentador = crearReintentador({ dormir });
  for (const k of [1, 2, 3, 4, 5, 0]) {
    await escribirAtomico(fs, join(dir, `p${k + 1}.lua`), textos[k], { reintentador, mover });
  }
  estado.ultimaRanuraPrecios = ranura;
  return { ranura };
}
