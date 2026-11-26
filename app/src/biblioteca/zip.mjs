// Biblioteca de guías: un lector de .zip propio, sin dependencias (el directorio central y node:zlib). Lo usa guardar.mjs
// para los addons de guías que se bajan de GitHub y sitios así. Solo LEE bytes en memoria: no escribe nada, y lo que sale
// son datos (nunca se ejecuta ni se carga como código).
//
//   leerZip(cuerpo, {topes: {archivos, porArchivo, total}, quedarse: (ruta) => boolean})
//     -> {archivos: [{ruta, datos: Buffer}], saltados}   ruta: los trozos de la entrada unidos con «/»
//   Lanza ErrorZip con `code`:
//     'zip'        no es un zip, está dañado o usa algo que no se lee: cifrado, zip64, varios discos, otro método que no
//                  sea store (0) o deflate (8), un CRC que no cuadra, un tamaño que no es el que dice la cabecera, o dos
//                  rutas que en Windows son la misma
//     'peligroso'  una entrada (la que sea, se quede o no) con ruta absoluta, unidad (C:), «..», un carácter que Windows
//                  no admite (: < > " | ? * o de control, como el NUL), un trozo que acaba en punto o espacio, un nombre
//                  reservado de Windows (CON, NUL, COM1…) o un enlace simbólico
//     'demasiados' más entradas que topes.archivos (cuentan todas)
//     'tamano'     una entrada que se queda pasa de topes.porArchivo, o todas las que se quedan pasan de topes.total
//                  (se mira lo que dice la cabecera y, al descomprimir, lo que sale de verdad: maxOutputLength)
// Las carpetas (entradas que acaban en «/») no se devuelven ni cuentan como saltadas; las que `quedarse` no quiere, sí.
import { inflateRawSync, crc32 } from 'node:zlib';
const FIN = 0x06054b50;
const FIN64 = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
export const RESERVADOS = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(?:\..*)?$/i;
const PROHIBIDOS = /[\x00-\x1f<>:"|?*]/;
export class ErrorZip extends Error {
    /** @param {'zip'|'peligroso'|'demasiados'|'tamano'} code */
    constructor(code, mensaje) {
        super(mensaje);
        this.name = 'ErrorZip';
        this.code = code;
    }
}
const mal = (texto) => new ErrorZip('zip', texto);
// El registro del final del directorio central: el último que encaja con su comentario.
function buscarFin(b) {
    const desde = Math.max(0, b.length - 22 - 0xffff);
    for (let p = b.length - 22; p >= desde; p--) {
        if (b.readUInt32LE(p) === FIN && p + 22 + b.readUInt16LE(p + 20) === b.length)
            return p;
    }
    throw mal('no es un zip (no tiene directorio central)');
}
/** Los trozos de la ruta de una entrada; lanza 'peligroso' si podría salir de su carpeta o pisar algo raro. */
export function trozosDeRuta(nombre) {
    const texto = String(nombre).replace(/\\/g, '/');
    if (texto.startsWith('/') || /^[A-Za-z]:/.test(texto))
        throw new ErrorZip('peligroso', 'ruta absoluta o con unidad');
    const trozos = texto.split('/').filter((t) => t !== '' && t !== '.');
    for (const t of trozos) {
        if (t === '..')
            throw new ErrorZip('peligroso', 'ruta con «..»');
        if (PROHIBIDOS.test(t))
            throw new ErrorZip('peligroso', 'ruta con un carácter que Windows no admite');
        if (/[. ]$/.test(t))
            throw new ErrorZip('peligroso', 'trozo de ruta que acaba en punto o espacio');
        if (RESERVADOS.test(t))
            throw new ErrorZip('peligroso', 'nombre reservado de Windows');
    }
    return trozos;
}
// ¿Es un enlace? De Unix (modo S_IFLNK en los 16 bits altos) o de Windows (atributo de punto de análisis, 0x400).
function esEnlace(hecho, atributos) {
    const sistema = hecho >> 8;
    if (sistema === 3 && ((atributos >>> 16) & 0xf000) === 0xa000)
        return true;
    return sistema === 0 && (atributos & 0x400) !== 0;
}
export function leerZip(cuerpo, { topes, quedarse = () => true } = {}) {
    const b = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo ?? []);
    if (b.length < 22)
        throw mal('no es un zip');
    const fin = buscarFin(b);
    if (fin >= 20 && b.readUInt32LE(fin - 20) === FIN64)
        throw mal('zip64 (no se lee)');
    const disco = b.readUInt16LE(fin + 4);
    const discoCentral = b.readUInt16LE(fin + 6);
    const enEsteDisco = b.readUInt16LE(fin + 8);
    const entradas = b.readUInt16LE(fin + 10);
    const tamanoCentral = b.readUInt32LE(fin + 12);
    const inicioCentral = b.readUInt32LE(fin + 16);
    if (entradas === 0xffff || tamanoCentral === 0xffffffff || inicioCentral === 0xffffffff)
        throw mal('zip64 (no se lee)');
    if (disco !== 0 || discoCentral !== 0 || enEsteDisco !== entradas)
        throw mal('zip de varios discos');
    if (entradas > topes.archivos)
        throw new ErrorZip('demasiados', `más de ${topes.archivos} archivos`);
    if (inicioCentral + tamanoCentral > fin)
        throw mal('directorio central fuera de sitio');
    const elegidas = [];
    const vistas = new Set();
    let saltados = 0;
    let total = 0;
    let p = inicioCentral;
    for (let i = 0; i < entradas; i++) {
        if (p + 46 > fin || b.readUInt32LE(p) !== CENTRAL)
            throw mal('directorio central dañado');
        const hecho = b.readUInt16LE(p + 4);
        const flags = b.readUInt16LE(p + 8);
        const metodo = b.readUInt16LE(p + 10);
        const crc = b.readUInt32LE(p + 16);
        const comprimido = b.readUInt32LE(p + 20);
        const tamano = b.readUInt32LE(p + 24);
        const largoNombre = b.readUInt16LE(p + 28);
        const largoExtra = b.readUInt16LE(p + 30);
        const largoComentario = b.readUInt16LE(p + 32);
        const atributos = b.readUInt32LE(p + 38);
        const local = b.readUInt32LE(p + 42);
        const finEntrada = p + 46 + largoNombre + largoExtra + largoComentario;
        if (finEntrada > fin)
            throw mal('directorio central dañado');
        const crudo = b.subarray(p + 46, p + 46 + largoNombre);
        const nombre = (flags & 0x800) !== 0 ? crudo.toString('utf8') : crudo.toString('latin1');
        p = finEntrada;
        if (esEnlace(hecho, atributos))
            throw new ErrorZip('peligroso', 'enlace dentro del zip');
        const trozos = trozosDeRuta(nombre);
        if ((flags & 0x41) !== 0)
            throw mal('zip cifrado');
        if (metodo !== 0 && metodo !== 8)
            throw mal(`método ${metodo} (solo store y deflate)`);
        if (comprimido === 0xffffffff || tamano === 0xffffffff)
            throw mal('zip64 (no se lee)');
        const esCarpeta = /[/\\]$/.test(nombre) || trozos.length === 0;
        if (esCarpeta)
            continue;
        const ruta = trozos.join('/');
        if (!quedarse(ruta)) {
            saltados++;
            continue;
        }
        const clave = ruta.toLowerCase();
        if (vistas.has(clave))
            throw mal('dos entradas con la misma ruta');
        vistas.add(clave);
        if (tamano > topes.porArchivo)
            throw new ErrorZip('tamano', `un archivo pasa de ${topes.porArchivo} bytes`);
        total += tamano;
        if (total > topes.total)
            throw new ErrorZip('tamano', `lo descomprimido pasa de ${topes.total} bytes`);
        elegidas.push({ ruta, metodo, crc, comprimido, tamano, local });
    }
    const archivos = [];
    for (const e of elegidas) {
        if (e.local + 30 > inicioCentral || b.readUInt32LE(e.local) !== LOCAL)
            throw mal('cabecera local dañada');
        const inicio = e.local + 30 + b.readUInt16LE(e.local + 26) + b.readUInt16LE(e.local + 28);
        if (inicio + e.comprimido > inicioCentral)
            throw mal('datos fuera de sitio');
        const trozo = b.subarray(inicio, inicio + e.comprimido);
        let datos;
        if (e.metodo === 0) {
            datos = Buffer.from(trozo);
        }
        else {
            try {
                datos = inflateRawSync(trozo, { maxOutputLength: Math.max(1, Math.min(e.tamano, topes.porArchivo)) });
            }
            catch (error) {
                if (error?.code === 'ERR_BUFFER_TOO_LARGE' || error instanceof RangeError) {
                    throw new ErrorZip('tamano', 'un archivo descomprimido es más grande de lo que dice');
                }
                throw mal('datos comprimidos dañados');
            }
        }
        if (datos.length !== e.tamano)
            throw mal('el tamaño no es el que dice la cabecera');
        if ((crc32(datos) >>> 0) !== e.crc)
            throw mal('el CRC no cuadra');
        archivos.push({ ruta: e.ruta, datos });
    }
    return { archivos, saltados };
}
