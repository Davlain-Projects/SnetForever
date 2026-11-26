// Adaptado de NeverQuestAlone (MIT; © 2026 chelinho139 y los autores de NeverQuestAlone), bridge/transport/luaenc.mjs, commit 3a9b93c.
//
// Buzón de la IA: el archivo Lua que la app deja en las ranuras SnetForever_R001…R020 del addon (protocolo P4).
// `luaCadena` deriva de `luaStr` de luaenc.mjs; los reintentos y la cuarentena están en fsseguro.mjs.
//
// Nada se borra: lo sustituido (un buzon.lua ajeno) y los temporales que fallan van a la cuarentena del volumen del juego
// renombrándolos, y los temporales de escritura se renombran sobre el destino.
import * as fsReal from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { VERSION } from './version.mjs';
import { textoError } from './textos.mjs';
import { carpetaSegura, crearReintentador, cuarentenaDelVolumen, existe, fallo } from './fsseguro.mjs';
export const LIMITE_BUZON = 64 * 1024; // el buzon.lua pesa como mucho 64 KB
export const RANURAS = 20; // lote G: eran 100 y llenaban la lista de addons (las que sobran las aparta prepararAddOns)
export const MAX_REGISTROS = 10;
export const MAX_RECIBIDOS = 50; // los recibidos más recientes que viajan en el buzón
export const MAX_NIVELES = 12;
const INICIO_BUZON = 'SNF_BUZON';
const INTERFAZ_POR_DEFECTO = '16001';
// Palabras reservadas de Lua (con `goto`, que Lua 5.1 no tiene pero fengari rechaza como clave).
const PALABRAS_LUA = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or',
    'repeat', 'return', 'then', 'true', 'until', 'while',
]);
export const nombreRanura = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;
// ---------- serialización a Lua ----------
/**
 * Cadena de Lua entre comillas dobles para el texto `s`, en UTF-8. Una mitad sustituta suelta pasa a U+FFFD (como
 * haría Buffer.from). Se escapan la barra, la comilla, los saltos, los controles (con tres cifras, para que un dígito
 * detrás no los alargue) y el 0x7F. Con comillas simples y sin corchetes largos no hay forma de cerrar la cadena.
 */
export function luaCadena(s) {
    if (typeof s !== 'string')
        throw fallo('LUA_TIPO', 'luaCadena solo admite cadenas');
    let salida = '"';
    for (const ch of s.toWellFormed()) {
        const c = ch.codePointAt(0);
        if (ch === '\\')
            salida += '\\\\';
        else if (ch === '"')
            salida += '\\"';
        else if (ch === '\n')
            salida += '\\n';
        else if (ch === '\r')
            salida += '\\r';
        else if (c < 0x20 || c === 0x7f)
            salida += `\\${String(c).padStart(3, '0')}`;
        else
            salida += ch;
    }
    return `${salida}"`;
}
function numeroLua(n) {
    if (!Number.isFinite(n))
        throw fallo('LUA_TIPO', 'número no finito');
    if (Object.is(n, -0))
        return '0';
    return String(n);
}
function claveLua(k) {
    if (/^(?:0|-?[1-9]\d{0,14})$/.test(k))
        return `[${k}]`;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !PALABRAS_LUA.has(k))
        return k;
    throw fallo('LUA_CLAVE', `clave no permitida: ${JSON.stringify(k.slice(0, 40))}`);
}
function serializar(v, nivel) {
    switch (typeof v) {
        case 'string':
            return luaCadena(v);
        case 'number':
            return numeroLua(v);
        case 'boolean':
            return v ? 'true' : 'false';
        case 'object':
            break;
        default:
            throw fallo('LUA_TIPO', `tipo no permitido: ${typeof v}`);
    }
    if (v === null)
        throw fallo('LUA_TIPO', 'null no permitido');
    if (nivel + 1 > MAX_NIVELES)
        throw fallo('LUA_PROFUNDIDAD', `más de ${MAX_NIVELES} niveles de profundidad`);
    if (Array.isArray(v)) {
        if (Object.keys(v).length !== v.length)
            throw fallo('LUA_TIPO', 'lista con huecos o con claves añadidas');
        const items = [];
        for (let i = 0; i < v.length; i++) {
            if (v[i] === undefined)
                throw fallo('LUA_TIPO', 'undefined dentro de una lista');
            items.push(serializar(v[i], nivel + 1));
        }
        return `{${items.join(', ')}}`;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null)
        throw fallo('LUA_TIPO', 'solo se admiten objetos simples');
    const pares = [];
    for (const k of Object.keys(v)) {
        if (v[k] === undefined)
            continue; // como en JSON: sin valor, sin campo
        pares.push(`${claveLua(k)} = ${serializar(v[k], nivel + 1)}`);
    }
    return `{${pares.join(', ')}}`;
}
/**
 * Valor de JS a texto de Lua, solo con tablas (listas y objetos simples), cadenas, números finitos y booleanos, claves
 * que sean identificadores (no palabras reservadas) o enteros, y como mucho 12 niveles. Cualquier otra cosa da error.
 * Los campos `undefined` se omiten.
 */
