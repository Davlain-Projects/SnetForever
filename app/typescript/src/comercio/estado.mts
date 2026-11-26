// Estado del comercio en la app: quién juega (identidad), qué casas se usan, cuáles se han descubierto y lo último que
// se bajó de cada casa. Se guarda en `<datos>\comercio\estado.json`.
//
// - identidad: {region, reino, faccion} del último personaje que abrió la subasta (la deja el addon en
//   SnetForeverCuenta.comercio.identidad; la app la lee de SavedVariables solo con el juego cerrado). F10: con el juego
//   abierto, tras un /reload, se leen solo los escaneos (alLeerEscaneos): ni la identidad ni las facciones cambian.
// - vistas: el bando del último personaje de cada tipo de reino ("<region>|<reino>" → faccion). Con personajes en otro tipo
//   de reino se siguen también sus casas.
// - jugadas (F7): las facciones con personajes de cada tipo de reino ("<region>|<reino>" → ["Horde", "Alliance"…]): la de
//   cada identidad que llega y la de cada escaneo de la subasta de una facción (solo un personaje de esa facción la abre).
//   Se sigue la casa de cada una de esas facciones más la neutral (casasSeguidas); la de una facción sin personajes, nunca.
//   Un estado.json de antes (sin jugadas) las saca de vistas y de la identidad.
// - conocidas: las casas descubiertas ("<reino>|<faccion>" → casa). F7: no hay casa supuesta; sin descubrir, no se baja.
// - probados (F7): la hora del último escaneo probado de cada casa ("<reino>|<faccion>" → hora): cada subasta (la de la
//   facción y la neutral) se descubre con su propio escaneo. escaneoProbado (el de antes, uno solo) se sigue escribiendo y,
//   leído de un estado.json de antes, vale para las casas que aún no tienen el suyo.
// - sinCasa (F7, ronda 1): cuándo (ms) un escaneo de "<reino>|<faccion>" no se pareció a ninguna candidata. Durante 24 h
//   no se vuelve a probar esa casa (cada intento son ~25 MB), aunque lleguen escaneos nuevos.
// - Ronda 1: un estado.json de antes de F7 con la identidad de la Horda y la 114 en sus casas (la 114 supuesta, la única
//   comprobada) pasa a tener "<reino>|Horde" = 114 en conocidas, para que la Horda se siga bajando al actualizar.
// - desde: el Last-Modified de la última foto completa de cada casa ("<region>|<casa>" → {subastas, mercancias, cuentas}),
//   para preguntar con If-Modified-Since; `cuentas` dice cuántas subastas y mercancías traía (para aceptar listas vacías).
// - seq: el número de la última ranura de precios escrita (siempre crece).
// - casas: las casas en uso, solo para verlas en el archivo (se recalculan siempre).
// Un estado.json roto se aparta (nunca se borra) y se empieza de cero.
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { escribirAtomico } from '../buzon.mjs';
import { HOSTS_BLIZZARD } from '../actualizar/origen.mjs';
import { leerVariablesGuardadas, entradas } from '../base/leer-lua.mjs';
import { casasSeguidas } from './casas.mjs';

export const ARCHIVO_ESTADO = 'estado.json';
const VERSION = 1;
// Las regiones que tienen API: las de HOSTS_BLIZZARD («us.api…» → us).
export const REGIONES = HOSTS_BLIZZARD.map((h) => /^([a-z]{2})\.api\./.exec(h)?.[1]).filter(Boolean);
const FACCIONES = ['Horde', 'Alliance', 'Neutral'];
const MAX_TEXTO = 40;
const MAX_OBJETOS_ESCANEO = 1000;
const ARCHIVO_CUENTA = 'SnetForever.lua';
const GLOBAL_CUENTA = 'SnetForeverCuenta';
const MAX_BYTES_CUENTA = 5 * 1024 * 1024;

const vacio = () => ({
  version: VERSION, identidad: null, vistas: {}, jugadas: {}, conocidas: {}, desde: {}, seq: 0, escaneoProbado: 0, probados: {},
  sinCasa: {}, casas: [],
});
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = (v) => (typeof v === 'string' && v.trim() !== '' && v.length <= MAX_TEXTO ? v.trim() : null);

