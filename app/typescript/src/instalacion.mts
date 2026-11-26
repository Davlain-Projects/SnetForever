// Preparación de la carpeta AddOns del juego: crea las 20 ranuras SnetForever_R001…R020 (con su .toc y su buzon.lua vacío)
// y los .wav de los timbres que falten. Solo crea lo que falta y solo dentro de la carpeta de AddOns; lo que sustituye
// (un .toc distinto) y lo que sobra (las ranuras R021…R100 de cuando eran 100, lote G) va a la cuarentena del volumen del
// juego (`<raíz>\_CUARENTENA\SnetForever\<sello>\`). Nunca borra nada. Apartar y reescribir solo se hace con el juego
// cerrado: si se crea, se aparta o se reescribe algo, el juego tiene que reiniciarse para verlo.
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { nombreRanura, tocRanura, RANURAS } from './buzon.mjs';
import { carpetaSegura, cuarentenaDelVolumen, existe, fallo } from './fsseguro.mjs';
import { TIMBRES_ARCHIVOS } from './timbres.mjs';
import { nombreRanuraPrecios, tocPrecios, RANURAS_PRECIOS, ARCHIVOS_POR_RANURA } from './comercio/precios-lua.mjs';

const INTERFAZ_POR_DEFECTO = '16001';
const BUZON_VACIO = 'SNF_BUZON = nil\n';
const PRECIOS_VACIO = '-- vacío\n';
const NOMBRE_RANURA = /^SnetForever_R(\d{3})$/; // el de nombreRanura(i)

// La interfaz que declara SnetForever.toc (16001 si no se puede leer).
function interfazDe(fs, addonsDir) {
  try {
    const m = /^##\s*Interface\s*:\s*(\S+)/m.exec(fs.readFileSync(join(addonsDir, 'SnetForever', 'SnetForever.toc'), 'utf8'));
    return m ? m[1] : INTERFAZ_POR_DEFECTO;
  } catch {
    return INTERFAZ_POR_DEFECTO;
  }
}

/**
 * Crea lo que falte en `addonsDir`: las 20 ranuras y los 7 .wav de `SnetForever/senales`. Un .toc de ranura distinto del
 * esperado se mueve a la cuarentena antes de reescribirlo. Las ranuras de más (`SnetForever_R%03d` por encima de RANURAS:
 * las R021…R100 de la 0.4.8) se mueven enteras a la cuarentena. Una ranura que sea un enlace hacia fuera de AddOns no se
 * toca (sale en `omitidas`). Si la carpeta no existe o no contiene SnetForever, da error (`code = 'ADDONS'`) y no crea nada.
 * También crea las 8 ranuras de precios SnetForever_P01…P08 (.toc y p1…p6 vacíos; el resultado lleva
 * `ranurasPreciosCreadas`), solo con el juego cerrado: con `juegoAbierto` no se crea ninguna y sale `aplazado: true`.
 * Si no se puede crear la cuarentena, ese .toc (o esa ranura de más) no se toca, se añade un aviso
 * `{codigo: 'CUARENTENA', ranura}` y se sigue con lo demás (nunca se pierde lo ya hecho).
 * Con `juegoAbierto`, no se aparta ninguna ranura ni se reescribe ningún .toc (solo se crea lo que falta) y, si había algo
 * de eso por hacer, el resultado lleva `aplazado: true`. principal.mjs lo pasa también cuando no sabe si el juego está
 * cerrado, y vuelve a llamar cuando la captura dice «juego: no».
 * Devuelve {ranurasCreadas, timbresCreados, tocsReescritos[, ranurasApartadas], juegoDebeReiniciar[, aplazado][, omitidas]
 * [, avisos]}: `juegoDebeReiniciar` es true si se creó, se apartó o se reescribió algo que el cliente solo lee al arrancar
 * (ranuras, timbres o .toc); `avisos` dice, por ejemplo, que `senales` es un enlace hacia fuera.
 */
