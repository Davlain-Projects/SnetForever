// F9m: contador TEMPORAL de «Salen al día». Mide 48 horas y se apaga solo; después este código queda inerte hasta que se
// quite en una versión normal. Recoge cifras agregadas, por objeto y par de fotos, para ver qué parte de lo que se cuenta
// como salida PODRÍA ser una subasta cancelada y vuelta a publicar (investigación F9, apartados 1.4 y 2.2). No da ningún
// veredicto: la API no distingue una venta de una cancelación, y este archivo tampoco.
//
// LO QUE NO HACE. No baja nada ni llama a la API: mira el par de fotos que el historial acaba de comparar. No abre la
// clave de Blizzard (blizzard.dat): solo toca sus dos archivos. No cambia ningún número: recibe una COPIA de las
// dos fotos, y un fallo dentro se apunta una vez, lo apaga para esta ejecución y el historial sigue como si nada. El
// archivo no sale del PC: no va a la IA ni al addon.
//
// QUÉ MIDE. Solo la casa 114 (la Horda de este reino) y solo si el estado la tiene descubierta como "<reino>|Horde". Con
// cualquier otra casa no hace nada: ni archivo ni memoria. Solo mercancías: la lana (2592), el lino (2589) y las 20
// mercancías con más unidades en la foto nueva del primer par. La lista se fija al empezar y se guarda en el archivo.
//
// CUÁNDO. Empieza con el primer par válido (con mercancías en las dos fotos) de la 114, y nunca desde el 21-dic-2026 a las
// 00:00 UTC (LIMITE_INICIO_S, con la hora de la foto): así una carpeta de datos borrada o una instalación nueva no vuelven a
// medir. Una medición ya en marcha acaba sus 48 h. La hora de inicio va en el archivo, así que reiniciar la app no vuelve a
// empezar. Con un par de 48 h o más desde el inicio escribe la línea de cierre y no vuelve a escribir nunca. Si el PC estuvo
// apagado, los huecos se quedan como huecos: la ventana no se alarga. Si el archivo llegara al tope de bytes (TOPE_BYTES),
// también se cierra.
//
// EL ARCHIVO: `diag-salen-<casa>.csv`, en la carpeta `comercio` de los datos. Solo se añade al final:
//   #medir-salen v3 casa=<casa> inicio=<segundos> objetos=<id,id,...>
//   hora,hueco_s,item,... (las columnas de abajo)
//   ...una línea por objeto y par...
//   #cierre hora=<segundos> motivo=48h|tope
// Una línea a medias por un corte de luz se deja donde está y se le pega `#cortada`, así que al leer no vale como dato. Una
// foto repetida tras un reinicio (la misma hora) no se vuelve a escribir.
//
// LA MARCA: `diag-salen-114.marca`, al lado del CSV, con solo la hora de inicio en segundos. Es la memoria de que ya se midió:
// sin ella no se escribe ninguna fila.
//   · sin marca y sin CSV (o vacío): empieza; escribe la cabecera y después la marca. Si la marca no se puede escribir, se
//     apaga en esta ejecución sin escribir filas;
//   · cabecera válida sin marca (un corte entre las dos escrituras): crea la marca con ese inicio y sigue;
//   · con marca y un CSV que no está, está vacío o no se entiende (movido, vaciado, guardado con CRLF o UTF-16): no toca nada
//     y sigue apagado;
//   · con marca y CSV válido del mismo inicio: sigue hasta las 48 h;
//   · sin marca y con un archivo sin cabecera válida: no empieza ni lo toca. La única excepción es un archivo que solo trae
//     el principio de la cabecera (un corte en la primera escritura): ahí no se llegó a medir nada y empieza.
//
// LAS COLUMNAS (unidades salvo donde se dice; ningún id de subasta, vendedor ni nombre):
//   hora                  segundos desde 1970 de la foto nueva del par.
//   hueco_s               segundos entre las dos fotos del par.
//   item                  el objeto.
//   unidades_a_la_venta   unidades de la mercancía en la foto nueva.
//   subastas              subastas de la mercancía en la foto nueva.
//   salen_u               lo que `contarVentas` contaría SIN el filtro de P*: salidas antes de tiempo más compras parciales.
//   descartadas_u         lo que el filtro quita: salió antes de tiempo a más de P* (más que la intacta más barata).
//   contadas_u            lo que de verdad suma a «Salen al día» en ese par (salen_u - descartadas_u).
//   parciales_u           de las contadas, las de subastas que siguen con menos cantidad.
//   caducadas_n           SUBASTAS (no unidades) que el historial da por caducadas en ese par.
//   altura_P_pct          % de las unidades de la foto anterior con precio por debajo de P*; vacío si no hay ninguna intacta.
//   vuelven_lote_10pct_u  de las contadas, las que reaparecen como subasta nueva con el mismo lote y un precio a ±10 %. Solo
//                         para comparar: la reposición normal usa los mismos lotes y también lo marca.
//   vuelven_bajo_minimo_u de las contadas, las que PODRÍAN reaparecer: hay una subasta nueva con el mismo lote y un precio
//                         POR DEBAJO del mínimo de la foto anterior. Eligen primero las descartadas.
//   vuelven_bajo_minimo_max_u   lo mismo, eligiendo primero las contadas.
//   vuelven_hasta_minimo_max_u  lo mismo que la anterior, con un precio POR DEBAJO O IGUAL al mínimo: así se ve a quien
//                         republica igualando el mínimo.
//   nuevas_bajo_minimo_u  unidades de todas las subastas nuevas por debajo del mínimo anterior (0 si el objeto no estaba en
//                         la foto anterior: no hay mínimo). Es un control: un vendedor honrado también publica por debajo.
//   nuevas_hasta_minimo_u lo mismo, a ese mínimo o por debajo.
// Cómo se empareja: cada subasta que sale busca una subasta nueva de su mismo lote, y cada nueva solo sirve a una por
// criterio. Siempre es determinista (por id). Dentro de un lote se cumple siempre:
//   vuelven_bajo_minimo_u <= vuelven_bajo_minimo_max_u <= vuelven_hasta_minimo_max_u <= contadas_u.
// `vuelven_lote_10pct_u` empareja con las descartadas primero.
//
// CÓMO SE LEE, sumando las horas de cada objeto:
//   · contadas al día = Σ contadas_u / (pares / 24), como «Salen al día».
//   · S_min = Σ vuelven_bajo_minimo_u / Σ contadas_u y S_max_hasta = Σ vuelven_hasta_minimo_max_u / Σ contadas_u.
//   · La parte de las contadas que PODRÍA ser republicación va de S_min a S_max_hasta.
//   · Las ventas al día son COMPATIBLES con el rango de contadas × (1 - S_max_hasta) a contadas.
// LÍMITES. Es un rango bajo supuestos, no una medida de las ventas; S_min y S_max_hasta acotan el emparejamiento, no la
// parte real de cancelaciones:
//   · quien parte un lote, cambia su tamaño o republica por encima del mínimo se escapa: puede haber más cancelaciones de
//     las que se ven, y las ventas pueden quedar POR DEBAJO del rango;
//   · un vendedor honrado que publica ese mismo lote a ese precio entra en la cuenta sin haber cancelado nada;
//   · lo que se publica y se vende entre dos fotos no se ve, y una venta en la última media hora de una subasta se cuenta
//     como caducada: las ventas también pueden quedar POR ENCIMA de contadas.
//   · si un objeto medido tiene alguna subasta que no es mercancía, `contadas_u` también la cuenta, igual que `contarVentas`.
// Las cuentas salen de `cuentasDelPar` e `intactasMasBaratas` de historial.mjs, las mismas que usa `contarVentas`: no hay
// una copia de la regla que se pueda desviar.
import { join } from 'node:path';
import { CASAS, casaDe } from './casas.mjs';
import { cuentasDelPar, intactasMasBaratas } from './historial.mjs';

