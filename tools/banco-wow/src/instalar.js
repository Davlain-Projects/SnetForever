// Instalador de los addons SnetForever y SnetForever_Comercio: copia addons/SnetForever y addons/SnetForever_Comercio
// (0.7.0: el comercio es un addon aparte) a la carpeta AddOns del cliente.
// Variables de entorno: SNF_ADDONS (carpeta AddOns de destino), SNF_CUARENTENA (carpeta de cuarentena),
// SNF_SELLO (fecha-hora de la carpeta de cuarentena; solo para pruebas).
// Sobrescribe sin borrar: los .lua que un addon ya no trae se mueven a cuarentena (<sello>/<addon>/…), igual para los dos.
// Los addons de datos (SnetForever_Rutas y SnetForever_Misiones) no son de este instalador: tienen que estar ya.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_ADDONS = path.resolve(AQUI, '..', '..', '..', 'addons');
// Los addons que se copian, en este orden (el comercio depende del núcleo).
const ADDONS = ['SnetForever', 'SnetForever_Comercio'];
const ADDONS_POR_DEFECTO = 'E:\\wow\\World of Warcraft\\_forever_\\Interface\\AddOns';
const CUARENTENA_POR_DEFECTO = 'E:\\_CUARENTENA\\SnetForever';
const DEPENDENCIAS = ['SnetForever_Rutas', 'SnetForever_Misiones'];

function listar(dir, base = dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) listar(ruta, base, salida);
    else salida.push(path.relative(base, ruta).split(path.sep).join('/'));
  }
  return salida.sort();
}

function sello() {
  if (process.env.SNF_SELLO) return process.env.SNF_SELLO;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Ruta libre: si existe, añade un sufijo numérico para no sobrescribir nunca.
function rutaLibre(ruta) {
  if (!fs.existsSync(ruta)) return ruta;
  let n = 1;
  while (fs.existsSync(`${ruta}.${n}`)) n++;
  return `${ruta}.${n}`;
}

// Copia un addon (`nombre`) de addons/ a `addons`; los .lua de más del destino van a `<cuarentena>/<sello>/<nombre>`.
// Da 0 si todo coincide, 1 si no.
function instalarAddon(nombre, addons, cuarentena, selloComun) {
  const ORIGEN = path.join(RAIZ_ADDONS, nombre);
  const destino = path.join(addons, nombre);

  const archivosOrigen = listar(ORIGEN);
  const conjunto = new Set(archivosOrigen);

  // Sobrantes: .lua del destino que el addon ya no trae.
  const sobrantes = fs.existsSync(destino) ? listar(destino).filter((f) => f.endsWith('.lua') && !conjunto.has(f)) : [];
  if (sobrantes.length > 0) {
    const raiz = path.join(cuarentena, selloComun, nombre);
    for (const f of sobrantes) {
      const aqui = rutaLibre(path.join(raiz, ...f.split('/')));
      fs.mkdirSync(path.dirname(aqui), { recursive: true });
      fs.renameSync(path.join(destino, ...f.split('/')), aqui);
      console.log(`Sobrante a cuarentena: ${f} -> ${aqui}`);
    }
  }

  for (const f of archivosOrigen) {
    const hasta = path.join(destino, ...f.split('/'));
    fs.mkdirSync(path.dirname(hasta), { recursive: true });
    fs.copyFileSync(path.join(ORIGEN, ...f.split('/')), hasta);
  }
  console.log(`${nombre}: copiados ${archivosOrigen.length} archivos a ${destino}`);

  const distintos = archivosOrigen.filter((f) => {
    const hasta = path.join(destino, ...f.split('/'));
    return !fs.existsSync(hasta) || !fs.readFileSync(path.join(ORIGEN, ...f.split('/'))).equals(fs.readFileSync(hasta));
  });
  if (distintos.length > 0) {
    console.error(`${nombre}: origen y destino NO coinciden en: ${distintos.join(', ')}`);
    return 1;
  }
  console.log(`${nombre}: origen y destino coinciden: ${archivosOrigen.length} archivos con el mismo contenido.`);
  return 0;
}

function main() {
  const addons = process.env.SNF_ADDONS || ADDONS_POR_DEFECTO;
  const cuarentena = process.env.SNF_CUARENTENA || CUARENTENA_POR_DEFECTO;

  const faltan = DEPENDENCIAS.filter((d) => !fs.existsSync(path.join(addons, d)));
  if (faltan.length > 0) {
    console.error(`Faltan en ${addons} los addons de datos (hacen falta ${DEPENDENCIAS.join(" y ")}; los instala la fase 1): ${faltan.join(", ")}`);
    return 1;
  }

  // un solo sello para toda la pasada: lo apartado del núcleo y del comercio queda junto
  const selloComun = sello();
  let salida = 0;
  for (const nombre of ADDONS) salida = Math.max(salida, instalarAddon(nombre, addons, cuarentena, selloComun));
  return salida;
}

process.exitCode = main();