export function prepararAddOns(addonsDir, { fs = fsReal, raizVolumen, juegoAbierto = false }: { fs?: typeof fsReal; raizVolumen?: any; juegoAbierto?: boolean; } = {}) {
  if (typeof addonsDir !== 'string' || !addonsDir || !esCarpetaNormalOEnlace(fs, addonsDir)) {
    throw fallo('ADDONS', 'la carpeta de AddOns no existe');
  }
  const addon = join(addonsDir, 'SnetForever');
  try {
    carpetaSegura(fs, addonsDir, addon);
  } catch {
    throw fallo('ADDONS', 'la carpeta de AddOns no contiene SnetForever');
  }
  const interfaz = interfazDe(fs, addonsDir);
  const mover = cuarentenaDelVolumen({ fs, addonsDir, raiz: raizVolumen });
  const avisos = [];
  const omitidas = [];

  // Timbres: .wav vacíos (si uno está «fuera» por un pulso a medias, existe).
  let timbresCreados = 0;
  const senales = join(addon, 'senales');
  if (!existe(fs, senales)) fs.mkdirSync(senales);
  let senalesSeguras = true;
  try {
    carpetaSegura(fs, addonsDir, senales);
  } catch (e) {
    senalesSeguras = false;
    avisos.push({ codigo: 'SENALES', mensaje: `la carpeta de señales no es segura (${e.code}); no se crean timbres` });
  }
  if (senalesSeguras) {
    for (const archivo of TIMBRES_ARCHIVOS) {
      const ruta = join(senales, `${archivo}.wav`);
      if (existe(fs, ruta) || existe(fs, `${ruta}.fuera`)) continue;
      fs.writeFileSync(ruta, '', { flag: 'wx' });
      timbresCreados++;
    }
  }

  // Ranuras.
  let ranurasCreadas = 0;
  let tocsReescritos = 0;
  let tocsNuevos = 0; // .toc que faltaban en una ranura que ya existía
  let aplazado = false; // algo que no se hace con el juego abierto
  for (let i = 1; i <= RANURAS; i++) {
    const nombre = nombreRanura(i);
    const dir = join(addonsDir, nombre);
    const toc = join(dir, `${nombre}.toc`);
    const esperado = tocRanura(i, interfaz);
    if (!existe(fs, dir)) {
      fs.mkdirSync(dir);
      fs.writeFileSync(toc, esperado, { flag: 'wx' });
      fs.writeFileSync(join(dir, 'buzon.lua'), BUZON_VACIO, { flag: 'wx' });
      ranurasCreadas++;
      continue;
    }
    try {
      carpetaSegura(fs, addonsDir, dir);
    } catch {
      omitidas.push(i);
      continue;
    }
    if (!existe(fs, toc)) {
      fs.writeFileSync(toc, esperado, { flag: 'wx' });
      tocsNuevos++;
    } else {
      let actual = null;
      try {
        actual = fs.readFileSync(toc, 'utf8');
      } catch {
        // ilegible: se trata como distinto
      }
      if (actual !== esperado && juegoAbierto) {
        aplazado = true;
      } else if (actual !== esperado) {
        let apartado = false;
        try {
          mover(toc, `${nombre}.toc`);
          apartado = true;
        } catch (e) {
          if (e.code !== 'CUARENTENA') throw e;
          // Sin cuarentena no se sustituye nada: ese .toc se queda como está, se avisa y se sigue con lo demás.
          avisos.push({ codigo: 'CUARENTENA', ranura: i, mensaje: `${nombre}.toc no se pudo apartar: no se reescribe` });
        }
        if (apartado) {
          fs.writeFileSync(toc, esperado, { flag: 'wx' });
          tocsReescritos++;
        }
      }
    }
    const buzon = join(dir, 'buzon.lua');
    if (!existe(fs, buzon)) fs.writeFileSync(buzon, BUZON_VACIO, { flag: 'wx' });
  }
  // Lote G: las ranuras de más (R021…R100 de cuando eran 100), enteras a la cuarentena; nunca se borran.
  let ranurasApartadas = 0;
  for (const i of ranurasDeMas(fs, addonsDir)) {
    const nombre = nombreRanura(i);
    const dir = join(addonsDir, nombre);
    try {
      carpetaSegura(fs, addonsDir, dir);
    } catch {
      omitidas.push(i);
      continue;
    }
    if (juegoAbierto) {
      aplazado = true;
      continue;
    }
    try {
      mover(dir, nombre);
      ranurasApartadas++;
    } catch (e) {
      if (e.code !== 'CUARENTENA') throw e;
      avisos.push({ codigo: 'CUARENTENA', ranura: i, mensaje: `${nombre} no se pudo apartar: se queda donde está` });
    }
  }

  // Ranuras de precios SnetForever_P01…P08 (comercio): .toc y p1…p6 vacíos. Solo se crean con el juego cerrado.
  let preciosCreadas = 0;
  if (juegoAbierto) {
    for (let i = 1; i <= RANURAS_PRECIOS; i++) {
      const nombre = nombreRanuraPrecios(i);
      let actual = null;
      try {
        actual = fs.readFileSync(join(addonsDir, nombre, `${nombre}.toc`), 'utf8');
      } catch {
        // falta o ilegible: se trata como distinto
      }
      if (actual !== tocPrecios(i, interfaz)) aplazado = true; // falta la ranura o su .toc cambió: se arregla con el juego cerrado
    }
  } else {
    for (let i = 1; i <= RANURAS_PRECIOS; i++) {
      const nombre = nombreRanuraPrecios(i);
      const dir = join(addonsDir, nombre);
      const toc = join(dir, `${nombre}.toc`);
      const esperado = tocPrecios(i, interfaz);
      if (existe(fs, dir)) {
        try {
          carpetaSegura(fs, addonsDir, dir);
        } catch {
          omitidas.push(`P${i}`);
          continue;
        }
      } else {
        fs.mkdirSync(dir);
        preciosCreadas++;
      }
      if (!existe(fs, toc)) {
        fs.writeFileSync(toc, esperado, { flag: 'wx' });
        tocsNuevos++;
      } else {
        let actual = null;
        try {
          actual = fs.readFileSync(toc, 'utf8');
        } catch {
          // ilegible: se trata como distinto
        }
        if (actual !== esperado) {
          try {
            mover(toc, `${nombre}.toc`);
            fs.writeFileSync(toc, esperado, { flag: 'wx' });
            tocsReescritos++;
          } catch (e) {
            if (e.code !== 'CUARENTENA') throw e;
            avisos.push({ codigo: 'CUARENTENA', ranura: nombre, mensaje: `${nombre}.toc no se pudo apartar: no se reescribe` });
          }
        }
      }
      for (let k = 1; k <= ARCHIVOS_POR_RANURA; k++) {
        const archivo = join(dir, `p${k}.lua`);
        if (!existe(fs, archivo)) fs.writeFileSync(archivo, PRECIOS_VACIO, { flag: 'wx' });
      }
    }
  }

  // El cliente solo lee los .toc al arrancar: un .toc reescrito o nuevo, o una ranura apartada, también piden reiniciar.
  const juegoDebeReiniciar = ranurasCreadas + timbresCreados + tocsReescritos + tocsNuevos + ranurasApartadas + preciosCreadas > 0;
  const resultado: {
    ranurasCreadas: typeof ranurasCreadas;
    timbresCreados: typeof timbresCreados;
    tocsReescritos: typeof tocsReescritos;
    juegoDebeReiniciar: typeof juegoDebeReiniciar;
    ranurasPreciosCreadas?: number;
    ranurasApartadas?: number;
    aplazado?: boolean;
    omitidas?: any;
    avisos?: any;
  } = { ranurasCreadas, timbresCreados, tocsReescritos, juegoDebeReiniciar };
  if (preciosCreadas > 0) resultado.ranurasPreciosCreadas = preciosCreadas;
  if (ranurasApartadas > 0) resultado.ranurasApartadas = ranurasApartadas;
  if (aplazado) resultado.aplazado = true;
  if (omitidas.length > 0) resultado.omitidas = omitidas;
  if (avisos.length > 0) resultado.avisos = avisos;
  return resultado;
}

// Los números de las carpetas `SnetForever_R%03d` de AddOns que pasan de RANURAS, de menor a mayor.
function ranurasDeMas(fs, addonsDir) {
  const numeros = [];
  for (const nombre of fs.readdirSync(addonsDir)) {
    const m = NOMBRE_RANURA.exec(nombre);
    if (m && Number(m[1]) > RANURAS) numeros.push(Number(m[1]));
  }
  return numeros.sort((a, b) => a - b);
}

// La carpeta de AddOns tiene que ser una carpeta (se admite que sea una unión que el usuario puso a propósito).
function esCarpetaNormalOEnlace(fs, ruta) {
  try {
    return fs.statSync(ruta).isDirectory();
  } catch {
    return false;
  }
}