const HORA = 3600;
const LANA = 2592;
const LINO = 2589;
const MAS_UNIDADES = 20;
const CORTE = '#cortada\n';
const VERSION = 3; // del formato del archivo
const NADIE = 0xffffffff;
const CASA_MEDIDA = 114; // la Horda de este reino: ninguna otra
// Nunca se empieza desde esta fecha (21-dic-2026 00:00 UTC), en segundos y con la hora de la foto.
export const LIMITE_INICIO_S = Date.UTC(2026, 11, 21) / 1000;
export const HORAS_MEDIDA = 48;
// Unas 22 líneas por hora: bastante menos de este tope en las 48 horas. Si se alcanza, se cierra.
export const TOPE_BYTES = 150_000;
export const COLUMNAS = Object.freeze([
  'hora', 'hueco_s', 'item', 'unidades_a_la_venta', 'subastas', 'salen_u', 'descartadas_u', 'contadas_u', 'parciales_u',
  'caducadas_n', 'altura_P_pct', 'vuelven_lote_10pct_u', 'vuelven_bajo_minimo_u',
  'vuelven_bajo_minimo_max_u', 'vuelven_hasta_minimo_max_u', 'nuevas_bajo_minimo_u', 'nuevas_hasta_minimo_u',
]);

const RE_CABECERA = /^#medir-salen v3 casa=(\d+) inicio=(\d+) objetos=(\d+(?:,\d+)*)$/;
const RE_VERSION = /^#medir-salen v(\d+) /gm;
const RE_CIERRE = /^#cierre hora=(\d+) motivo=(48h|tope)$/;
const RE_FILA = /^\d+,\d+,\d+,\d+,\d+,\d+,\d+,\d+,\d+,\d+,(?:\d+(?:\.\d+)?)?,\d+,\d+,\d+,\d+,\d+,\d+$/;