export function aLuaSeguro(v) {
    return serializar(v, 0);
}
// ---------- el texto del buzón ----------
const bytes = (t) => Buffer.byteLength(t, 'utf8');
function recibidosLua(pares) {
    const salida = [];
    for (const [pj, id] of pares) {
        if (typeof id !== 'string')
            throw fallo('LUA_TIPO', 'recibidos: el id tiene que ser una cadena');
        salida.push(`[${luaCadena(pj)}] = ${luaCadena(id)}`);
    }
    return `{${salida.join(', ')}}`;
}
function textoDe({ seq, ahora, app, estado, recibidos, registros }) {
    const cuerpo = registros.map((r) => `    ${aLuaSeguro(r)}`).join(',\n');
    return (`SNF_BUZON = {v = 1, app = ${luaCadena(app)}, seq = ${numeroLua(seq)}, ahora = ${numeroLua(ahora)},\n` +
        `  estado = ${aLuaSeguro(estado || {})},\n` +
        `  recibidos = ${recibidosLua(recibidos)},\n` +
        `  registros = {${cuerpo ? `\n${cuerpo}` : ''}}}\n`);
}
// Trozos de texto que no se parten al recortar: grafemas con Intl.Segmenter; si no existe, puntos de código.
function trozosDe(texto) {
    const limpio = texto.toWellFormed();
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(limpio), (s) => s.segment);
    }
    return Array.from(limpio);
}
// Unión de trozos sin un ZWJ colgando al final (de un emoji compuesto cortado por la mitad).
const unir = (trozos) => trozos.join('').replace(/‍+$/u, '');
/**
 * `SNF_BUZON = {…}\n` con los 10 últimos registros por seq y los 50 recibidos más recientes. Pesa como mucho 64 KB:
 *   1. se quitan los registros más antiguos, uno a uno, mientras no quepa (nunca el más nuevo);
 *   2. si el más nuevo él solo no cabe, se le quita `guiaIA` y se pone `guiaIAQuitada = true` (el addon avisa);
 *   3. si aún no cabe, se recorta su `texto` sin partir grafemas y se pone `textoRecortado = true`;
 *   4. si ni con el texto al mínimo cabe (una propuesta enorme…), se publica en su lugar un registro `t = "error"`,
 *      `tipo = "grande"`, con el mismo seq, pj y msg, para que el addon salga de «pensando».
 * Un valor que no sea seguro para Lua (ver aLuaSeguro) da error. `idioma` ('es' o 'en', el del mensaje) elige el texto
 * del error «grande» (ERRORES.<idioma>.grande de textos.mjs).
 */
export function tablaBuzon({ seq, estado, recibidos, registros, ahora = Math.floor(Date.now() / 1000), app = VERSION, idioma = 'es' }) {
    const lista = [...(registros || [])];
    for (const r of lista)
        if (!r || !Number.isFinite(r.seq))
            throw fallo('LUA_TIPO', 'cada registro necesita un seq numérico');
    lista.sort((a, b) => a.seq - b.seq);
    let activos = lista.slice(-MAX_REGISTROS);
    const base = { seq, ahora, app, estado, recibidos: Object.entries(recibidos || {}).slice(-MAX_RECIBIDOS) };
    const hacer = (rs) => textoDe({ ...base, registros: rs });
    let texto = hacer(activos);
    while (bytes(texto) > LIMITE_BUZON && activos.length > 1) {
        activos = activos.slice(1);
        texto = hacer(activos);
    }
    if (bytes(texto) <= LIMITE_BUZON)
        return texto;
    // Solo queda el registro más nuevo y no cabe.
    const nuevo = { ...activos[0] };
    if (nuevo.guiaIA !== undefined) {
        delete nuevo.guiaIA;
        nuevo.guiaIAQuitada = true;
        texto = hacer([nuevo]);
        if (bytes(texto) <= LIMITE_BUZON)
            return texto;
    }
    if (typeof nuevo.texto === 'string') {
        const trozos = trozosDe(nuevo.texto);
        const con = (n) => hacer([{ ...nuevo, texto: unir(trozos.slice(0, n)), textoRecortado: true }]);
        if (bytes(con(0)) <= LIMITE_BUZON) {
            let bajo = 0;
            let alto = trozos.length;
            while (bajo < alto) {
                const medio = Math.ceil((bajo + alto) / 2);
                if (bytes(con(medio)) <= LIMITE_BUZON)
                    bajo = medio;
                else
                    alto = medio - 1;
            }
            return con(bajo);
        }
    }
    // Ni así: un error corto en su lugar (el mismo msg), para que el addon no se quede esperando.
    const error = { seq: nuevo.seq, pj: nuevo.pj, msg: nuevo.msg, t: 'error', tipo: 'grande', texto: textoError('grande', '', idioma) };
    if (typeof nuevo.motor === 'string' && nuevo.motor.length <= 16)
        error.motor = nuevo.motor;
    texto = hacer([error]);
    if (bytes(texto) <= LIMITE_BUZON)
        return texto;
    throw fallo('BUZON_GRANDE', 'ni un registro de error cabe en 64 KB');
}
/**
 * El .toc de la ranura `i`, exacto (P4). `## Group: SnetForever` pliega las ranuras bajo SnetForever en la lista de addons
 * del juego (como hace EllesmereUI con sus módulos); sin `## Category` propia, para que no salgan en una categoría aparte.
 */