/** {region, reino, faccion} limpia ('US' → 'us'), o null si falta algo o la región no tiene API. */
export function normalizarIdentidad(i) {
  if (!objeto(i)) return null;
  const region = texto(i.region)?.toLowerCase();
  const reino = texto(i.reino);
  const faccion = texto(i.faccion);
  if (!REGIONES.includes(region) || !reino || !FACCIONES.includes(faccion)) return null;
  return { region, reino, faccion };
}

const igual = (a, b) => a?.region === b?.region && a?.reino === b?.reino && a?.faccion === b?.faccion;

// {[item]: {[precio]: cantidad}} con números de verdad; lo que no vale se salta. Sirve para tablas de Lua leídas
// (que pueden salir como arrays si las claves son 1…n).
function normalizarMuestras(m) {
  const salida = {};
  let n = 0;
  for (const [item, precios] of entradas(m)) {
    if (n >= MAX_OBJETOS_ESCANEO) break;
    if (!Number.isInteger(item) || item <= 0) continue;
    const fila = {};
    for (const [precio, cantidad] of entradas(precios)) {
      if (Number.isInteger(precio) && precio > 0 && Number.isFinite(cantidad) && cantidad > 0) fila[precio] = cantidad;
    }
    if (Object.keys(fila).length > 0) {
      salida[item] = fila;
      n += 1;
    }
  }
  return salida;
}

/**
 * Un escaneo tal como lo guarda el addon, limpio: {hora, identidad|null, jugador|null, muestras}, o null. F7: en los
 * escaneos por subasta (SnetForeverCuenta.comercio.escaneos), identidad.faccion es la de la subasta (la de su subastador:
 * «Neutral» en la neutral) y jugador, la del personaje que la leyó.
 */
export function normalizarEscaneo(e) {
  if (!objeto(e) || !Number.isFinite(e.hora) || e.hora <= 0) return null;
  const muestras = normalizarMuestras(e.muestras);
  if (Object.keys(muestras).length === 0) return null;
  const jugador = FACCIONES.includes(e.jugador) ? e.jugador : null;
  return { hora: e.hora, identidad: normalizarIdentidad(e.identidad), jugador, muestras };
}

// F7: las facciones con personajes de un estado.json, limpias; sin el campo (un estado de antes), las de vistas y la de la
// identidad.
function jugadasDe(j, identidad) {
  const salida = {};
  const anadir = (clave, faccion) => {
    if (typeof clave !== 'string' || !FACCIONES.includes(faccion)) return;
    const lista = (salida[clave] ||= []);
    if (!lista.includes(faccion)) lista.push(faccion);
  };
  if (objeto(j.jugadas)) {
    for (const [clave, lista] of Object.entries(j.jugadas)) if (Array.isArray(lista)) for (const f of lista) anadir(clave, f);
  }
  if (objeto(j.vistas)) for (const [clave, f] of Object.entries(j.vistas)) anadir(clave, f);
  if (identidad) anadir(`${identidad.region}|${identidad.reino}`, identidad.faccion);
  return salida;
}

/**
 * El estado del comercio. `fs` y `carpeta` (la carpeta `comercio` de los datos) se inyectan; `opciones` (reintentador,
 * mover, dormir) van tal cual a la escritura atómica.
 */