/** Las casas de la Horda descubiertas: primero la del reino del personaje. Solo candidatas de la Horda. */
export function casasHordaDe(identidad, conocidas) {
  const sufijo = '|Horde';
  const reinos = Object.keys(conocidas ?? {}).filter((k) => k.endsWith(sufijo)).map((k) => k.slice(0, -sufijo.length)).sort();
  if (identidad) reinos.unshift(identidad.reino);
  const lista = [];
  for (const reino of reinos) {
    const casa = casaDe({ reino, faccion: 'Horde' }, conocidas);
    if (casa != null && CASAS.Horde.includes(casa) && !lista.includes(casa)) lista.push(casa);
  }
  return lista;
}

/** Lee el archivo. Solo valen las líneas enteras (con su salto de línea) y bien formadas: lo demás se ignora. */
export function leerMedicion(texto) {
  const r = { casa: null, inicio: null, objetos: [], filas: [], cierre: null, ultimaHora: 0, otraVersion: null };
  for (const m of String(texto ?? '').matchAll(RE_VERSION)) if (Number(m[1]) !== VERSION) r.otraVersion = Number(m[1]);
  const lineas = String(texto ?? '').split('\n');
  lineas.pop(); // lo que hay tras el último salto: vacío, o una línea a medias
  for (const linea of lineas) {
    if (RE_FILA.test(linea)) {
      const v = linea.split(',');
      const fila: { hora?: number; } = {};
      COLUMNAS.forEach((c, i) => { fila[c] = v[i] === '' ? null : Number(v[i]); });
      r.filas.push(fila);
      if (fila.hora > r.ultimaHora) r.ultimaHora = fila.hora;
      continue;
    }
    const cab = r.inicio == null ? RE_CABECERA.exec(linea) : null;
    if (cab) {
      r.casa = Number(cab[1]);
      r.inicio = Number(cab[2]);
      r.objetos = cab[3].split(',').map(Number);
      continue;
    }
    const cierre = RE_CIERRE.exec(linea);
    if (cierre && !r.cierre) r.cierre = { hora: Number(cierre[1]), motivo: cierre[2] };
  }
  return r;
}

