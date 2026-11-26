import { existsSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escribirRutas, NOMBRE_ADDON_RXP } from './escribir/rutas.js';
import { cargarMapas } from './rxp/coordenadas.js';
import { construirGuias } from './rxp/guias.js';
import { diagnosticarEnlaces } from './rxp/diagnostico.js';
import { crearPaquete } from './rxp/paquete.js';

const RAIZ_REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CARPETA_GUIAS = 'Guides/forever';
const PREFIJO = 'RXP\\';
const GRUPO = 'Mis guías RXP · ';

function fuentesDe(origen) {
  const carpeta = join(origen, CARPETA_GUIAS);
  return readdirSync(carpeta, { recursive: true, withFileTypes: true })
    .filter((entrada) => entrada.isFile() && /\.lua$/i.test(entrada.name))
    .map((entrada) => relative(carpeta, join(entrada.parentPath, entrada.name)).split(sep).join('/'))
    .sort()
    .map((archivo) => ({
      en: `${CARPETA_GUIAS}/${archivo}`,
      es: `lang/Guides-esES/forever/${archivo}`,
      tipo: archivo.startsWith('dungeon/') ? 'mazmorras' : 'normal',
    }));
}

function referencias(siguientes) {
  return siguientes.map((siguiente) => siguiente.clave ? { ...siguiente, clave: PREFIJO + siguiente.clave } : siguiente);
}

function separarDeLasGuiasExistentes(guia) {
  guia.clave = PREFIJO + guia.clave;
  guia.grupo = GRUPO + guia.grupo;
  guia.tipo = 'propia';
  guia.niveles ??= [1, 60];
  guia.siguientes = referencias(guia.siguientes);
  for (const variante of guia.variantes ?? []) {
    variante.clave = PREFIJO + variante.clave;
    variante.grupo = GRUPO + variante.grupo;
  }
  for (const paso of guia.pasos) {
    if (paso.de) paso.de = PREFIJO + paso.de;
    for (const elemento of paso.elementos) {
      if (elemento.siguientes) elemento.siguientes = referencias(elemento.siguientes);
    }
  }
  return guia;
}

function salidaFueraDelRepo(carpetaSalida) {
  const salida = realpathSync(carpetaSalida);
  const respectoAlRepo = relative(realpathSync(RAIZ_REPO), salida);
  if (!isAbsolute(respectoAlRepo) && respectoAlRepo !== '..' && !respectoAlRepo.startsWith(`..${sep}`)) {
    throw new Error('La carpeta de salida debe estar fuera del repositorio.');
  }
  return salida;
}

/** Las guías de Forever de la carpeta, ya con las claves «RXP\…», y lo que no se pudo resolver. */
function construir(origen) {
  const { guias, avisos, estadisticas } = construirGuias(fuentesDe(origen), {
    origen,
    mapas: cargarMapas(join(origen, 'DB', 'forever', 'db.lua')),
    enlaces: {},
    siguientesExtra: {},
    soloEnlacesOriginales: true,
    xpVariable: true,
  });
  if (guias.size === 0) throw new Error('La carpeta de origen no contiene guías de Forever que se puedan cargar.');
  const diagnostico = diagnosticarEnlaces({ origen, avisos, guias })
    .map((d) => ({ ...d, desde: PREFIJO + d.desde, parecidos: d.parecidos.map((p) => ({ ...p, clave: PREFIJO + p.clave })) }));
  const personales = new Map();
  for (const guia of guias.values()) {
    const personal = separarDeLasGuiasExistentes(guia);
    personales.set(personal.clave, personal);
  }
  return {
    personales, diagnostico,
    inclusionesSinResolver: estadisticas.includes.fallidos,
    enlacesSinResolver: estadisticas.next.sinResolver + estadisticas.nextComandos.sinResolver,
    comandosSinInterpretar: avisos.filter((aviso) =>
      aviso.tipo === 'comando-desconocido' || aviso.tipo === 'comando-no-valido').length,
  };
}

