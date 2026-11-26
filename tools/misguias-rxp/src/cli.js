// La orden del conversor de RestedXP a Mis guías:
//
//   node src/cli.js <carpeta de las guías de RestedXP> <carpeta de salida>
//
// Variables de entorno (todas opcionales; nada de rutas escritas en el código):
//   TRADUCCIONES=<json {inglés: español}>   los textos que estén ahí salen en español (el inglés, en *_en); varios json
//                                            separados por «;» (con el mismo texto, manda el último)
//   ANTERIOR=<mis-guias.lua de antes>        los pasos que ya estaban conservan su id (el progreso del jugador)
//   EXCLUIR_RUTAS=<carpeta de SnetForever_Rutas>   se saltan las guías que ya están en Rutas
//   MISIONES=<carpeta de SnetForever_Misiones>     las misiones que no están en la base se quitan de los pasos
//   INCLUIR_SOD=1                            también las guías de Season of Discovery
//   SOLO_RAIZ=1                              solo los archivos de la carpeta de origen, sin subcarpetas
//
// Escribe en la carpeta de salida mis-guias.lua, pendientes.json (los textos en inglés, para traducir) e informe.json.
// Nunca escribe en otro sitio.
import * as fs from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertir, normClave } from './convertir.js';

// Los .lua de la carpeta, en el orden en que los da el sistema (como el conversor de antes), sin las carpetas de talentos
// ni de supervivencia (no son rutas de nivel).
function listar(dir, soloRaiz, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (soloRaiz || /^(Talents|SurvivalGuide)$/i.test(e.name)) continue;
      listar(p, soloRaiz, salida);
    } else if (e.name.endsWith('.lua')) {
      salida.push({ ruta: p, texto: fs.readFileSync(p, 'utf8') });
    }
  }
  return salida;
}

// Las claves de las guías que ya están en SnetForever_Rutas (grupo|título y *|título).
function clavesDeRutas(dir) {
  const claves = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => /^guias_\d+\.lua$/.test(x))) {
    const t = fs.readFileSync(join(dir, f), 'utf8');
    for (const m of t.matchAll(/grupo="([^"]*)",nombre="([^"]*)",titulo=\{en="([^"]*)"/g)) {
      claves.add(normClave(m[1]) + '|' + normClave(m[3]));
      claves.add('*|' + normClave(m[3]));
    }
  }
  return claves;
}

// Los ids de las misiones de la base (SnetForever_Misiones/quest_*.lua: «T[id]={»).
function misionesDeLaBase(dir) {
  const ids = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => /^quest_\d+\.lua$/.test(x))) {
    for (const m of fs.readFileSync(join(dir, f), 'utf8').matchAll(/T\[(\d+)\]=\{/g)) ids.add(+m[1]);
  }
  return ids;
}

// Ronda 2: TRADUCCIONES puede traer varios json separados por «;»; si dos traen el mismo texto, manda el último.
function traduccionesDe(lista) {
  const salida = {};
  for (const ruta of lista.split(';').map((r) => r.trim()).filter(Boolean)) Object.assign(salida, JSON.parse(fs.readFileSync(ruta, 'utf8')));
  return salida;
}

/** Ejecuta la orden. Devuelve el código de salida (0: bien). */
export function principal(args, env = process.env, { escribir = console.log, error = console.error } = {}) {
  const [origen, salida] = args;
  if (!origen || !salida) {
    error('Uso: node src/cli.js <carpeta de las guías de RestedXP> <carpeta de salida>\n'
      + '  (opcionales: TRADUCCIONES, EXCLUIR_RUTAS, MISIONES, INCLUIR_SOD=1, SOLO_RAIZ=1)');
    return 2;
  }
  try {
    const archivos = listar(origen, Boolean(env.SOLO_RAIZ));
    const resultado = convertir(archivos, {
      traducciones: env.TRADUCCIONES ? traduccionesDe(env.TRADUCCIONES) : null,
      anterior: env.ANTERIOR ? fs.readFileSync(env.ANTERIOR, 'utf8') : null,
      yaEnRutas: env.EXCLUIR_RUTAS ? clavesDeRutas(env.EXCLUIR_RUTAS) : null,
      misiones: env.MISIONES ? misionesDeLaBase(env.MISIONES) : null,
      incluirSod: Boolean(env.INCLUIR_SOD),
    });
    fs.mkdirSync(salida, { recursive: true });
    fs.writeFileSync(join(salida, 'mis-guias.lua'), resultado.lua, 'utf8');
    fs.writeFileSync(join(salida, 'pendientes.json'), JSON.stringify(resultado.pendientes, null, 1), 'utf8');
    fs.writeFileSync(join(salida, 'informe.json'), JSON.stringify(resultado.informe, null, 2), 'utf8');
    const { listaYaExistentes, ...resumen } = resultado.informe;
    escribir(JSON.stringify(resumen, null, 2));
    return 0;
  } catch (e) {
    error(`No se pudo convertir: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv.slice(2));
}