// Solo las mercancías llevan precio en las columnas de la foto.
const hayMercancias = (foto) => !!foto.precio && foto.precio.some((p) => p > 0);

// La lana, el lino y las 20 mercancías con más unidades de la foto (a igualdad, el id más bajo).
function elegirObjetos(foto) {
  const unidades = new Map();
  for (let i = 0; i < foto.ids.length; i++) {
    if (foto.precio[i] > 0) unidades.set(foto.items[i], (unidades.get(foto.items[i]) || 0) + foto.cant[i]);
  }
  const resto = [...unidades].filter(([item]) => item !== LANA && item !== LINO).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return [LANA, LINO, ...resto.slice(0, MAS_UNIDADES).map(([item]) => item)];
}

// Para el criterio de ±10 %: da la primera subasta libre (por id) con el precio a ±10 % del pedido y la marca como usada.
// Un árbol de mínimos sobre las subastas ordenadas por precio: cada petición cuesta O(log n), no recorre las ya usadas.
function buscadorParecida(precios) {
  const n = precios.length;
  const orden = Uint32Array.from(precios.keys()).sort((a, b) => precios[a] - precios[b] || a - b);
  const valores = Float64Array.from(orden, (i) => precios[i]);
  const sitio = new Uint32Array(n);
  for (let k = 0; k < n; k++) sitio[orden[k]] = k;
  let tam = 1;
  while (tam < n) tam *= 2;
  const arbol = new Uint32Array(2 * tam).fill(NADIE);
  for (let k = 0; k < n; k++) arbol[tam + k] = orden[k];
  for (let k = tam - 1; k >= 1; k--) arbol[k] = Math.min(arbol[2 * k], arbol[2 * k + 1]);
  const primeroQue = (cumple) => {
    let a = 0;
    let b = n;
    while (a < b) {
      const m = (a + b) >>> 1;
      if (cumple(valores[m])) b = m;
      else a = m + 1;
    }
    return a;
  };
  return (precio) => {
    const margen = 0.1 * precio;
    const desde = primeroQue((x) => x >= precio || precio - x <= margen);
    const hasta = primeroQue((x) => x > precio && x - precio > margen);
    let mejor = NADIE;
    for (let a = desde + tam, b = hasta + tam; a < b; a >>= 1, b >>= 1) {
      if (a & 1) mejor = Math.min(mejor, arbol[a++]);
      if (b & 1) mejor = Math.min(mejor, arbol[--b]);
    }
    if (mejor === NADIE) return false;
    let p = sitio[mejor] + tam;
    arbol[p] = NADIE;
    for (p >>= 1; p >= 1; p >>= 1) arbol[p] = Math.min(arbol[2 * p], arbol[2 * p + 1]);
    return true;
  };
}