const versionDeHoy = () => new Date().toISOString().slice(0, 10).replaceAll('-', '.') + '.1';

/** Genera un addon de datos privado a partir de los archivos originales de Forever. */
export function importarRXP(origen, carpetaSalida, version = versionDeHoy()) {
  const salida = salidaFueraDelRepo(carpetaSalida);
  const destino = join(salida, NOMBRE_ADDON_RXP);
  if (existsSync(destino)) throw new Error('La carpeta SnetForever_RutasRXP ya existe en la salida.');
  const { personales, diagnostico, ...cuentas } = construir(origen);

  const temporal = mkdtempSync(join(salida, '.snet-rxp-'));
  try {
    const { bytes, archivos } = escribirRutas(personales, temporal, { version, dirRxp: origen, personal: true });
    renameSync(temporal, destino);
    return {
      destino, archivos: archivos.length, bytes, guias: personales.size,
      pasos: [...personales.values()].reduce((total, guia) => total + guia.pasos.length, 0),
      inclusionesSinResolver: cuentas.inclusionesSinResolver,
      enlacesSinResolver: cuentas.enlacesSinResolver,
      enlacesSinResolverDetalle: diagnostico,
      comandosSinInterpretar: cuentas.comandosSinInterpretar,
    };
  } finally {
    // El nombre temporal se genera bajo la salida verificada e identifica solo lo escrito en esta importación.
    if (existsSync(temporal)) rmSync(temporal, { recursive: true });
  }
}

/**
 * Las guías que piden los selectores: «<grupo>» elige el grupo entero y «<grupo>\<tramo>», un tramo (también por la
 * clave de una de sus variantes). Un selector que no elige nada es un error: nunca se prepara un paquete a medias.
 */
function elegir(personales, selectores) {
  if (selectores.length === 0) throw new Error('Indica al menos un grupo o un tramo para el paquete.');
  const elegidas = new Map();
  const sinGuias = [];
  for (const selector of selectores) {
    const texto = selector.trim();
    let alguna = false;
    for (const [clave, guia] of personales) {
      const variantes = guia.variantes ?? [];
      const porTramo = clave === PREFIJO + texto || variantes.some((v) => v.clave === PREFIJO + texto);
      const porGrupo = guia.grupo === GRUPO + texto || variantes.some((v) => v.grupo === GRUPO + texto);
      if (porTramo || porGrupo) {
        elegidas.set(clave, guia);
        alguna = true;
      }
    }
    if (!alguna) sinGuias.push(texto);
  }
  if (sinGuias.length > 0) throw new Error(`No hay ninguna guía de Forever con estos nombres: ${sinGuias.join(' | ')}`);
  return elegidas;
}

const nombreParte = (k, n) => `parte-${String(k).padStart(2, '0')}-de-${String(n).padStart(2, '0')}.txt`;