export function crearEstadoComercio({ fs = fsReal, carpeta, opciones = {} }) {
  const ruta = join(carpeta, ARCHIVO_ESTADO);
  let est = null;
  // F7: los escaneos que faltan comparar con las casas, uno por casa ("<reino>|<faccion>" → escaneo; solo en memoria: se
  // vuelven a leer de SavedVariables).
  const pendientes = new Map();
  let probadoAntes = 0; // el escaneoProbado de un estado.json de antes de F7 (para las casas sin el suyo en probados)

  function cargar() {
    est = vacio();
    try {
      const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      if (objeto(j) && j.version === VERSION) {
        const identidad = normalizarIdentidad(j.identidad);
        est = {
          ...vacio(),
          identidad,
          vistas: objeto(j.vistas) ? j.vistas : {},
          jugadas: jugadasDe(j, identidad),
          conocidas: objeto(j.conocidas) ? j.conocidas : {},
          desde: objeto(j.desde) ? j.desde : {},
          seq: Number.isFinite(j.seq) ? j.seq : 0,
          escaneoProbado: Number.isFinite(j.escaneoProbado) ? j.escaneoProbado : 0,
          probados: objeto(j.probados) ? j.probados : {},
        };
        if (!objeto(j.probados)) probadoAntes = est.escaneoProbado;
        // F7, ronda 1: un estado de antes de F7 (sin jugadas ni probados) conocía la 114 solo por suposición: conocidas
        // vacías y la 114 en sus casas. La 114 es la comprobada (con datos de verdad, fixtures/comercio-114.json), así
        // que, con la identidad de la Horda, pasa a descubierta en su reino; si no, la Horda dejaría de bajarse al
        // actualizar. La 111 y la 117 (supuestas sin comprobar) no se migran.
        const antesDeF7 = !objeto(j.jugadas) && !objeto(j.probados);
        const claveHorda = identidad && `${identidad.reino}|Horde`;
        if (antesDeF7 && identidad?.faccion === 'Horde' && Array.isArray(j.casas) && j.casas.includes(114) && est.conocidas[claveHorda] == null) {
          est.conocidas = { ...est.conocidas, [claveHorda]: 114 };
        }
        est.sinCasa = objeto(j.sinCasa) ? j.sinCasa : {};
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        try {
          fs.renameSync(ruta, `${ruta}.roto-${Date.now()}`);
        } catch {
          // si ni así se puede, se sobrescribirá al guardar
        }
      }
    }
    return est;
  }
  const estado = () => est || cargar();

  function enUso() {
    const e = estado();
    const yo = e.identidad;
    if (!yo) return null;
    const casas = [];
    // F7: en cada tipo de reino, la casa de cada facción con personajes y la neutral (solo las descubiertas).
    const anadir = (identidad) => {
      const jugadas = e.jugadas[`${identidad.region}|${identidad.reino}`] ?? [];
      for (const c of casasSeguidas(identidad, e.conocidas, jugadas)) if (!casas.includes(c)) casas.push(c);
    };
    anadir(yo);
    for (const clave of new Set([...Object.keys(e.vistas), ...Object.keys(e.jugadas)])) {
      const [region, reino] = clave.split('|');
      if (region !== yo.region || reino === yo.reino) continue;
      const otra = normalizarIdentidad({ region, reino, faccion: e.vistas[clave] ?? e.jugadas[clave]?.[0] });
      if (otra) anadir(otra);
    }
    return { region: yo.region, casas };
  }

  // F7: apunta que hay personajes de esa facción en ese tipo de reino. true si es nueva.
  function jugada(region, reino, faccion) {
    if (!FACCIONES.includes(faccion)) return false;
    const lista = (estado().jugadas[`${region}|${reino}`] ||= []);
    if (lista.includes(faccion)) return false;
    lista.push(faccion);
    return true;
  }

  /** Pone la identidad del personaje en uso (y apunta su facción entre las que tienen personajes). true si ha cambiado. */
  function ponerIdentidad(i) {
    const limpia = normalizarIdentidad(i);
    if (!limpia) return false;
    const e = estado();
    jugada(limpia.region, limpia.reino, limpia.faccion);
    e.vistas[`${limpia.region}|${limpia.reino}`] = limpia.faccion;
    if (igual(e.identidad, limpia)) return false;
    e.identidad = limpia;
    return true;
  }

  /** Apunta la casa descubierta de un tipo de reino y bando. true si es nueva o ha cambiado. */
  function aprender(reino, faccion, casa) {
    const e = estado();
    const clave = `${reino}|${faccion}`;
    if (!Number.isInteger(casa) || e.conocidas[clave] === casa) return false;
    e.conocidas[clave] = casa;
    return true;
  }

  const claveEsc = (esc) => `${esc.identidad.reino}|${esc.identidad.faccion}`;
  const probado = (clave) => estado().probados[clave] ?? probadoAntes;

  /**
   * Lo leído de SavedVariables con el juego cerrado: {identidad, escaneo, escaneos} (de leerCuentas). Toma la identidad y
   * deja para descubrir cada escaneo más nuevo que el último probado de su casa, si esa casa no se conoce. F7: `escaneo` es
   * el de antes (ultimoEscaneo: la subasta de la facción del jugador); `escaneos`, uno por subasta, con la facción de su
   * subastador. Un escaneo de la subasta de una facción (o su `jugador`) dice que hay personajes de esa facción.
   * → {identidadCambiada, casasCambiadas, escaneosNuevos}: casasCambiadas, si hay una facción con personajes nueva (cambian
   * las casas); escaneosNuevos (F10), los que acaban de quedar por descubrir ({clave, faccion}, uno por casa).
   */
  function alLeerCuenta({ identidad, escaneo, escaneos }: { identidad?: any; escaneo?: any; escaneos?: any; } = {}) {
    const identidadCambiada = ponerIdentidad(identidad);
    let casasCambiadas = false;
    const nuevos = new Map();
    for (const crudo of [escaneo, ...(Array.isArray(escaneos) ? escaneos : [])]) {
      const esc = normalizarEscaneo(crudo);
      if (!esc) continue;
      const quien = esc.identidad || estado().identidad;
      if (!quien) continue;
      if (quien.faccion !== 'Neutral' && jugada(quien.region, quien.reino, quien.faccion)) casasCambiadas = true;
      if (esc.jugador && esc.jugador !== 'Neutral' && jugada(quien.region, quien.reino, esc.jugador)) casasCambiadas = true;
      dejarPendiente({ ...esc, identidad: quien }, nuevos);
    }
    return { identidadCambiada, casasCambiadas, escaneosNuevos: [...nuevos.values()] };
  }

  // Deja el escaneo para descubrir si su casa no se conoce y es más nuevo que el probado y que el que ya esperaba.
  function dejarPendiente(listo, nuevos) {
    const clave = claveEsc(listo);
    const antes = pendientes.get(clave);
    if (estado().conocidas[clave] != null || listo.hora <= probado(clave) || (antes && listo.hora <= antes.hora)) return;
    pendientes.set(clave, listo);
    nuevos.set(clave, { clave, faccion: listo.identidad.faccion });
  }

  /**
   * F10: los escaneos leídos con el juego abierto (tras un /reload). No toca la identidad ni las facciones con personajes:
   * solo deja para descubrir, en un tipo de reino con personajes ya sabidos, su subasta neutral y las de esas facciones. Lo
   * demás (un reino sin personajes, que costaría hasta 5 candidatas, ~25 MB; una facción nueva; el ultimoEscaneo, que no dice
   * de qué subasta es con certeza) espera a la lectura con el juego cerrado, para que un escaneo no empiece a bajar nada por
   * su cuenta. → {escaneosNuevos}, como alLeerCuenta.
   */
  function alLeerEscaneos({ escaneos }: { escaneos?: any; } = {}) {
    const nuevos = new Map();
    for (const crudo of Array.isArray(escaneos) ? escaneos : []) {
      const esc = normalizarEscaneo(crudo);
      if (!esc?.identidad) continue;
      const { region, reino, faccion } = esc.identidad;
      const conPersonajes = estado().jugadas[`${region}|${reino}`] ?? [];
      if (conPersonajes.length === 0 || (faccion !== 'Neutral' && !conPersonajes.includes(faccion))) continue;
      dejarPendiente(esc, nuevos);
    }
    return { escaneosNuevos: [...nuevos.values()] };
  }

  // Un escaneo que falta comparar (el más viejo de los que `acepta`), si su casa sigue sin conocerse; null si no queda
  // ninguno. El programador usa `acepta` para saltarse los que ya probó hace menos de una hora.
  function porDescubrir(acepta: (scan: object) => boolean = () => true) {
    let elegido = null;
    for (const [clave, esc] of pendientes) {
      if (estado().conocidas[clave] != null || esc.hora <= probado(clave)) {
        pendientes.delete(clave);
        continue;
      }
      if (acepta(esc) && (!elegido || esc.hora < elegido.hora)) elegido = esc;
    }
    return elegido;
  }

  // Ya se probó este escaneo (haya salido o no): no se vuelve a probar.
  function descubierto(esc) {
    if (!esc?.identidad) return;
    const e = estado();
    const clave = claveEsc(esc);
    if (esc.hora > probado(clave)) e.probados[clave] = esc.hora;
    if (esc.hora > e.escaneoProbado) e.escaneoProbado = esc.hora;
    const p = pendientes.get(clave);
    if (p && p.hora <= esc.hora) pendientes.delete(clave);
  }

  // El desde de una casa y, si se sabe, cuántas subastas y mercancías traía su última foto (`cuentas`).
  const desde = (region, casa) => {
    const d = estado().desde[`${region}|${casa}`];
    if (!objeto(d)) return {};
    const salida: { subastas: any; mercancias: any; cuentas?: any; } = { subastas: d.subastas ?? undefined, mercancias: d.mercancias ?? undefined };
    if (objeto(d.cuentas)) salida.cuentas = { subastas: d.cuentas.subastas, mercancias: d.cuentas.mercancias };
    return salida;
  };
  function ponerDesde(region, casa, { subastas, mercancias, cuentas }: { subastas?: any; mercancias?: any; cuentas?: any; } = {}) {
    const d: { subastas: any; mercancias: any; cuentas?: any; } = { subastas: subastas ?? null, mercancias: mercancias ?? null };
    if (objeto(cuentas)) d.cuentas = { subastas: cuentas.subastas, mercancias: cuentas.mercancias };
    estado().desde[`${region}|${casa}`] = d;
  }

  /** El seq de la ranura siguiente: siempre mayor que el anterior y, como mínimo, los segundos de `ahoraMs`. */
  function siguienteSeq(ahoraMs) {
    const e = estado();
    e.seq = Math.max(e.seq + 1, Math.floor(ahoraMs / 1000));
    return e.seq;
  }

  async function guardar() {
    const e = estado();
    e.casas = enUso()?.casas ?? [];
    fs.mkdirSync(carpeta, { recursive: true });
    await escribirAtomico(fs, ruta, JSON.stringify(e, null, 2), opciones);
  }

  return {
    identidad: () => estado().identidad,
    conocidas: () => ({ ...estado().conocidas }),
    jugadas: () => JSON.parse(JSON.stringify(estado().jugadas)),
    // F7, ronda 1: cuándo (ms) la casa de "<reino>|<faccion>" no salió con ningún escaneo (null si nunca), y apuntarlo.
    sinCasa: (clave) => (Number.isFinite(estado().sinCasa[clave]) ? estado().sinCasa[clave] : null),
    ponerSinCasa: (clave, ms) => { estado().sinCasa[clave] = ms; },
    enUso, ponerIdentidad, aprender, alLeerCuenta, alLeerEscaneos, porDescubrir, descubierto, desde, ponerDesde, siguienteSeq,
    guardar,
  };
}

