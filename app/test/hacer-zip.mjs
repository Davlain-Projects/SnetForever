// Para las pruebas: arma un .zip en memoria (store o deflate), con lo justo para probar el lector de biblioteca/zip.mjs.
//
//   hacerZip([{nombre, datos?, metodo? = 'deflate' | 'store', flags?, enlace?, crc?, tamano?, hostUnix?}], {zip64?}) -> Buffer
//   enlace: true marca la entrada como enlace simbólico de Unix; crc y tamano cambian lo que dice la cabecera (para
//   probar cabeceras que mienten); zip64: true pone 0xFFFF en el número de entradas del final.
import { deflateRawSync, crc32 } from 'node:zlib';

export function hacerZip(entradas, { zip64 = false } = {}) {
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8');
    const datos = Buffer.isBuffer(e.datos) ? e.datos : Buffer.from(e.datos ?? '', 'utf8');
    const metodo = e.metodo === 'store' ? 0 : e.metodo === 'raro' ? 14 : 8;
    const comprimido = metodo === 8 ? deflateRawSync(datos) : datos;
    const crc = e.crc ?? crc32(datos);
    const tamano = e.tamano ?? datos.length;
    const flags = (e.flags ?? 0) | 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(tamano, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombre, comprimido);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.enlace || e.hostUnix ? (3 << 8) | 20 : 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(tamano, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(e.enlace ? (0o120777 << 16) >>> 0 : 0, 38);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombre);
    desplazamiento += 30 + nombre.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(zip64 ? 0xffff : entradas.length, 8);
  fin.writeUInt16LE(zip64 ? 0xffff : entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}