function leeme(paquete, elegidas, sinResolver) {
  const { id, suma, partes, resumen } = paquete;
  const n = partes.length;
  const partesTexto = n === 1 ? 'la parte' : `las ${n} partes`;
  const lineas = [
    'PAQUETE DE GUÍAS RXP PARA IMPORTAR DESDE EL JUEGO',
    '=================================================',
    '',
    `Paquete ${id} · ${n} ${n === 1 ? 'parte' : 'partes'} · ${resumen.guias} guías · ${resumen.pasos} pasos · suma ${suma}`,
    '',
    'Es para tu uso personal: no lo compartas. No hace falta cerrar el juego ni instalar nada.',
    '',
    '1. En la ventana de SnetForever abre el selector de guías y pulsa «Mis guías: importar de RestedXP…».',
    '   También puedes escribir /snet importar.',
    '2. Abre una parte con el Bloc de notas y pulsa Ctrl+A y Ctrl+C. En el juego, haz clic en el cuadro de la',
    '   ventana y pulsa Ctrl+V. Repite con cada parte, en cualquier orden.',
    `3. Con ${partesTexto}, la ventana comprueba el paquete. Debe decir «Paquete ${id}», ${resumen.guias} guías`,
    `   y ${resumen.pasos} pasos. Si algo no cuadra, no se importa nada y la ventana dice qué falla.`,
    '4. Pulsa Importar. Las guías salen en el selector, en los grupos «Mis guías RXP · …».',
    '   Si ya tenías esas guías, se sustituyen y conservas el progreso de los pasos que siguen igual.',
    '',
    'Partes:',
    ...partes.map((_, k) => `  ${nombreParte(k + 1, n)}`),
    '',
    'Guías:',
    ...[...elegidas.keys()].map((clave) => `  ${clave}`),
  ];
  if (resumen.fuera.length > 0) {
    lineas.push('', 'Guías a las que llevan estas y que no van en el paquete (se usan si ya las tienes):',
      ...resumen.fuera.map((clave) => `  ${clave}`));
  }
  if (sinResolver.length > 0) {
    lineas.push('', 'Enlaces que ya faltan en la biblioteca de origen (el recorrido se queda en ese tramo):',
      ...sinResolver.map((d) => `  ${d.desde} → «${d.destino}» (${d.motivo})`));
  }
  return `${lineas.join('\r\n')}\r\n`;
}

/**
 * Prepara un paquete para importar desde el juego con las guías que piden los selectores. Escribe en
 * `<salida>/SnetForever_ImportarRXP_<id>` una parte por archivo (una sola línea) y un LEEME.txt con los pasos y lo
 * que debe decir el juego. Nunca escribe en AddOns ni en el repositorio.
 */
export function importarRXPJuego(origen, carpetaSalida, selectores, { version = versionDeHoy(), tamanoParte } = {}) {
  const salida = salidaFueraDelRepo(carpetaSalida);
  const { personales, diagnostico } = construir(origen);
  const elegidas = elegir(personales, selectores);
  const paquete = crearPaquete(elegidas, { version, tamanoParte });
  const destino = join(salida, `SnetForever_ImportarRXP_${paquete.id}`);
  if (existsSync(destino)) throw new Error(`La carpeta ${destino} ya existe en la salida.`);
  const sinResolver = diagnostico.filter((d) => elegidas.has(d.desde));
  const temporal = mkdtempSync(join(salida, '.snet-rxp-'));
  try {
    paquete.partes.forEach((parte, k) => {
      writeFileSync(join(temporal, nombreParte(k + 1, paquete.partes.length)), parte, 'ascii');
    });
    writeFileSync(join(temporal, 'LEEME.txt'), leeme(paquete, elegidas, sinResolver), 'utf8');
    renameSync(temporal, destino);
  } finally {
    if (existsSync(temporal)) rmSync(temporal, { recursive: true });
  }
  return {
    destino, id: paquete.id, suma: paquete.suma, partes: paquete.partes.length, caracteres: paquete.texto.length,
    guias: paquete.resumen.guias, pasos: paquete.resumen.pasos, fuera: paquete.resumen.fuera,
    enlacesSinResolverDetalle: sinResolver,
  };
}

const USO = [
  'Uso: npm run importar:rxp -- "<carpeta RXPGuides>" "<carpeta de salida>"',
  '     npm run importar:rxp -- --juego "<carpeta RXPGuides>" "<carpeta de salida>" "<grupo>" ["<grupo>\\<tramo>" ...]',
].join('\n');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const juego = args[0] === '--juego';
  const [origen, salida, ...resto] = juego ? args.slice(1) : args;
  if (!origen || !salida || (juego ? resto.length === 0 : resto.length > 0)) {
    console.error(USO);
    process.exitCode = 2;
  } else {
    try {
      const resultado = juego
        ? importarRXPJuego(resolve(origen), resolve(salida), resto)
        : importarRXP(resolve(origen), resolve(salida));
      console.log(JSON.stringify(resultado, null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