// ---------- SavedVariables de la cuenta (solo lectura) ----------

// La entrada de `dir` que se llama `nombre` sin mirar mayúsculas (Windows no las distingue).
function hijo(fs, dir, nombre) {
  try {
    const encontrado = fs.readdirSync(dir).find((n) => n.toLowerCase() === nombre.toLowerCase());
    return encontrado === undefined ? null : join(dir, encontrado);
  } catch {
    return null;
  }
}

// Los SnetForever.lua de las cuentas del juego; null si no hay carpeta de cuentas.
function archivosDeCuentas(fs, raizJuego) {
  const wtf = typeof raizJuego === 'string' ? hijo(fs, raizJuego, 'WTF') : null;
  const account = wtf && hijo(fs, wtf, 'Account');
  if (!account) return null;
  let dirs;
  try {
    dirs = fs.readdirSync(account, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(account, d.name));
  } catch {
    return null;
  }
  const archivos = [];
  for (const dir of dirs) {
    const sv = hijo(fs, dir, 'SavedVariables');
    const archivo = sv && hijo(fs, sv, ARCHIVO_CUENTA);
    if (archivo) archivos.push(archivo);
  }
  return archivos;
}

/**
 * F10: cómo están ahora los SnetForever.lua, sin abrirlos: {firma, ultimo} (firma cambia si cambia la fecha o el tamaño de
 * alguno; ultimo, la fecha más reciente en ms), o null si no hay ninguno. La firma lleva rutas: solo para comparar en
 * memoria, nunca para el registro.
 */