export function tocRanura(i, interfaz = INTERFAZ_POR_DEFECTO) {
    const n = String(i).padStart(3, '0');
    return [
        `## Interface: ${interfaz}`,
        `## Title: SnetForever - Respuestas ${n}`,
        '## Notes: Trae al juego las respuestas del chat de SnetForever. Déjalo activado.',
        '## LoadOnDemand: 1',
        '## Dependencies: SnetForever',
        '## Group: SnetForever',
        '## X-License: MIT',
        '## IconTexture: Interface\\AddOns\\SnetForever\\recursos\\icono',
        '',
        'buzon.lua',
        '',
    ].join('\n');
}
// ---------- escritura segura en AddOns ----------
export const dormirReal = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
/**
 * Escribe `contenido` en `destino`: primero un temporal en la misma carpeta y luego lo renombra encima (con EPERM, EACCES
 * o EBUSY lo reintenta a los 25, 50 y 75 ms, con el reintentador `reintentador`). Si la escritura o el renombre fallan,
 * el temporal (entero o a medias) va a la cuarentena del volumen (`mover`) y el error sube: nunca queda en la carpeta.
 */
export async function escribirAtomico(fs, destino, contenido, { reintentador, mover, dormir = dormirReal } = {}) {
    const r = reintentador || crearReintentador({ dormir });
    const temporal = join(dirname(destino), `${basename(destino)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
    try {
        fs.writeFileSync(temporal, contenido, { flag: 'wx' });
        await r.ejecutar(() => fs.renameSync(temporal, destino));
    }
    catch (e) {
        try {
            if (mover && existe(fs, temporal))
                mover(temporal, basename(temporal));
        }
        catch {
            // no hay cuarentena: el error original es el que importa
        }
        throw e;
    }
}
// ¿El buzon.lua que hay es nuestro? Un archivo normal que empieza por SNF_BUZON.
function esNuestro(fs, ruta) {
    try {
        const st = fs.lstatSync(ruta);
        if (!st.isFile() || st.size > 2 * LIMITE_BUZON)
            return false;
        return fs.readFileSync(ruta, 'utf8').startsWith(INICIO_BUZON);
    }
    catch {
        return false;
    }
}
/**
 * Escribe `texto` en el buzon.lua de las ranuras `desde`…`hasta` (1…RANURAS) de la carpeta de AddOns. Antes de cada una
 * comprueba que la carpeta no es un enlace ni lleva fuera de AddOns; un buzon.lua que no sea nuestro va a la cuarentena
 * del volumen (si no se puede, la ranura falla con `CUARENTENA` y su archivo se queda donde estaba). Una ranura que falta
 * no se crea (eso es prepararAddOns). Si una ranura agota los reintentos por un bloqueo, las demás de la llamada se
 * intentan una sola vez. Devuelve {escritas: [i…], fallos: [{ranura, codigo, mensaje}…]}.
 */
export async function escribirRanuras(addonsDir, texto, { desde = 1, hasta = RANURAS, fs = fsReal, dormir = dormirReal, raizVolumen } = {}) {
    const escritas = [];
    const fallos = [];
    const mover = cuarentenaDelVolumen({ fs, addonsDir, raiz: raizVolumen });
    const reintentador = crearReintentador({ dormir });
    const ultima = Math.min(hasta, RANURAS);
    for (let i = Math.max(1, desde); i <= ultima; i++) {
        try {
            const dir = join(addonsDir, nombreRanura(i));
            carpetaSegura(fs, addonsDir, dir);
            const destino = join(dir, 'buzon.lua');
            if (existe(fs, destino) && !esNuestro(fs, destino))
                mover(destino, `${nombreRanura(i)}-buzon.lua`);
            await escribirAtomico(fs, destino, texto, { reintentador, mover });
            escritas.push(i);
        }
        catch (e) {
            fallos.push({ ranura: i, codigo: e.code || 'ERROR', mensaje: e.message });
        }
    }
    return { escritas, fallos };
}