// Las filas del par, una por objeto de la lista (aunque ya no esté a la venta). Función pura: solo lee las dos fotos.
function filasDelPar({ antes, ahora, huecoAntes, hueco, hora, objetos }: { antes: any; ahora: any; huecoAntes: number; hueco: number; hora: number; objetos: number[] }) {
  const filas = new Map(objetos.map((item) => [item, {
    hora, hueco_s: hueco, item, unidades_a_la_venta: 0, subastas: 0, salen_u: 0, descartadas_u: 0, contadas_u: 0, parciales_u: 0,
    caducadas_n: 0, altura_P_pct: null, vuelven_lote_10pct_u: 0, vuelven_bajo_minimo_u: 0,
    vuelven_bajo_minimo_max_u: 0, vuelven_hasta_minimo_max_u: 0, nuevas_bajo_minimo_u: 0, nuevas_hasta_minimo_u: 0,
  }]));

  // La foto anterior: unidades y mínimo de cada objeto.
  const previo = new Map(objetos.map((item) => [item, { total: 0, minimo: Infinity }]));
  for (let i = 0; i < antes.ids.length; i++) {
    const d = previo.get(antes.items[i]);
    if (!d || !(antes.precio[i] > 0)) continue;
    d.total += antes.cant[i];
    if (antes.precio[i] < d.minimo) d.minimo = antes.precio[i];
  }

  // La foto nueva: lo que hay a la venta y las subastas nuevas, por objeto y lote (las dos fotos van ordenadas por id).
  const nuevas = new Map(); // objeto -> lote -> {precios (por id), bajoMinimo, hastaMinimo, descartadas, contadas, tomar}
  let k = 0;
  for (let j = 0; j < ahora.ids.length; j++) {
    const f = filas.get(ahora.items[j]);
    if (!f || !(ahora.precio[j] > 0)) continue;
    f.unidades_a_la_venta += ahora.cant[j];
    f.subastas += 1;
    while (k < antes.ids.length && antes.ids[k] < ahora.ids[j]) k++;
    if (k < antes.ids.length && antes.ids[k] === ahora.ids[j]) continue;
    const minimo = previo.get(f.item).minimo;
    const bajoMinimo = Number.isFinite(minimo) && ahora.precio[j] < minimo;
    const hastaMinimo = Number.isFinite(minimo) && ahora.precio[j] <= minimo;
    if (bajoMinimo) f.nuevas_bajo_minimo_u += ahora.cant[j];
    if (hastaMinimo) f.nuevas_hasta_minimo_u += ahora.cant[j];
    if (!nuevas.has(f.item)) nuevas.set(f.item, new Map());
    const porLote = nuevas.get(f.item);
    if (!porLote.has(ahora.cant[j])) {
      porLote.set(ahora.cant[j], { precios: [], bajoMinimo: 0, hastaMinimo: 0, descartadas: 0, contadas: 0, tomar: null });
    }
    const grupo = porLote.get(ahora.cant[j]);
    grupo.precios.push(ahora.precio[j]);
    if (bajoMinimo) grupo.bajoMinimo += 1;
    if (hastaMinimo) grupo.hastaMinimo += 1;
  }

  // Lo que sale, con la misma regla que el historial. Se apunta aquí y se empareja después (ver la cabecera).
  const salidas = [];
  const cuentas = cuentasDelPar(huecoAntes, antes, ahora, hueco, {
    parcial(item, n) {
      const f = filas.get(item);
      if (f) f.parciales_u += n;
    },
    sale(i, contada) {
      const f = filas.get(antes.items[i]);
      if (!f) return;
      if (!contada) f.descartadas_u += antes.cant[i];
      salidas.push({ f, cant: antes.cant[i], precio: antes.precio[i], contada });
    },
  });
  // ±10 %: primero las descartadas y luego las contadas; dentro de cada grupo, en el orden de la foto (por id).
  for (const turno of [false, true]) {
    for (const { f, cant, precio, contada } of salidas) {
      if (contada !== turno) continue;
      const grupo = nuevas.get(f.item)?.get(cant);
      if (!grupo) continue;
      if (contada) grupo.contadas += 1;
      else grupo.descartadas += 1;
      grupo.tomar ||= buscadorParecida(grupo.precios);
      if (grupo.tomar(precio) && contada) f.vuelven_lote_10pct_u += cant;
    }
  }
  // Respecto al mínimo: dentro de un lote cualquier nueva vale para cualquier salida, así que basta contar.
  for (const [item, porLote] of nuevas) {
    const f = filas.get(item);
    for (const [cant, g] of porLote) {
      f.vuelven_bajo_minimo_u += cant * Math.min(g.contadas, Math.max(0, g.bajoMinimo - g.descartadas));
      f.vuelven_bajo_minimo_max_u += cant * Math.min(g.contadas, g.bajoMinimo);
      f.vuelven_hasta_minimo_max_u += cant * Math.min(g.contadas, g.hastaMinimo);
    }
  }
  for (const [item, [, caducadas, unidades]] of cuentas) {
    const f = filas.get(item);
    if (!f) continue;
    f.contadas_u = unidades;
    f.caducadas_n = caducadas;
  }

  // La altura de P*: qué parte de la foto anterior estaba por debajo de la intacta más barata.
  const pIntacta = intactasMasBaratas(antes, ahora);
  const debajo = new Map();
  for (let i = 0; i < antes.ids.length; i++) {
    const tope = pIntacta.get(antes.items[i]);
    if (tope !== undefined && antes.precio[i] > 0 && antes.precio[i] < tope) {
      debajo.set(antes.items[i], (debajo.get(antes.items[i]) || 0) + antes.cant[i]);
    }
  }
  for (const f of filas.values()) {
    f.salen_u = f.contadas_u + f.descartadas_u;
    const total = previo.get(f.item).total;
    if (pIntacta.has(f.item) && total > 0) f.altura_P_pct = Math.round((1000 * (debajo.get(f.item) || 0)) / total) / 10;
  }
  return [...filas.values()];
}