export function firmaCuentas(raizJuego, { fs = fsReal } = {}) {
  const archivos = archivosDeCuentas(fs, raizJuego);
  if (!archivos || archivos.length === 0) return null;
  let ultimo = -Infinity;
  const partes = archivos.map((archivo) => {
    try {
      const st = fs.statSync(archivo);
      ultimo = Math.max(ultimo, st.mtimeMs);
      return `${archivo}|${st.mtimeMs}|${st.size}`;
    } catch {
      return `${archivo}|?`;
    }
  });
  return { firma: partes.sort().join('\n'), ultimo };
}

/**
 * Lo del comercio en los SavedVariables de las cuentas del juego (`<raizJuego>\WTF\Account\*\SavedVariables\SnetForever.lua`,
 * en solo lectura y de 5 MB como mucho): `{identidad, escaneo, escaneos}` o null si no hay nada. La identidad es la del
 * archivo escrito más recientemente (WoW lo escribe al salir de esa cuenta); el escaneo, el de `hora` más nueva. F7:
 * escaneos, el más nuevo de cada subasta (SnetForeverCuenta.comercio.escaneos[facción del subastador]). Los archivos que
 * no se pueden leer se saltan (y se apunta solo el motivo, nunca la ruta: lleva el nombre de la cuenta).
 */
export function leerCuentas(raizJuego, { fs = fsReal, registrar = (() => {}) as (level: string, message: string) => void } = {}) {
  const archivos = archivosDeCuentas(fs, raizJuego);
  if (!archivos) return null;
  let identidad = null;
  let mtimeIdentidad = -Infinity;
  let escaneo = null;
  const escaneos = new Map(); // F7: "<region>|<reino>|<facción de la subasta>" → el escaneo más nuevo de esa subasta
  for (const archivo of archivos) {
    let cuenta;
    let mtime;
    try {
      const st = fs.statSync(archivo);
      if (!st.isFile() || st.size > MAX_BYTES_CUENTA) continue;
      mtime = st.mtimeMs;
      const contenido = fs.readFileSync(archivo, 'utf8');
      const sinBom = contenido.charCodeAt(0) === 0xfeff ? contenido.slice(1) : contenido;
      cuenta = leerVariablesGuardadas(sinBom, GLOBAL_CUENTA, ARCHIVO_CUENTA);
    } catch (e) {
      const m = /^SnetForever\.lua:\d+/.exec(String(e?.message ?? ''));
      registrar('aviso', `comercio: se salta un ${ARCHIVO_CUENTA} que no se puede leer (${m ? m[0] : e?.code || 'error'})`);
      continue;
    }
    const comercio = objeto(cuenta) && objeto(cuenta.comercio) ? cuenta.comercio : null;
    if (!comercio) continue;
    const id = normalizarIdentidad(comercio.identidad);
    if (id && mtime > mtimeIdentidad) {
      identidad = id;
      mtimeIdentidad = mtime;
    }
    const esc = normalizarEscaneo(comercio.ultimoEscaneo);
    if (esc && (!escaneo || esc.hora > escaneo.hora)) escaneo = esc;
    for (const [, crudo] of entradas(comercio.escaneos)) {
      const e = normalizarEscaneo(crudo);
      if (!e?.identidad) continue;
      const clave = `${e.identidad.region}|${e.identidad.reino}|${e.identidad.faccion}`;
      if (!escaneos.has(clave) || e.hora > escaneos.get(clave).hora) escaneos.set(clave, e);
    }
  }
  if (!identidad && !escaneo && escaneos.size === 0) return null;
  return { identidad, escaneo, escaneos: [...escaneos.values()] };
}