// ¿Es solo el principio de la cabecera, sin salto de línea? Un corte en la primera escritura: aún no se midió nada.
function esCabeceraCortada(texto) {
  const molde = `#medir-salen v${VERSION} casa=${CASA_MEDIDA} inicio=`;
  if (texto.includes('\n')) return false;
  if (texto.length <= molde.length) return molde.startsWith(texto);
  return texto.startsWith(molde) && /^[\dobjetos=, ]*$/.test(texto.slice(molde.length));
}

const aLinea = (f) => `${COLUMNAS.map((c) => f[c] ?? '').join(',')}\n`;

/**
 * El contador. `casasHorda()`: las casas de la Horda descubiertas (casasHordaDe; solo se mide si está la 114); `registrar(nivel, texto)`: el registro.
 * → {alPar}: lo que el historial llama con cada par de fotos seguidas. Nunca lanza.
 */
export function crearMedidorSalen({ fs, carpeta, casasHorda, registrar = (() => {}) as (level: string, message: string) => void, tope = TOPE_BYTES }) {
  const rutaCsv = join(carpeta, `diag-salen-${CASA_MEDIDA}.csv`);
  const rutaMarca = join(carpeta, `diag-salen-${CASA_MEDIDA}.marca`);
  let apagado = false; // cerrado, o con un fallo en esta ejecución
  let cargado = false; // ya se han leído el archivo y la marca
  let inicio = null;
  let objetos = null;
  let ultimaHora = 0;
  let bytes = 0;
  let cortada = false; // el archivo acaba en una línea a medias

  const apuntar = (nivel, texto) => {
    try {
      registrar(nivel, texto);
    } catch {
      // el registro tampoco puede parar el historial
    }
  };

  const parar = (nivel, motivo) => {
    apagado = true;
    apuntar(nivel, `comercio: la medición de «Salen al día» de la casa ${CASA_MEDIDA} no sigue: ${motivo}; no se escribe nada`);
  };

  // → {existe, inicio}: inicio es null si la marca no trae una hora.
  function leerMarca() {
    let texto;
    try {
      texto = fs.readFileSync(rutaMarca, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return { existe: false, inicio: null };
      throw e;
    }
    return { existe: true, inicio: /^\d+\s*$/.test(texto) ? Number(texto) : null };
  }

  // Nunca pisa una marca que ya esté.
  function crearMarca(hora) {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(rutaMarca, String(hora), { flag: 'wx' });
  }

  function cargar() {
    const marca = leerMarca();
    let texto = '';
    try {
      texto = fs.readFileSync(rutaCsv, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const leido = leerMedicion(texto);
    if (leido.otraVersion != null) {
      // De otro formato: no se mezclan columnas ni se empieza encima.
      parar('aviso', `su archivo es de otro formato (v${leido.otraVersion}) y no se mezcla`);
      return;
    }
    const valida = leido.inicio != null && leido.casa === CASA_MEDIDA;
    if (marca.existe) {
      if (!texto.length) {
        parar('info', 'ya se midió y el archivo no está o está vacío');
        return;
      }
      if (!valida || marca.inicio !== leido.inicio) {
        parar('aviso', 'el archivo no se entiende o no es el de la marca, y no se toca');
        return;
      }
    } else if (valida) {
      crearMarca(leido.inicio); // un corte entre la cabecera y la marca
    } else if (texto.length && !esCabeceraCortada(texto)) {
      parar('aviso', 'el archivo no tiene una cabecera válida, y no se toca');
      return;
    }
    if (leido.cierre) {
      apagado = true;
      return;
    }
    cargado = true;
    inicio = valida ? leido.inicio : null;
    objetos = valida ? leido.objetos : null;
    ultimaHora = valida ? Math.max(leido.ultimaHora, leido.inicio - 1) : 0;
    bytes = Buffer.byteLength(texto);
    cortada = texto.length > 0 && !texto.endsWith('\n');
  }

  function escribir(texto) {
    const bloque = cortada ? CORTE + texto : texto;
    fs.mkdirSync(carpeta, { recursive: true });
    fs.appendFileSync(rutaCsv, bloque);
    bytes += Buffer.byteLength(bloque);
    cortada = false;
  }

  function cerrar(hora, motivo) {
    apagado = true;
    escribir(`#cierre hora=${hora} motivo=${motivo}\n`);
    apuntar('info', `comercio: la medición de «Salen al día» de la casa ${CASA_MEDIDA} ha terminado (${motivo})`);
  }

  // Primero la cabecera y después la marca; sin marca no se llega a escribir ninguna fila.
  function empezar(hora, lista) {
    escribir(`#medir-salen v${VERSION} casa=${CASA_MEDIDA} inicio=${hora} objetos=${lista.join(',')}\n${COLUMNAS.join(',')}\n`);
    inicio = hora;
    objetos = lista;
    crearMarca(hora);
    apuntar('info', `comercio: empieza la medición de «Salen al día» en la casa ${CASA_MEDIDA} (${HORAS_MEDIDA} h, ${lista.length} objetos)`);
  }

  function medir({ hora, hueco, huecoAntes, par }) {
    if (!cargado) {
      if (!(casasHorda() ?? []).includes(CASA_MEDIDA)) return;
      cargar();
      if (apagado) return;
    }
    if (inicio == null && hora >= LIMITE_INICIO_S) {
      parar('info', 'ha pasado la fecha límite para empezar');
      return;
    }
    if (inicio != null && hora >= inicio + HORAS_MEDIDA * HORA) {
      cerrar(hora, '48h');
      return;
    }
    if (hora <= ultimaHora) return; // la misma foto tras un reinicio
    const { antes, ahora } = par();
    if (!hayMercancias(antes) || !hayMercancias(ahora)) return;
    if (inicio == null) empezar(hora, elegirObjetos(ahora));
    let bloque = '';
    for (const f of filasDelPar({ antes, ahora, huecoAntes, hueco, hora, objetos })) bloque += aLinea(f);
    const reserva = Buffer.byteLength(`${CORTE}#cierre hora=${hora} motivo=tope\n`);
    if (bytes + Buffer.byteLength(bloque) + reserva > tope) {
      cerrar(hora, 'tope');
      return;
    }
    escribir(bloque);
    ultimaHora = hora;
  }

  function alPar(datos) {
    if (apagado || datos?.casa !== CASA_MEDIDA) return;
    try {
      medir(datos);
    } catch (e) {
      apagado = true;
      // Una sola línea, con lo necesario para ver el hueco al leer el resultado.
      const cuando = Number.isFinite(datos?.hora) ? new Date(datos.hora * 1000).toISOString().slice(0, 16) : 'hora desconocida';
      const ventana = inicio != null
        ? 'las 48 h siguen corriendo y esas horas quedan como hueco en el CSV'
        : 'aún no había empezado a contar las 48 h';
      apuntar('aviso', `comercio: la medición de «Salen al día» (casa ${CASA_MEDIDA}) se apaga en la foto de las ${cuando} UTC por un fallo (${e?.code || e?.name || 'Error'}): no mide hasta el próximo arranque, ${ventana}; el historial sigue igual`);
    }
  }

  return { alPar };
}
